<?php
// alerts.php — DryLog PRO alerts queue management + per-claim rule config.
//
//   GET    /api/alerts?claim_id=N[&state=new]   list alerts for a claim
//                                                (state default: new+acked;
//                                                'all' to include resolved/dismissed)
//   POST   /api/alerts/{id}/ack                  ack
//   POST   /api/alerts/{id}/resolve              body { notes? }
//   POST   /api/alerts/{id}/dismiss              body { notes? }
//   POST   /api/alerts/cron-daily                trigger cron-daily rule sweep
//                                                  (Owner role only; cron-callable)
//
//   GET    /api/alerts/config?claim_id=N         list rule configs for a claim
//                                                (rule_def + per-claim override row)
//   PUT    /api/alerts/config                    body { claim_id, configs: [
//                                                  { code, is_enabled?, thresholds?,
//                                                    severity_override?, notify_sms?,
//                                                    notify_email?, notify_user_ids?[] }
//                                                ] }
//
// Spec: docs/F18-drylog-pro-spec.md §5, §7.3

require_once __DIR__ . '/../lib/drylog_pro_model.php';
require_once __DIR__ . '/../lib/alerts.php';

$db     = $GLOBALS['db'];
$method = $GLOBALS['method'];
$id     = $GLOBALS['route_id'];
$user   = require_auth($db);
$cid    = (int)$user['company_id'];

$_segs = explode('/', trim(parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH), '/'));
if (($_segs[0] ?? '') === 'api') array_shift($_segs);
// /alerts             → action=null, id=null
// /alerts/{id}/ack    → action=null (id is in $route_id), sub_action=ack
// /alerts/config      → action='config'
// /alerts/cron-daily  → action='cron-daily'
$action     = (!$id && isset($_segs[1]) && !is_numeric($_segs[1])) ? $_segs[1] : null;
$sub_action = $_segs[2] ?? null;

