<?php
// ─────────────────────────────────────────────────────────────────────────────
// patch_drylog_pro_surface_dimensions_v1.php  (F18.14b)
//
// Adds dimension columns to claim_surfaces so the CAD Room tool can auto-
// populate floor/ceiling/wall surface measurements. Without these the room
// shape would have to be re-entered as raw numbers on every surface row.
//
// area_sf           — square footage of the surface (floor, ceiling, or
//                     walls composite). For a 12×14 room: floor=168,
//                     ceiling=168, walls=(perimeter × ceiling_height).
// linear_ft         — perimeter in linear feet. Used by the walls
//                     composite to express LF separately from SF.
// ceiling_height_ft — stored on the ceiling + walls rows so the wall SF
//                     calc can be reproduced / edited. NULL for floors.
//
// All three are NULL-default so existing rows (created before Room-tool
// auto-population) keep working.
//
// Idempotent.
// ─────────────────────────────────────────────────────────────────────────────
ini_set('display_errors', '1');
error_reporting(E_ALL);
header('Content-Type: application/json');

require_once __DIR__ . '/db.php';
$db = get_db();
$out = ['ok' => true, 'steps' => []];

function step(array &$out, PDO $db, string $sql, string $label) {
    try {
        $db->exec($sql);
        $out['steps'][] = ['ok' => true, 'label' => $label];
    } catch (Throwable $e) {
        $msg = strtolower($e->getMessage());
        if (str_contains($msg, 'duplicate column') || str_contains($msg, 'already exists')) {
            $out['steps'][] = ['ok' => true, 'label' => $label, 'note' => 'already (idempotent)'];
        } else {
            $out['steps'][] = ['ok' => false, 'label' => $label, 'error' => $e->getMessage()];
            $out['ok'] = false;
        }
    }
}

step($out, $db,
    "ALTER TABLE claim_surfaces ADD COLUMN area_sf DECIMAL(8,2) NULL",
    'add claim_surfaces.area_sf');

step($out, $db,
    "ALTER TABLE claim_surfaces ADD COLUMN linear_ft DECIMAL(8,2) NULL",
    'add claim_surfaces.linear_ft');

step($out, $db,
    "ALTER TABLE claim_surfaces ADD COLUMN ceiling_height_ft DECIMAL(5,2) NULL",
    'add claim_surfaces.ceiling_height_ft');

echo json_encode($out, JSON_PRETTY_PRINT);
