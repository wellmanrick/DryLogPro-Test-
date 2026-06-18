<?php

$db     = $GLOBALS['db'];
$method = $GLOBALS['method'];
$id     = $GLOBALS['route_id'];
$user   = require_auth($db);
$cid    = (int)$user['company_id'];

if ($method === 'GET' && $id) {
    $s = $db->prepare("SELECT * FROM jobs WHERE id = ? AND company_id = ?");
    $s->execute([$id, $cid]);
    $row = $s->fetch();
    if (!$row) json_error('Not found', 404);
    json_ok($row);
}

if ($method === 'GET') {
    $where = ['company_id = ?'];
    $args = [$cid];
    if (!empty($_GET['status'])) {
        $where[] = 'status = ?';
        $args[] = trim((string)$_GET['status']);
    }
    $s = $db->prepare("SELECT * FROM jobs WHERE " . implode(' AND ', $where) . " ORDER BY updated_at DESC, id DESC LIMIT 500");
    $s->execute($args);
    json_list($s->fetchAll());
}

if ($method === 'POST' && !$id) {
    $b = get_json_body();
    $customer = isset($b['customer']) ? trim((string)$b['customer']) : null;
    $address = isset($b['address']) ? trim((string)$b['address']) : null;
    $db->prepare("
        INSERT INTO jobs
            (company_id, customer, address, claim_no, loss_type, source_of_loss, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ")->execute([
        $cid,
        $customer,
        $address,
        isset($b['claim_no']) ? trim((string)$b['claim_no']) : null,
        isset($b['loss_type']) ? trim((string)$b['loss_type']) : null,
        isset($b['source_of_loss']) ? trim((string)$b['source_of_loss']) : null,
        isset($b['status']) ? trim((string)$b['status']) : 'open',
    ]);
    $new_id = (int)$db->lastInsertId();
    $s = $db->prepare("SELECT * FROM jobs WHERE id = ? AND company_id = ?");
    $s->execute([$new_id, $cid]);
    json_ok($s->fetch(), 201);
}

if ($method === 'PUT' && $id) {
    $s = $db->prepare("SELECT id FROM jobs WHERE id = ? AND company_id = ?");
    $s->execute([$id, $cid]);
    if (!$s->fetch()) json_error('Not found', 404);

    $b = get_json_body();
    $fields = pick($b, ['customer', 'address', 'claim_no', 'loss_type', 'source_of_loss', 'status']);
    if (empty($fields)) json_error('No fields to update');
    $sets = implode(', ', array_map(fn($k) => "$k = ?", array_keys($fields)));
    $vals = array_values($fields);
    $vals[] = $id;
    $vals[] = $cid;
    $db->prepare("UPDATE jobs SET $sets WHERE id = ? AND company_id = ?")->execute($vals);

    $s = $db->prepare("SELECT * FROM jobs WHERE id = ? AND company_id = ?");
    $s->execute([$id, $cid]);
    json_ok($s->fetch());
}

json_error('Not found', 404);
