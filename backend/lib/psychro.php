<?php
// ─────────────────────────────────────────────────────────────────────────────
// Psychrometric helpers — air-condition math for IICRC S500 drying logs.
//
// Given air temperature (°F) and relative humidity (%), computes:
//   - saturation vapor pressure (kPa)
//   - actual vapor pressure (kPa)
//   - humidity ratio (lb water / lb dry air)
//   - GPP (grains per pound, the standard restoration unit)
//   - dew point (°F)
//
// Formulas: Magnus-Tetens approximation. Accurate to within 0.5% of full
// ASHRAE tables across the range typical for drying work.
// ─────────────────────────────────────────────────────────────────────────────

if (!function_exists('tc_psychro')) {

function tc_f_to_c(float $f): float { return ($f - 32.0) * 5.0 / 9.0; }
function tc_c_to_f(float $c): float { return $c * 9.0 / 5.0 + 32.0; }

/**
 * Compute psychrometric properties from temp (°F) and RH (%).
 * Returns an array of derived values. Inputs out of range return all-null.
 */
function tc_psychro(?float $temp_f, ?float $rh_pct): array {
    $blank = [
        'gpp' => null, 'vapor_pressure_kpa' => null, 'sat_vp_kpa' => null,
        'humidity_ratio' => null, 'dew_point_f' => null,
    ];
    if ($temp_f === null || $rh_pct === null) return $blank;
    if ($rh_pct < 0 || $rh_pct > 100) return $blank;

    $tc = tc_f_to_c($temp_f);
    // Saturation vapor pressure (kPa) — Magnus
    $svp = 0.6108 * exp((17.27 * $tc) / ($tc + 237.3));
    $vp  = $svp * ($rh_pct / 100.0);

    // Humidity ratio (lb_water / lb_dry_air) at sea level (101.325 kPa)
    // W = 0.622 * vp / (P - vp)
    $W   = 0.622 * $vp / (101.325 - $vp);

    // GPP — grains per pound. 1 lb = 7000 grains.
    $gpp = $W * 7000.0;

    // Dew point (°F) — invert Magnus
    $alpha = log($rh_pct / 100.0) + (17.27 * $tc) / ($tc + 237.3);
    $td_c = (237.3 * $alpha) / (17.27 - $alpha);
    $td_f = tc_c_to_f($td_c);

    return [
        'gpp'                => round($gpp, 1),
        'vapor_pressure_kpa' => round($vp, 4),
        'sat_vp_kpa'         => round($svp, 4),
        'humidity_ratio'     => round($W, 5),
        'dew_point_f'        => round($td_f, 1),
    ];
}

/**
 * Annotate a row that may include air_temp_f + air_rh_pct (or
 * outdoor_temp_f + outdoor_rh_pct) with psychrometric values prefixed
 * with $key_prefix.
 */
function tc_psychro_decorate(array $row, string $temp_key = 'air_temp_f', string $rh_key = 'air_rh_pct', string $out_prefix = 'air_'): array {
    $t = isset($row[$temp_key]) && $row[$temp_key] !== null ? (float)$row[$temp_key] : null;
    $h = isset($row[$rh_key])   && $row[$rh_key]   !== null ? (float)$row[$rh_key]   : null;
    $p = tc_psychro($t, $h);
    $row[$out_prefix . 'gpp']            = $p['gpp'];
    $row[$out_prefix . 'dew_point_f']    = $p['dew_point_f'];
    $row[$out_prefix . 'humidity_ratio'] = $p['humidity_ratio'];
    return $row;
}

}  // function_exists guard
