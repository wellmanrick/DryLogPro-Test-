<?php

$db     = $GLOBALS['db'];
$method = $GLOBALS['method'];
$id     = $GLOBALS['route_id'];
$user   = require_auth($db);
$cid    = (int)$user['company_id'];

if ($method === 'GET' && $id) {
    $s = $db->prepare("
        SELECT d.*, e.type, e.make, e.model, e.serial_no, e.asset_tag,
               TIMESTAMPDIFF(HOUR, d.deployed_at, COALESCE(d.returned_at, NOW())) AS hours_deployed
          FROM equipment_deploys d
          JOIN equipment e ON e.id = d.equipment_id AND e.company_id = d.company_id
         WHERE d.id = ? AND d.company_id = ?
    ");
    $s->execute([$id, $cid]);
    $row = $s->fetch();
    if (!$row) json_error('Not found', 404);
    json_ok($row);
}

if ($method === 'GET') {
    $job_id = (int)($_GET['job_id'] ?? 0);
    if ($job_id <= 0) json_error('job_id required', 422);
    $j = $db->prepare("SELECT id FROM jobs WHERE id = ? AND company_id = ?");
    $j->execute([$job_id, $cid]);
    if (!$j->fetch()) json_error('Job not found', 404);

    $where = ['d.company_id = ?', 'd.job_id = ?'];
    $args = [$cid, $job_id];
    if (!empty($_GET['active'])) $where[] = 'd.returned_at IS NULL';

    $s = $db->prepare("
        SELECT d.*, e.type, e.make, e.model, e.serial_no, e.asset_tag,
               TIMESTAMPDIFF(HOUR, d.deployed_at, COALESCE(d.returned_at, NOW())) AS hours_deployed
          FROM equipment_deploys d
          JOIN equipment e ON e.id = d.equipment_id AND e.company_id = d.company_id
         WHERE " . implode(' AND ', $where) . "
         ORDER BY d.returned_at IS NULL DESC, d.deployed_at DESC, d.id DESC
    ");
    $s->execute($args);
    json_list($s->fetchAll());
}

if ($method === 'POST' && !$id) {
    $b = get_json_body();
    $equipment_id = (int)($b['equipment_id'] ?? 0);
    $job_id = (int)($b['job_id'] ?? 0);
    if ($equipment_id <= 0) json_error('equipment_id required', 422);
    if ($job_id <= 0) json_error('job_id required', 422);

    $e = $db->prepare("SELECT id FROM equipment WHERE id = ? AND company_id = ?");
    $e->execute([$equipment_id, $cid]);
    if (!$e->fetch()) json_error('Equipment not found', 404);
    $j = $db->prepare("SELECT id FROM jobs WHERE id = ? AND company_id = ?");
    $j->execute([$job_id, $cid]);
    if (!$j->fetch()) json_error('Job not found', 404);
    $active = $db->prepare("SELECT id FROM equipment_deploys WHERE equipment_id = ? AND company_id = ? AND returned_at IS NULL LIMIT 1");
    $active->execute([$equipment_id, $cid]);
    if ($active->fetch()) json_error('Equipment is already deployed', 409);

    $db->prepare("
        INSERT INTO equipment_deploys
            (company_id, equipment_id, job_id, drying_zone_id, deployed_at, notes, created_by)
        VALUES (?, ?, ?, ?, NOW(), ?, ?)
    ")->execute([
        $cid,
        $equipment_id,
        $job_id,
        isset($b['drying_zone_id']) && $b['drying_zone_id'] !== null ? (int)$b['drying_zone_id'] : null,
        isset($b['notes']) ? trim((string)$b['notes']) : null,
        (int)$user['id'],
    ]);
    $new_id = (int)$db->lastInsertId();
    $s = $db->prepare("SELECT * FROM equipment_deploys WHERE id = ? AND company_id = ?");
    $s->execute([$new_id, $cid]);
    json_ok($s->fetch(), 201);
}

if ($method === 'PUT' && $id) {
    $s = $db->prepare("SELECT * FROM equipment_deploys WHERE id = ? AND company_id = ?");
    $s->execute([$id, $cid]);
    $row = $s->fetch();
    if (!$row) json_error('Not found', 404);
    $b = get_json_body();

    if (!empty($b['return']) || !empty($b['returned'])) {
        $db->prepare("UPDATE equipment_deploys SET returned_at = NOW() WHERE id = ? AND company_id = ?")->execute([$id, $cid]);
    } else {
        $fields = pick($b, ['drying_zone_id', 'notes', 'returned_at']);
        if (array_key_exists('drying_zone_id', $fields) && ($fields['drying_zone_id'] === '' || $fields['drying_zone_id'] === null)) {
            $fields['drying_zone_id'] = null;
        }
        if (empty($fields)) json_error('No fields to update');
        $sets = implode(', ', array_map(fn($k) => "$k = ?", array_keys($fields)));
        $vals = array_values($fields);
        $vals[] = $id;
        $vals[] = $cid;
        $db->prepare("UPDATE equipment_deploys SET $sets WHERE id = ? AND company_id = ?")->execute($vals);
    }

    $s = $db->prepare("SELECT * FROM equipment_deploys WHERE id = ? AND company_id = ?");
    $s->execute([$id, $cid]);
    json_ok($s->fetch());
}

json_error('Not found', 404);