// ── GET /api/alerts?claim_id=N (or no claim_id for cross-claim queue) ───────
// F18.8f: claim_id is now optional. Without it, returns all alerts company-
// wide (joined with job + zone names for the admin queue UI).
if ($method === 'GET' && !$id && !$action) {
    $claim_id = isset($_GET['claim_id']) ? (int)$_GET['claim_id'] : 0;
    $where = ['a.company_id = ?'];
    $params = [$cid];
    if ($claim_id > 0) {
        if (!tc_drylog_claim_for_company($db, $cid, $claim_id)) json_error('Claim not found', 404);
        $where[] = 'a.claim_id = ?'; $params[] = $claim_id;
    }

    $state_filter = $_GET['state'] ?? 'open';
    if ($state_filter === 'open') {
        $where[] = "a.state IN ('new','acked')";
    } elseif (in_array($state_filter, ['new','acked','resolved','dismissed'], true)) {
        $where[] = "a.state = ?"; $params[] = $state_filter;
    } elseif ($state_filter !== 'all') {
        json_error('invalid state filter', 422);
    }

    if (!empty($_GET['severity']) && in_array($_GET['severity'], ['info','warning','critical'], true)) {
        $where[] = 'a.severity = ?'; $params[] = $_GET['severity'];
    }

    $s = $db->prepare("
        SELECT a.*,
               rd.code AS rule_code, rd.name AS rule_name,
               z.name AS zone_name,
               j.customer AS claim_customer, j.address AS claim_address, j.claim_no,
               COALESCE(au.display_name, au.username) AS acked_by_name,
               COALESCE(ru.display_name, ru.username) AS resolved_by_name
          FROM alerts a
          JOIN alert_rule_definitions rd ON rd.id = a.alert_rule_definition_id
          LEFT JOIN drying_zones z ON z.id = a.drying_zone_id
          LEFT JOIN jobs j ON j.id = a.claim_id
          LEFT JOIN users au ON au.id = a.acked_by_user_id
          LEFT JOIN users ru ON ru.id = a.resolved_by_user_id
         WHERE " . implode(' AND ', $where) . "
         ORDER BY a.fired_at DESC
         LIMIT 500
    ");
    $s->execute($params);
    json_list($s->fetchAll());
}

// ── POST /api/alerts/{id}/ack ──────────────────────────────────────────────
if ($method === 'POST' && $id && $sub_action === 'ack') {
    $s = $db->prepare("SELECT * FROM alerts WHERE id = ? AND company_id = ?");
    $s->execute([$id, $cid]);
    $row = $s->fetch();
    if (!$row) json_error('Not found', 404);
    if (!in_array($row['state'], ['new'], true)) {
        json_error("Alert is already $row[state]", 422);
    }
    $db->prepare("
        UPDATE alerts SET state = 'acked', acked_at = NOW(), acked_by_user_id = ?
         WHERE id = ? AND company_id = ?
    ")->execute([(int)$user['id'], $id, $cid]);
    $s = $db->prepare("SELECT * FROM alerts WHERE id = ?");
    $s->execute([$id]);
    json_ok($s->fetch());
}

// ── POST /api/alerts/{id}/resolve ──────────────────────────────────────────
if ($method === 'POST' && $id && $sub_action === 'resolve') {
    $s = $db->prepare("SELECT * FROM alerts WHERE id = ? AND company_id = ?");
    $s->execute([$id, $cid]);
    $row = $s->fetch();
    if (!$row) json_error('Not found', 404);
    if (in_array($row['state'], ['resolved','dismissed'], true)) {
        json_error("Alert is already $row[state]", 422);
    }
    $b = get_json_body();
    $notes = isset($b['notes']) ? trim((string)$b['notes']) : null;

    $db->prepare("
        UPDATE alerts
           SET state = 'resolved', resolved_at = NOW(),
               resolved_by_user_id = ?, resolved_notes = ?
         WHERE id = ? AND company_id = ?
    ")->execute([(int)$user['id'], $notes, $id, $cid]);
    $s = $db->prepare("SELECT * FROM alerts WHERE id = ?");
    $s->execute([$id]);
    json_ok($s->fetch());
}

// ── POST /api/alerts/{id}/dismiss ──────────────────────────────────────────
if ($method === 'POST' && $id && $sub_action === 'dismiss') {
    $s = $db->prepare("SELECT * FROM alerts WHERE id = ? AND company_id = ?");
    $s->execute([$id, $cid]);
    $row = $s->fetch();
    if (!$row) json_error('Not found', 404);
    if (in_array($row['state'], ['resolved','dismissed'], true)) {
        json_error("Alert is already $row[state]", 422);
    }
    $b = get_json_body();
    $notes = isset($b['notes']) ? trim((string)$b['notes']) : null;

    $db->prepare("
        UPDATE alerts
           SET state = 'dismissed', resolved_at = NOW(),
               resolved_by_user_id = ?, resolved_notes = ?
         WHERE id = ? AND company_id = ?
    ")->execute([(int)$user['id'], $notes, $id, $cid]);
    $s = $db->prepare("SELECT * FROM alerts WHERE id = ?");
    $s->execute([$id]);
    json_ok($s->fetch());
}

// ── POST /api/alerts/cron-daily ────────────────────────────────────────────
// Owner-only — invoked by a server-side cron (curl localhost/api/alerts/cron-daily
// with the cron user's session cookie). Sweeps every active claim for the
// cron_daily rule family (visit_overdue, equipment_overstay).
if ($method === 'POST' && !$id && $action === 'cron-daily') {
    require_role($user, 'Owner', 'GM', 'Admin');
    try {
        $out = tc_alerts_run_cron_daily($db, $cid);
    } catch (Throwable $e) {
        json_error_with_log('alerts.cron-daily', 'Cron sweep failed', $e, 500);
    }
    json_ok($out);
}

// ── GET /api/alerts/config?claim_id=N ──────────────────────────────────────
if ($method === 'GET' && !$id && $action === 'config') {
    $claim_id = (int)($_GET['claim_id'] ?? 0);
    if ($claim_id <= 0) json_error('claim_id required', 422);
    if (!tc_drylog_claim_for_company($db, $cid, $claim_id)) json_error('Claim not found', 404);

    $s = $db->prepare("
        SELECT rd.id, rd.code, rd.name, rd.description, rd.severity_default,
               rd.evaluates_on, rd.threshold_schema,
               cfg.id AS config_id,
               COALESCE(cfg.is_enabled, 1) AS is_enabled,
               cfg.thresholds_json,
               cfg.severity_override,
               COALESCE(cfg.notify_sms, 0)   AS notify_sms,
               COALESCE(cfg.notify_email, 0) AS notify_email,
               cfg.notify_user_ids_json
          FROM alert_rule_definitions rd
          LEFT JOIN claim_alert_configs cfg
                 ON cfg.alert_rule_definition_id = rd.id
                AND cfg.claim_id = ? AND cfg.company_id = ?
         WHERE rd.is_active = 1
         ORDER BY rd.code
    ");
    $s->execute([$claim_id, $cid]);
    json_list($s->fetchAll());
}

// ── PUT /api/alerts/config ─────────────────────────────────────────────────
if ($method === 'PUT' && !$id && $action === 'config') {
    $b = get_json_body();
    $claim_id = (int)($b['claim_id'] ?? 0);
    $configs  = $b['configs'] ?? null;
    if ($claim_id <= 0) json_error('claim_id required', 422);
    if (!is_array($configs)) json_error('configs[] required', 422);
    if (!tc_drylog_claim_for_company($db, $cid, $claim_id)) json_error('Claim not found', 404);

    // Resolve codes → rule_def_ids.
    $codes = array_values(array_unique(array_filter(array_map(
        fn($c) => trim((string)($c['code'] ?? '')),
        $configs
    ))));
    if (empty($codes)) json_error('No valid codes in configs[]', 422);
    $ph = implode(',', array_fill(0, count($codes), '?'));
    $s = $db->prepare("SELECT id, code FROM alert_rule_definitions WHERE code IN ($ph)");
    $s->execute($codes);
    $code_to_id = [];
    foreach ($s->fetchAll() as $r) {
        $code_to_id[$r['code']] = (int)$r['id'];
    }
    foreach ($codes as $c) {
        if (!isset($code_to_id[$c])) json_error("Unknown rule code: $c", 422);
    }

    $db->beginTransaction();
    try {
        $upsert = $db->prepare("
            INSERT INTO claim_alert_configs
                (company_id, claim_id, alert_rule_definition_id,
                 is_enabled, thresholds_json, severity_override,
                 notify_sms, notify_email, notify_user_ids_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                is_enabled = VALUES(is_enabled),
                thresholds_json = VALUES(thresholds_json),
                severity_override = VALUES(severity_override),
                notify_sms = VALUES(notify_sms),
                notify_email = VALUES(notify_email),
                notify_user_ids_json = VALUES(notify_user_ids_json)
        ");
        foreach ($configs as $c) {
            $code = trim((string)($c['code'] ?? ''));
            if (!isset($code_to_id[$code])) continue;
            $rid = $code_to_id[$code];

            $is_enabled = array_key_exists('is_enabled', $c) ? ((int)!!$c['is_enabled']) : 1;
            $thresholds = isset($c['thresholds']) ? json_encode($c['thresholds']) : null;
            $sev_over   = isset($c['severity_override']) ? trim((string)$c['severity_override']) : null;
            if ($sev_over !== null && $sev_over !== '' && !in_array($sev_over, ['info','warning','critical'], true)) {
                json_error("severity_override must be info|warning|critical", 422);
            }
            if ($sev_over === '') $sev_over = null;
            $notify_sms   = !empty($c['notify_sms']) ? 1 : 0;
            $notify_email = !empty($c['notify_email']) ? 1 : 0;
            $notify_users = isset($c['notify_user_ids']) ? json_encode($c['notify_user_ids']) : null;

            $upsert->execute([
                $cid, $claim_id, $rid,
                $is_enabled, $thresholds, $sev_over,
                $notify_sms, $notify_email, $notify_users,
            ]);
        }
        $db->commit();
    } catch (Throwable $e) {
        if ($db->inTransaction()) $db->rollBack();
        json_error_with_log('alerts.config', 'Config update failed', $e, 500);
    }

    json_ok(['updated' => count($configs)]);
}

json_error('Not found', 404);
