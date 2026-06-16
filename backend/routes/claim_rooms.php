<?php
// claim_rooms.php — DryLog PRO persistent room registry per claim.
//
//   GET    /api/claim-rooms?claim_id=N           list rooms for a claim (active only)
//   GET    /api/claim-rooms/{id}                 single room
//   POST   /api/claim-rooms                      create. body: { claim_id, name,
//                                                room_index?, floor_level?,
//                                                length_ft?, width_ft?, height_ft?,
//                                                sketch_url?, notes? }
//   PUT    /api/claim-rooms/{id}                 update (any field above except claim_id)
//   DELETE /api/claim-rooms/{id}                 soft-delete (sets deleted_at)
//
// Spec: docs/F18-drylog-pro-spec.md §3.1, §7.1

require_once __DIR__ . '/../lib/drylog_pro_model.php';

$db     = $GLOBALS['db'];
$method = $GLOBALS['method'];
$id     = $GLOBALS['route_id'];
$user   = require_auth($db);
$cid    = (int)$user['company_id'];

// ── GET list ───────────────────────────────────────────────────────────────
if ($method === 'GET' && !$id) {
    $claim_id = (int)($_GET['claim_id'] ?? 0);
    if ($claim_id <= 0) json_error('claim_id required', 422);
    if (!tc_drylog_claim_for_company($db, $cid, $claim_id)) {
        json_error('Claim not found', 404);
    }
    $s = $db->prepare("
        SELECT id, claim_id, name, room_index, floor_level,
               length_ft, width_ft, height_ft, sketch_url, notes,
               created_at, updated_at
          FROM claim_rooms
         WHERE company_id = ? AND claim_id = ? AND deleted_at IS NULL
         ORDER BY COALESCE(room_index, 999999), id
    ");
    $s->execute([$cid, $claim_id]);
    json_list($s->fetchAll());
}

// ── GET single ─────────────────────────────────────────────────────────────
if ($method === 'GET' && $id) {
    $row = tc_drylog_room_for_company($db, $cid, $id);
    if (!$row) json_error('Not found', 404);
    json_ok($row);
}

// ── POST create ────────────────────────────────────────────────────────────
if ($method === 'POST' && !$id) {
    $b = get_json_body();
    $claim_id = (int)($b['claim_id'] ?? 0);
    $name     = trim((string)($b['name'] ?? ''));
    if ($claim_id <= 0)  json_error('claim_id required', 422);
    if ($name === '')    json_error('name required', 422);
    if (!tc_drylog_claim_for_company($db, $cid, $claim_id)) {
        json_error('Claim not found', 404);
    }

    $room_index  = isset($b['room_index'])  ? (int)$b['room_index'] : null;
    $floor_level = isset($b['floor_level']) ? trim((string)$b['floor_level']) : null;
    $length_ft   = isset($b['length_ft'])   ? (float)$b['length_ft'] : null;
    $width_ft    = isset($b['width_ft'])    ? (float)$b['width_ft']  : null;
    $height_ft   = isset($b['height_ft'])   ? (float)$b['height_ft'] : null;
    $sketch_url  = isset($b['sketch_url'])  ? trim((string)$b['sketch_url']) : null;
    $notes       = isset($b['notes'])       ? trim((string)$b['notes']) : null;

    $db->prepare("
        INSERT INTO claim_rooms
            (company_id, claim_id, name, room_index, floor_level,
             length_ft, width_ft, height_ft, sketch_url, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ")->execute([$cid, $claim_id, $name, $room_index, $floor_level,
                 $length_ft, $width_ft, $height_ft, $sketch_url, $notes]);

    $new_id = (int)$db->lastInsertId();
    json_ok(tc_drylog_room_for_company($db, $cid, $new_id), 201);
}

// ── PUT update ─────────────────────────────────────────────────────────────
if ($method === 'PUT' && $id) {
    if (!tc_drylog_room_for_company($db, $cid, $id)) {
        json_error('Not found', 404);
    }
    $b = get_json_body();
    $fields = pick($b, [
        'name','room_index','floor_level',
        'length_ft','width_ft','height_ft',
        'sketch_url','notes'
    ]);
    if (empty($fields)) json_error('No fields to update');

    if (isset($fields['name']) && trim((string)$fields['name']) === '') {
        json_error('name cannot be blank', 422);
    }

    $sets = implode(', ', array_map(fn($k) => "$k = ?", array_keys($fields)));
    $vals = array_values($fields);
    $vals[] = $id;
    $vals[] = $cid;
    $db->prepare("UPDATE claim_rooms SET $sets WHERE id = ? AND company_id = ?")
       ->execute($vals);

    json_ok(tc_drylog_room_for_company($db, $cid, $id));
}

// ── DELETE (soft) ──────────────────────────────────────────────────────────
if ($method === 'DELETE' && $id) {
    if (!tc_drylog_room_for_company($db, $cid, $id)) {
        json_error('Not found', 404);
    }
    $db->prepare("UPDATE claim_rooms SET deleted_at = NOW() WHERE id = ? AND company_id = ?")
       ->execute([$id, $cid]);
    json_ok(null);
}

json_error('Not found', 404);
