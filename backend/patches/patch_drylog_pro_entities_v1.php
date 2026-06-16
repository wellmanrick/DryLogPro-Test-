<?php
// ─────────────────────────────────────────────────────────────────────────────
// patch_drylog_pro_entities_v1.php  (F18.1)
//
// Schema for DryLog PRO's 5-level entity hierarchy:
//   Claim → Room → Drying Zone → Surface → Reading Point → Moisture Reading
// plus the four atmosphere/dehu reading-type tables, plus nullable bridge
// columns on legacy tables so the old field flow keeps working unchanged.
//
// Spec: docs/F18-drylog-pro-spec.md §3
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

// ── claim_rooms: persistent room registry per claim ────────────────────────
step($out, $db, "
    CREATE TABLE IF NOT EXISTS claim_rooms (
        id           INT AUTO_INCREMENT PRIMARY KEY,
        company_id   INT NOT NULL,
        claim_id     INT NOT NULL,
        name         VARCHAR(120) NOT NULL,
        room_index   INT NULL,
        floor_level  VARCHAR(40) NULL,
        length_ft    DECIMAL(5,2) NULL,
        width_ft     DECIMAL(5,2) NULL,
        height_ft    DECIMAL(5,2) NULL,
        sketch_url   VARCHAR(500) NULL,
        notes        TEXT,
        deleted_at   DATETIME NULL,
        created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_company (company_id),
        KEY idx_claim (claim_id),
        KEY idx_claim_active (claim_id, deleted_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
", 'create claim_rooms');

// ── drying_zones: logical drying volumes (may span rooms via junction) ─────
step($out, $db, "
    CREATE TABLE IF NOT EXISTS drying_zones (
        id                INT AUTO_INCREMENT PRIMARY KEY,
        company_id        INT NOT NULL,
        claim_id          INT NOT NULL,
        name              VARCHAR(120) NOT NULL,
        zone_index        INT NULL,
        category_of_water TINYINT NULL,
        class_of_water    TINYINT NULL,
        containment_notes TEXT,
        is_closed         TINYINT(1) DEFAULT 0,
        closed_at         DATETIME NULL,
        deleted_at        DATETIME NULL,
        created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at        DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_company (company_id),
        KEY idx_claim (claim_id),
        KEY idx_claim_open (claim_id, is_closed, deleted_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
", 'create drying_zones');

// ── drying_zone_rooms: M:N junction between zones and rooms ────────────────
step($out, $db, "
    CREATE TABLE IF NOT EXISTS drying_zone_rooms (
        id              INT AUTO_INCREMENT PRIMARY KEY,
        company_id      INT NOT NULL,
        drying_zone_id  INT NOT NULL,
        claim_room_id   INT NOT NULL,
        created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uk_zone_room (drying_zone_id, claim_room_id),
        KEY idx_company (company_id),
        KEY idx_room (claim_room_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
", 'create drying_zone_rooms');

// ── claim_surfaces: material faces inside a zone ───────────────────────────
step($out, $db, "
    CREATE TABLE IF NOT EXISTS claim_surfaces (
        id                INT AUTO_INCREMENT PRIMARY KEY,
        company_id        INT NOT NULL,
        drying_zone_id    INT NOT NULL,
        surface_type      VARCHAR(40) NOT NULL,
        surface_label     VARCHAR(120) NULL,
        wall_index        INT NULL,
        material          VARCHAR(80) NULL,
        dry_goal          DECIMAL(6,2) NULL,
        dry_goal_unit     VARCHAR(10) DEFAULT '%MC',
        meter_type        VARCHAR(40) NULL,
        notes             TEXT,
        is_dry            TINYINT(1) DEFAULT 0,
        dry_confirmed_at  DATETIME NULL,
        deleted_at        DATETIME NULL,
        created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at        DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_company (company_id),
        KEY idx_zone (drying_zone_id),
        KEY idx_zone_active (drying_zone_id, deleted_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
", 'create claim_surfaces');

// ── reading_points: specific meter location on a surface ───────────────────
step($out, $db, "
    CREATE TABLE IF NOT EXISTS reading_points (
        id                INT AUTO_INCREMENT PRIMARY KEY,
        company_id        INT NOT NULL,
        claim_surface_id  INT NOT NULL,
        point_label       VARCHAR(80) NULL,
        location_notes    TEXT,
        sketch_x_pct      DECIMAL(5,2) NULL,
        sketch_y_pct      DECIMAL(5,2) NULL,
        deleted_at        DATETIME NULL,
        created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
        KEY idx_company (company_id),
        KEY idx_surface (claim_surface_id),
        KEY idx_surface_active (claim_surface_id, deleted_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
", 'create reading_points');

// ── reference_readings: baseline / outdoor / unaffected atmosphere ─────────
step($out, $db, "
    CREATE TABLE IF NOT EXISTS reference_readings (
        id                    INT AUTO_INCREMENT PRIMARY KEY,
        company_id            INT NOT NULL,
        claim_id              INT NOT NULL,
        visit_id              INT NULL,
        reading_type          ENUM('outdoor','unaffected_indoor') NOT NULL,
        source_label          VARCHAR(120) NULL,
        reading_at            DATETIME NOT NULL,
        temp_f                DECIMAL(5,2) NOT NULL,
        rh_pct                DECIMAL(5,2) NOT NULL,
        gpp                   DECIMAL(6,2) NULL,
        dew_point_f           DECIMAL(5,2) NULL,
        vapor_pressure_kpa    DECIMAL(8,4) NULL,
        weather_source        VARCHAR(40) NULL,
        captured_by_user_id   INT NULL,
        notes                 TEXT,
        created_at            DATETIME DEFAULT CURRENT_TIMESTAMP,
        KEY idx_company (company_id),
        KEY idx_claim (claim_id),
        KEY idx_claim_time (claim_id, reading_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
", 'create reference_readings');

// ── zone_atmosphere_readings: inside-the-zone air capture ──────────────────
step($out, $db, "
    CREATE TABLE IF NOT EXISTS zone_atmosphere_readings (
        id                    INT AUTO_INCREMENT PRIMARY KEY,
        company_id            INT NOT NULL,
        claim_id              INT NOT NULL,
        drying_zone_id        INT NOT NULL,
        visit_id              INT NOT NULL,
        reading_at            DATETIME NOT NULL,
        temp_f                DECIMAL(5,2) NOT NULL,
        rh_pct                DECIMAL(5,2) NOT NULL,
        gpp                   DECIMAL(6,2) NULL,
        dew_point_f           DECIMAL(5,2) NULL,
        vapor_pressure_kpa    DECIMAL(8,4) NULL,
        captured_by_user_id   INT NULL,
        notes                 TEXT,
        created_at            DATETIME DEFAULT CURRENT_TIMESTAMP,
        KEY idx_company (company_id),
        KEY idx_zone (drying_zone_id),
        KEY idx_zone_time (drying_zone_id, reading_at),
        KEY idx_visit (visit_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
", 'create zone_atmosphere_readings');

// ── hvac_atmosphere_readings: HVAC supply/return/plenum capture ────────────
step($out, $db, "
    CREATE TABLE IF NOT EXISTS hvac_atmosphere_readings (
        id                    INT AUTO_INCREMENT PRIMARY KEY,
        company_id            INT NOT NULL,
        claim_id              INT NOT NULL,
        drying_zone_id        INT NOT NULL,
        visit_id              INT NOT NULL,
        hvac_label            VARCHAR(80) NULL,
        measurement_point     ENUM('supply','return','plenum') NOT NULL,
        reading_at            DATETIME NOT NULL,
        temp_f                DECIMAL(5,2) NOT NULL,
        rh_pct                DECIMAL(5,2) NOT NULL,
        gpp                   DECIMAL(6,2) NULL,
        dew_point_f           DECIMAL(5,2) NULL,
        vapor_pressure_kpa    DECIMAL(8,4) NULL,
        captured_by_user_id   INT NULL,
        notes                 TEXT,
        created_at            DATETIME DEFAULT CURRENT_TIMESTAMP,
        KEY idx_company (company_id),
        KEY idx_zone_time (drying_zone_id, reading_at),
        KEY idx_visit (visit_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
", 'create hvac_atmosphere_readings');

// ── dehu_performance_readings: intake + exhaust + runtime per dehu ─────────
step($out, $db, "
    CREATE TABLE IF NOT EXISTS dehu_performance_readings (
        id                        INT AUTO_INCREMENT PRIMARY KEY,
        company_id                INT NOT NULL,
        claim_id                  INT NOT NULL,
        drying_zone_id            INT NOT NULL,
        equipment_deploy_id       INT NULL,
        visit_id                  INT NOT NULL,
        reading_at                DATETIME NOT NULL,
        intake_temp_f             DECIMAL(5,2) NOT NULL,
        intake_rh_pct             DECIMAL(5,2) NOT NULL,
        intake_gpp                DECIMAL(6,2) NULL,
        exhaust_temp_f            DECIMAL(5,2) NOT NULL,
        exhaust_rh_pct            DECIMAL(5,2) NOT NULL,
        exhaust_gpp               DECIMAL(6,2) NULL,
        grain_depression          DECIMAL(6,2) NULL,
        hours_running             DECIMAL(6,1) NULL,
        water_collected_pints     DECIMAL(6,1) NULL,
        captured_by_user_id       INT NULL,
        notes                     TEXT,
        created_at                DATETIME DEFAULT CURRENT_TIMESTAMP,
        KEY idx_company (company_id),
        KEY idx_zone_time (drying_zone_id, reading_at),
        KEY idx_deploy (equipment_deploy_id),
        KEY idx_visit (visit_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
", 'create dehu_performance_readings');

// ── moisture_readings: per Reading Point, per visit time-series ────────────
step($out, $db, "
    CREATE TABLE IF NOT EXISTS moisture_readings (
        id                    INT AUTO_INCREMENT PRIMARY KEY,
        company_id            INT NOT NULL,
        claim_id              INT NOT NULL,
        drying_zone_id        INT NOT NULL,
        claim_surface_id      INT NOT NULL,
        reading_point_id      INT NOT NULL,
        visit_id              INT NOT NULL,
        reading_at            DATETIME NOT NULL,
        moisture_value        DECIMAL(6,2) NOT NULL,
        moisture_unit         VARCHAR(10) DEFAULT '%MC',
        dry_goal_snapshot     DECIMAL(6,2) NULL,
        surface_temp_f        DECIMAL(5,2) NULL,
        meter_make_model      VARCHAR(80) NULL,
        is_dry_at_time        TINYINT(1) DEFAULT 0,
        photo_url             VARCHAR(500) NULL,
        captured_by_user_id   INT NULL,
        notes                 TEXT,
        created_at            DATETIME DEFAULT CURRENT_TIMESTAMP,
        KEY idx_company (company_id),
        KEY idx_point_time (reading_point_id, reading_at),
        KEY idx_surface_time (claim_surface_id, reading_at),
        KEY idx_zone_time (drying_zone_id, reading_at),
        KEY idx_visit (visit_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
", 'create moisture_readings');

// ── Bridge columns on existing tables ──────────────────────────────────────
// All nullable so legacy field flow keeps working; new DryLog PRO flow
// populates them when writing dual-write rows.

step($out, $db, "
    ALTER TABLE visit_rooms ADD COLUMN claim_room_id INT NULL AFTER visit_id
", 'visit_rooms.claim_room_id');

step($out, $db, "
    ALTER TABLE visit_rooms ADD KEY idx_claim_room (claim_room_id)
", 'visit_rooms idx_claim_room');

step($out, $db, "
    ALTER TABLE equipment_deploys ADD COLUMN drying_zone_id INT NULL AFTER job_id
", 'equipment_deploys.drying_zone_id');

step($out, $db, "
    ALTER TABLE equipment_deploys ADD KEY idx_drying_zone (drying_zone_id)
", 'equipment_deploys idx_drying_zone');

step($out, $db, "
    ALTER TABLE room_readings ADD COLUMN reading_point_id INT NULL AFTER visit_room_id
", 'room_readings.reading_point_id');

step($out, $db, "
    ALTER TABLE room_readings ADD KEY idx_reading_point (reading_point_id)
", 'room_readings idx_reading_point');

echo json_encode($out, JSON_PRETTY_PRINT);
