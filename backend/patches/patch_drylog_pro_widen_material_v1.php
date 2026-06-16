<?php
// ─────────────────────────────────────────────────────────────────────────────
// patch_drylog_pro_widen_material_v1.php  (F18.7f)
//
// Widens claim_surfaces.material from VARCHAR(80) to VARCHAR(255) so the
// new multi-select material picker (per-surface "Plaster, Drywall, Framing,
// Insulation") doesn't get truncated when a tech checks several materials
// on a single wet wall.
//
// Idempotent — MODIFY COLUMN is safe to re-run; column already at target
// size or wider is a no-op.
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
        $out['steps'][] = ['ok' => false, 'label' => $label, 'error' => $e->getMessage()];
        $out['ok'] = false;
    }
}

step($out, $db, "ALTER TABLE claim_surfaces MODIFY material VARCHAR(255) NULL",
     'widen claim_surfaces.material to VARCHAR(255)');

echo json_encode($out, JSON_PRETTY_PRINT);
