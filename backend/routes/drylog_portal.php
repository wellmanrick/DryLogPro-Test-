<?php
// drylog_portal.php — tokenized customer live-progress portal (F18.11a).
//
//   POST /api/drylog-portal/mint              Office-side. Body: { claim_id, expires_days? }
//                                              Returns { token, url, expires_at }
//                                              Requires Owner/GM/Admin/PM role.
//   GET  /api/drylog-portal/list?claim_id=N   Office-side. Lists active tokens for a claim.
//   POST /api/drylog-portal/{id}/revoke       Office-side. Marks a token revoked.
//
//   GET  /api/drylog-portal/view?t=<token>    PUBLIC — no auth. Returns the sanitized
//                                              read-only status JSON for the customer view.
//                                              Increments view_count + last_viewed_at.
//
// Spec: docs/F18-drylog-pro-spec.md §11 (F18.11 differentiators)

require_once __DIR__ . '/../lib/drylog_pro_model.php';
require_once __DIR__ . '/../lib/drylog_predict.php';

$db     = $GLOBALS['db'];
$method = $GLOBALS['method'];
$id     = $GLOBALS['route_id'];

$_segs = explode('/', trim(parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH), '/'));
if (($_segs[0] ?? '') === 'api') array_shift($_segs);
// /drylog-portal             → action=null
// /drylog-portal/mint        → action='mint'
// /drylog-portal/view        → action='view'
// /drylog-portal/list        → action='list'
// /drylog-portal/{id}/revoke → action=null (id is numeric), sub_action='revoke'
$action     = (!$id && isset($_segs[1]) && !is_numeric($_segs[1])) ? $_segs[1] : null;
$sub_action = $_segs[2] ?? null;

