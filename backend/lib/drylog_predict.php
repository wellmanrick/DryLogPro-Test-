<?php
// drylog_predict.php — predictive dry-end-date for a claim (F18.11b).
//
// Approach:
//   1. For each non-deleted reading_point on the claim, build a time series of
//      moisture_readings.
//   2. Fit a simple linear regression on (days_since_first_reading, moisture_value).
//      Extrapolate to find the day the trend line crosses dry_goal_snapshot.
//   3. Per zone: zone-dry-date = MAX(point dry dates within zone).
//   4. Claim: claim-dry-date = MAX(zone dry dates).
//   5. If a point has no goal, fewer than 2 readings, or a non-negative slope
//      (not drying), it can't be predicted — those flow through as null.
//
// Confidence labels:
//   'high'    — ≥4 readings AND slope < 0
//   'medium'  — 3 readings AND slope < 0
//   'low'     — 2 readings AND slope < 0
//   'stalled' — slope ≥ 0 (moisture flat or rising — equipment / containment issue)
//   'unknown' — < 2 readings OR no dry_goal
//
// Returns:
//   [
//     'overall_date'        => 'YYYY-MM-DD' | null,
//     'overall_confidence'  => 'high'|'medium'|'low'|'stalled'|'unknown',
//     'overall_label'       => 'Expected dry by Tue May 27' | 'Drying stalled' | etc.,
//     'days_remaining'      => int | null,
//     'zones'               => [
//        {zone_id, zone_name, projected_date, confidence, label, days_remaining, points: [...]}
//     ],
//   ]

