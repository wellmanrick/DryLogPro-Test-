<?php
// drylog_admin.php — company-wide DryLog PRO admin endpoints (F18.8f).
// Per-claim management lives on the existing routes; this file owns the
// cross-claim views the admin portal needs.
//
//   GET /api/drylog-admin/active-claims
//     Returns one row per claim that has any non-deleted drying_zones row.
//     Aggregates: zone count, surface total + dry count, open alerts count,
//     latest reading_at across moisture + zone atmosphere, days since first
//     visit. Sorted by most-recent-activity desc.

require_once __DIR__ . '/../lib/drylog_pro_model.php';
require_once __DIR__ . '/../lib/drylog_predict.php';

$db     = $GLOBALS['db'];
$method = $GLOBALS['method'];
$user   = require_auth($db);
$cid    = (int)$user['company_id'];

$_segs = explode('/', trim(parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH), '/'));
if (($_segs[0] ?? '') === 'api') array_shift($_segs);
$action = $_segs[1] ?? null;

if ($method === 'GET' && $action === 'active-claims') {
    $s = $db->prepare("
        SELECT j.id AS claim_id, j.customer, j.address, j.claim_no, j.loss_type,
               COUNT(DISTINCT z.id) AS zone_count,
               COUNT(DISTINCT CASE WHEN z.is_closed = 0 THEN z.id END) AS open_zone_count,
               (SELECT COUNT(*) FROM claim_surfaces s2
                  JOIN drying_zones z2 ON z2.id = s2.drying_zone_id
                 WHERE z2.claim_id = j.id AND s2.deleted_at IS NULL AND z2.deleted_at IS NULL) AS surface_total,
               (SELECT COUNT(*) FROM claim_surfaces s2
                  JOIN drying_zones z2 ON z2.id = s2.drying_zone_id
                 WHERE z2.claim_id = j.id AND s2.deleted_at IS NULL AND z2.deleted_at IS NULL
                   AND s2.is_dry = 1) AS surface_dry,
               (SELECT COUNT(*) FROM alerts a
                 WHERE a.claim_id = j.id AND a.company_id = j.company_id
                   AND a.state IN ('new','acked')) AS open_alerts,
               (SELECT COUNT(*) FROM alerts a
                 WHERE a.claim_id = j.id AND a.company_id = j.company_id
                   AND a.state IN ('new','acked') AND a.severity = 'critical') AS open_critical,
               GREATEST(
                   COALESCE((SELECT MAX(reading_at) FROM moisture_readings        WHERE claim_id = j.id AND company_id = j.company_id), '1970-01-01'),
                   COALESCE((SELECT MAX(reading_at) FROM zone_atmosphere_readings WHERE claim_id = j.id AND company_id = j.company_id), '1970-01-01')
               ) AS latest_reading_at,
               (SELECT MIN(visit_date) FROM visits WHERE job_id = j.id AND company_id = j.company_id) AS first_visit_date
          FROM jobs j
          JOIN drying_zones z ON z.claim_id = j.id AND z.deleted_at IS NULL
         WHERE j.company_id = ?
         GROUP BY j.id
         ORDER BY latest_reading_at DESC
         LIMIT 500
    ");
    $s->execute([$cid]);
    json_list($s->fetchAll());
}

// ── GET /photos?claim_id=N ──────────────────────────────────────────────────
// F18.12a: cross-visit photo gallery for a claim. Pulls every image-type
// entity_attachment whose visit belongs to this claim, plus moisture-reading
// photos (those have a photo_url column populated separately by F18.7h).
// Returned grouped by visit_date so the office can scrub day-by-day.
if ($method === 'GET' && $action === 'photos') {
    $claim_id = (int)($_GET['claim_id'] ?? 0);
    if ($claim_id <= 0) json_error('claim_id required', 422);
    if (!tc_drylog_claim_for_company($db, $cid, $claim_id)) json_error('Claim not found', 404);

    try {
        // claim_room_id tags each photo into a drying room (DryLog PRO Photos +
        // Move). LEFT JOIN resolves the room name. If the schema patch hasn't
        // run yet, the a.claim_room_id reference throws unknown-column → the
        // catch falls back to the original room-less query so the office gallery
        // never 500s during the deploy→patch window.
        $s = $db->prepare("
            SELECT a.id, a.file_url, a.original_name, a.mime_type, a.size_bytes,
                   a.caption, a.uploaded_at, a.claim_room_id, r.name AS room_name,
                   COALESCE(u.display_name, u.username) AS uploaded_by_name,
                   v.id AS visit_id, v.visit_date
              FROM entity_attachments a
              JOIN visits v ON v.id = a.entity_id
              LEFT JOIN users u ON u.id = a.uploaded_by
              LEFT JOIN claim_rooms r ON r.id = a.claim_room_id
             WHERE a.company_id = ? AND v.job_id = ?
               AND a.entity_type = 'visit'
               AND (a.mime_type LIKE 'image/%' OR LOWER(a.original_name) REGEXP '\\\\.(jpe?g|png|gif|webp|heic)$')
             ORDER BY v.visit_date DESC, a.uploaded_at DESC
        ");
        $s->execute([$cid, $claim_id]);
        json_list($s->fetchAll());
    } catch (Throwable $e) {
        if (stripos($e->getMessage(), 'claim_room_id') === false
            && stripos($e->getMessage(), 'unknown column') === false) throw $e;
        $s = $db->prepare("
            SELECT a.id, a.file_url, a.original_name, a.mime_type, a.size_bytes,
                   a.caption, a.uploaded_at,
                   COALESCE(u.display_name, u.username) AS uploaded_by_name,
                   v.id AS visit_id, v.visit_date
              FROM entity_attachments a
              JOIN visits v ON v.id = a.entity_id
              LEFT JOIN users u ON u.id = a.uploaded_by
             WHERE a.company_id = ? AND v.job_id = ?
               AND a.entity_type = 'visit'
               AND (a.mime_type LIKE 'image/%' OR LOWER(a.original_name) REGEXP '\\\\.(jpe?g|png|gif|webp|heic)$')
             ORDER BY v.visit_date DESC, a.uploaded_at DESC
        ");
        $s->execute([$cid, $claim_id]);
        json_list($s->fetchAll());
    }
}

// ── GET /predict?claim_id=N ─────────────────────────────────────────────────
// F18.11b: linear-fit-based dry-end-date prediction per claim. See
// api/lib/drylog_predict.php for the math.
if ($method === 'GET' && $action === 'predict') {
    $claim_id = (int)($_GET['claim_id'] ?? 0);
    if ($claim_id <= 0) json_error('claim_id required', 422);
    if (!tc_drylog_claim_for_company($db, $cid, $claim_id)) json_error('Claim not found', 404);
    json_ok(tc_drylog_predict_dry_date($db, $cid, $claim_id));
}

json_error('Not found', 404);