// ─── PUBLIC: GET /view?t=<token> ────────────────────────────────────────────
// Auth-bypassing endpoint — the token IS the auth. Returns a curated
// sanitized view designed for homeowners: no internal compliance alerts,
// no raw psychrometrics, no equipment serials.
if ($method === 'GET' && $action === 'view') {
    $raw = $_GET['t'] ?? '';
    if (!$raw || strlen($raw) < 32) json_error('Invalid link', 401);
    $hash = hash('sha256', $raw);

    $s = $db->prepare("
        SELECT t.id, t.company_id, t.claim_id, t.expires_at, t.revoked_at
          FROM drylog_pro_portal_tokens t
         WHERE t.token_hash = ?
         LIMIT 1
    ");
    $s->execute([$hash]);
    $tok = $s->fetch();
    if (!$tok) json_error('Invalid link', 401);
    if ($tok['revoked_at']) json_error('This link has been revoked.', 410);
    if ($tok['expires_at'] && strtotime($tok['expires_at']) < time()) json_error('This link has expired.', 410);

    $cid = (int)$tok['company_id'];
    $claim_id = (int)$tok['claim_id'];

    // Load claim + company + sanitized chamber data
    $j = $db->prepare("SELECT id, customer, address, claim_no, loss_type FROM jobs WHERE id = ? AND company_id = ?");
    $j->execute([$claim_id, $cid]);
    $job = $j->fetch();
    if (!$job) json_error('Claim not found', 404);

    $cmp = $db->prepare("SELECT name, logo_url, phone FROM companies WHERE id = ?");
    $cmp->execute([$cid]);
    $company = $cmp->fetch() ?: [];

    // Zones + surface roll-up
    $zs = $db->prepare("
        SELECT z.id, z.name, z.is_closed, z.closed_at, z.category_of_water
          FROM drying_zones z
         WHERE z.company_id = ? AND z.claim_id = ? AND z.deleted_at IS NULL
         ORDER BY z.zone_index, z.id
    ");
    $zs->execute([$cid, $claim_id]);
    $zones = $zs->fetchAll();

    $surfTotal = 0; $surfDry = 0; $zoneSummaries = [];
    foreach ($zones as $z) {
        $ss = $db->prepare("SELECT COUNT(*) AS total, SUM(is_dry) AS dry FROM claim_surfaces WHERE drying_zone_id = ? AND deleted_at IS NULL");
        $ss->execute([(int)$z['id']]);
        $r = $ss->fetch();
        $tot = (int)($r['total'] ?? 0); $dr = (int)($r['dry'] ?? 0);
        $surfTotal += $tot; $surfDry += $dr;
        $zoneSummaries[] = [
            'name'        => $z['name'],
            'surface_total' => $tot,
            'surface_dry'   => $dr,
            'is_closed'   => !empty($z['is_closed']),
            'pct'         => $tot > 0 ? (int)round($dr / $tot * 100) : null,
        ];
    }

    // Days running (since first visit)
    $vd = $db->prepare("SELECT MIN(visit_date) FROM visits WHERE company_id = ? AND job_id = ?");
    $vd->execute([$cid, $claim_id]);
    $first_visit = $vd->fetchColumn();
    $days_running = $first_visit ? max(0, (int)((time() - strtotime($first_visit . ' 12:00:00')) / 86400)) : null;

    // Customer-friendly alerts: only positive (info) ones from the rules
    // that aren't internal-compliance flavored. Hide internal categories.
    $excluded_codes = ['cat3_no_hepa', 'equipment_overstay', 'scope_creep_late_surface'];
    $ph = implode(',', array_fill(0, count($excluded_codes), '?'));
    $aq = $db->prepare("
        SELECT a.title, a.severity, a.fired_at, z.name AS zone_name, rd.code
          FROM alerts a
          JOIN alert_rule_definitions rd ON rd.id = a.alert_rule_definition_id
          LEFT JOIN drying_zones z ON z.id = a.drying_zone_id
         WHERE a.company_id = ? AND a.claim_id = ?
           AND a.state IN ('new','acked')
           AND rd.code NOT IN ($ph)
           AND a.severity != 'critical'
         ORDER BY a.fired_at DESC
         LIMIT 20
    ");
    $aq->execute(array_merge([$cid, $claim_id], $excluded_codes));
    $alerts_public = $aq->fetchAll();

    // Bump view count + last viewed
    $db->prepare("UPDATE drylog_pro_portal_tokens SET view_count = view_count + 1, last_viewed_at = NOW() WHERE id = ?")
       ->execute([(int)$tok['id']]);

    $pctDry = $surfTotal > 0 ? (int)round($surfDry / $surfTotal * 100) : null;

    // Predicted dry date (F18.11b) — only surface to the customer if confidence
    // is high or medium. Low/stalled/unknown stays internal so we don't promise
    // a date we can't back up.
    $pred = tc_drylog_predict_dry_date($db, $cid, $claim_id);
    $public_pred = null;
    if (in_array($pred['overall_confidence'] ?? '', ['high','medium'], true) && !empty($pred['overall_date'])) {
        $public_pred = [
            'expected_date' => $pred['overall_date'],
            'label'         => $pred['overall_label'],
        ];
    }

    // F18.13: per-zone predictions, same filter. Index by zone_id so the
    // portal can join into its existing zone list.
    $zone_preds_public = [];
    foreach (($pred['zones'] ?? []) as $zp) {
        if (in_array($zp['confidence'] ?? '', ['high','medium'], true) && !empty($zp['projected_date'])) {
            $zone_preds_public[(int)$zp['zone_id']] = [
                'expected_date' => $zp['projected_date'],
                'label'         => $zp['label'],
            ];
        }
    }
    // Decorate each zone summary with its prediction (if any)
    foreach ($zoneSummaries as &$zs) {
        // zoneSummaries currently lacks zone_id — backfill by name match against $zones
        $zs['prediction'] = null;
    }
    unset($zs);
    foreach ($zones as $idx => $z) {
        $zid = (int)$z['id'];
        if (isset($zone_preds_public[$zid]) && isset($zoneSummaries[$idx])) {
            $zoneSummaries[$idx]['prediction'] = $zone_preds_public[$zid];
        }
    }

    json_ok([
        'company' => [
            'name' => $company['name'] ?? null,
            'logo_url' => $company['logo_url'] ?? null,
            'phone' => $company['phone'] ?? null,
        ],
        'claim' => [
            'customer' => $job['customer'],
            'address'  => $job['address'],
            'claim_no' => $job['claim_no'],
        ],
        'status' => [
            'pct_dry'        => $pctDry,
            'surface_total'  => $surfTotal,
            'surface_dry'    => $surfDry,
            'days_running'   => $days_running,
            'first_visit'    => $first_visit,
            'zones'          => $zoneSummaries,
        ],
        'prediction' => $public_pred,
        'updates' => array_map(fn($a) => [
            'title'     => $a['title'],
            'zone'      => $a['zone_name'],
            'when'      => $a['fired_at'],
            'category'  => $a['severity'],   // 'info' (positive) or 'warning' (heads-up)
        ], $alerts_public),
    ]);
}

// Office endpoints below require auth
$user = require_auth($db);
$cid  = (int)$user['company_id'];

// ─── POST /mint ─────────────────────────────────────────────────────────────
if ($method === 'POST' && !$id && $action === 'mint') {
    require_role($user, 'Owner', 'GM', 'Admin', 'PM');
    $b = get_json_body();
    $claim_id = (int)($b['claim_id'] ?? 0);
    $expires_days = isset($b['expires_days']) ? (int)$b['expires_days'] : 0;  // 0 = no expiration
    if ($claim_id <= 0) json_error('claim_id required', 422);
    if (!tc_drylog_claim_for_company($db, $cid, $claim_id)) json_error('Claim not found', 404);

    $raw = bin2hex(random_bytes(24));   // 48-char hex token
    $hash = hash('sha256', $raw);
    $expires_at = $expires_days > 0 ? date('Y-m-d H:i:s', time() + $expires_days * 86400) : null;

    $db->prepare("
        INSERT INTO drylog_pro_portal_tokens
            (company_id, claim_id, token_hash, created_by, expires_at)
        VALUES (?, ?, ?, ?, ?)
    ")->execute([$cid, $claim_id, $hash, (int)$user['id'], $expires_at]);

    $base = 'https://totalcontracting.pro';
    json_ok([
        'token' => $raw,
        'url'   => $base . '/drylog.html?t=' . $raw,
        'expires_at' => $expires_at,
    ], 201);
}

// ─── GET /list?claim_id=N ───────────────────────────────────────────────────
if ($method === 'GET' && !$id && $action === 'list') {
    $claim_id = (int)($_GET['claim_id'] ?? 0);
    if ($claim_id <= 0) json_error('claim_id required', 422);
    if (!tc_drylog_claim_for_company($db, $cid, $claim_id)) json_error('Claim not found', 404);
    $s = $db->prepare("
        SELECT t.id, t.created_at, t.expires_at, t.revoked_at,
               t.last_viewed_at, t.view_count,
               COALESCE(u.display_name, u.username) AS created_by_name
          FROM drylog_pro_portal_tokens t
          LEFT JOIN users u ON u.id = t.created_by
         WHERE t.company_id = ? AND t.claim_id = ?
         ORDER BY t.created_at DESC
    ");
    $s->execute([$cid, $claim_id]);
    json_list($s->fetchAll());
}

// ─── POST /{id}/revoke ──────────────────────────────────────────────────────
if ($method === 'POST' && $id && $sub_action === 'revoke') {
    require_role($user, 'Owner', 'GM', 'Admin', 'PM');
    $s = $db->prepare("SELECT id FROM drylog_pro_portal_tokens WHERE id = ? AND company_id = ?");
    $s->execute([$id, $cid]);
    if (!$s->fetch()) json_error('Not found', 404);
    $db->prepare("UPDATE drylog_pro_portal_tokens SET revoked_at = NOW() WHERE id = ? AND company_id = ?")
       ->execute([$id, $cid]);
    json_ok(null);
}

json_error('Not found', 404);
