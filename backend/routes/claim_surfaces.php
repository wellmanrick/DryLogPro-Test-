<?php
// claim_surfaces.php — DryLog PRO trackable material faces inside a drying zone.
//
//   GET    /api/claim-surfaces?drying_zone_id=N      list active surfaces in a zone
//   GET    /api/claim-surfaces/{id}                  single surface
//   POST   /api/claim-surfaces                       create. body: {
//                                                     drying_zone_id, surface_type,
//                                                     surface_label?, wall_index?,
//                                                     material?, dry_goal?, dry_goal_unit?,
//                                                     meter_type?, notes? }
//   PUT    /api/claim-surfaces/{id}                  update
//   DELETE /api/claim-surfaces/{id}                  soft-delete
//
// Spec: docs/F18-drylog-pro-spec.md §3.4, §7.1

require_once __DIR__ . '/../lib/drylog_pro_model.php';

$db     = $GLOBALS['db'];
$method = $GLOBALS['method'];
$id     = $GLOBALS['route_id'];
$user   = require_auth($db);
$cid    = (int)$user['company_id'];

// ── GET list ───────────────────────────────────────────────────────────────
if ($method === 'GET' && !$id) {
    $zone_id = (int)($_GET['drying_zone_id'] ?? 0);
    if ($zone_id <= 0) json_error('drying_zone_id required', 422);
    if (!tc_drylog_zone_for_company($db, $cid, $zone_id)) {
        json_error('Drying zone not found', 404);
    }
    $s = $db->prepare("
        SELECT id, drying_zone_id, surface_type, surface_label, wall_index,
               material, dry_goal, dry_goal_unit, meter_type, notes,
               is_dry, dry_confirmed_at, created_at, updated_at
          FROM claim_surfaces
         WHERE company_id = ? AND drying_zone_id = ? AND deleted_at IS NULL
         ORDER BY COALESCE(wall_index, 999999), id
    ");
    $s->execute([$cid, $zone_id]);
    json_list($s->fetchAll());
}

// ── GET single ─────────────────────────────────────────────────────────────
if ($method === 'GET' && $id) {
    $row = tc_drylog_surface_for_company($db, $cid, $id);
    if (!$row) json_error('Not found', 404);
    json_ok($row);
}

// ── POST create ────────────────────────────────────────────────────────────
if ($method === 'POST' && !$id) {
    $b = get_json_body();
    $zone_id      = (int)($b['drying_zone_id'] ?? 0);
    $surface_type = trim((string)($b['surface_type'] ?? ''));
    if ($zone_id <= 0)       json_error('drying_zone_id required', 422);
    if ($surface_type === '') json_error('surface_type required', 422);
    $zone = tc_drylog_zone_for_company($db, $cid, $zone_id);
    if (!$zone) {
        json_error('Drying zone not found', 404);
    }

    $surface_label = isset($b['surface_label']) ? trim((string)$b['surface_label']) : null;
    $wall_index    = isset($b['wall_index'])    ? (int)$b['wall_index'] : null;
    $material      = isset($b['material'])      ? trim((string)$b['material']) : null;
    $dry_goal      = isset($b['dry_goal'])      ? (float)$b['dry_goal'] : null;
    $dry_goal_unit = isset($b['dry_goal_unit']) ? trim((string)$b['dry_goal_unit']) : '%MC';
    $meter_type    = isset($b['meter_type'])    ? trim((string)$b['meter_type']) : null;
    $notes         = isset($b['notes'])         ? trim((string)$b['notes']) : null;
    $area_sf       = isset($b['area_sf'])       ? (float)$b['area_sf'] : null;
    $linear_ft     = isset($b['linear_ft'])     ? (float)$b['linear_ft'] : null;
    $ceiling_h     = isset($b['ceiling_height_ft']) ? (float)$b['ceiling_height_ft'] : null;

    $db->prepare("
        INSERT INTO claim_surfaces
            (company_id, drying_zone_id, surface_type, surface_label, wall_index,
             material, dry_goal, dry_goal_unit, meter_type, notes,
             area_sf, linear_ft, ceiling_height_ft)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ")->execute([$cid, $zone_id, $surface_type, $surface_label, $wall_index,
                 $material, $dry_goal, $dry_goal_unit, $meter_type, $notes,
                 $area_sf, $linear_ft, $ceiling_h]);

    $new_id = (int)$db->lastInsertId();
    // Dry goal is property-wide per material — derive it from the claim's
    // material standard (ignores any client-sent goal). Overwrites the inserted
    // dry_goal/unit/meter_type so the standard stays the single source of truth.
    tc_apply_material_standard_to_surface($db, $cid, $new_id, (int)$zone['claim_id'], $material);
    json_ok(tc_drylog_surface_for_company($db, $cid, $new_id), 201);
}

// ── PUT update ─────────────────────────────────────────────────────────────
if ($method === 'PUT' && $id) {
    if (!tc_drylog_surface_for_company($db, $cid, $id)) {
        json_error('Not found', 404);
    }
    $b = get_json_body();
    $fields = pick($b, [
        'surface_type','surface_label','wall_index','material',
        'dry_goal','dry_goal_unit','meter_type','notes',
        'area_sf','linear_ft','ceiling_height_ft'
    ]);
    if (empty($fields)) json_error('No fields to update');

    if (isset($fields['surface_type']) && trim((string)$fields['surface_type']) === '') {
        json_error('surface_type cannot be blank', 422);
    }

    $sets = implode(', ', array_map(fn($k) => "$k = ?", array_keys($fields)));
    $vals = array_values($fields);
    $vals[] = $id;
    $vals[] = $cid;
    $db->prepare("UPDATE claim_surfaces SET $sets WHERE id = ? AND company_id = ?")
       ->execute($vals);

    // Re-derive the dry goal from the claim's per-material standard whenever the
    // material may have changed (goal is property-wide, never hand-typed here).
    if (array_key_exists('material', $fields)) {
        $claim_id = tc_claim_id_for_surface($db, $cid, $id);
        if ($claim_id > 0) {
            $cur = tc_drylog_surface_for_company($db, $cid, $id);
            tc_apply_material_standard_to_surface($db, $cid, $id, $claim_id, $cur['material'] ?? null);
        }
    }

    json_ok(tc_drylog_surface_for_company($db, $cid, $id));
}

// ── DELETE (soft) ──────────────────────────────────────────────────────────
if ($method === 'DELETE' && $id) {
    if (!tc_drylog_surface_for_company($db, $cid, $id)) {
        json_error('Not found', 404);
    }
    $db->prepare("UPDATE claim_surfaces SET deleted_at = NOW() WHERE id = ? AND company_id = ?")
       ->execute([$id, $cid]);
    json_ok(null);
}

json_error('Not found', 404);
