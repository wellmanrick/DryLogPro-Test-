<?php
// claim_material_standards.php — property-wide dry goals, one per material class
// per claim. Editing a standard PROPAGATES (write-through) into every matching
// surface's dry_goal, so the standard is the single source of truth.
//
//   GET  /api/claim-material-standards?claim_id=N     list standards for a claim
//   POST /api/claim-material-standards                upsert one material's goal:
//        { claim_id, material, dry_goal?, dry_goal_unit?, meter_type? }
//        → returns the row + { propagated: <surfaces updated> }
//
// material must be one of the canonical classes (see tc_material_class()).
// Pre-patch safe: GET returns [] if the table isn't created yet.

require_once __DIR__ . '/../lib/drylog_pro_model.php';

$db     = $GLOBALS['db'];
$method = $GLOBALS['method'];
$id     = $GLOBALS['route_id'];
$user   = require_auth($db);
$cid    = (int)$user['company_id'];

const _CMS_CLASSES = ['drywall','wood','plaster','carpet','pad','concrete','insulation','tile','resilient','other'];

// ── GET list (claim-scoped) ─────────────────────────────────────────────────
if ($method === 'GET' && !$id) {
    $claim_id = (int)($_GET['claim_id'] ?? 0);
    if ($claim_id <= 0) json_error('claim_id required', 422);
    if (!tc_drylog_claim_for_company($db, $cid, $claim_id)) json_error('Claim not found', 404);

    try {
        $s = $db->prepare("SELECT id, claim_id, material, dry_goal, dry_goal_unit, meter_type, updated_at
                             FROM claim_material_standards
                            WHERE company_id = ? AND claim_id = ?
                            ORDER BY material");
        $s->execute([$cid, $claim_id]);
        json_list($s->fetchAll());
    } catch (Throwable $e) {
        if (stripos($e->getMessage(), 'claim_material_standards') !== false) json_list([]);
        throw $e;
    }
}

// ── POST upsert (set/clear a material's goal) ───────────────────────────────
if ($method === 'POST' && !$id) {
    $b = get_json_body();
    $claim_id = (int)($b['claim_id'] ?? 0);
    $material = strtolower(trim((string)($b['material'] ?? '')));
    if ($claim_id <= 0)                          json_error('claim_id required', 422);
    if (!in_array($material, _CMS_CLASSES, true)) json_error('Unknown material class', 422);
    if (!tc_drylog_claim_for_company($db, $cid, $claim_id)) json_error('Claim not found', 404);

    $dry_goal = (isset($b['dry_goal']) && $b['dry_goal'] !== '' && is_numeric($b['dry_goal'])) ? (float)$b['dry_goal'] : null;
    $unit     = isset($b['dry_goal_unit']) ? (trim((string)$b['dry_goal_unit']) ?: '%MC') : '%MC';
    $meter    = isset($b['meter_type']) ? (trim((string)$b['meter_type']) ?: null) : null;

    $db->prepare("
        INSERT INTO claim_material_standards (company_id, claim_id, material, dry_goal, dry_goal_unit, meter_type)
        VALUES (?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE dry_goal = VALUES(dry_goal),
                                dry_goal_unit = VALUES(dry_goal_unit),
                                meter_type = VALUES(meter_type)
    ")->execute([$cid, $claim_id, $material, $dry_goal, $unit, $meter]);

    // Write-through to every matching surface on the claim.
    $propagated = tc_propagate_standard_to_surfaces($db, $cid, $claim_id, $material, $dry_goal, $unit, $meter);

    $s = $db->prepare("SELECT id, claim_id, material, dry_goal, dry_goal_unit, meter_type, updated_at
                         FROM claim_material_standards
                        WHERE company_id = ? AND claim_id = ? AND material = ?");
    $s->execute([$cid, $claim_id, $material]);
    $row = $s->fetch() ?: [];
    $row['propagated'] = $propagated;
    json_ok($row, 201);
}

json_error('Not found', 404);
