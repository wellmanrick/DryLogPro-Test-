<?php
// ─────────────────────────────────────────────────────────────────────────────
// patch_drylog_pro_engines_v1.php  (F18.2)
//
// Schema + seed data for DryLog PRO's task and alerts engines.
//
// Tables:
//   - task_definitions          library of standard tasks
//   - task_dependencies         prereq DAG between tasks
//   - claim_task_configs        which tasks apply to this claim
//   - claim_task_states         state per (claim, task): locked/available/...
//   - alert_rule_definitions    library of alert rules
//   - claim_alert_configs       which rules apply to this claim + overrides
//   - alerts                    fired alert events
//
// Seed library:
//   - 20 task definitions across cat1/cat2/cat3 templates with prereq DAG
//   - 10 alert rule definitions with default threshold schemas
//
// Spec: docs/F18-drylog-pro-spec.md §4, §5
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

// ─── Task Engine Tables ────────────────────────────────────────────────────

step($out, $db, "
    CREATE TABLE IF NOT EXISTS task_definitions (
        id                 INT AUTO_INCREMENT PRIMARY KEY,
        code               VARCHAR(60) NOT NULL UNIQUE,
        name               VARCHAR(120) NOT NULL,
        description        TEXT,
        category           VARCHAR(40) NULL,
        default_templates  VARCHAR(60) NULL,
        display_order      INT DEFAULT 100,
        is_active          TINYINT(1) DEFAULT 1,
        created_at         DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
", 'create task_definitions');

step($out, $db, "
    CREATE TABLE IF NOT EXISTS task_dependencies (
        id                    INT AUTO_INCREMENT PRIMARY KEY,
        task_definition_id    INT NOT NULL,
        prereq_definition_id  INT NOT NULL,
        UNIQUE KEY uk_pair (task_definition_id, prereq_definition_id),
        KEY idx_prereq (prereq_definition_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
", 'create task_dependencies');

step($out, $db, "
    CREATE TABLE IF NOT EXISTS claim_task_configs (
        id                    INT AUTO_INCREMENT PRIMARY KEY,
        company_id            INT NOT NULL,
        claim_id              INT NOT NULL,
        task_definition_id    INT NOT NULL,
        display_order         INT NOT NULL,
        is_required           TINYINT(1) DEFAULT 1,
        created_at            DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uk_claim_task (claim_id, task_definition_id),
        KEY idx_company (company_id),
        KEY idx_claim (claim_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
", 'create claim_task_configs');

step($out, $db, "
    CREATE TABLE IF NOT EXISTS claim_task_states (
        id                    INT AUTO_INCREMENT PRIMARY KEY,
        company_id            INT NOT NULL,
        claim_id              INT NOT NULL,
        task_definition_id    INT NOT NULL,
        state                 ENUM('locked','available','in_progress','complete','skipped') NOT NULL DEFAULT 'locked',
        started_at            DATETIME NULL,
        completed_at          DATETIME NULL,
        completed_by_user_id  INT NULL,
        skip_reason           TEXT NULL,
        updated_at            DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_claim_task (claim_id, task_definition_id),
        KEY idx_company (company_id),
        KEY idx_claim_state (claim_id, state)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
", 'create claim_task_states');

// ─── Alerts Engine Tables ──────────────────────────────────────────────────

step($out, $db, "
    CREATE TABLE IF NOT EXISTS alert_rule_definitions (
        id                INT AUTO_INCREMENT PRIMARY KEY,
        code              VARCHAR(60) NOT NULL UNIQUE,
        name              VARCHAR(120) NOT NULL,
        description       TEXT,
        severity_default  ENUM('info','warning','critical') DEFAULT 'warning',
        evaluates_on      VARCHAR(40) NOT NULL,
        threshold_schema  LONGTEXT NULL,
        is_active         TINYINT(1) DEFAULT 1,
        created_at        DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
", 'create alert_rule_definitions');

step($out, $db, "
    CREATE TABLE IF NOT EXISTS claim_alert_configs (
        id                        INT AUTO_INCREMENT PRIMARY KEY,
        company_id                INT NOT NULL,
        claim_id                  INT NOT NULL,
        alert_rule_definition_id  INT NOT NULL,
        is_enabled                TINYINT(1) DEFAULT 1,
        thresholds_json           LONGTEXT NULL,
        severity_override         ENUM('info','warning','critical') NULL,
        notify_sms                TINYINT(1) DEFAULT 0,
        notify_email              TINYINT(1) DEFAULT 0,
        notify_user_ids_json      LONGTEXT NULL,
        created_at                DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uk_claim_rule (claim_id, alert_rule_definition_id),
        KEY idx_company (company_id),
        KEY idx_claim (claim_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
", 'create claim_alert_configs');

step($out, $db, "
    CREATE TABLE IF NOT EXISTS alerts (
        id                        INT AUTO_INCREMENT PRIMARY KEY,
        company_id                INT NOT NULL,
        claim_id                  INT NOT NULL,
        alert_rule_definition_id  INT NOT NULL,
        drying_zone_id            INT NULL,
        source_table              VARCHAR(60) NOT NULL,
        source_row_id             INT NOT NULL,
        severity                  ENUM('info','warning','critical') NOT NULL,
        title                     VARCHAR(200) NOT NULL,
        detail                    TEXT,
        context_json              LONGTEXT NULL,
        state                     ENUM('new','acked','resolved','dismissed') DEFAULT 'new',
        acked_at                  DATETIME NULL,
        acked_by_user_id          INT NULL,
        resolved_at               DATETIME NULL,
        resolved_by_user_id       INT NULL,
        resolved_notes            TEXT,
        fired_at                  DATETIME DEFAULT CURRENT_TIMESTAMP,
        KEY idx_company (company_id),
        KEY idx_claim_state (claim_id, state),
        KEY idx_zone (drying_zone_id),
        KEY idx_fired (fired_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
", 'create alerts');

// ─── Seed: task_definitions ────────────────────────────────────────────────
// INSERT IGNORE on code UNIQUE → idempotent.
// (code, name, category, default_templates, display_order)

$tasks = [
    // setup
    ['source_of_loss',        'Source of Loss',               'setup',      'cat1,cat2,cat3', 100],
    ['cat_of_water',          'Category of Water',            'setup',      'cat1,cat2,cat3', 110],
    ['class_of_water',        'Class of Water',               'setup',      'cat1,cat2,cat3', 120],
    ['room_inventory',        'Room Inventory',               'setup',      'cat1,cat2,cat3', 130],
    ['define_zones',          'Define Drying Zones',          'setup',      'cat1,cat2,cat3', 140],
    ['define_surfaces',       'Define Surfaces & Dry Goals',  'setup',      'cat1,cat2,cat3', 150],
    ['define_reading_points', 'Define Reading Points',        'setup',      'cat1,cat2,cat3', 160],
    ['equipment_placed',      'Equipment Placed',             'setup',      'cat1,cat2,cat3', 170],
    // capture
    ['baseline_outdoor',      'Capture Outdoor Baseline',     'capture',    'cat1,cat2,cat3', 200],
    ['baseline_unaffected',   'Capture Unaffected Baseline',  'capture',    'cat2,cat3',      210],
    ['zone_atmosphere',       'Capture Zone Atmosphere',      'capture',    'cat1,cat2,cat3', 220],
    ['hvac_atmosphere',       'Capture HVAC Atmosphere',      'capture',    'cat3',           230],
    ['moisture_readings',     'Capture Moisture Readings',    'capture',    'cat1,cat2,cat3', 240],
    ['dehu_performance',      'Capture Dehu Performance',     'capture',    'cat2,cat3',      250],
    ['daily_visit_complete',  'Daily Visit Complete',         'capture',    'cat1,cat2,cat3', 260],
    // compliance
    ['containment_documented','Containment Documented',       'compliance', 'cat3',           300],
    ['antimicrobial_log',     'Antimicrobial Application Log','compliance', 'cat3',           310],
    // closeout
    ['dry_goal_hit',          'Dry Goal Hit (All Zones)',     'closeout',   'cat1,cat2,cat3', 400],
    ['equipment_removed',     'Equipment Removed',            'closeout',   'cat1,cat2,cat3', 410],
    ['final_walkthrough',     'Final Walkthrough',            'closeout',   'cat1,cat2,cat3', 420],
];

$task_seed_inserted = 0;
$task_seed_skipped = 0;
try {
    $stmt = $db->prepare("
        INSERT IGNORE INTO task_definitions
            (code, name, category, default_templates, display_order)
        VALUES (?, ?, ?, ?, ?)
    ");
    foreach ($tasks as $t) {
        $stmt->execute($t);
        if ($stmt->rowCount() > 0) $task_seed_inserted++;
        else $task_seed_skipped++;
    }
    $out['steps'][] = [
        'ok' => true,
        'label' => 'seed task_definitions',
        'note' => "inserted=$task_seed_inserted, already=$task_seed_skipped"
    ];
} catch (Throwable $e) {
    $out['steps'][] = ['ok' => false, 'label' => 'seed task_definitions', 'error' => $e->getMessage()];
    $out['ok'] = false;
}

// ─── Seed: task_dependencies ───────────────────────────────────────────────
// Each entry: [task_code, prereq_code]
// INSERT IGNORE on uk_pair → idempotent.

$deps = [
    ['cat_of_water',          'source_of_loss'],
    ['class_of_water',        'cat_of_water'],
    ['define_zones',          'room_inventory'],
    ['define_surfaces',       'define_zones'],
    ['define_reading_points', 'define_surfaces'],
    ['equipment_placed',      'define_zones'],
    ['baseline_unaffected',   'room_inventory'],
    ['zone_atmosphere',       'define_zones'],
    ['hvac_atmosphere',       'define_zones'],
    ['moisture_readings',     'define_reading_points'],
    ['dehu_performance',      'equipment_placed'],
    ['dehu_performance',      'zone_atmosphere'],
    ['containment_documented','define_zones'],
    ['antimicrobial_log',     'cat_of_water'],
    ['daily_visit_complete',  'moisture_readings'],
    ['daily_visit_complete',  'zone_atmosphere'],
    ['dry_goal_hit',          'moisture_readings'],
    ['equipment_removed',     'dry_goal_hit'],
    ['final_walkthrough',     'equipment_removed'],
];

$dep_inserted = 0;
$dep_skipped = 0;
try {
    $stmt = $db->prepare("
        INSERT IGNORE INTO task_dependencies (task_definition_id, prereq_definition_id)
        SELECT t.id, p.id
        FROM task_definitions t, task_definitions p
        WHERE t.code = ? AND p.code = ?
    ");
    foreach ($deps as $d) {
        $stmt->execute($d);
        if ($stmt->rowCount() > 0) $dep_inserted++;
        else $dep_skipped++;
    }
    $out['steps'][] = [
        'ok' => true,
        'label' => 'seed task_dependencies',
        'note' => "inserted=$dep_inserted, already=$dep_skipped"
    ];
} catch (Throwable $e) {
    $out['steps'][] = ['ok' => false, 'label' => 'seed task_dependencies', 'error' => $e->getMessage()];
    $out['ok'] = false;
}

// ─── Seed: alert_rule_definitions ──────────────────────────────────────────
// (code, name, description, severity_default, evaluates_on, threshold_schema_json)

$rules = [
    [
        'dehu_underperforming',
        'Dehu underperforming (zone RH stuck high)',
        'Zone RH above threshold with at least one dehu deployed and running.',
        'warning',
        'zone_atmosphere_insert',
        '{"rh_pct_max":60,"with_dehu_deployed":true}',
    ],
    [
        'grain_depression_low',
        'Grain depression below minimum',
        'Dehu intake_gpp minus exhaust_gpp under threshold — dehu likely failing.',
        'warning',
        'dehu_performance_insert',
        '{"min_gpp":5}',
    ],
    [
        'condensation_risk',
        'Surface near dew point',
        'Difference between zone dew point and surface temperature under threshold — condensation imminent.',
        'critical',
        'moisture_insert',
        '{"min_diff_f":5}',
    ],
    [
        'moisture_regressed',
        'Moisture went up day-over-day',
        'Latest moisture reading higher than the prior reading at the same point.',
        'warning',
        'moisture_insert',
        '{"min_increase_pct":1.0}',
    ],
    [
        'visit_overdue',
        'No reading in N hours',
        'No moisture or atmosphere reading captured on this claim in over the threshold hours.',
        'warning',
        'cron_daily',
        '{"max_hours":48}',
    ],
    [
        'zone_ready_to_close',
        'All points hit dry goal',
        'Every reading point in a zone has its latest moisture reading at or below dry goal — zone is ready to close.',
        'info',
        'moisture_insert',
        '{}',
    ],
    [
        'cat3_no_hepa',
        'Cat 3 without HEPA scrubber',
        'Category 3 job has no HEPA air scrubber currently deployed.',
        'critical',
        'equipment_event',
        '{}',
    ],
    [
        'outdoor_humidity_spike',
        'Outdoor humidity spike vs baseline',
        'Latest outdoor reference reading RH is significantly above the established baseline — expect drying slowdown.',
        'info',
        'reference_insert',
        '{"delta_pct":20}',
    ],
    [
        'scope_creep_late_surface',
        'New surface added on later visit',
        'A new surface was added to the claim on or after the threshold visit index — possible scope creep.',
        'warning',
        'surface_insert',
        '{"min_visit_index":4}',
    ],
    [
        'equipment_overstay',
        'Equipment on-rent over N days',
        'A piece of equipment has been deployed for longer than the threshold days without being returned.',
        'warning',
        'cron_daily',
        '{"max_days":14}',
    ],
];

$rule_inserted = 0;
$rule_skipped = 0;
try {
    $stmt = $db->prepare("
        INSERT IGNORE INTO alert_rule_definitions
            (code, name, description, severity_default, evaluates_on, threshold_schema)
        VALUES (?, ?, ?, ?, ?, ?)
    ");
    foreach ($rules as $r) {
        $stmt->execute($r);
        if ($stmt->rowCount() > 0) $rule_inserted++;
        else $rule_skipped++;
    }
    $out['steps'][] = [
        'ok' => true,
        'label' => 'seed alert_rule_definitions',
        'note' => "inserted=$rule_inserted, already=$rule_skipped"
    ];
} catch (Throwable $e) {
    $out['steps'][] = ['ok' => false, 'label' => 'seed alert_rule_definitions', 'error' => $e->getMessage()];
    $out['ok'] = false;
}

echo json_encode($out, JSON_PRETTY_PRINT);
