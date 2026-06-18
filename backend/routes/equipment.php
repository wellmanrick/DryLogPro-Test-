<?php

$db     = $GLOBALS['db'];
$method = $GLOBALS['method'];
$id     = $GLOBALS['route_id'];
$user   = require_auth($db);
$cid    = (int)$user['company_id'];

if ($method === 'GET' && $id) {
    $s = $db->prepare("SELECT * FROM equipment WHERE id = ? AND company_id = ?");
    $s->execute([$id, $cid]);
    $row = $s->fetch();
    if (!$row) json_error('Not found', 404);
    json_ok($row);
}

if ($method === 'GET') {
    $s = $db->prepare("
        SELECT e.*,
               d.job_id AS deployed_job_id,
               d.id AS active_deploy_id,
               d.drying_zone_id
          FROM equipment e
          LEFT JOIN equipment_deploys d
                 ON d.equipment_id = e.id
                AND d.company_id = e.company_id
                AND d.returned_at IS NULL
         WHERE e.company_id = ?
         ORDER BY e.type, e.make, e.model, e.asset_tag, e.id
    ");
    $s->execute([$cid]);
    json_list($s->fetchAll());
}

if ($method === 'POST' && !$id) {
    require_role($user, 'Owner', 'GM', 'Admin', 'PM');
    $b = get_json_body();
    $db->prepare("
        INSERT INTO equipment
            (company_id, type, make, model, serial_no, asset_tag, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ")->execute([
        $cid,
        isset($b['type']) ? trim((string)$b['type']) : null,
        isset($b['make']) ? trim((string)$b['make']) : null,
        isset($b['model']) ? trim((string)$b['model']) : null,
        isset($b['serial_no']) ? trim((string)$b['serial_no']) : null,
        isset($b['asset_tag']) ? trim((string)$b['asset_tag']) : null,
        isset($b['status']) ? trim((string)$b['status']) : 'available',
    ]);
    $new_id = (int)$db->lastInsertId();
    $s = $db->prepare("SELECT * FROM equipment WHERE id = ? AND company_id = ?");
    $s->execute([$new_id, $cid]);
    json_ok($s->fetch(), 201);
}

json_error('Not found', 404);
