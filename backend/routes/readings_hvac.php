<?php
// HVAC supply/return/plenum atmosphere readings.

require_once __DIR__ . '/../lib/drylog_pro_model.php';
require_once __DIR__ . '/../lib/psychro.php';
require_once __DIR__ . '/../lib/alerts.php';

$db     = $GLOBALS['db'];
$method = $GLOBALS['method'];
$id     = $GLOBALS['reading_route_id'] ?? null;
$sub    = $GLOBALS['reading_sub_action'] ?? null;
$user   = require_auth($db);
$cid    = (int)$user['company_id'];

if ($method === 'GET' && $id && $sub === 'history') {
    json_list(tc_drylog_edit_history($db, $cid, 'hvac_atmosphere_readings', (int)$id));
}

if ($method === 'GET' && $id) {
    $s = $db->prepare("SELECT * FROM hvac_atmosphere_readings WHERE id = ? AND company_id = ?");
    $s->execute([$id, $cid]);
    $row = $s->fetch();
    if (!$row) json_error('Not found', 404);
    json_ok($row);
}

if ($method === 'GET') {
    $claim_id = (int)($_GET['claim_id'] ?? 0);
    $zone_id = (int)($_GET['drying_zone_id'] ?? 0);
    $where = ['company_id = ?'];
    $params = [$cid];
    if ($zone_id > 0) {
        if (!tc_drylog_zone_for_company($db, $cid, $zone_id)) json_error('Drying zone not found', 404);
        $where[] = 'drying_zone_id = ?'; $params[] = $zone_id;
    } elseif ($claim_id > 0) {
        if (!tc_drylog_claim_for_company($db, $cid, $claim_id)) json_error('Claim not found', 404);
        $where[] = 'claim_id = ?'; $params[] = $claim_id;
    } else {
        json_error('claim_id or drying_zone_id required', 422);
    }
    $s = $db->prepare("SELECT * FROM hvac_atmosphere_readings WHERE " . implode(' AND ', $where) . " ORDER BY reading_at DESC, id DESC");
    $s->execute($params);
    json_list($s->fetchAll());
}

if ($method === 'POST') {
    $b = get_json_body();
    $zone_id = (int)($b['drying_zone_id'] ?? 0);
    $visit_id = (int)($b['visit_id'] ?? 0);
    $point = trim((string)($b['measurement_point'] ?? ''));
    $reading_at = trim((string)($b['reading_at'] ?? date('Y-m-d H:i:s')));
    $temp_f = isset($b['temp_f']) ? (float)$b['temp_f'] : null;
    $rh_pct = isset($b['rh_pct']) ? (float)$b['rh_pct'] : null;

    if ($zone_id <= 0) json_error('drying_zone_id required', 422);
    if ($visit_id <= 0) json_error('visit_id required', 422);
    if (!in_array($point, ['supply', 'return', 'plenum'], true)) json_error('measurement_point must be supply, return, or plenum', 422);
    if ($temp_f === null) json_error('temp_f required', 422);
    if ($rh_pct === null) json_error('rh_pct required', 422);
    $zone = tc_drylog_zone_for_company($db, $cid, $zone_id);
    if (!$zone) json_error('Drying zone not found', 404);
    $claim_id = (int)$zone['claim_id'];
    if (!tc_drylog_visit_for_claim($db, $cid, $visit_id, $claim_id)) json_error('Visit not found on this claim', 422);

    $p = tc_psychro($temp_f, $rh_pct);
    $db->prepare("
        INSERT INTO hvac_atmosphere_readings
            (company_id, claim_id, drying_zone_id, visit_id, hvac_label,
             measurement_point, reading_at, temp_f, rh_pct, gpp, dew_point_f,
             vapor_pressure_kpa, captured_by_user_id, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ")->execute([
        $cid, $claim_id, $zone_id, $visit_id,
        isset($b['hvac_label']) ? trim((string)$b['hvac_label']) : null,
        $point, $reading_at, $temp_f, $rh_pct, $p['gpp'], $p['dew_point_f'],
        $p['vapor_pressure_kpa'], (int)$user['id'],
        isset($b['notes']) ? trim((string)$b['notes']) : null,
    ]);

    $new_id = (int)$db->lastInsertId();
    $alerts = tc_alerts_evaluate($db, $cid, $claim_id, 'hvac_atmosphere_readings', $new_id);
    $s = $db->prepare("SELECT * FROM hvac_atmosphere_readings WHERE id = ? AND company_id = ?");
    $s->execute([$new_id, $cid]);
    json_ok(['reading' => $s->fetch(), 'derived' => $p, 'alerts_fired' => $alerts['alerts_fired']], 201);
}

json_error('Not found', 404);
