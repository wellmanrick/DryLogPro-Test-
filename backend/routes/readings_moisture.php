<?php
// Moisture readings at a persistent reading point.

require_once __DIR__ . '/../lib/drylog_pro_model.php';
require_once __DIR__ . '/../lib/alerts.php';

$db     = $GLOBALS['db'];
$method = $GLOBALS['method'];
$id     = $GLOBALS['reading_route_id'] ?? null;
$sub    = $GLOBALS['reading_sub_action'] ?? null;
$user   = require_auth($db);
$cid    = (int)$user['company_id'];

function _dlp_moisture_point_context(PDO $db, int $cid, int $point_id): ?array {
    $s = $db->prepare("
        SELECT rp.id AS reading_point_id,
               s.id AS claim_surface_id, s.dry_goal, s.dry_goal_unit,
               z.id AS drying_zone_id, z.claim_id
          FROM reading_points rp
          JOIN claim_surfaces s ON s.id = rp.claim_surface_id
          JOIN drying_zones z ON z.id = s.drying_zone_id
         WHERE rp.id = ? AND rp.company_id = ?
           AND rp.deleted_at IS NULL AND s.deleted_at IS NULL AND z.deleted_at IS NULL
         LIMIT 1
    ");
    $s->execute([$point_id, $cid]);
    $row = $s->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}

if ($method === 'GET' && $id && $sub === 'history') {
    json_list(tc_drylog_edit_history($db, $cid, 'moisture_readings', (int)$id));
}

if ($method === 'GET' && $id) {
    $s = $db->prepare("SELECT * FROM moisture_readings WHERE id = ? AND company_id = ?");
    $s->execute([$id, $cid]);
    $row = $s->fetch();
    if (!$row) json_error('Not found', 404);
    json_ok($row);
}

if ($method === 'GET') {
    $claim_id = (int)($_GET['claim_id'] ?? 0);
    $zone_id = (int)($_GET['drying_zone_id'] ?? 0);
    $surface_id = (int)($_GET['claim_surface_id'] ?? 0);
    $point_id = (int)($_GET['reading_point_id'] ?? 0);
    $where = ['company_id = ?'];
    $params = [$cid];
    if ($point_id > 0) {
        if (!tc_drylog_point_for_company($db, $cid, $point_id)) json_error('Reading point not found', 404);
        $where[] = 'reading_point_id = ?'; $params[] = $point_id;
    } elseif ($surface_id > 0) {
        if (!tc_drylog_surface_for_company($db, $cid, $surface_id)) json_error('Surface not found', 404);
        $where[] = 'claim_surface_id = ?'; $params[] = $surface_id;
    } elseif ($zone_id > 0) {
        if (!tc_drylog_zone_for_company($db, $cid, $zone_id)) json_error('Drying zone not found', 404);
        $where[] = 'drying_zone_id = ?'; $params[] = $zone_id;
    } elseif ($claim_id > 0) {
        if (!tc_drylog_claim_for_company($db, $cid, $claim_id)) json_error('Claim not found', 404);
        $where[] = 'claim_id = ?'; $params[] = $claim_id;
    } else {
        json_error('claim_id, drying_zone_id, claim_surface_id, or reading_point_id required', 422);
    }
    $s = $db->prepare("SELECT * FROM moisture_readings WHERE " . implode(' AND ', $where) . " ORDER BY reading_at DESC, id DESC");
    $s->execute($params);
    json_list($s->fetchAll());
}

if ($method === 'POST') {
    $b = get_json_body();
    $point_id = (int)($b['reading_point_id'] ?? 0);
    $visit_id = (int)($b['visit_id'] ?? 0);
    $reading_at = trim((string)($b['reading_at'] ?? date('Y-m-d H:i:s')));
    $value = isset($b['moisture_value']) ? (float)$b['moisture_value'] : null;
    if ($point_id <= 0) json_error('reading_point_id required', 422);
    if ($visit_id <= 0) json_error('visit_id required', 422);
    if ($value === null) json_error('moisture_value required', 422);

    $ctx = _dlp_moisture_point_context($db, $cid, $point_id);
    if (!$ctx) json_error('Reading point not found', 404);
    $claim_id = (int)$ctx['claim_id'];
    if (!tc_drylog_visit_for_claim($db, $cid, $visit_id, $claim_id)) json_error('Visit not found on this claim', 422);

    $goal = $ctx['dry_goal'] !== null ? (float)$ctx['dry_goal'] : null;
    $unit = isset($b['moisture_unit']) ? trim((string)$b['moisture_unit']) : ($ctx['dry_goal_unit'] ?: '%MC');
    $is_dry = ($goal !== null && $value <= $goal) ? 1 : 0;

    $db->prepare("
        INSERT INTO moisture_readings
            (company_id, claim_id, drying_zone_id, claim_surface_id, reading_point_id,
             visit_id, reading_at, moisture_value, moisture_unit, dry_goal_snapshot,
             surface_temp_f, meter_make_model, is_dry_at_time, photo_url,
             captured_by_user_id, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ")->execute([
        $cid, $claim_id, (int)$ctx['drying_zone_id'], (int)$ctx['claim_surface_id'],
        $point_id, $visit_id, $reading_at, $value, $unit, $goal,
        isset($b['surface_temp_f']) ? (float)$b['surface_temp_f'] : null,
        isset($b['meter_make_model']) ? trim((string)$b['meter_make_model']) : null,
        $is_dry,
        isset($b['photo_url']) ? trim((string)$b['photo_url']) : null,
        (int)$user['id'],
        isset($b['notes']) ? trim((string)$b['notes']) : null,
    ]);

    $new_id = (int)$db->lastInsertId();
    tc_drylog_recompute_surface_dryness($db, $cid, (int)$ctx['claim_surface_id']);
    $alerts = tc_alerts_evaluate($db, $cid, $claim_id, 'moisture_readings', $new_id);
    $s = $db->prepare("SELECT * FROM moisture_readings WHERE id = ? AND company_id = ?");
    $s->execute([$new_id, $cid]);
    json_ok(['reading' => $s->fetch(), 'alerts_fired' => $alerts['alerts_fired']], 201);
}

json_error('Not found', 404);
