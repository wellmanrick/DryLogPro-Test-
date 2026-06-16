<?php
// room_work_items.php — per-room "Work Log" for DryLog PRO. Captures what the
// crew actually did in a room, dated per visit: demo/removed line items
// (qty + unit), consumables used, and a per-visit room note.
//
//   GET    /api/room-work-items?claim_id=N[&claim_room_id=R][&visit_id=V]
//   POST   /api/room-work-items   { claim_room_id, visit_id?, item_type,
//                                   category?, label?, qty?, unit?, notes? }
//   PUT    /api/room-work-items/{id}   { label?, qty?, unit?, notes?, category? }
//   DELETE /api/room-work-items/{id}
//
// item_type ∈ {demo, consumable, note}. A non-null room/visit must belong to
// the SAME claim (not just the same company). Pre-patch safe: if the
// room_work_items table doesn't exist yet, GET returns [] instead of 500.

require_once __DIR__ . '/../lib/drylog_pro_model.php';

$db     = $GLOBALS['db'];
$method = $GLOBALS['method'];
$id     = $GLOBALS['route_id'];
$user   = require_auth($db);
$cid    = (int)$user['company_id'];

const _RWI_TYPES = ['demo', 'consumable', 'note'];

// Resolve the claim a visit belongs to (job_id), scoped to company. 0 if miss.
function _rwi_visit_claim(PDO $db, int $cid, int $visit_id): int {
    $s = $db->prepare("SELECT job_id FROM visits WHERE id = ? AND company_id = ?");
    $s->execute([$visit_id, $cid]);
    return (int)($s->fetchColumn() ?: 0);
}

// ── GET list (claim-scoped) ─────────────────────────────────────────────────
if ($method === 'GET' && !$id) {
    $claim_id = (int)($_GET['claim_id'] ?? 0);
    if ($claim_id <= 0) json_error('claim_id required', 422);
    if (!tc_drylog_claim_for_company($db, $cid, $claim_id)) json_error('Claim not found', 404);

    $where = "w.company_id = ? AND r.claim_id = ?";
    $args  = [$cid, $claim_id];
    if (!empty($_GET['claim_room_id'])) { $where .= " AND w.claim_room_id = ?"; $args[] = (int)$_GET['claim_room_id']; }
    if (!empty($_GET['visit_id']))      { $where .= " AND w.visit_id = ?";      $args[] = (int)$_GET['visit_id']; }

    try {
        $stmt = $db->prepare("
            SELECT w.*, r.name AS room_name, v.visit_date,
                   COALESCE(u.display_name, u.username) AS created_by_name
              FROM room_work_items w
              JOIN claim_rooms r ON r.id = w.claim_room_id
              LEFT JOIN visits v ON v.id = w.visit_id
              LEFT JOIN users  u ON u.id = w.created_by
             WHERE $where
             ORDER BY COALESCE(v.visit_date, w.created_at) DESC, w.id DESC
        ");
        $stmt->execute($args);
        json_list($stmt->fetchAll());
    } catch (Throwable $e) {
        // Pre-patch: table not created yet → behave as empty so the field app
        // (and dashboard tile) work before run-patches.sh is run.
        if (stripos($e->getMessage(), 'room_work_items') !== false
            && (stripos($e->getMessage(), "doesn't exist") !== false
                || stripos($e->getMessage(), 'no such table') !== false
                || stripos($e->getMessage(), 'base table or view not found') !== false)) {
            json_list([]);
        }
        throw $e;
    }
}

// ── POST create ─────────────────────────────────────────────────────────────
if ($method === 'POST' && !$id) {
    $b = get_json_body();
    $claim_room_id = (int)($b['claim_room_id'] ?? 0);
    $item_type     = trim((string)($b['item_type'] ?? ''));
    if ($claim_room_id <= 0)                       json_error('claim_room_id required', 422);
    if (!in_array($item_type, _RWI_TYPES, true))   json_error('item_type must be demo, consumable, or note', 422);

    $room = tc_drylog_room_for_company($db, $cid, $claim_room_id);
    if (!$room) json_error('Room not found', 404);
    $room_claim = (int)$room['claim_id'];

    // visit_id is how we date the entry; require it to belong to the same claim.
    $visit_id = isset($b['visit_id']) && $b['visit_id'] !== '' ? (int)$b['visit_id'] : null;
    if ($visit_id !== null) {
        if (_rwi_visit_claim($db, $cid, $visit_id) !== $room_claim) {
            json_error('Visit not found on this claim', 422);
        }
    }

    $category = isset($b['category']) ? (trim((string)$b['category']) ?: null) : null;
    $label    = isset($b['label'])    ? (trim((string)$b['label'])    ?: null) : null;
    $unit     = isset($b['unit'])     ? (trim((string)$b['unit'])     ?: null) : null;
    $notes    = isset($b['notes'])    ? (trim((string)$b['notes'])    ?: null) : null;
    $qty      = (isset($b['qty']) && $b['qty'] !== '' && is_numeric($b['qty'])) ? (float)$b['qty'] : null;

    if ($item_type === 'note' && $notes === null) json_error('note text required', 422);

    $db->prepare("
        INSERT INTO room_work_items
            (company_id, claim_room_id, visit_id, item_type, category, label, qty, unit, notes, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ")->execute([$cid, $claim_room_id, $visit_id, $item_type, $category, $label, $qty, $unit, $notes, (int)$user['id']]);

    $new_id = (int)$db->lastInsertId();
    $s = $db->prepare("SELECT * FROM room_work_items WHERE id = ?");
    $s->execute([$new_id]);
    json_ok($s->fetch(), 201);
}

// ── PUT update ──────────────────────────────────────────────────────────────
if ($method === 'PUT' && $id) {
    $s = $db->prepare("SELECT * FROM room_work_items WHERE id = ? AND company_id = ?");
    $s->execute([$id, $cid]);
    $row = $s->fetch();
    if (!$row) json_error('Not found', 404);

    $b = get_json_body();
    $fields = pick($b, ['label', 'qty', 'unit', 'notes', 'category']);
    if (empty($fields)) json_error('No fields to update');
    if (array_key_exists('qty', $fields)) {
        $fields['qty'] = ($fields['qty'] !== '' && $fields['qty'] !== null && is_numeric($fields['qty'])) ? (float)$fields['qty'] : null;
    }

    $sets = implode(', ', array_map(fn($k) => "$k = ?", array_keys($fields)));
    $vals = array_values($fields);
    $vals[] = $id; $vals[] = $cid;
    $db->prepare("UPDATE room_work_items SET $sets WHERE id = ? AND company_id = ?")->execute($vals);

    $s = $db->prepare("SELECT * FROM room_work_items WHERE id = ?");
    $s->execute([$id]);
    json_ok($s->fetch());
}

// ── DELETE ──────────────────────────────────────────────────────────────────
if ($method === 'DELETE' && $id) {
    $s = $db->prepare("SELECT * FROM room_work_items WHERE id = ? AND company_id = ?");
    $s->execute([$id, $cid]);
    $row = $s->fetch();
    if (!$row) json_error('Not found', 404);

    // Office roles can delete anything; a field tech can delete what they
    // logged themselves. (require_role exit()s, so check inline.)
    $isOffice  = in_array($user['role'] ?? '', ['Owner', 'GM', 'Admin'], true);
    $isCreator = ((int)$row['created_by'] === (int)$user['id']);
    if (!$isOffice && !$isCreator) json_error('Forbidden', 403);

    $db->prepare("DELETE FROM room_work_items WHERE id = ? AND company_id = ?")->execute([$id, $cid]);
    json_ok(null);
}

json_error('Not found', 404);
