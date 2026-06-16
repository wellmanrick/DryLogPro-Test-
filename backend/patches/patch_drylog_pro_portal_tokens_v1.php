<?php
// ─────────────────────────────────────────────────────────────────────────────
// patch_drylog_pro_portal_tokens_v1.php  (F18.11a)
//
// Tokenized customer live-progress portal: one row per per-claim share link.
// Office mints a token via /api/drylog-portal/mint; the customer opens
// /drylog.html?t=<token> and gets a sanitized read-only status view.
// Tokens are hashed at rest (sha256), revocable, optionally expiring.
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
    CREATE TABLE IF NOT EXISTS drylog_pro_portal_tokens (
        id              INT AUTO_INCREMENT PRIMARY KEY,
        company_id      INT NOT NULL,
        claim_id        INT NOT NULL,
        token_hash      CHAR(64) NOT NULL UNIQUE,
        created_by      INT NULL,
        created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at      DATETIME NULL,
        revoked_at      DATETIME NULL,
        last_viewed_at  DATETIME NULL,
        view_count      INT DEFAULT 0,
        KEY idx_claim (claim_id),
        KEY idx_company (company_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
", 'create drylog_pro_portal_tokens');

echo json_encode($out, JSON_PRETTY_PRINT);
