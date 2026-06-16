<?php
// drying_zones.php — DryLog PRO logical drying volumes per claim. Zones can
// span multiple rooms via the drying_zone_rooms M:N junction.
//
//   GET    /api/drying-zones?claim_id=N                   list zones for a claim
//                                                         (includes claim_room_ids[])
//   GET    /api/drying-zones/{id}                         single zone (+ room ids)
//   POST   /api/drying-zones                              create. body: {
//                                                           claim_id, name,
//                                                           claim_room_ids: [],
//                                                           zone_index?, category_of_water?,
//                                                           class_of_water?, containment_notes? }
//   PUT    /api/drying-zones/{id}                         update zone (and optionally
//                                                         replace claim_room_ids[])
//   POST   /api/drying-zones/{id}/close                   mark closed (zone hit dry goal)
//   DELETE /api/drying-zones/{id}                         soft-delete
//
// Spec: docs/F18-drylog-pro-spec.md §3.2, §3.3, §7.1

require_once __DIR__ . '/../lib/drylog_pro_model.php';

$db     = $GLOBALS['db'];
$method = $GLOBALS['method'];
$id     = $GLOBALS['route_id'];
$user   = require_auth($db);
$cid    = (int)$user['company_id'];

// Sub-segment parsing for /drying-zones/{id}/close
$_segs = explode('/', trim(parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH), '/'));
if (($_segs[0] ?? '') === 'api') array_shift($_segs);
$action = $_segs[2] ?? null;

