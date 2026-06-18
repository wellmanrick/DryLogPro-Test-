<?php
// DryLog PRO alert engine.
//
// Alerts are meant to guide review, not replace judgment. This engine evaluates
// the seeded rule library against newly inserted readings and daily sweeps.

if (!function_exists('tc_alerts_evaluate')) {

function tc_alerts_evaluate(PDO $db, int $cid, int $claim_id, string $source_table, int $source_row_id): array {
    $event = tc_alert_event_name($source_table);
    if ($event === null) return ['alerts_fired' => [], 'notifications_queued' => 0];

    $source = tc_alert_load_source_row($db, $cid, $source_table, $source_row_id);
    if (!$source) return ['alerts_fired' => [], 'notifications_queued' => 0];

    $rules = tc_alert_rules_for_claim($db, $cid, $claim_id, $event);
    $fired = [];
    foreach ($rules as $rule) {
        $thresholds = tc_alert_thresholds($rule);
        $hit = tc_alert_eval_rule($db, $cid, $claim_id, $rule['code'], $source_table, $source, $thresholds);
        if (!$hit) continue;

        $alert = tc_alert_insert_once(
            $db,
            $cid,
            $claim_id,
            (int)$rule['id'],
            isset($hit['drying_zone_id']) ? (int)$hit['drying_zone_id'] : null,
            $source_table,
            $source_row_id,
            $rule['severity_override'] ?: $hit['severity'] ?: $rule['severity_default'],
            $hit['title'] ?: $rule['name'],
            $hit['detail'] ?? null,
            $hit['context'] ?? []
        );
        if ($alert) $fired[] = $alert;
    }

    return ['alerts_fired' => $fired, 'notifications_queued' => 0];
}

function tc_alerts_run_cron_daily(PDO $db, int $cid): array {
    $claims = $db->prepare("
        SELECT DISTINCT z.claim_id
          FROM drying_zones z
         WHERE z.company_id = ? AND z.deleted_at IS NULL AND z.is_closed = 0
    ");
    $claims->execute([$cid]);

    $created = [];
    foreach ($claims->fetchAll(PDO::FETCH_COLUMN) as $claimId) {
        $claim_id = (int)$claimId;
        $rules = tc_alert_rules_for_claim($db, $cid, $claim_id, 'cron_daily');
        foreach ($rules as $rule) {
            $thresholds = tc_alert_thresholds($rule);
            $hit = tc_alert_eval_cron_rule($db, $cid, $claim_id, $rule['code'], $thresholds);
            if (!$hit) continue;
            $alert = tc_alert_insert_once(
                $db,
                $cid,
                $claim_id,
                (int)$rule['id'],
                isset($hit['drying_zone_id']) ? (int)$hit['drying_zone_id'] : null,
                'cron_daily',
                $claim_id,
                $rule['severity_override'] ?: $hit['severity'] ?: $rule['severity_default'],
                $hit['title'] ?: $rule['name'],
                $hit['detail'] ?? null,
                $hit['context'] ?? []
            );
            if ($alert) $created[] = $alert;
        }
    }
    return ['alerts_fired' => $created, 'notifications_queued' => 0];
}

function tc_alert_event_name(string $source_table): ?string {
    return [
        'reference_readings' => 'reference_insert',
        'zone_atmosphere_readings' => 'zone_atmosphere_insert',
        'hvac_atmosphere_readings' => 'hvac_atmosphere_insert',
        'dehu_performance_readings' => 'dehu_performance_insert',
        'moisture_readings' => 'moisture_insert',
    ][$source_table] ?? null;
}

function tc_alert_rules_for_claim(PDO $db, int $cid, int $claim_id, string $event): array {
    $s = $db->prepare("
        SELECT rd.*,
               cfg.is_enabled,
               cfg.thresholds_json,
               cfg.severity_override,
               cfg.notify_sms,
               cfg.notify_email,
               cfg.notify_user_ids_json
          FROM alert_rule_definitions rd
          LEFT JOIN claim_alert_configs cfg
                 ON cfg.alert_rule_definition_id = rd.id
                AND cfg.company_id = ?
                AND cfg.claim_id = ?
         WHERE rd.is_active = 1
           AND rd.evaluates_on = ?
           AND COALESCE(cfg.is_enabled, 1) = 1
         ORDER BY rd.code
    ");
    $s->execute([$cid, $claim_id, $event]);
    return $s->fetchAll(PDO::FETCH_ASSOC);
}

function tc_alert_thresholds(array $rule): array {
    $base = json_decode((string)($rule['threshold_schema'] ?? ''), true);
    if (!is_array($base)) $base = [];
    $override = json_decode((string)($rule['thresholds_json'] ?? ''), true);
    if (!is_array($override)) $override = [];
    return array_merge($base, $override);
}

function tc_alert_load_source_row(PDO $db, int $cid, string $table, int $id): ?array {
    static $allowed = [
        'reference_readings',
        'zone_atmosphere_readings',
        'hvac_atmosphere_readings',
        'dehu_performance_readings',
        'moisture_readings',
    ];
    if (!in_array($table, $allowed, true)) return null;
    $s = $db->prepare("SELECT * FROM `$table` WHERE id = ? AND company_id = ?");
    $s->execute([$id, $cid]);
    $row = $s->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}

function tc_alert_eval_rule(PDO $db, int $cid, int $claim_id, string $code, string $source_table, array $row, array $t): ?array {
    if ($code === 'dehu_underperforming') {
        $max = (float)($t['rh_pct_max'] ?? 60);
        if ((float)($row['rh_pct'] ?? 0) <= $max) return null;
        if (!empty($t['with_dehu_deployed']) && !tc_alert_zone_has_dehu($db, $cid, (int)$row['drying_zone_id'])) return null;
        return [
            'drying_zone_id' => (int)$row['drying_zone_id'],
            'severity' => 'warning',
            'title' => 'Zone RH is still high',
            'detail' => 'Zone RH is above ' . $max . '% with dehumidification expected.',
            'context' => ['rh_pct' => (float)$row['rh_pct'], 'threshold' => $max],
        ];
    }

    if ($code === 'grain_depression_low') {
        $min = (float)($t['min_gpp'] ?? 5);
        if ($row['grain_depression'] === null || (float)$row['grain_depression'] >= $min) return null;
        return [
            'drying_zone_id' => (int)$row['drying_zone_id'],
            'severity' => 'warning',
            'title' => 'Dehu grain depression is low',
            'detail' => 'Intake-to-exhaust grain depression is below ' . $min . ' GPP.',
            'context' => ['grain_depression' => (float)$row['grain_depression'], 'threshold' => $min],
        ];
    }

    if ($code === 'condensation_risk') {
        if ($row['surface_temp_f'] === null) return null;
        $zone = tc_alert_latest_zone_atmosphere($db, $cid, (int)$row['drying_zone_id']);
        if (!$zone || $zone['dew_point_f'] === null) return null;
        $diff = (float)$row['surface_temp_f'] - (float)$zone['dew_point_f'];
        $min = (float)($t['min_diff_f'] ?? 5);
        if ($diff >= $min) return null;
        return [
            'drying_zone_id' => (int)$row['drying_zone_id'],
            'severity' => 'critical',
            'title' => 'Condensation risk',
            'detail' => 'Surface temperature is within ' . $min . 'F of the zone dew point.',
            'context' => ['surface_temp_f' => (float)$row['surface_temp_f'], 'dew_point_f' => (float)$zone['dew_point_f'], 'diff_f' => $diff],
        ];
    }

    if ($code === 'moisture_regressed') {
        $prev = tc_alert_previous_moisture($db, $cid, (int)$row['reading_point_id'], (int)$row['id']);
        if (!$prev) return null;
        $increase = (float)$row['moisture_value'] - (float)$prev['moisture_value'];
        $min = (float)($t['min_increase_pct'] ?? 1.0);
        if ($increase < $min) return null;
        return [
            'drying_zone_id' => (int)$row['drying_zone_id'],
            'severity' => 'warning',
            'title' => 'Moisture reading increased',
            'detail' => 'Latest moisture reading is up by ' . round($increase, 2) . ' from the prior reading at this point.',
            'context' => ['current' => (float)$row['moisture_value'], 'previous' => (float)$prev['moisture_value'], 'increase' => $increase],
        ];
    }

    if ($code === 'zone_ready_to_close') {
        if (!tc_alert_zone_ready_to_close($db, $cid, (int)$row['drying_zone_id'])) return null;
        return [
            'drying_zone_id' => (int)$row['drying_zone_id'],
            'severity' => 'info',
            'title' => 'Drying zone is ready to close',
            'detail' => 'All active reading points in this zone are at or below their dry goals.',
            'context' => ['drying_zone_id' => (int)$row['drying_zone_id']],
        ];
    }

    if ($code === 'outdoor_humidity_spike') {
        if (($row['reading_type'] ?? '') !== 'outdoor') return null;
        $baseline = tc_alert_first_outdoor_rh($db, $cid, $claim_id, (int)$row['id']);
        if ($baseline === null) return null;
        $delta = (float)$row['rh_pct'] - $baseline;
        $threshold = (float)($t['delta_pct'] ?? 20);
        if ($delta < $threshold) return null;
        return [
            'drying_zone_id' => null,
            'severity' => 'info',
            'title' => 'Outdoor humidity spike',
            'detail' => 'Outdoor RH is ' . round($delta, 1) . ' points above the first outdoor baseline.',
            'context' => ['current_rh' => (float)$row['rh_pct'], 'baseline_rh' => $baseline, 'delta' => $delta],
        ];
    }

    return null;
}

function tc_alert_eval_cron_rule(PDO $db, int $cid, int $claim_id, string $code, array $t): ?array {
    if ($code === 'visit_overdue') {
        $maxHours = (int)($t['max_hours'] ?? 48);
        $latest = tc_alert_latest_claim_reading_time($db, $cid, $claim_id);
        if (!$latest) return null;
        $hours = (time() - strtotime($latest)) / 3600;
        if ($hours <= $maxHours) return null;
        return [
            'severity' => 'warning',
            'title' => 'Drying visit overdue',
            'detail' => 'No DryLog PRO reading has been captured in over ' . $maxHours . ' hours.',
            'context' => ['latest_reading_at' => $latest, 'hours_since' => round($hours, 1)],
        ];
    }

    if ($code === 'equipment_overstay') {
        $maxDays = (int)($t['max_days'] ?? 14);
        try {
            $s = $db->prepare("
                SELECT id, drying_zone_id, deployed_at
                  FROM equipment_deploys
                 WHERE company_id = ? AND job_id = ? AND returned_at IS NULL
                   AND deployed_at IS NOT NULL
                 ORDER BY deployed_at ASC
                 LIMIT 1
            ");
            $s->execute([$cid, $claim_id]);
            $row = $s->fetch(PDO::FETCH_ASSOC);
        } catch (Throwable $e) {
            return null;
        }
        if (!$row) return null;
        $days = (time() - strtotime((string)$row['deployed_at'])) / 86400;
        if ($days <= $maxDays) return null;
        return [
            'drying_zone_id' => isset($row['drying_zone_id']) ? (int)$row['drying_zone_id'] : null,
            'severity' => 'warning',
            'title' => 'Equipment has been deployed too long',
            'detail' => 'Equipment has been on site for more than ' . $maxDays . ' days.',
            'context' => ['equipment_deploy_id' => (int)$row['id'], 'days_deployed' => round($days, 1)],
        ];
    }

    return null;
}

function tc_alert_insert_once(
    PDO $db,
    int $cid,
    int $claim_id,
    int $rule_id,
    ?int $zone_id,
    string $source_table,
    int $source_row_id,
    string $severity,
    string $title,
    ?string $detail,
    array $context
): ?array {
    $dupe = $db->prepare("
        SELECT id
          FROM alerts
         WHERE company_id = ? AND claim_id = ?
           AND alert_rule_definition_id = ?
           AND source_table = ? AND source_row_id = ?
           AND state IN ('new','acked')
         LIMIT 1
    ");
    $dupe->execute([$cid, $claim_id, $rule_id, $source_table, $source_row_id]);
    if ($dupe->fetch()) return null;

    $db->prepare("
        INSERT INTO alerts
            (company_id, claim_id, alert_rule_definition_id, drying_zone_id,
             source_table, source_row_id, severity, title, detail, context_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ")->execute([
        $cid, $claim_id, $rule_id, $zone_id,
        $source_table, $source_row_id, $severity, $title, $detail,
        $context ? json_encode($context) : null,
    ]);
    $id = (int)$db->lastInsertId();
    $s = $db->prepare("SELECT * FROM alerts WHERE id = ? AND company_id = ?");
    $s->execute([$id, $cid]);
    return $s->fetch(PDO::FETCH_ASSOC) ?: null;
}

function tc_alert_zone_has_dehu(PDO $db, int $cid, int $zone_id): bool {
    try {
        $s = $db->prepare("
            SELECT COUNT(*)
              FROM equipment_deploys
             WHERE company_id = ? AND drying_zone_id = ? AND returned_at IS NULL
               AND (type LIKE '%dehu%' OR name LIKE '%dehu%')
        ");
        $s->execute([$cid, $zone_id]);
        return (int)$s->fetchColumn() > 0;
    } catch (Throwable $e) {
        return false;
    }
}

function tc_alert_latest_zone_atmosphere(PDO $db, int $cid, int $zone_id): ?array {
    $s = $db->prepare("
        SELECT *
          FROM zone_atmosphere_readings
         WHERE company_id = ? AND drying_zone_id = ?
         ORDER BY reading_at DESC, id DESC
         LIMIT 1
    ");
    $s->execute([$cid, $zone_id]);
    $row = $s->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}

function tc_alert_previous_moisture(PDO $db, int $cid, int $point_id, int $current_id): ?array {
    $s = $db->prepare("
        SELECT *
          FROM moisture_readings
         WHERE company_id = ? AND reading_point_id = ? AND id <> ?
         ORDER BY reading_at DESC, id DESC
         LIMIT 1
    ");
    $s->execute([$cid, $point_id, $current_id]);
    $row = $s->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}

function tc_alert_zone_ready_to_close(PDO $db, int $cid, int $zone_id): bool {
    $s = $db->prepare("
        SELECT id, is_dry
          FROM claim_surfaces
         WHERE company_id = ? AND drying_zone_id = ? AND deleted_at IS NULL
    ");
    $s->execute([$cid, $zone_id]);
    $surfaces = $s->fetchAll(PDO::FETCH_ASSOC);
    if (!$surfaces) return false;
    foreach ($surfaces as $sf) {
        if (empty($sf['is_dry'])) return false;
    }
    return true;
}

function tc_alert_first_outdoor_rh(PDO $db, int $cid, int $claim_id, int $exclude_id): ?float {
    $s = $db->prepare("
        SELECT rh_pct
          FROM reference_readings
         WHERE company_id = ? AND claim_id = ? AND reading_type = 'outdoor' AND id <> ?
         ORDER BY reading_at ASC, id ASC
         LIMIT 1
    ");
    $s->execute([$cid, $claim_id, $exclude_id]);
    $v = $s->fetchColumn();
    return $v === false || $v === null ? null : (float)$v;
}

function tc_alert_latest_claim_reading_time(PDO $db, int $cid, int $claim_id): ?string {
    $times = [];
    foreach (['reference_readings', 'zone_atmosphere_readings', 'hvac_atmosphere_readings', 'dehu_performance_readings', 'moisture_readings'] as $table) {
        try {
            $s = $db->prepare("SELECT MAX(reading_at) FROM `$table` WHERE company_id = ? AND claim_id = ?");
            $s->execute([$cid, $claim_id]);
            $v = $s->fetchColumn();
            if ($v) $times[] = $v;
        } catch (Throwable $e) {}
    }
    if (!$times) return null;
    rsort($times);
    return $times[0];
}

}
