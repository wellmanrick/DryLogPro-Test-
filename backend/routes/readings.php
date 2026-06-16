<?php
// readings.php — sub-route dispatcher for DryLog PRO reading capture.
//
//   /api/readings/reference        → readings_reference.php
//   /api/readings/zone-atmosphere  → readings_zone_atmosphere.php
//   /api/readings/hvac             → readings_hvac.php
//   /api/readings/dehu             → readings_dehu.php
//   /api/readings/moisture         → readings_moisture.php
//
// Each sub-file handles its own GET (list / single) + POST (create). All
// authenticate via require_auth and scope every write to the session
// company. Reading rows include psychrometric derivatives computed inline
// via tc_psychro() and trigger tc_alerts_evaluate() before returning.
//
// Spec: docs/F18-drylog-pro-spec.md §7.2

$_segs = explode('/', trim(parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH), '/'));
if (($_segs[0] ?? '') === 'api') array_shift($_segs);
$reading_type = $_segs[1] ?? '';

$map = [
    'reference'        => 'readings_reference.php',
    'zone-atmosphere'  => 'readings_zone_atmosphere.php',
    'hvac'             => 'readings_hvac.php',
    'dehu'             => 'readings_dehu.php',
    'moisture'         => 'readings_moisture.php',
];

if (!isset($map[$reading_type])) {
    json_error('Unknown reading type', 404);
}

// Expose the parsed reading id (third segment, if numeric) for sub-files.
// /api/readings/<type>/{id}            → reading_route_id = N, reading_sub_action = null
// /api/readings/<type>/{id}/history    → reading_route_id = N, reading_sub_action = 'history'
$GLOBALS['reading_route_id']   = isset($_segs[2]) && is_numeric($_segs[2]) ? (int)$_segs[2] : null;
$GLOBALS['reading_sub_action'] = $_segs[3] ?? null;

require __DIR__ . '/' . $map[$reading_type];
