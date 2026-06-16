<?php
// room_readings.php — query moisture readings for drying-log views
//
//   GET /api/room-readings?job_id=N                 all readings for a job, grouped
//   GET /api/room-readings?visit_id=N               readings for one visit
//
// Returns a structured payload optimized for a drying-log chart UI:
//
// {
//   job_id: 5,
//   rooms: [
//     {
//       room_name: "Basement",
//       surfaces: [
//         {
//           surface_type: "drywall",
//           surface_label: "East wall",
//           wall_index: 1,
//           drying_goal: 16,
//           series: [
//             { date: "2026-05-12", m1: 28.5, m2: 30.0, m3: 27.0, visit_id: 12 },
//             { date: "2026-05-13", m1: 22.0, m2: 24.5, m3: 21.0, visit_id: 13 },
//           ]
//         }
//       ]
//     }
//   ]
// }

$db     = $GLOBALS['db'];
$method = $GLOBALS['method'];
$id     = $GLOBALS['route_id'];
$user   = require_auth($db);
$cid    = (int)$user['company_id'];

// ── PUT /api/room-readings/{id} — edit a single reading (office fix flow) ──
if ($method === 'PUT' && $id) {
    $s = $db->prepare("SELECT id FROM room_readings WHERE id = ? AND company_id = ?");
    $s->execute([$id, $cid]);
    if (!$s->fetch()) json_error('Reading not found', 404);

    $b = get_json_body();
    $allowed = ['surface_type','surface_label','wall_index','m1','m2','m3','drying_goal','surface_temp','is_reference','notes'];
    $fields = pick($b, $allowed);
    // Coerce numerics
    foreach (['m1','m2','m3','drying_goal','surface_temp'] as $k) {
        if (array_key_exists($k, $fields)) {
            $fields[$k] = ($fields[$k] === '' || $fields[$k] === null) ? null : (float)$fields[$k];
        }
    }
    if (array_key_exists('wall_index', $fields)) {
        $fields['wall_index'] = $fields['wall_index'] === '' || $fields['wall_index'] === null ? null : (int)$fields['wall_index'];
    }
    if (array_key_exists('is_reference', $fields)) {
        $fields['is_reference'] = !empty($fields['is_reference']) ? 1 : 0;
    }
    if (empty($fields)) json_error('No fields to update');

    $sets = implode(', ', array_map(fn($k) => "$k = ?", array_keys($fields)));
    $vals = array_values($fields);
    $vals[] = $id;
    $vals[] = $cid;
    $db->prepare("UPDATE room_readings SET $sets WHERE id = ? AND company_id = ?")->execute($vals);

    $s = $db->prepare("SELECT * FROM room_readings WHERE id = ?");
    $s->execute([$id]);
    json_ok($s->fetch());
}

// ── DELETE /api/room-readings/{id} — remove a reading entirely ────────────
if ($method === 'DELETE' && $id) {
    require_role($user, 'Owner', 'GM', 'Admin');
    $s = $db->prepare("SELECT id FROM room_readings WHERE id = ? AND company_id = ?");
    $s->execute([$id, $cid]);
    if (!$s->fetch()) json_error('Reading not found', 404);
    $db->prepare("DELETE FROM room_readings WHERE id = ? AND company_id = ?")->execute([$id, $cid]);
    json_ok(null);
}

if ($method !== 'GET') json_error('Method not allowed', 405);

$job_id   = (int)($_GET['job_id']   ?? 0);
$visit_id = (int)($_GET['visit_id'] ?? 0);

$where  = ['r.company_id = ?'];
$params = [$cid];
if ($job_id > 0)   { $where[] = 'r.job_id = ?';   $params[] = $job_id; }
if ($visit_id > 0) { $where[] = 'r.visit_id = ?'; $params[] = $visit_id; }
if ($job_id === 0 && $visit_id === 0) json_error('job_id or visit_id required', 422);

$sql = "
    SELECT r.*,
           v.visit_date,
           v.day_index,
           COALESCE(vr.room_name, r.room_name) AS room_name_resolved
    FROM room_readings r
    LEFT JOIN visits       v  ON v.id  = r.visit_id
    LEFT JOIN visit_rooms  vr ON vr.id = r.visit_room_id
    WHERE " . implode(' AND ', $where) . "
    ORDER BY r.reading_date, r.id
";
$stmt = $db->prepare($sql);
$stmt->execute($params);
$rows = $stmt->fetchAll();

// Group: room → surface → readings (time series)
$grouped = [];
foreach ($rows as $r) {
    $room = $r['room_name_resolved'] ?: 'Unknown Room';
    $surf_key = ($r['surface_type'] ?? 'unknown')
        . '|' . ($r['surface_label'] ?? '')
        . '|' . ($r['wall_index'] ?? '');
    if (!isset($grouped[$room]))             $grouped[$room] = [];
    if (!isset($grouped[$room][$surf_key])) {
        $grouped[$room][$surf_key] = [
            'surface_type'  => $r['surface_type'],
            'surface_label' => $r['surface_label'],
            'wall_index'    => $r['wall_index'] !== null ? (int)$r['wall_index'] : null,
            'drying_goal'   => $r['drying_goal'] !== null ? (float)$r['drying_goal'] : null,
            'is_reference'  => !empty($r['is_reference']),
            'series'        => [],
        ];
    }
    $grouped[$room][$surf_key]['series'][] = [
        'date'         => $r['reading_date'],
        'visit_date'   => $r['visit_date'],
        'day_index'    => $r['day_index'] !== null ? (int)$r['day_index'] : null,
        'visit_id'     => (int)$r['visit_id'],
        'm1'           => $r['m1'] !== null ? (float)$r['m1'] : null,
        'm2'           => $r['m2'] !== null ? (float)$r['m2'] : null,
        'm3'           => $r['m3'] !== null ? (float)$r['m3'] : null,
        'surface_temp' => $r['surface_temp'] !== null ? (float)$r['surface_temp'] : null,
        'notes'        => $r['notes'],
    ];
    // Keep most-recent drying_goal in case it changed mid-job
    if ($r['drying_goal'] !== null) {
        $grouped[$room][$surf_key]['drying_goal'] = (float)$r['drying_goal'];
    }
}

// Reshape to ordered arrays
$out_rooms = [];
foreach ($grouped as $room_name => $surfaces) {
    $out_rooms[] = [
        'room_name' => $room_name,
        'surfaces'  => array_values($surfaces),
    ];
}

json_ok([
    'job_id'   => $job_id ?: null,
    'visit_id' => $visit_id ?: null,
    'rooms'    => $out_rooms,
]);
