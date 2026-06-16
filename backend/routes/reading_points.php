<?php
// reading_points.php — DryLog PRO specific meter location on a surface.
//
//   GET    /api/reading-points?claim_surface_id=N    list active points on a surface
//   GET    /api/reading-points/{id}                  single point
//   POST   /api/reading-points                       create. body: {
//                                                     claim_surface_id, point_label?,
//                                                     location_notes?,
//                                                     sketch_x_pct?, sketch_y_pct? }
//   PUT    /api/reading-points/{id}                  update
//   DELETE /api/reading-points/{id}                  soft-delete
//
// Spec: docs/F18-drylog-pro-spec.md §3.5, §7.1

require_once __DIR__ . '/../lib/drylog_pro_model.php';

$db     = $GLOBALS['db'];
$method = $GLOBALS['method'];
$id     = $GLOBALS['route_id'];
$user   = require_auth($db);
$cid    = (int)$user['company_id'];

// ── GET list ───────────────────────────────────────────────────────────────
if ($method === 'GET' && !$id) {
    $surface_id = (int)($_GET['claim_surface_id'] ?? 0);
    if ($surface_id <= 0) json_error('claim_surface_id required', 422);
    if (!tc_drylog_surface_for_company($db, $cid, $surface_id)) {
        json_error('Surface not found', 404);
    }
    $s = $db->prepare("
        SELECT id, claim_surface_id, point_label, location_notes,
               sketch_x_pct, sketch_y_pct, created_at
          FROM reading_points
         WHERE company_id = ? AND claim_surface_id = ? AND deleted_at IS NULL
         ORDER BY id
    ");
    $s->execute([$cid, $surface_id]);
    json_list($s->fetchAll());
}

// ── GET single ─────────────────────────────────────────────────────────────
if ($method === 'GET' && $id) {
    $row = tc_drylog_point_for_company($db, $cid, $id);
    if (!$row) json_error('Not found', 404);
    json_ok($row);
}

// ── POST create ────────────────────────────────────────────────────────────
if ($method === 'POST' && !$id) {
    $b = get_json_body();
    $surface_id = (int)($b['claim_surface_id'] ?? 0);
    if ($surface_id <= 0) json_error('claim_surface_id required', 422);
    if (!tc_drylog_surface_for_company($db, $cid, $surface_id)) {
        json_error('Surface not found', 404);
    }

    $point_label    = isset($b['point_label'])    ? trim((string)$b['point_label']) : null;
    $location_notes = isset($b['location_notes']) ? trim((string)$b['location_notes']) : null;
    $sketch_x_pct   = isset($b['sketch_x_pct'])   ? (float)$b['sketch_x_pct'] : null;
    $sketch_y_pct   = isset($b['sketch_y_pct'])   ? (float)$b['sketch_y_pct'] : null;

    $db->prepare("
        INSERT INTO reading_points
            (company_id, claim_surface_id, point_label, location_notes,
             sketch_x_pct, sketch_y_pct)
        VALUES (?, ?, ?, ?, ?, ?)
    ")->execute([$cid, $surface_id, $point_label, $location_notes,
                 $sketch_x_pct, $sketch_y_pct]);

    $new_id = (int)$db->lastInsertId();
    json_ok(tc_drylog_point_for_company($db, $cid, $new_id), 201);
}

// ── PUT update ─────────────────────────────────────────────────────────────
if ($method === 'PUT' && $id) {
    if (!tc_drylog_point_for_company($db, $cid, $id)) {
        json_error('Not found', 404);
    }
    $b = get_json_body();
    $fields = pick($b, [
        'point_label','location_notes','sketch_x_pct','sketch_y_pct'
    ]);
    if (empty($fields)) json_error('No fields to update');

    $sets = implode(', ', array_map(fn($k) => "$k = ?", array_keys($fields)));
    $vals = array_values($fields);
    $vals[] = $id;
    $vals[] = $cid;
    $db->prepare("UPDATE reading_points SET $sets WHERE id = ? AND company_id = ?")
       ->execute($vals);

    json_ok(tc_drylog_point_for_company($db, $cid, $id));
}

// ── DELETE (soft) ──────────────────────────────────────────────────────────
if ($method === 'DELETE' && $id) {
    if (!tc_drylog_point_for_company($db, $cid, $id)) {
        json_error('Not found', 404);
    }
    $db->prepare("UPDATE reading_points SET deleted_at = NOW() WHERE id = ? AND company_id = ?")
       ->execute([$id, $cid]);
    json_ok(null);
}

json_error('Not found', 404);
