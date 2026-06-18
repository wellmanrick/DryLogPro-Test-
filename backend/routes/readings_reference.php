<?php
// Baseline atmosphere readings: outdoor or unaffected indoor.

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
    json_list(tc_drylog_edit_history($db, $cid, 'reference_readings', (int)$id));
}

if ($method === 'GET' && $id) {
    $s = $db->prepare("SELECT * FROM reference_readings WHERE id = ? AND company_id = ?");
    $s->execute([$id, $cid]);
    $row = $s->fetch();
    if (!$row) json_error('Not found', 404);
    json_ok($row);
}

if ($method === 'GET') {
    $claim_id = (int)($_GET['claim_id'] ?? 0);
    if ($claim_id <= 0) json_error('claim_id required', 422);
    if (!tc_drylog_claim_for_company($db, $cid, $claim_id)) json_error('Claim not found', 404);
    $s = $db->prepare("
        SELECT *
          FROM reference_readings
         WHERE company_id = ? AND claim_id = ?
         ORDER BY reading_at DESC, id DESC
    ");
    $s->execute([$cid, $claim_id]);
    json_list($s->fetchAll());
}

if ($method === 'POST') {
    $b = get_json_body();
    $claim_id = (int)($b['claim_id'] ?? 0);
    $visit_id = isset($b['visit_id']) && $b['visit_id'] !== null ? (int)$b['visit_id'] : null;
    $type = trim((string)($b['reading_type'] ?? ''));
    $reading_at = trim((string)($b['reading_at'] ?? date('Y-m-d H:i:s')));
    $temp_f = isset($b['temp_f']) ? (float)$b['temp_f'] : null;
    $rh_pct = isset($b['rh_pct']) ? (float)$b['rh_pct'] : null;

    if ($claim_id <= 0) json_error('claim_id required', 422);
    if (!in_array($type, ['outdoor', 'unaffected_indoor'], true)) json_error('reading_type must be outdoor or unaffected_indoor', 422);
    if ($temp_f === null) json_error('temp_f required', 422);
    if ($rh_pct === null) json_error('rh_pct required', 422);
    if (!tc_drylog_claim_for_company($db, $cid, $claim_id)) json_error('Claim not found', 404);
    if ($visit_id && !tc_drylog_visit_for_claim($db, $cid, $visit_id, $claim_id)) json_error('Visit not found on this claim', 422);

    $p = tc_psychro($temp_f, $rh_pct);
    $db->prepare("
        INSERT INTO reference_readings
            (company_id, claim_id, visit_id, reading_type, source_label, reading_at,
             temp_f, rh_pct, gpp, dew_point_f, vapor_pressure_kpa,
             weather_source, captured_by_user_id, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ")->execute([
        $cid, $claim_id, $visit_id, $type,
        isset($b['source_label']) ? trim((string)$b['source_label']) : null,
        $reading_at, $temp_f, $rh_pct, $p['gpp'], $p['dew_point_f'],
        $p['vapor_pressure_kpa'],
        isset($b['weather_source']) ? trim((string)$b['weather_source']) : null,
        (int)$user['id'],
        isset($b['notes']) ? trim((string)$b['notes']) : null,
    ]);

    $new_id = (int)$db->lastInsertId();
    $alerts = tc_alerts_evaluate($db, $cid, $claim_id, 'reference_readings', $new_id);
    $s = $db->prepare("SELECT * FROM reference_readings WHERE id = ? AND company_id = ?");
    $s->execute([$new_id, $cid]);
    json_ok(['reading' => $s->fetch(), 'derived' => $p, 'alerts_fired' => $alerts['alerts_fired']], 201);
}

json_error('Not found', 404);
