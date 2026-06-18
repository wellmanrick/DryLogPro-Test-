<?php
// Minimal standalone platform tables that DryLog PRO depends on.
// Idempotent. MySQL 5.7 compatible.

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
            $out['steps'][] = ['ok' => true, 'label' => $label, 'note' => 'already'];
        } else {
            $out['steps'][] = ['ok' => false, 'label' => $label, 'error' => $e->getMessage()];
            $out['ok'] = false;
        }
    }
}

step($out, $db, "
    CREATE TABLE IF NOT EXISTS companies (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(160) NOT NULL,
        logo_url VARCHAR(500) NULL,
        phone VARCHAR(40) NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
", 'create companies');

step($out, $db, "
    CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_id INT NOT NULL,
        username VARCHAR(120) NOT NULL,
        display_name VARCHAR(160) NULL,
        role VARCHAR(40) DEFAULT 'Tech',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        KEY idx_company (company_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
", 'create users');

step($out, $db, "
    CREATE TABLE IF NOT EXISTS jobs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_id INT NOT NULL,
        lead_id INT NULL,
        customer VARCHAR(160) NULL,
        address VARCHAR(255) NULL,
        claim_no VARCHAR(80) NULL,
        loss_type VARCHAR(80) NULL,
        source_of_loss VARCHAR(160) NULL,
        status VARCHAR(40) DEFAULT 'open',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_company (company_id),
        KEY idx_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
", 'create jobs');

step($out, $db, "
    CREATE TABLE IF NOT EXISTS visits (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_id INT NOT NULL,
        job_id INT NOT NULL,
        tech_user_id INT NULL,
        visit_date DATE NOT NULL,
        day_index INT NULL,
        visit_type VARCHAR(40) DEFAULT 'followup',
        submitted_at DATETIME NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_company (company_id),
        KEY idx_job_date (job_id, visit_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
", 'create visits');

step($out, $db, "
    CREATE TABLE IF NOT EXISTS visit_rooms (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_id INT NOT NULL,
        visit_id INT NOT NULL,
        room_name VARCHAR(120) NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        KEY idx_visit (visit_id),
        KEY idx_company (company_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
", 'create visit_rooms');

step($out, $db, "
    CREATE TABLE IF NOT EXISTS entity_attachments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_id INT NOT NULL,
        entity_type VARCHAR(60) NOT NULL,
        entity_id INT NOT NULL,
        claim_room_id INT NULL,
        file_url VARCHAR(500) NOT NULL,
        original_name VARCHAR(255) NULL,
        mime_type VARCHAR(120) NULL,
        size_bytes INT NULL,
        caption VARCHAR(255) NULL,
        uploaded_by INT NULL,
        uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        KEY idx_company (company_id),
        KEY idx_entity (entity_type, entity_id),
        KEY idx_claim_room (claim_room_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
", 'create entity_attachments');

step($out, $db, "
    CREATE TABLE IF NOT EXISTS equipment (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_id INT NOT NULL,
        type VARCHAR(80) NULL,
        make VARCHAR(80) NULL,
        model VARCHAR(80) NULL,
        serial_no VARCHAR(120) NULL,
        asset_tag VARCHAR(120) NULL,
        status VARCHAR(40) DEFAULT 'available',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_company (company_id),
        KEY idx_asset (asset_tag)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
", 'create equipment');

step($out, $db, "
    CREATE TABLE IF NOT EXISTS equipment_deploys (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_id INT NOT NULL,
        equipment_id INT NOT NULL,
        job_id INT NOT NULL,
        drying_zone_id INT NULL,
        deployed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        returned_at DATETIME NULL,
        notes TEXT NULL,
        created_by INT NULL,
        KEY idx_company (company_id),
        KEY idx_job_active (job_id, returned_at),
        KEY idx_equipment_active (equipment_id, returned_at),
        KEY idx_drying_zone (drying_zone_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
", 'create equipment_deploys');

step($out, $db, "
    CREATE TABLE IF NOT EXISTS room_readings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_id INT NOT NULL,
        job_id INT NOT NULL,
        visit_id INT NOT NULL,
        visit_room_id INT NULL,
        reading_point_id INT NULL,
        room_name VARCHAR(120) NULL,
        reading_date DATE NULL,
        surface_type VARCHAR(80) NULL,
        surface_label VARCHAR(120) NULL,
        wall_index INT NULL,
        m1 DECIMAL(6,2) NULL,
        m2 DECIMAL(6,2) NULL,
        m3 DECIMAL(6,2) NULL,
        drying_goal DECIMAL(6,2) NULL,
        surface_temp DECIMAL(5,2) NULL,
        is_reference TINYINT(1) DEFAULT 0,
        notes TEXT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        KEY idx_company (company_id),
        KEY idx_job (job_id),
        KEY idx_visit (visit_id),
        KEY idx_reading_point (reading_point_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
", 'create room_readings');

step($out, $db, "
    CREATE TABLE IF NOT EXISTS room_work_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_id INT NOT NULL,
        claim_room_id INT NOT NULL,
        visit_id INT NULL,
        item_type ENUM('demo','consumable','note') NOT NULL,
        category VARCHAR(80) NULL,
        label VARCHAR(160) NULL,
        qty DECIMAL(8,2) NULL,
        unit VARCHAR(40) NULL,
        notes TEXT NULL,
        created_by INT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        KEY idx_company (company_id),
        KEY idx_room (claim_room_id),
        KEY idx_visit (visit_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
", 'create room_work_items');

echo json_encode($out, JSON_PRETTY_PRINT);
