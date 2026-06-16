<?php
// sizing.php — IICRC S500–derived air mover + dehu sizing recommender.
//
// Single-room calc consumed by F18.7's zone-setup UI. Given dimensions and
// class of water, returns a suggestion the tech can accept or override.
//
// Spec: docs/F18-drylog-pro-spec.md §6
//
// Formulas (S500-abbreviated; numbers are the commonly cited divisors —
// IICRC trainers vary, treat as a starting point the tech can override):
//   - Air movers per room  = ceil(wet_floor_sqft / divisor)
//                            divisor = 70 (C1) / 50 (C2) / 40 (C3) / 35 (C4)
//   - Dehu pints/day total = ceil(wet_volume_ft3 / divisor)
//                            divisor = 100 (C1) / 40 (C2) / 30 (C3) / 30 (C4)
//   - If current_gpp > 70 (the AHAM 80°F/60%RH dehu rating baseline),
//     pints/day is multiplied by 1.25 to compensate for the actual unit
//     pulling less than its rated capacity in a humid envelope.

if (!function_exists('tc_sizing_for_room')) {

/**
 * Compute the per-room sizing recommendation.
 *
 * @param float       $length_ft       room length
 * @param float       $width_ft        room width
 * @param float       $height_ft       room height (typically 8–10)
 * @param int         $class_of_water  IICRC class 1–4
 * @param float|null  $current_gpp     latest zone atmosphere GPP; null if unknown
 * @return array{
 *     air_movers_recommended: int,
 *     dehu_pints_per_day_recommended: int,
 *     wet_floor_sqft: float,
 *     wet_volume_ft3: float,
 *     air_mover_divisor: float,
 *     dehu_divisor: float,
 *     rationale: string
 * }
 */
function tc_sizing_for_room(
    float $length_ft,
    float $width_ft,
    float $height_ft,
    int $class_of_water,
    ?float $current_gpp = null
): array {
    if ($length_ft <= 0 || $width_ft <= 0 || $height_ft <= 0) {
        throw new InvalidArgumentException('length, width, and height must all be > 0');
    }
    if ($class_of_water < 1 || $class_of_water > 4) {
        throw new InvalidArgumentException('class_of_water must be 1, 2, 3, or 4');
    }

    $wet_floor = $length_ft * $width_ft;
    $wet_vol   = $wet_floor * $height_ft;

    $am_divisor_by_class   = [1 => 70.0, 2 => 50.0, 3 => 40.0, 4 => 35.0];
    $dehu_divisor_by_class = [1 => 100.0, 2 => 40.0, 3 => 30.0, 4 => 30.0];

    $am_div   = $am_divisor_by_class[$class_of_water];
    $dehu_div = $dehu_divisor_by_class[$class_of_water];

    $air_movers = (int)max(1, ceil($wet_floor / $am_div));

    $pints_per_day = $wet_vol / $dehu_div;
    $humidity_bump = false;
    if ($current_gpp !== null && $current_gpp > 70.0) {
        $pints_per_day *= 1.25;
        $humidity_bump = true;
    }
    $pints_per_day = (int)max(1, ceil($pints_per_day));

    $rationale = sprintf(
        "Class %d, %0.1f × %0.1f × %0.1f ft = %0.0f sq ft / %0.0f cu ft. "
        . "%d air mover%s (1 per ~%0.0f sq ft). %d pints/day dehu (%0.0f cu ft ÷ %0.0f%s).",
        $class_of_water,
        $length_ft, $width_ft, $height_ft,
        $wet_floor, $wet_vol,
        $air_movers, ($air_movers === 1 ? '' : 's'),
        $am_div,
        $pints_per_day, $wet_vol, $dehu_div,
        $humidity_bump ? ' × 1.25 humid-envelope bump (current GPP > 70)' : ''
    );

    return [
        'air_movers_recommended'         => $air_movers,
        'dehu_pints_per_day_recommended' => $pints_per_day,
        'wet_floor_sqft'                 => $wet_floor,
        'wet_volume_ft3'                 => $wet_vol,
        'air_mover_divisor'              => $am_div,
        'dehu_divisor'                   => $dehu_div,
        'rationale'                      => $rationale,
    ];
}

}