if (!function_exists('tc_drylog_predict_dry_date')) {

function tc_drylog_predict_dry_date(PDO $db, int $cid, int $claim_id): array {
    $today = strtotime(date('Y-m-d') . ' 00:00:00');

    // Pull zones + their surfaces + reading_points
    $z = $db->prepare("
        SELECT z.id AS zone_id, z.name AS zone_name, z.is_closed
          FROM drying_zones z
         WHERE z.company_id = ? AND z.claim_id = ? AND z.deleted_at IS NULL
         ORDER BY z.zone_index, z.id
    ");
    $z->execute([$cid, $claim_id]);
    $zones = $z->fetchAll(PDO::FETCH_ASSOC);
    if (empty($zones)) {
        return ['overall_date' => null, 'overall_confidence' => 'unknown',
                'overall_label' => 'No zones to predict', 'days_remaining' => null,
                'zones' => []];
    }

    $zone_predictions = [];
    foreach ($zones as $z) {
        $zone_id = (int)$z['zone_id'];

        // Get all reading_points in this zone with their latest dry goal
        $rp = $db->prepare("
            SELECT rp.id AS point_id, rp.point_label,
                   s.surface_label, s.surface_type, s.id AS surface_id
              FROM reading_points rp
              JOIN claim_surfaces s ON s.id = rp.claim_surface_id
             WHERE s.drying_zone_id = ? AND s.deleted_at IS NULL AND rp.deleted_at IS NULL
        ");
        $rp->execute([$zone_id]);
        $points = $rp->fetchAll(PDO::FETCH_ASSOC);

        $point_predictions = [];
        $max_days_remaining = null;
        $overall_confidence = 'unknown';

        foreach ($points as $p) {
            $point_id = (int)$p['point_id'];
            // Time series for this point
            $ts = $db->prepare("
                SELECT reading_at, moisture_value, dry_goal_snapshot
                  FROM moisture_readings
                 WHERE reading_point_id = ? AND company_id = ?
                 ORDER BY reading_at ASC, id ASC
            ");
            $ts->execute([$point_id, $cid]);
            $series = $ts->fetchAll(PDO::FETCH_ASSOC);

            $fit = _tc_drylog_fit_point($series, $today);
            $point_predictions[] = [
                'point_id'        => $point_id,
                'label'           => trim(($p['surface_label'] ?: $p['surface_type']) . ' · ' . ($p['point_label'] ?: '')),
                'reading_count'   => count($series),
                'confidence'      => $fit['confidence'],
                'days_remaining'  => $fit['days_remaining'],
                'projected_date'  => $fit['projected_date'],
                'current_value'   => $fit['current_value'],
                'goal'            => $fit['goal'],
                'slope_per_day'   => $fit['slope'],
            ];

            // Aggregate zone: take the max days_remaining across points
            if ($fit['days_remaining'] !== null) {
                if ($max_days_remaining === null || $fit['days_remaining'] > $max_days_remaining) {
                    $max_days_remaining = $fit['days_remaining'];
                }
            }
            // Aggregate confidence — worst of any non-stalled point wins, but
            // any stalled point makes the zone stalled
            $rank = ['stalled' => 0, 'low' => 1, 'medium' => 2, 'high' => 3, 'unknown' => 4];
            if (!isset($rank[$fit['confidence']])) $fit['confidence'] = 'unknown';
            if ($overall_confidence === 'unknown' || $rank[$fit['confidence']] < $rank[$overall_confidence]) {
                $overall_confidence = $fit['confidence'];
            }
        }

        $zone_proj_date = $max_days_remaining !== null
            ? date('Y-m-d', $today + $max_days_remaining * 86400)
            : null;

        $zone_predictions[] = [
            'zone_id'         => $zone_id,
            'zone_name'       => $z['zone_name'],
            'is_closed'       => !empty($z['is_closed']),
            'projected_date'  => $zone_proj_date,
            'confidence'      => $overall_confidence,
            'days_remaining'  => $max_days_remaining,
            'label'           => _tc_drylog_human_label($zone_proj_date, $overall_confidence, $max_days_remaining),
            'points'          => $point_predictions,
        ];
    }

    // Claim-level: max of zone days (excluding closed zones — they're done)
    $open_zones = array_filter($zone_predictions, fn($z) => !$z['is_closed']);
    $claim_days = null;
    $claim_conf = 'unknown';
    $rank = ['stalled' => 0, 'low' => 1, 'medium' => 2, 'high' => 3, 'unknown' => 4];
    foreach ($open_zones as $z) {
        if ($z['days_remaining'] !== null && ($claim_days === null || $z['days_remaining'] > $claim_days)) {
            $claim_days = $z['days_remaining'];
        }
        if ($claim_conf === 'unknown' || $rank[$z['confidence']] < $rank[$claim_conf]) {
            $claim_conf = $z['confidence'];
        }
    }
    $claim_date = $claim_days !== null ? date('Y-m-d', $today + $claim_days * 86400) : null;

    return [
        'overall_date'       => $claim_date,
        'overall_confidence' => $claim_conf,
        'overall_label'      => _tc_drylog_human_label($claim_date, $claim_conf, $claim_days),
        'days_remaining'     => $claim_days,
        'zones'              => $zone_predictions,
    ];
}

/** @internal — linear regression on one point's time series. */
function _tc_drylog_fit_point(array $series, int $today_epoch): array {
    $blank = ['confidence' => 'unknown', 'days_remaining' => null,
              'projected_date' => null, 'current_value' => null,
              'goal' => null, 'slope' => null];
    if (count($series) < 2) {
        return array_merge($blank, ['confidence' => 'unknown']);
    }
    $first_epoch = strtotime((string)$series[0]['reading_at']);
    if (!$first_epoch) return $blank;

    $goal = null;
    $xs = []; $ys = [];
    foreach ($series as $r) {
        $t = strtotime((string)$r['reading_at']);
        if (!$t) continue;
        $days = ($t - $first_epoch) / 86400.0;
        $xs[] = $days;
        $ys[] = (float)$r['moisture_value'];
        if ($r['dry_goal_snapshot'] !== null) $goal = (float)$r['dry_goal_snapshot'];
    }
    $n = count($xs);
    if ($n < 2 || $goal === null) return $blank;

    $current = $ys[$n - 1];
    if ($current <= $goal) {
        // Already at goal — days remaining is 0
        return ['confidence' => 'high', 'days_remaining' => 0,
                'projected_date' => date('Y-m-d', $today_epoch),
                'current_value' => $current, 'goal' => $goal, 'slope' => 0.0];
    }

    // Least-squares slope + intercept
    $xMean = array_sum($xs) / $n;
    $yMean = array_sum($ys) / $n;
    $num = 0.0; $den = 0.0;
    for ($i = 0; $i < $n; $i++) {
        $num += ($xs[$i] - $xMean) * ($ys[$i] - $yMean);
        $den += ($xs[$i] - $xMean) ** 2;
    }
    if ($den == 0.0) return array_merge($blank, ['confidence' => 'unknown', 'current_value' => $current, 'goal' => $goal]);
    $slope = $num / $den;
    $intercept = $yMean - $slope * $xMean;

    if ($slope >= 0) {
        return array_merge($blank, ['confidence' => 'stalled',
                                    'current_value' => $current, 'goal' => $goal, 'slope' => $slope]);
    }

    // Days since first reading until y = goal: x = (goal - intercept) / slope
    $days_from_first = ($goal - $intercept) / $slope;
    $last_x = end($xs);
    $days_remaining_from_today = max(0, (int)ceil($days_from_first - $last_x));

    $confidence = $n >= 4 ? 'high' : ($n >= 3 ? 'medium' : 'low');

    return [
        'confidence' => $confidence,
        'days_remaining' => $days_remaining_from_today,
        'projected_date' => date('Y-m-d', $today_epoch + $days_remaining_from_today * 86400),
        'current_value' => $current,
        'goal' => $goal,
        'slope' => $slope,
    ];
}

/** @internal — produce a friendly one-line label from the projection. */
function _tc_drylog_human_label(?string $date, string $confidence, ?int $days_remaining): string {
    if ($confidence === 'unknown') return 'Not enough data yet';
    if ($confidence === 'stalled') return 'Drying stalled — check equipment';
    if ($date === null) return 'Not enough data yet';
    if ($days_remaining === 0) return '✓ Dry today';
    $when = date('D M j', strtotime($date));
    $hedge = $confidence === 'low' ? ' (rough estimate)' : ($confidence === 'medium' ? ' (estimate)' : '');
    if ($days_remaining === 1) return 'Expected dry tomorrow' . $hedge;
    if ($days_remaining < 7) return "Expected dry $when ($days_remaining days)" . $hedge;
    return "Expected dry $when (~$days_remaining days)" . $hedge;
}

}
