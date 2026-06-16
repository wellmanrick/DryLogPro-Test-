<?php
// ─────────────────────────────────────────────────────────────────────────────
// patch_drylog_pro_sketch_v1.php  (F18.12c)
//
// Floor-sketch support: per-chamber uploaded image (FK to entity_attachments)
// + per-reading-point (x, y) coordinates as fractions of the sketch
// dimensions (0.0000–1.0000 so the placement is scale-independent and
// re-rendering on any device size always lands callouts in the right spot).
//
// Idempotent — ADD COLUMN guarded so re-running is a no-op.
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
        if (str_contains($msg, 'duplicate column') || str_contains($msg, 'duplicate key name')
            || str_contains($msg, 'already exists')) {
            $out['steps'][] = ['ok' => true, 'label' => $label, 'note' => 'already (idempotent)'];
        } else {
            $out['steps'][] = ['ok' => false, 'label' => $label, 'error' => $e->getMessage()];
            $out['ok'] = false;
        }
    }
}

// reading_points.sketch_x_pct / sketch_y_pct already exist from F18.1 — only
// drying_zones gets a new column here (the FK to the sketch attachment).
step($out, $db,
    "ALTER TABLE drying_zones ADD COLUMN sketch_attachment_id INT NULL",
    'add drying_zones.sketch_attachment_id');

echo json_encode($out, JSON_PRETTY_PRINT);
