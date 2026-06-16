<?php
// ─────────────────────────────────────────────────────────────────────────────
// patch_drylog_pro_cad_sketch_v1.php  (F18.14)
//
// Stores the in-app CAD sketch state as JSON on the chamber. The JSON is
// the source of truth — walls, doors, windows, equipment markers, reading-
// point placements, text labels, freehand annotations, etc. SVG rendering
// for PDF + customer portal is derived from this JSON at view time.
//
// We keep drying_zones.sketch_attachment_id (the older upload-photo path)
// in place for backward compat — claims that uploaded a sketch before this
// patch still render the uploaded image. New chambers use the CAD path.
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
    "ALTER TABLE drying_zones ADD COLUMN sketch_cad_json LONGTEXT NULL",
    'add drying_zones.sketch_cad_json');

step($out, $db,
    "ALTER TABLE drying_zones ADD COLUMN sketch_cad_updated_at DATETIME NULL",
    'add drying_zones.sketch_cad_updated_at');

step($out, $db,
    "ALTER TABLE drying_zones ADD COLUMN sketch_cad_updated_by INT NULL",
    'add drying_zones.sketch_cad_updated_by');

echo json_encode($out, JSON_PRETTY_PRINT);
