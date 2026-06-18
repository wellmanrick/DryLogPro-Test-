<?php

$db     = $GLOBALS['db'];
$method = $GLOBALS['method'];
$id     = $GLOBALS['route_id'];
$user   = require_auth($db);
$cid    = (int)$user['company_id'];

function _ea_visit_claim(PDO $db, int $cid, int $visit_id): int {
    $s = $db->prepare("SELECT job_id FROM visits WHERE id = ? AND company_id = ?");
    $s->execute([$visit_id, $cid]);
    return (int)($s->fetchColumn() ?: 0);
}

if ($method === 'GET' && $id) {
    $s = $db->prepare("SELECT * FROM entity_attachments WHERE id = ? AND company_id = ?");
    $s->execute([$id, $cid]);
    $row = $s->fetch();
    if (!$row) json_error('Not found', 404);
    json_ok($row);
}

if ($method === 'GET') {
    $entity_type = trim((string)($_GET['entity_type'] ?? ''));
    $entity_id = (int)($_GET['entity_id'] ?? 0);
    $claim_id = (int)($_GET['claim_id'] ?? 0);
    if ($entity_type === '') json_error('entity_type required', 422);

    if ($claim_id > 0 && $entity_type === 'visit') {
        $j = $db->prepare("SELECT id FROM jobs WHERE id = ? AND company_id = ?");
        $j->execute([$claim_id, $cid]);
        if (!$j->fetch()) json_error('Claim not found', 404);
        $s = $db->prepare("
            SELECT a.*, r.name AS room_name
              FROM entity_attachments a
              JOIN visits v ON v.id = a.entity_id AND v.company_id = a.company_id
              LEFT JOIN claim_rooms r ON r.id = a.claim_room_id AND r.company_id = a.company_id
             WHERE a.company_id = ? AND a.entity_type = 'visit' AND v.job_id = ?
             ORDER BY a.uploaded_at DESC, a.id DESC
        ");
        $s->execute([$cid, $claim_id]);
        json_list($s->fetchAll());
    }

    if ($entity_id <= 0) json_error('entity_id or claim_id required', 422);
    if ($entity_type === 'visit' && !_ea_visit_claim($db, $cid, $entity_id)) json_error('Visit not found', 404);

    $s = $db->prepare("
        SELECT a.*, r.name AS room_name
          FROM entity_attachments a
          LEFT JOIN claim_rooms r ON r.id = a.claim_room_id AND r.company_id = a.company_id
         WHERE a.company_id = ? AND a.entity_type = ? AND a.entity_id = ?
         ORDER BY a.uploaded_at DESC, a.id DESC
    ");
    $s->execute([$cid, $entity_type, $entity_id]);
    json_list($s->fetchAll());
}

if ($method === 'POST' && !$id) {
    $entity_type = trim((string)($_POST['entity_type'] ?? ''));
    $entity_id = (int)($_POST['entity_id'] ?? 0);
    if ($entity_type === '') json_error('entity_type required', 422);
    if ($entity_id <= 0) json_error('entity_id required', 422);
    if (empty($_FILES['file']) || !is_uploaded_file($_FILES['file']['tmp_name'] ?? '')) {
        json_error('file required', 422);
    }
    if ($entity_type === 'visit' && !_ea_visit_claim($db, $cid, $entity_id)) json_error('Visit not found', 404);

    $claim_room_id = isset($_POST['claim_room_id']) && $_POST['claim_room_id'] !== '' ? (int)$_POST['claim_room_id'] : null;
    if ($claim_room_id !== null) {
        $rs = $db->prepare("SELECT id FROM claim_rooms WHERE id = ? AND company_id = ? AND deleted_at IS NULL");
        $rs->execute([$claim_room_id, $cid]);
        if (!$rs->fetch()) json_error('Room not found', 422);
    }

    $f = $_FILES['file'];
    $ext = strtolower(pathinfo((string)$f['name'], PATHINFO_EXTENSION));
    $base = preg_replace('/[^a-zA-Z0-9._-]/', '_', pathinfo((string)$f['name'], PATHINFO_FILENAME)) ?: 'attachment';
    $safe = date('Ymd_His') . '_' . substr(bin2hex(random_bytes(4)), 0, 8) . '_' . $base . ($ext ? '.' . $ext : '');
    $dir = __DIR__ . "/../public/uploads/attachments/$cid/$entity_type/$entity_id";
    if (!is_dir($dir) && !@mkdir($dir, 0775, true) && !is_dir($dir)) {
        json_error('Could not create upload directory', 500);
    }
    $dest = $dir . '/' . $safe;
    if (!move_uploaded_file($f['tmp_name'], $dest)) json_error('Upload failed', 500);
    $rel = "uploads/attachments/$cid/$entity_type/$entity_id/$safe";

    $db->prepare("
        INSERT INTO entity_attachments
            (company_id, entity_type, entity_id, claim_room_id, file_url,
             original_name, mime_type, size_bytes, caption, uploaded_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ")->execute([
        $cid, $entity_type, $entity_id, $claim_room_id, $rel,
        (string)$f['name'],
        ($f['type'] ?? null) ?: null,
        (int)$f['size'],
        isset($_POST['caption']) ? trim((string)$_POST['caption']) : null,
        (int)$user['id'],
    ]);

    $new_id = (int)$db->lastInsertId();
    $s = $db->prepare("SELECT * FROM entity_attachments WHERE id = ? AND company_id = ?");
    $s->execute([$new_id, $cid]);
    json_ok($s->fetch(), 201);
}

if ($method === 'PUT' && $id) {
    $s = $db->prepare("SELECT * FROM entity_attachments WHERE id = ? AND company_id = ?");
    $s->execute([$id, $cid]);
    if (!$s->fetch()) json_error('Not found', 404);
    $b = get_json_body();
    $fields = pick($b, ['caption', 'claim_room_id']);
    if (array_key_exists('claim_room_id', $fields) && ($fields['claim_room_id'] === '' || $fields['claim_room_id'] === null)) {
        $fields['claim_room_id'] = null;
    }
    if (empty($fields)) json_error('No fields to update');
    $sets = implode(', ', array_map(fn($k) => "$k = ?", array_keys($fields)));
    $vals = array_values($fields);
    $vals[] = $id;
    $vals[] = $cid;
    $db->prepare("UPDATE entity_attachments SET $sets WHERE id = ? AND company_id = ?")->execute($vals);
    $s = $db->prepare("SELECT * FROM entity_attachments WHERE id = ? AND company_id = ?");
    $s->execute([$id, $cid]);
    json_ok($s->fetch());
}

if ($method === 'DELETE' && $id) {
    $s = $db->prepare("SELECT file_url FROM entity_attachments WHERE id = ? AND company_id = ?");
    $s->execute([$id, $cid]);
    $file = $s->fetchColumn();
    if (!$file) json_error('Not found', 404);
    $db->prepare("DELETE FROM entity_attachments WHERE id = ? AND company_id = ?")->execute([$id, $cid]);
    $path = __DIR__ . '/../public/' . ltrim((string)$file, '/');
    if (is_file($path)) @unlink($path);
    json_ok(null);
}

json_error('Not found', 404);
