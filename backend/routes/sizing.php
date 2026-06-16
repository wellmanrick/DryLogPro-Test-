<?php
// sizing.php — IICRC S500 air mover + dehu sizing recommender route.
//
//   POST /api/sizing/recommend
//     body { length_ft, width_ft, height_ft, class_of_water, current_gpp? }
//     → { air_movers_recommended, dehu_pints_per_day_recommended,
//         wet_floor_sqft, wet_volume_ft3, class_factor_used, rationale }
//
// Pure compute — no DB writes. Consumed by F18.7 field-app zone setup.
//
// Spec: docs/F18-drylog-pro-spec.md §6, §7.4

require_once __DIR__ . '/../lib/sizing.php';

$db     = $GLOBALS['db'];
$method = $GLOBALS['method'];
$user   = require_auth($db);

$_segs = explode('/', trim(parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH), '/'));
if (($_segs[0] ?? '') === 'api') array_shift($_segs);
$action = $_segs[1] ?? null;

if ($method === 'POST' && $action === 'recommend') {
    $b = get_json_body();
    foreach (['length_ft','width_ft','height_ft','class_of_water'] as $k) {
        if (!array_key_exists($k, $b)) json_error("$k required", 422);
    }
    try {
        $out = tc_sizing_for_room(
            (float)$b['length_ft'],
            (float)$b['width_ft'],
            (float)$b['height_ft'],
            (int)$b['class_of_water'],
            isset($b['current_gpp']) ? (float)$b['current_gpp'] : null
        );
    } catch (InvalidArgumentException $e) {
        json_error($e->getMessage(), 422);
    } catch (Throwable $e) {
        json_error_with_log('sizing.recommend', 'Sizing failed', $e, 500);
    }
    json_ok($out);
}

json_error('Not found', 404);
