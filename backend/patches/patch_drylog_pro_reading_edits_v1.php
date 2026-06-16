<?php
// ─────────────────────────────────────────────────────────────────────────────
// patch_drylog_pro_reading_edits_v1.php  (F18.8b)
//
// Audit table for office-side edits to tech-captured readings. Every PUT or
// DELETE on a reading row writes a row here capturing the actor, the
// before/after JSON snapshots, and the edit type. Used by the office UI to
// surface "edited by X on date" hints and a full edit history per reading.
//
// Spec: docs/F18-drylog-pro-spec.md (F18.8b addendum logged in §14)
//
// Idempotent. MySQL 5.7 compatible. Safe to re-run.
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
        if (str_contains($msg, 'duplicate column')
            || str_contains($msg, 'duplicate key name')
            || str_contains($msg, 'already exists')) {
            $out['steps'][] = ['ok' => true, 'label' => $label, 'note' => 'already (idempotent)'];
        } else {
            $out['steps'][] = ['ok' => false, 'label' => $label, 'error' => $e->getMessage()];
            $out['ok'] = false;
        }
    }
}

step($out, $db, "
    CREATE TABLE IF NOT EXISTS reading_edits (
        id            INT AUTO_INCREMENT PRIMARY KEY,
        company_id    INT NOT NULL,
        source_table  VARCHAR(60) NOT NULL,
        source_row_id INT NOT NULL,
        edited_by     INT NOT NULL,
        edited_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
        edit_type     ENUM('update','delete') NOT NULL,
        before_json   LONGTEXT,
        after_json    LONGTEXT,
        notes         TEXT,
        KEY idx_source (source_table, source_row_id),
        KEY idx_company (company_id),
        KEY idx_edited_at (edited_at),
        KEY idx_edited_by (edited_by)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
", 'create reading_edits');

echo json_encode($out, JSON_PRETTY_PRINT);
