<?php

require_once __DIR__ . '/../core/bootstrap.php';

$db = get_db();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$path = trim(parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/', '/');
$segments = $path === '' ? [] : explode('/', $path);
if (($segments[0] ?? '') === 'api') array_shift($segments);

$resource = $segments[0] ?? '';
$route_id = isset($segments[1]) && is_numeric($segments[1]) ? (int)$segments[1] : null;

$routes = [
    'jobs' => 'jobs.php',
    'visits' => 'visits.php',
    'entity-attachments' => 'entity_attachments.php',
    'equipment' => 'equipment.php',
    'equipment-deploys' => 'equipment_deploys.php',
    'room-readings' => 'room_readings.php',
    'claim-rooms' => 'claim_rooms.php',
    'drying-zones' => 'drying_zones.php',
    'claim-surfaces' => 'claim_surfaces.php',
    'reading-points' => 'reading_points.php',
    'room-work-items' => 'room_work_items.php',
    'claim-material-standards' => 'claim_material_standards.php',
    'readings' => 'readings.php',
    'claim-tasks' => 'claim_tasks.php',
    'alerts' => 'alerts.php',
    'sizing' => 'sizing.php',
    'drylog-admin' => 'drylog_admin.php',
    'drylog-portal' => 'drylog_portal.php',
];

if ($resource === '' || $resource === 'health') {
    json_ok([
        'service' => 'DryLog PRO API',
        'status' => 'ok',
    ]);
}

if (!isset($routes[$resource])) {
    json_error('Route not found', 404);
}

$GLOBALS['db'] = $db;
$GLOBALS['method'] = $method;
$GLOBALS['route_id'] = $route_id;

require __DIR__ . '/../routes/' . $routes[$resource];
