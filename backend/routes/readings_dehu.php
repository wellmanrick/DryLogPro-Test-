<?php
// Dehumidifier intake/exhaust performance readings.

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
    json_list(tc_drylog_edit_history($db, $cid, 'dehu_performance_readings', (int)$id));
}

if ($method === 'GET' && $id) {
    $s = $db->prepare("SELECT * FROM dehu_performance_readings WHERE id = ? AND company_id = ?");
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
    $s = $db->prepare("SELECT * FROM dehu_performance_readings WHERE " . implode(' AND ', $where) . " ORDER BY reading_at DESC, id DESC");
    $s->execute($params);
    json_list($s->fetchAll());
}

if ($method === 'POST') {
    $b = get_json_body();
    $zone_id = (int)($b['drying_zone_id'] ?? 0);
    $visit_id = (int)($b['visit_id'] ?? 0);
    $deploy_id = isset($b['equipment_deploy_id']) && $b['equipment_deploy_id'] !== null ? (int)$b['equipment_deploy_id'] : null;
    $reading_at = trim((string)($b['reading_at'] ?? date('Y-m-d H:i:s')));
    $in_t = isset($b['intake_temp_f']) ? (float)$b['intake_temp_f'] : null;
    $in_rh = isset($b['intake_rh_pct']) ? (float)$b['intake_rh_pct'] : null;
    $ex_t = isset($b['exhaust_temp_f']) ? (float)$b['exhaust_temp_f'] : null;
    $ex_rh = isset($b['exhaust_rh_pct']) ? (float)$b['exhaust_rh_pct'] : null;

    if ($zone_id <= 0) json_error('drying_zone_id required', 422);
    if ($visit_id <= 0) json_error('visit_id required', 422);
    foreach (['intake_temp_f' => $in_t, 'intake_rh_pct' => $in_rh, 'exhaust_temp_f' => $ex_t, 'exhaust_rh_pct' => $ex_rh] as $k => $v) {
        if ($v === null) json_error("$k required", 422);
    }
    $zone = tc_drylog_zone_for_company($db, $cid, $zone_id);
    if (!$zone) json_error('Drying zone not found', 404);
    $claim_id = (int)$zone['claim_id'];
    if (!tc_drylog_visit_for_claim($db, $cid, $visit_id, $claim_id)) json_error('Visit not found on this claim', 422);
    if ($deploy_id && !tc_drylog_deploy_for_zone($db, $cid, $deploy_id, $zone_id)) json_error('Equipment deploy not found on this zone', 422);

    $in = tc_psychro($in_t, $in_rh);
    $ex = tc_psychro($ex_t, $ex_rh);
    $gd = ($in['gpp'] !== null && $ex['gpp'] !== null) ? round($in['gpp'] - $ex['gpp'], 1) : null;
    $db->prepare("
        INSERT INTO dehu_performance_readings
            (company_id, claim_id, drying_zone_id, equipment_deploy_id, visit_id,
             reading_at, intake_temp_f, intake_rh_pct, intake_gpp,
             exhaust_temp_f, exhaust_rh_pct, exhaust_gpp, grain_depression,
             hours_running, water_collected_pints, captured_by_user_id, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ")->execute([
        $cid, $claim_id, $zone_id, $deploy_id, $visit_id, $reading_at,
        $in_t, $in_rh, $in['gpp'], $ex_t, $ex_rh, $ex['gpp'], $gd,
        isset($b['hours_running']) ? (float)$b['hours_running'] : null,
        isset($b['water_collected_pints']) ? (float)$b['water_collected_pints'] : null,
        (int)$user['id'],
        isset($b['notes']) ? trim((string)$b['notes']) : null,
    ]);

    $new_id = (int)$db->lastInsertId();
    $alerts = tc_alerts_evaluate($db, $cid, $claim_id, 'dehu_performance_readings', $new_id);
    $s = $db->prepare("SELECT * FROM dehu_performance_readings WHERE id = ? AND company_id = ?");
    $s->execute([$new_id, $cid]);
    json_ok(['reading' => $s->fetch(), 'derived' => ['intake' => $in, 'exhaust' => $ex, 'grain_depression' => $gd], 'alerts_fired' => $alerts['alerts_fired']], 201);
}

json_error('Not found', 404);