// ── POST /api/drying-zones/seed-from-inspection ──────────────────────────────
// One-tap chamber setup from the claim's completed inspection. Builds a single
// "Chamber 1" linking every room that has a wet surface (Rick's call — one
// chamber, all wet rooms), a claim_surface per wet surface (dry goal
// auto-derived from the claim's material standards), a reading point each, and
// seeds the Day-0 moisture reading from the %MC captured at inspection — so the
// drying trend starts at the inspection, not a cold start days later.
//
// Idempotent-safe: refuses if the claim already has a (non-deleted) chamber, so
// re-tapping the button can't double-seed.
//   POST body: { claim_id }
//   → { zone_id, rooms_created, surfaces_created, readings_created }
if ($method === 'POST' && !$id && ($_segs[1] ?? '') === 'seed-from-inspection') {
    $b = get_json_body();
    $claim_id = (int)($b['claim_id'] ?? 0);
    if ($claim_id <= 0) json_error('claim_id required', 422);
    if (!tc_drylog_claim_for_company($db, $cid, $claim_id)) json_error('Claim not found', 404);

    // Already seeded? Bail rather than duplicate.
    $ex = $db->prepare("SELECT COUNT(*) FROM drying_zones WHERE company_id=? AND claim_id=? AND deleted_at IS NULL");
    $ex->execute([$cid, $claim_id]);
    if ((int)$ex->fetchColumn() > 0) {
        json_error('This claim already has a drying chamber — seed skipped to avoid duplicates.', 409);
    }

    // Locate the claim's completed inspection (linked by job_id, or via the
    // lead both share).
    $lead_id = null;
    try {
        $js = $db->prepare("SELECT lead_id FROM jobs WHERE id=? AND company_id=?");
        $js->execute([$claim_id, $cid]);
        $lv = $js->fetchColumn();
        $lead_id = ($lv !== false && $lv !== null) ? (int)$lv : null;
    } catch (Throwable $e) { /* jobs.lead_id may be absent on old installs */ }

    $isql  = "SELECT id, payload_json, inspection_date, sketch_cad_json FROM inspections
              WHERE company_id=? AND status='completed' AND (job_id=?";
    $iargs = [$cid, $claim_id];
    if ($lead_id) { $isql .= " OR lead_id=?"; $iargs[] = $lead_id; }
    $isql .= ") ORDER BY inspection_date DESC, id DESC LIMIT 1";
    $is = $db->prepare($isql);
    $is->execute($iargs);
    $insp = $is->fetch();
    if (!$insp) json_error('No completed inspection found for this claim to seed from.', 404);

    $payload = json_decode((string)($insp['payload_json'] ?? ''), true);
    $rooms   = is_array($payload['rooms']   ?? null) ? $payload['rooms']   : [];
    $modules = is_array($payload['modules'] ?? null) ? $payload['modules'] : [];

    // "Cat 2 (gray)" → 2 ; "Class 3" → 3 (TINYINT columns on the zone).
    $catw = null; $clsw = null;
    if (preg_match('/cat\s*([123])/i',   (string)($modules['water']['category'] ?? ''), $mm)) $catw = (int)$mm[1];
    if (preg_match('/class\s*([1234])/i', (string)($modules['water']['class']    ?? ''), $mm)) $clsw = (int)$mm[1];

    // Rooms with ≥1 wet surface.
    $wetRooms = [];
    foreach ($rooms as $rm) {
        $surfs = is_array($rm['surfaces'] ?? null) ? $rm['surfaces'] : [];
        $wet = array_values(array_filter($surfs, fn($s) => !empty($s['wet'])));
        if ($wet) $wetRooms[] = ['room' => $rm, 'wet' => $wet];
    }
    if (!$wetRooms) {
        json_error('The inspection has no surfaces marked wet — mark wet surfaces on the inspection first, then seed.', 422);
    }

    $insp_date  = $insp['inspection_date'] ?: date('Y-m-d');
    $reading_at = $insp_date . ' 12:00:00';
    $surfaceTypeMap = ['walls' => 'wall'];   // others pass through unchanged

    $db->beginTransaction();
    try {
        // Day-0 visit (reuse the latest if one already exists) so the seeded
        // moisture readings have a visit to hang on.
        $vs = $db->prepare("SELECT id FROM visits WHERE company_id=? AND job_id=? ORDER BY visit_date DESC, id DESC LIMIT 1");
        $vs->execute([$cid, $claim_id]);
        $visit_id = (int)($vs->fetchColumn() ?: 0);
        if ($visit_id <= 0) {
            $db->prepare("INSERT INTO visits (company_id, job_id, tech_user_id, visit_date, visit_type, submitted_at)
                          VALUES (?, ?, ?, ?, 'drying', NOW())")
               ->execute([$cid, $claim_id, (int)$user['id'], $insp_date]);
            $visit_id = (int)$db->lastInsertId();
        }

        // The chamber — copy the inspection's CAD sketch onto it if present.
        $sketch = $insp['sketch_cad_json'] ?: null;
        $db->prepare("INSERT INTO drying_zones
                        (company_id, claim_id, name, zone_index, category_of_water, class_of_water,
                         containment_notes, sketch_cad_json, sketch_cad_updated_at, sketch_cad_updated_by)
                      VALUES (?, ?, 'Chamber 1', 1, ?, ?, ?, ?, ?, ?)")
           ->execute([$cid, $claim_id, $catw, $clsw,
                      'Seeded from inspection #' . (int)$insp['id'] . '.',
                      $sketch, ($sketch ? date('Y-m-d H:i:s') : null), ($sketch ? (int)$user['id'] : null)]);
        $zone_id = (int)$db->lastInsertId();

        $roomIns = $db->prepare("INSERT INTO claim_rooms (company_id, claim_id, name, room_index, length_ft, width_ft, height_ft)
                                 VALUES (?, ?, ?, ?, ?, ?, ?)");
        $surfIns = $db->prepare("INSERT INTO claim_surfaces (company_id, drying_zone_id, surface_type, surface_label, material, area_sf, linear_ft, ceiling_height_ft)
                                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
        $ptIns   = $db->prepare("INSERT INTO reading_points (company_id, claim_surface_id, point_label) VALUES (?, ?, 'RP1')");
        $moiIns  = $db->prepare("INSERT INTO moisture_readings
                                    (company_id, claim_id, drying_zone_id, claim_surface_id, reading_point_id, visit_id,
                                     reading_at, moisture_value, moisture_unit, dry_goal_snapshot, is_dry_at_time, captured_by_user_id, notes)
                                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, '%MC', ?, ?, ?, 'Day-0 reading from inspection')");
        $goalGet = $db->prepare("SELECT dry_goal FROM claim_surfaces WHERE id=? AND company_id=?");

        $room_ids = []; $surfaces_created = 0; $readings_created = 0; $ri = 0;
        foreach ($wetRooms as $wr) {
            $rm   = $wr['room'];
            $name = trim((string)($rm['name'] ?? '')) ?: ('Room ' . ($ri + 1));
            $L = (float)($rm['length_ft'] ?? 0) ?: null;
            $W = (float)($rm['width_ft']  ?? 0) ?: null;
            $H = (float)($rm['height_ft'] ?? 0) ?: null;
            $roomIns->execute([$cid, $claim_id, $name, ++$ri, $L, $W, $H]);
            $room_ids[] = (int)$db->lastInsertId();

            // Surface measures (prefer the form's computed values; fall back to geometry).
            $floor_sf = (float)($rm['floor_sf'] ?? 0);
            $wall_sf  = (float)($rm['wall_sf']  ?? 0);
            $perim_lf = (float)($rm['perim_lf'] ?? 0);
            if ($floor_sf <= 0 && $L && $W)        $floor_sf = round($L * $W, 2);
            if ($perim_lf <= 0 && $L && $W)        $perim_lf = round(2 * ($L + $W), 2);
            if ($wall_sf  <= 0 && $perim_lf && $H) $wall_sf  = round($perim_lf * $H, 2);

            foreach ($wr['wet'] as $sf) {
                $stype    = (string)($sf['surface'] ?? '');
                $stypeDb  = $surfaceTypeMap[$stype] ?? ($stype !== '' ? $stype : 'surface');
                $material = trim((string)($sf['material'] ?? '')) ?: null;
                $label    = $name . ' — ' . ucfirst($stype);

                $area = null; $lin = null; $ch = null;
                if ($stype === 'floor')        { $area = $floor_sf ?: null; }
                elseif ($stype === 'ceiling')  { $area = $floor_sf ?: null; $ch = $H; }
                elseif ($stype === 'walls')    { $area = $wall_sf ?: null; $lin = $perim_lf ?: null; $ch = $H; }
                elseif ($stype === 'trim')     { $lin = $perim_lf ?: null; }

                $surfIns->execute([$cid, $zone_id, $stypeDb, $label, $material, $area, $lin, $ch]);
                $surface_id = (int)$db->lastInsertId();
                $surfaces_created++;

                // Dry goal from the claim's material standards (NULL if none set).
                tc_apply_material_standard_to_surface($db, $cid, $surface_id, $claim_id, $material);

                $ptIns->execute([$cid, $surface_id]);
                $point_id = (int)$db->lastInsertId();

                // Day-0 moisture reading from the captured %MC, when the tech entered one.
                $mc = $sf['mc_initial'] ?? null;
                if ($mc !== null && $mc !== '' && is_numeric($mc)) {
                    $goalGet->execute([$surface_id, $cid]);
                    $gv   = $goalGet->fetchColumn();
                    $goal = ($gv !== false && $gv !== null) ? (float)$gv : null;
                    $is_dry = ($goal !== null && (float)$mc <= $goal) ? 1 : 0;
                    $moiIns->execute([$cid, $claim_id, $zone_id, $surface_id, $point_id, $visit_id,
                                      $reading_at, (float)$mc, $goal, $is_dry, (int)$user['id']]);
                    $readings_created++;
                    tc_drylog_recompute_surface_dryness($db, $cid, $surface_id);
                }
            }
        }

        tc_drylog_zone_set_rooms($db, $cid, $zone_id, $claim_id, $room_ids);
        $db->commit();
    } catch (Throwable $e) {
        if ($db->inTransaction()) $db->rollBack();
        json_error_with_log('drying_zones.seed_from_inspection', 'Seed failed', $e, 500);
    }

    json_ok([
        'zone_id'          => $zone_id,
        'rooms_created'    => count($room_ids),
        'surfaces_created' => $surfaces_created,
        'readings_created' => $readings_created,
        'category_of_water'=> $catw,
    ], 201);
}

// ── GET list ───────────────────────────────────────────────────────────────
if ($method === 'GET' && !$id) {
    $claim_id = (int)($_GET['claim_id'] ?? 0);
    if ($claim_id <= 0) json_error('claim_id required', 422);
    if (!tc_drylog_claim_for_company($db, $cid, $claim_id)) {
        json_error('Claim not found', 404);
    }
    $include_closed = !empty($_GET['include_closed']);

    $sql = "
        SELECT id, claim_id, name, zone_index, category_of_water, class_of_water,
               containment_notes, is_closed, closed_at, created_at, updated_at,
               (sketch_cad_json IS NOT NULL AND sketch_cad_json <> '' AND LOWER(sketch_cad_json) <> 'null') AS has_sketch
          FROM drying_zones
         WHERE company_id = ? AND claim_id = ? AND deleted_at IS NULL
    ";
    if (!$include_closed) $sql .= " AND is_closed = 0 ";
    $sql .= " ORDER BY COALESCE(zone_index, 999999), id ";
    $s = $db->prepare($sql);
    $s->execute([$cid, $claim_id]);
    $rows = $s->fetchAll();

    // Batch-fetch all room IDs for these zones in one query instead of
    // N queries (was firing tc_drylog_zone_room_ids once per zone — visible
    // on every DryLog PRO dashboard load).
    if ($rows) {
        $zone_ids = array_map(fn($r) => (int)$r['id'], $rows);
        $ph = implode(',', array_fill(0, count($zone_ids), '?'));
        $rooms_s = $db->prepare("
            SELECT drying_zone_id, claim_room_id
              FROM drying_zone_rooms
             WHERE company_id = ? AND drying_zone_id IN ($ph)
             ORDER BY id
        ");
        $rooms_s->execute(array_merge([$cid], $zone_ids));
        $by_zone = [];
        foreach ($rooms_s->fetchAll() as $jr) {
            $zid = (int)$jr['drying_zone_id'];
            $by_zone[$zid] = $by_zone[$zid] ?? [];
            $by_zone[$zid][] = (int)$jr['claim_room_id'];
        }
        foreach ($rows as &$r) {
            $r['claim_room_ids'] = $by_zone[(int)$r['id']] ?? [];
        }
        unset($r);
    }
    json_list($rows);
}

// ── GET single ─────────────────────────────────────────────────────────────
// Only match when there's no sub-action — otherwise /{id}/sketch and /{id}/close
// would be shadowed by this handler.
if ($method === 'GET' && $id && !$action) {
    $row = tc_drylog_zone_for_company($db, $cid, $id);
    if (!$row) json_error('Not found', 404);
    $row['claim_room_ids'] = tc_drylog_zone_room_ids($db, $cid, $id);
    json_ok($row);
}

// ── POST create ────────────────────────────────────────────────────────────
if ($method === 'POST' && !$id) {
    $b = get_json_body();
    $claim_id   = (int)($b['claim_id'] ?? 0);
    $name       = trim((string)($b['name'] ?? ''));
    $room_ids   = $b['claim_room_ids'] ?? [];
    if ($claim_id <= 0) json_error('claim_id required', 422);
    if ($name === '')   json_error('name required', 422);
    if (!is_array($room_ids)) json_error('claim_room_ids must be array', 422);
    if (!tc_drylog_claim_for_company($db, $cid, $claim_id)) {
        json_error('Claim not found', 404);
    }

    $zone_index        = isset($b['zone_index'])        ? (int)$b['zone_index'] : null;
    $category_of_water = isset($b['category_of_water']) ? (int)$b['category_of_water'] : null;
    $class_of_water    = isset($b['class_of_water'])    ? (int)$b['class_of_water'] : null;
    $containment_notes = isset($b['containment_notes']) ? trim((string)$b['containment_notes']) : null;

    $db->beginTransaction();
    try {
        $db->prepare("
            INSERT INTO drying_zones
                (company_id, claim_id, name, zone_index,
                 category_of_water, class_of_water, containment_notes)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ")->execute([$cid, $claim_id, $name, $zone_index,
                     $category_of_water, $class_of_water, $containment_notes]);

        $new_id = (int)$db->lastInsertId();

        tc_drylog_zone_set_rooms($db, $cid, $new_id, $claim_id, array_map('intval', $room_ids));
        $db->commit();
    } catch (Throwable $e) {
        if ($db->inTransaction()) $db->rollBack();
        if (str_contains($e->getMessage(), 'claim_room_ids contains rooms')) {
            json_error($e->getMessage(), 422);
        }
        json_error_with_log('drying_zones.create', 'Create failed', $e, 500);
    }

    $row = tc_drylog_zone_for_company($db, $cid, $new_id);
    $row['claim_room_ids'] = tc_drylog_zone_room_ids($db, $cid, $new_id);
    json_ok($row, 201);
}

// ── POST {id}/sketch ───────────────────────────────────────────────────────
// F18.12c: upload (or replace) the chamber's floor-sketch image. Stored as a
// regular entity_attachment(entity_type='visit') for compatibility with the
// existing photo gallery, then drying_zones.sketch_attachment_id points at it.
// We tag the attachment with caption "Floor sketch — {chamber name}" so it's
// obvious in the gallery what it is.
if ($method === 'POST' && $id && $action === 'sketch') {
    $zone = tc_drylog_zone_for_company($db, $cid, $id);
    if (!$zone) json_error('Not found', 404);
    if (empty($_FILES['file']) || !is_uploaded_file($_FILES['file']['tmp_name'] ?? '')) {
        json_error('file (multipart) required', 422);
    }
    $f = $_FILES['file'];
    $ext = strtolower(pathinfo((string)$f['name'], PATHINFO_EXTENSION));
    if (!in_array($ext, ['jpg','jpeg','png','gif','webp','heic'], true)) {
        json_error('Image file required (.jpg/.png/.webp etc)', 422);
    }

    // Anchor to the most recent visit. If none exists yet (chamber created
    // before any reading), spin up a lightweight visit row so the upload has
    // somewhere to live — the tech shouldn't be blocked on capturing readings
    // first just to upload a planning sketch.
    $vs = $db->prepare("SELECT id FROM visits WHERE company_id = ? AND job_id = ? ORDER BY visit_date DESC, id DESC LIMIT 1");
    $vs->execute([$cid, (int)$zone['claim_id']]);
    $visit_id = (int)($vs->fetchColumn() ?: 0);
    if ($visit_id <= 0) {
        $db->prepare("
            INSERT INTO visits (company_id, job_id, tech_user_id, visit_date, visit_type, submitted_at)
            VALUES (?, ?, ?, CURDATE(), 'drying', NOW())
        ")->execute([$cid, (int)$zone['claim_id'], (int)$user['id']]);
        $visit_id = (int)$db->lastInsertId();
    }

    // Save the file
    $dir = __DIR__ . "/../../uploads/attachments/$cid/visit/$visit_id";
    if (!is_dir($dir) && !@mkdir($dir, 0775, true) && !is_dir($dir)) {
        json_error('Could not create upload dir', 500);
    }
    $base = preg_replace('/[^a-zA-Z0-9._-]/', '_', pathinfo((string)$f['name'], PATHINFO_FILENAME)) ?: 'sketch';
    $safe = 'sketch_' . date('Ymd_His') . '_' . substr(bin2hex(random_bytes(3)), 0, 5) . '_' . $base . '.' . $ext;
    $dest = $dir . '/' . $safe;
    if (!move_uploaded_file($f['tmp_name'], $dest)) json_error('Upload failed', 500);
    $rel = "uploads/attachments/$cid/visit/$visit_id/$safe";

    $caption = 'Floor sketch — ' . ($zone['name'] ?? 'chamber');
    $db->prepare("
        INSERT INTO entity_attachments
            (company_id, entity_type, entity_id, file_url, original_name, mime_type, size_bytes, caption, uploaded_by)
        VALUES (?, 'visit', ?, ?, ?, ?, ?, ?, ?)
    ")->execute([
        $cid, $visit_id, $rel, (string)$f['name'],
        ($f['type'] ?? null) ?: null, (int)$f['size'], $caption, (int)$user['id'],
    ]);
    $att_id = (int)$db->lastInsertId();

    $db->prepare("UPDATE drying_zones SET sketch_attachment_id = ? WHERE id = ? AND company_id = ?")
       ->execute([$att_id, $id, $cid]);

    json_ok(['sketch_attachment_id' => $att_id, 'sketch_url' => '/' . $rel]);
}

// ── GET {id}/sketch ────────────────────────────────────────────────────────
// Returns { sketch_url, points: [{id, point_label, surface_label, sketch_x, sketch_y}] }
// for rendering the placement canvas / drill-down view.
if ($method === 'GET' && $id && $action === 'sketch') {
    $zone = tc_drylog_zone_for_company($db, $cid, $id);
    if (!$zone) json_error('Not found', 404);
    $sketch_url = null;
    if (!empty($zone['sketch_attachment_id'])) {
        $s = $db->prepare("SELECT file_url FROM entity_attachments WHERE id = ? AND company_id = ?");
        $s->execute([(int)$zone['sketch_attachment_id'], $cid]);
        $fu = $s->fetchColumn();
        if ($fu) $sketch_url = '/' . ltrim($fu, '/');
    }
    $ps = $db->prepare("
        SELECT rp.id, rp.point_label, rp.sketch_x_pct, rp.sketch_y_pct,
               s.surface_label, s.surface_type
          FROM reading_points rp
          JOIN claim_surfaces s ON s.id = rp.claim_surface_id
         WHERE s.drying_zone_id = ? AND s.deleted_at IS NULL AND rp.deleted_at IS NULL
         ORDER BY s.id, rp.id
    ");
    $ps->execute([$id]);
    json_ok([
        'sketch_url' => $sketch_url,
        'points'     => $ps->fetchAll(),
    ]);
}

// ── PUT {id}/sketch-cad ────────────────────────────────────────────────────
// F18.14: save in-app CAD sketch JSON state. Body: { state_json: {...} }.
// The JSON is the source of truth — SVG renders on PDF/portal are derived.
if ($method === 'PUT' && $id && $action === 'sketch-cad') {
    $zone = tc_drylog_zone_for_company($db, $cid, $id);
    if (!$zone) json_error('Not found', 404);
    $b = get_json_body();
    if (!isset($b['state_json'])) json_error('state_json required', 422);
    // Accept object or string; we store as JSON string
    $json = is_string($b['state_json']) ? $b['state_json'] : json_encode($b['state_json']);
    if (strlen($json) > 5_000_000) json_error('Sketch state too large (>5MB)', 413);
    // Sanity: valid JSON
    if (json_decode($json) === null && strtolower($json) !== 'null') {
        json_error('state_json is not valid JSON', 422);
    }
    $db->prepare("
        UPDATE drying_zones
           SET sketch_cad_json = ?, sketch_cad_updated_at = NOW(), sketch_cad_updated_by = ?
         WHERE id = ? AND company_id = ?
    ")->execute([$json, (int)$user['id'], $id, $cid]);
    json_ok(['saved_at' => date('Y-m-d H:i:s')]);
}

// ── GET {id}/sketch-cad ────────────────────────────────────────────────────
// Returns { state_json, updated_at, updated_by_name, points }. points[] is
// the chamber's reading_points so the editor can offer them as placeable
// markers without a second round-trip.
if ($method === 'GET' && $id && $action === 'sketch-cad') {
    $zone = tc_drylog_zone_for_company($db, $cid, $id);
    if (!$zone) json_error('Not found', 404);
    $s = $db->prepare("
        SELECT z.sketch_cad_json, z.sketch_cad_updated_at,
               COALESCE(u.display_name, u.username) AS updated_by_name
          FROM drying_zones z
          LEFT JOIN users u ON u.id = z.sketch_cad_updated_by
         WHERE z.id = ? AND z.company_id = ?
    ");
    $s->execute([$id, $cid]);
    $r = $s->fetch() ?: [];

    $ps = $db->prepare("
        SELECT rp.id, rp.point_label,
               cs.surface_label, cs.surface_type
          FROM reading_points rp
          JOIN claim_surfaces cs ON cs.id = rp.claim_surface_id
         WHERE cs.drying_zone_id = ? AND cs.deleted_at IS NULL AND rp.deleted_at IS NULL
         ORDER BY cs.id, rp.id
    ");
    $ps->execute([$id]);
    json_ok([
        'state_json'      => $r['sketch_cad_json'] ? json_decode($r['sketch_cad_json'], true) : null,
        'updated_at'      => $r['sketch_cad_updated_at'] ?? null,
        'updated_by_name' => $r['updated_by_name'] ?? null,
        'points'          => $ps->fetchAll(),
    ]);
}

// ── POST {id}/copy-sketch ──────────────────────────────────────────────────
// Copy another zone's CAD sketch into this one so similar rooms aren't redrawn
// from scratch. We copy the geometry (walls/rooms/doors/windows/openings/texts/
// equipment/water) but strip zone-specific bindings: reading-point markers and
// any room→surface / reading-point id references (they belong to the SOURCE
// zone and would mislink). Geometry copies; the user re-links surfaces via the
// Room tool / auto-room in the target if desired.  body: { source_zone_id }
if ($method === 'POST' && $id && $action === 'copy-sketch') {
    $target = tc_drylog_zone_for_company($db, $cid, $id);
    if (!$target) json_error('Not found', 404);
    $b = get_json_body();
    $src_id = (int)($b['source_zone_id'] ?? 0);
    if ($src_id <= 0) json_error('source_zone_id required', 422);
    if ($src_id === (int)$id) json_error('Source and target are the same zone', 422);
    if (!tc_drylog_zone_for_company($db, $cid, $src_id)) json_error('Source zone not found', 404);

    $sj = $db->prepare("SELECT sketch_cad_json FROM drying_zones WHERE id = ? AND company_id = ?");
    $sj->execute([$src_id, $cid]);
    $raw = (string)($sj->fetchColumn() ?: '');
    if ($raw === '' || strtolower($raw) === 'null') json_error('That chamber has no sketch to copy', 422);

    $state = json_decode($raw, true);
    if (!is_array($state)) json_error('Source sketch is invalid', 422);

    // Reading-point markers are zone-specific — drop them.
    unset($state['points']);
    // Strip room→surface / reading-point id bindings (stale in the target).
    if (!empty($state['rooms']) && is_array($state['rooms'])) {
        foreach ($state['rooms'] as &$rm) {
            if (!is_array($rm)) continue;
            foreach (array_keys($rm) as $k) {
                if (stripos($k, 'surface') !== false || stripos($k, 'pointid') !== false || stripos($k, 'reading') !== false) {
                    unset($rm[$k]);
                }
            }
        }
        unset($rm);
    }

    $json = json_encode($state);
    if (strlen($json) > 5_000_000) json_error('Sketch state too large (>5MB)', 413);

    $db->prepare("
        UPDATE drying_zones
           SET sketch_cad_json = ?, sketch_cad_updated_at = NOW(), sketch_cad_updated_by = ?
         WHERE id = ? AND company_id = ?
    ")->execute([$json, (int)$user['id'], $id, $cid]);
    json_ok(['copied_from' => $src_id, 'saved_at' => date('Y-m-d H:i:s')]);
}

// ── POST {id}/auto-room ────────────────────────────────────────────────────
// F18.14b: called by the CAD Room tool. Given a room's label + dimensions in
// feet (width / depth / ceiling_height), creates the 3 surfaces (floor,
// ceiling, walls-composite) in one transaction with the SF + LF measurements
// pre-filled. Returns the 3 created surface IDs so the sketch can link them
// to the room polygon in state.rooms[].
if ($method === 'POST' && $id && $action === 'auto-room') {
    $zone = tc_drylog_zone_for_company($db, $cid, $id);
    if (!$zone) json_error('Not found', 404);
    $b = get_json_body();
    $label = trim((string)($b['label'] ?? ''));
    $width_ft  = (float)($b['width_ft']  ?? 0);
    $depth_ft  = (float)($b['depth_ft']  ?? 0);
    $ceil_h_ft = (float)($b['ceiling_height_ft'] ?? 8);
    if ($label === '')         json_error('label required', 422);
    if ($width_ft <= 0)        json_error('width_ft must be > 0', 422);
    if ($depth_ft <= 0)        json_error('depth_ft must be > 0', 422);
    if ($ceil_h_ft <= 0)       json_error('ceiling_height_ft must be > 0', 422);

    $floor_sf   = round($width_ft * $depth_ft, 2);
    $ceiling_sf = $floor_sf;
    $perimeter  = round(2 * ($width_ft + $depth_ft), 2);
    $wall_sf    = round($perimeter * $ceil_h_ft, 2);

    $ins = $db->prepare("
        INSERT INTO claim_surfaces
            (company_id, drying_zone_id, surface_type, surface_label,
             area_sf, linear_ft, ceiling_height_ft)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ");
    $db->beginTransaction();
    try {
        $ins->execute([$cid, $id, 'floor',   "$label Floor",   $floor_sf,   null,       null]);
        $floor_id = (int)$db->lastInsertId();
        $ins->execute([$cid, $id, 'ceiling', "$label Ceiling", $ceiling_sf, null,       $ceil_h_ft]);
        $ceiling_id = (int)$db->lastInsertId();
        $ins->execute([$cid, $id, 'wall',    "$label Walls",   $wall_sf,    $perimeter, $ceil_h_ft]);
        $wall_id = (int)$db->lastInsertId();
        $db->commit();
    } catch (Throwable $e) {
        $db->rollBack();
        throw $e;
    }
    json_ok([
        'floor_id'   => $floor_id,
        'ceiling_id' => $ceiling_id,
        'wall_id'    => $wall_id,
        'floor_sf'   => $floor_sf,
        'ceiling_sf' => $ceiling_sf,
        'wall_sf'    => $wall_sf,
        'linear_ft'  => $perimeter,
    ], 201);
}

// ── POST {id}/close ────────────────────────────────────────────────────────
if ($method === 'POST' && $id && $action === 'close') {
    if (!tc_drylog_zone_for_company($db, $cid, $id)) {
        json_error('Not found', 404);
    }
    $db->prepare("
        UPDATE drying_zones
           SET is_closed = 1, closed_at = NOW()
         WHERE id = ? AND company_id = ?
    ")->execute([$id, $cid]);
    $row = tc_drylog_zone_for_company($db, $cid, $id);
    $row['claim_room_ids'] = tc_drylog_zone_room_ids($db, $cid, $id);
    json_ok($row);
}

// ── PUT update ─────────────────────────────────────────────────────────────
if ($method === 'PUT' && $id) {
    $zone = tc_drylog_zone_for_company($db, $cid, $id);
    if (!$zone) json_error('Not found', 404);

    $b = get_json_body();
    $fields = pick($b, [
        'name','zone_index','category_of_water','class_of_water','containment_notes'
    ]);
    $update_rooms = array_key_exists('claim_room_ids', $b);
    $room_ids = $update_rooms ? $b['claim_room_ids'] : null;
    if ($update_rooms && !is_array($room_ids)) {
        json_error('claim_room_ids must be array', 422);
    }
    if (empty($fields) && !$update_rooms) json_error('No fields to update');

    if (isset($fields['name']) && trim((string)$fields['name']) === '') {
        json_error('name cannot be blank', 422);
    }

    $db->beginTransaction();
    try {
        if (!empty($fields)) {
            $sets = implode(', ', array_map(fn($k) => "$k = ?", array_keys($fields)));
            $vals = array_values($fields);
            $vals[] = $id;
            $vals[] = $cid;
            $db->prepare("UPDATE drying_zones SET $sets WHERE id = ? AND company_id = ?")
               ->execute($vals);
        }
        if ($update_rooms) {
            tc_drylog_zone_set_rooms($db, $cid, $id, (int)$zone['claim_id'], array_map('intval', $room_ids));
        }
        $db->commit();
    } catch (Throwable $e) {
        if ($db->inTransaction()) $db->rollBack();
        if (str_contains($e->getMessage(), 'claim_room_ids contains rooms')) {
            json_error($e->getMessage(), 422);
        }
        json_error_with_log('drying_zones.update', 'Update failed', $e, 500);
    }

    $row = tc_drylog_zone_for_company($db, $cid, $id);
    $row['claim_room_ids'] = tc_drylog_zone_room_ids($db, $cid, $id);
    json_ok($row);
}

// ── DELETE (soft) ──────────────────────────────────────────────────────────
if ($method === 'DELETE' && $id) {
    if (!tc_drylog_zone_for_company($db, $cid, $id)) {
        json_error('Not found', 404);
    }
    $db->prepare("UPDATE drying_zones SET deleted_at = NOW() WHERE id = ? AND company_id = ?")
       ->execute([$id, $cid]);
    json_ok(null);
}

json_error('Not found', 404);
