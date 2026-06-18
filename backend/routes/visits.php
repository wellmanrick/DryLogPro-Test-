<?php

$db     = $GLOBALS['db'];
$method = $GLOBALS['method'];
$id     = $GLOBALS['route_id'];
$user   = require_auth($db);
$cid    = (int)$user['company_id'];

if ($method === 'GET' && $id) {
    $s = $db->prepare("SELECT * FROM visits WHERE id = ? AND company_id = ?");
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

    $where = ['company_id = ?', 'job_id = ?'];
    $args = [$cid, $job_id];
    if (!empty($_GET['start'])) { $where[] = 'visit_date >= ?'; $args[] = $_GET['start']; }
    if (!empty($_GET['end'])) { $where[] = 'visit_date <= ?'; $args[] = $_GET['end']; }
    $s = $db->prepare("SELECT * FROM visits WHERE " . implode(' AND ', $where) . " ORDER BY visit_date DESC, id DESC");
    $s->execute($args);
    json_list($s->fetchAll());
}

if ($method === 'POST' && !$id) {
    $b = get_json_body();
    $job_id = (int)($b['job_id'] ?? 0);
    $visit_date = trim((string)($b['visit_date'] ?? date('Y-m-d')));
    if ($job_id <= 0) json_error('job_id required', 422);
    $j = $db->prepare("SELECT id FROM jobs WHERE id = ? AND company_id = ?");
    $j->execute([$job_id, $cid]);
    if (!$j->fetch()) json_error('Job not found', 404);

    $db->prepare("
        INSERT INTO visits
            (company_id, job_id, tech_user_id, visit_date, day_index, visit_type, submitted_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ")->execute([
        $cid,
        $job_id,
        (int)$user['id'],
        $visit_date,
        isset($b['day_index']) ? (int)$b['day_index'] : null,
        isset($b['visit_type']) ? trim((string)$b['visit_type']) : 'followup',
        isset($b['submitted_at']) ? trim((string)$b['submitted_at']) : null,
    ]);
    $new_id = (int)$db->lastInsertId();
    $s = $db->prepare("SELECT * FROM visits WHERE id = ? AND company_id = ?");
    $s->execute([$new_id, $cid]);
    json_ok($s->fetch(), 201);
}

if ($method === 'PUT' && $id) {
    $s = $db->prepare("SELECT id FROM visits WHERE id = ? AND company_id = ?");
    $s->execute([$id, $cid]);
    if (!$s->fetch()) json_error('Not found', 404);
    $b = get_json_body();
    $fields = pick($b, ['visit_date', 'day_index', 'visit_type', 'submitted_at']);
    if (empty($fields)) json_error('No fields to update');
    $sets = implode(', ', array_map(fn($k) => "$k = ?", array_keys($fields)));
    $vals = array_values($fields);
    $vals[] = $id;
    $vals[] = $cid;
    $db->prepare("UPDATE visits SET $sets WHERE id = ? AND company_id = ?")->execute($vals);
    $s = $db->prepare("SELECT * FROM visits WHERE id = ? AND company_id = ?");
    $s->execute([$id, $cid]);
    json_ok($s->fetch());
}

json_error('Not found', 404);
