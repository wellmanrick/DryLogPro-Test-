<?php
// drylog_pro_model.php — data-access helpers for the DryLog PRO 5-level
// entity hierarchy. Spec: docs/F18-drylog-pro-spec.md §2.
//
// Every cross-row write or read goes through these scope-check helpers so
// no route can mutate another company's data by ID guessing. Each helper
// returns the row on success, or null on miss/cross-tenant. Routes treat
// null as 404.

/**
 * Confirm a claim_id (jobs.id) belongs to $cid.
 * Returns the jobs row, or null.
 */
function tc_drylog_claim_for_company(PDO $db, int $cid, int $claim_id): ?array {
    $s = $db->prepare("SELECT * FROM jobs WHERE id = ? AND company_id = ?");
    $s->execute([$claim_id, $cid]);
    $row = $s->fetch();
    return $row ?: null;
}

/**
 * Confirm a claim_rooms.id belongs to $cid (via company_id column).
 * $include_deleted = false (default) requires deleted_at IS NULL.
 */
function tc_drylog_room_for_company(PDO $db, int $cid, int $room_id, bool $include_deleted = false): ?array {
    $sql = "SELECT * FROM claim_rooms WHERE id = ? AND company_id = ?";
    if (!$include_deleted) $sql .= " AND deleted_at IS NULL";
    $s = $db->prepare($sql);
    $s->execute([$room_id, $cid]);
    $row = $s->fetch();
    return $row ?: null;
}

/**
 * Confirm a drying_zones.id belongs to $cid.
 */
function tc_drylog_zone_for_company(PDO $db, int $cid, int $zone_id, bool $include_deleted = false): ?array {
    $sql = "SELECT * FROM drying_zones WHERE id = ? AND company_id = ?";
    if (!$include_deleted) $sql .= " AND deleted_at IS NULL";
    $s = $db->prepare($sql);
    $s->execute([$zone_id, $cid]);
    $row = $s->fetch();
    return $row ?: null;
}

/**
 * Confirm a claim_surfaces.id belongs to $cid.
 */
function tc_drylog_surface_for_company(PDO $db, int $cid, int $surface_id, bool $include_deleted = false): ?array {
    $sql = "SELECT * FROM claim_surfaces WHERE id = ? AND company_id = ?";
    if (!$include_deleted) $sql .= " AND deleted_at IS NULL";
    $s = $db->prepare($sql);
    $s->execute([$surface_id, $cid]);
    $row = $s->fetch();
    return $row ?: null;
}

/**
 * Confirm a reading_points.id belongs to $cid.
 */
function tc_drylog_point_for_company(PDO $db, int $cid, int $point_id, bool $include_deleted = false): ?array {
    $sql = "SELECT * FROM reading_points WHERE id = ? AND company_id = ?";
    if (!$include_deleted) $sql .= " AND deleted_at IS NULL";
    $s = $db->prepare($sql);
    $s->execute([$point_id, $cid]);
    $row = $s->fetch();
    return $row ?: null;
}

/**
 * Recompute claim_surfaces.is_dry + dry_confirmed_at for $surface_id based
 * on the freshest moisture reading at each of its reading points. A surface
 * is "dry" when every active reading point has its latest moisture reading
 * at or below the per-reading dry_goal_snapshot.
 *
 * Surfaces with no dry_goal stay is_dry=0 (we have no benchmark).
 *
 * Called from readings_moisture.php on POST/PUT/DELETE so the surface state
 * stays consistent with whatever readings exist after the change.
 */
function tc_drylog_recompute_surface_dryness(PDO $db, int $cid, int $surface_id): void {
    $sf = $db->prepare("SELECT id, is_dry, dry_goal FROM claim_surfaces WHERE id = ? AND company_id = ?");
    $sf->execute([$surface_id, $cid]);
    $surface = $sf->fetch();
    if (!$surface) return;
    if ($surface['dry_goal'] === null) return;

    $s = $db->prepare("
        SELECT rp.id AS point_id,
               (SELECT mr.moisture_value
                  FROM moisture_readings mr
                 WHERE mr.reading_point_id = rp.id
                 ORDER BY mr.reading_at DESC, mr.id DESC
                 LIMIT 1) AS latest_value,
               (SELECT mr.dry_goal_snapshot
                  FROM moisture_readings mr
                 WHERE mr.reading_point_id = rp.id
                 ORDER BY mr.reading_at DESC, mr.id DESC
                 LIMIT 1) AS latest_goal
          FROM reading_points rp
         WHERE rp.claim_surface_id = ? AND rp.deleted_at IS NULL
    ");
    $s->execute([$surface_id]);
    $points = $s->fetchAll();

    $all_dry = !empty($points);
    foreach ($points as $p) {
        if ($p['latest_value'] === null || $p['latest_goal'] === null
            || (float)$p['latest_value'] > (float)$p['latest_goal']) {
            $all_dry = false; break;
        }
    }

    if ($all_dry && !$surface['is_dry']) {
        $db->prepare("UPDATE claim_surfaces SET is_dry = 1, dry_confirmed_at = NOW()
                       WHERE id = ? AND company_id = ?")->execute([$surface_id, $cid]);
    } elseif (!$all_dry && $surface['is_dry']) {
        $db->prepare("UPDATE claim_surfaces SET is_dry = 0, dry_confirmed_at = NULL
                       WHERE id = ? AND company_id = ?")->execute([$surface_id, $cid]);
    }
}

/**
 * Apply $fields to a reading row in $table after the caller has already
 * scope-checked $cid + $row_id. Writes a reading_edits audit row capturing
 * the before + after snapshots and the actor. Returns the updated row.
 *
 * If $delete=true, performs a hard DELETE and the audit row records edit_type
 * 'delete' with before_json populated and after_json null. (Reading data is
 * preserved in the audit row so "delete" is recoverable from history.)
 *
 * $allowed_fields: whitelist of column names the caller permits to be
 * updated — anything else in $fields is ignored. Belt-and-suspenders against
 * the route forgetting to pick() the body.
 *
 * Routes wrap this call inside their own transaction if they also need to
 * re-derive psychrometrics / recompute parent surface.is_dry / etc.
 */
function tc_drylog_apply_edit(
    PDO $db, int $cid, int $user_id,
    string $table, int $row_id, array $fields, array $allowed_fields,
    bool $delete = false, ?string $notes = null
): ?array {
    static $whitelist = [
        'reference_readings', 'zone_atmosphere_readings',
        'hvac_atmosphere_readings', 'dehu_performance_readings',
        'moisture_readings',
    ];
    if (!in_array($table, $whitelist, true)) {
        throw new InvalidArgumentException("table not editable: $table");
    }

    // Snapshot before
    $b = $db->prepare("SELECT * FROM `$table` WHERE id = ? AND company_id = ?");
    $b->execute([$row_id, $cid]);
    $before = $b->fetch();
    if (!$before) return null;

    if ($delete) {
        $db->prepare("DELETE FROM `$table` WHERE id = ? AND company_id = ?")->execute([$row_id, $cid]);
        $audit = $db->prepare("
            INSERT INTO reading_edits
                (company_id, source_table, source_row_id, edited_by, edit_type, before_json, after_json, notes)
            VALUES (?, ?, ?, ?, 'delete', ?, NULL, ?)
        ");
        $audit->execute([$cid, $table, $row_id, $user_id, json_encode($before), $notes]);
        return null;
    }

    // Filter fields to whitelist + skip null/unchanged
    $apply = [];
    foreach ($fields as $k => $v) {
        if (!in_array($k, $allowed_fields, true)) continue;
        if (array_key_exists($k, $before) && (string)$before[$k] === (string)$v) continue;
        $apply[$k] = $v;
    }
    if (empty($apply)) {
        return $before;
    }

    $sets = implode(', ', array_map(fn($k) => "`$k` = ?", array_keys($apply)));
    $vals = array_values($apply);
    $vals[] = $row_id; $vals[] = $cid;
    $db->prepare("UPDATE `$table` SET $sets WHERE id = ? AND company_id = ?")->execute($vals);

    $a = $db->prepare("SELECT * FROM `$table` WHERE id = ? AND company_id = ?");
    $a->execute([$row_id, $cid]);
    $after = $a->fetch();

    $audit = $db->prepare("
        INSERT INTO reading_edits
            (company_id, source_table, source_row_id, edited_by, edit_type, before_json, after_json, notes)
        VALUES (?, ?, ?, ?, 'update', ?, ?, ?)
    ");
    $audit->execute([$cid, $table, $row_id, $user_id, json_encode($before), json_encode($after), $notes]);
    return $after;
}

/**
 * Returns the audit history for a given reading row, newest first.
 */
function tc_drylog_edit_history(PDO $db, int $cid, string $table, int $row_id): array {
    $s = $db->prepare("
        SELECT e.id, e.edited_at, e.edit_type, e.notes,
               e.before_json, e.after_json,
               COALESCE(u.display_name, u.username) AS edited_by_name
          FROM reading_edits e
          LEFT JOIN users u ON u.id = e.edited_by
         WHERE e.company_id = ? AND e.source_table = ? AND e.source_row_id = ?
         ORDER BY e.edited_at DESC, e.id DESC
    ");
    $s->execute([$cid, $table, $row_id]);
    return $s->fetchAll();
}

/**
 * Confirm a visits.id belongs to $cid AND to $claim_id (jobs.id).
 * Returns the visits row, or null. Catches cross-claim visit_id spoofing
 * on reading-capture POSTs.
 */
function tc_drylog_visit_for_claim(PDO $db, int $cid, int $visit_id, int $claim_id): ?array {
    $s = $db->prepare("SELECT * FROM visits WHERE id = ? AND company_id = ? AND job_id = ?");
    $s->execute([$visit_id, $cid, $claim_id]);
    $row = $s->fetch();
    return $row ?: null;
}

/**
 * Confirm an equipment_deploys.id belongs to $cid AND optionally to $zone_id.
 * Used by dehu_performance capture to validate the equipment_deploy_id ref.
 */
function tc_drylog_deploy_for_zone(PDO $db, int $cid, int $deploy_id, ?int $zone_id = null): ?array {
    $sql = "SELECT * FROM equipment_deploys WHERE id = ? AND company_id = ?";
    $params = [$deploy_id, $cid];
    if ($zone_id !== null) {
        $sql .= " AND drying_zone_id = ?";
        $params[] = $zone_id;
    }
    $s = $db->prepare($sql);
    $s->execute($params);
    $row = $s->fetch();
    return $row ?: null;
}

/**
 * Returns the array of claim_room_ids attached to a drying_zone via the
 * drying_zone_rooms junction. Always scoped to $cid for safety.
 */
function tc_drylog_zone_room_ids(PDO $db, int $cid, int $zone_id): array {
    $s = $db->prepare("
        SELECT claim_room_id
          FROM drying_zone_rooms
         WHERE drying_zone_id = ? AND company_id = ?
         ORDER BY id
    ");
    $s->execute([$zone_id, $cid]);
    return array_map('intval', $s->fetchAll(PDO::FETCH_COLUMN));
}

/**
 * Replace the drying_zone_rooms membership for a zone. All $room_ids must
 * belong to $cid AND the same claim as the zone. Returns the number of
 * junction rows after the replace.
 *
 * Caller must already have validated $zone_id via tc_drylog_zone_for_company().
 */
function tc_drylog_zone_set_rooms(PDO $db, int $cid, int $zone_id, int $zone_claim_id, array $room_ids): int {
    // Validate every room: belongs to this company AND to the same claim.
    if (!empty($room_ids)) {
        $placeholders = implode(',', array_fill(0, count($room_ids), '?'));
        $params = array_merge([$cid, $zone_claim_id], $room_ids);
        $s = $db->prepare("
            SELECT id
              FROM claim_rooms
             WHERE company_id = ? AND claim_id = ?
               AND deleted_at IS NULL
               AND id IN ($placeholders)
        ");
        $s->execute($params);
        $valid_ids = array_map('intval', $s->fetchAll(PDO::FETCH_COLUMN));
        $invalid = array_diff(array_map('intval', $room_ids), $valid_ids);
        if (!empty($invalid)) {
            throw new RuntimeException('claim_room_ids contains rooms not in this claim: ' . implode(',', $invalid));
        }
    }

    // Wipe and reinsert. Transaction-wrapped so a partial fail leaves no orphan rows.
    $in_tx = $db->inTransaction();
    if (!$in_tx) $db->beginTransaction();
    try {
        $db->prepare("DELETE FROM drying_zone_rooms WHERE drying_zone_id = ? AND company_id = ?")
           ->execute([$zone_id, $cid]);

        if (!empty($room_ids)) {
            $ins = $db->prepare("
                INSERT INTO drying_zone_rooms (company_id, drying_zone_id, claim_room_id)
                VALUES (?, ?, ?)
            ");
            foreach ($room_ids as $rid) {
                $ins->execute([$cid, $zone_id, (int)$rid]);
            }
        }

        if (!$in_tx) $db->commit();
    } catch (Throwable $e) {
        if (!$in_tx && $db->inTransaction()) $db->rollBack();
        throw $e;
    }

    return count($room_ids);
}

// ─── Per-material dry standards (property-wide dry goals) ────────────────────
// A dry goal is set ONCE per material class for the whole claim and propagated
// (write-through) into each surface's dry_goal, so every existing read site
// (dryness calc, reports, office, portal) keeps reading claim_surfaces.dry_goal
// unchanged. Surfaces never carry a hand-typed goal anymore.

/**
 * Collapse a surface material LABEL to its canonical dry-standard class.
 * Mirrors dlpMaterialClass() in frontend/field.html — keep the two in sync.
 * Order matters (e.g. "carpet pad" must beat "carpet").
 */
function tc_material_class(?string $label): string {
    $m = strtolower(trim((string)$label));
    if ($m === '') return 'other';
    if (strpos($m, 'drywall') !== false) return 'drywall';
    if (strpos($m, 'plaster') !== false) return 'plaster';
    if (strpos($m, 'carpet pad') !== false || $m === 'pad') return 'pad';
    if (strpos($m, 'carpet') !== false) return 'carpet';
    if (strpos($m, 'insulation') !== false || strpos($m, 'fiberglass') !== false
        || strpos($m, 'cellulose') !== false || strpos($m, 'spray foam') !== false
        || strpos($m, 'rockwool') !== false || strpos($m, 'rigid foam') !== false) return 'insulation';
    if (strpos($m, 'concrete') !== false || strpos($m, 'cmu') !== false
        || strpos($m, 'brick') !== false || strpos($m, 'masonry') !== false) return 'concrete';
    if (strpos($m, 'tile') !== false) return 'tile';
    if (strpos($m, 'lvp') !== false || strpos($m, 'vinyl') !== false || strpos($m, 'laminate') !== false) return 'resilient';
    if (strpos($m, 'wood') !== false || strpos($m, 'hardwood') !== false || strpos($m, 'framing') !== false
        || strpos($m, 'lumber') !== false || strpos($m, 'joist') !== false || strpos($m, 'subfloor') !== false
        || strpos($m, 'plywood') !== false || strpos($m, 'osb') !== false || strpos($m, 'beadboard') !== false
        || strpos($m, 'paneling') !== false || strpos($m, 'mdf') !== false
        || strpos($m, 'particleboard') !== false || strpos($m, 'tongue') !== false) return 'wood';
    return 'other';
}

/** Class of a surface's PRIMARY (first listed) material. */
function tc_surface_primary_class(?string $materialCsv): string {
    $parts = explode(',', (string)$materialCsv);
    return tc_material_class(trim($parts[0] ?? ''));
}

/** The claim_id (jobs.id) a surface belongs to, via its drying zone. 0 if miss. */
function tc_claim_id_for_surface(PDO $db, int $cid, int $surface_id): int {
    $s = $db->prepare("
        SELECT z.claim_id
          FROM claim_surfaces s
          JOIN drying_zones z ON z.id = s.drying_zone_id
         WHERE s.id = ? AND s.company_id = ?
    ");
    $s->execute([$surface_id, $cid]);
    return (int)($s->fetchColumn() ?: 0);
}

/**
 * Write the claim's dry standard for $surface's primary material onto the
 * surface (dry_goal / dry_goal_unit / meter_type). No material or no standard
 * set → clears the goal (NULL). Pre-patch safe: if claim_material_standards
 * doesn't exist yet, leaves the surface's goal untouched.
 */
function tc_apply_material_standard_to_surface(PDO $db, int $cid, int $surface_id, int $claim_id, ?string $materialCsv): void {
    $class = tc_surface_primary_class($materialCsv);
    $goal = null; $unit = '%MC'; $meter = null;
    try {
        $s = $db->prepare("SELECT dry_goal, dry_goal_unit, meter_type
                             FROM claim_material_standards
                            WHERE company_id = ? AND claim_id = ? AND material = ?");
        $s->execute([$cid, $claim_id, $class]);
        if ($row = $s->fetch()) {
            $goal = $row['dry_goal'];
            $unit = $row['dry_goal_unit'] ?: '%MC';
            $meter = $row['meter_type'];
        }
    } catch (Throwable $e) {
        return; // table not created yet → don't disturb the surface
    }
    $db->prepare("UPDATE claim_surfaces SET dry_goal = ?, dry_goal_unit = ?, meter_type = ?
                   WHERE id = ? AND company_id = ?")
       ->execute([$goal, $unit, $meter, $surface_id, $cid]);
}

/**
 * Push a just-saved standard out to every active surface on the claim whose
 * primary material maps to $material. Returns how many surfaces were updated.
 */
function tc_propagate_standard_to_surfaces(PDO $db, int $cid, int $claim_id, string $material, $goal, ?string $unit, ?string $meter): int {
    $s = $db->prepare("
        SELECT s.id, s.material
          FROM claim_surfaces s
          JOIN drying_zones z ON z.id = s.drying_zone_id
         WHERE s.company_id = ? AND z.claim_id = ? AND s.deleted_at IS NULL
    ");
    $s->execute([$cid, $claim_id]);
    $upd = $db->prepare("UPDATE claim_surfaces SET dry_goal = ?, dry_goal_unit = ?, meter_type = ?
                          WHERE id = ? AND company_id = ?");
    $n = 0;
    foreach ($s->fetchAll() as $row) {
        if (tc_surface_primary_class($row['material']) === $material) {
            $upd->execute([$goal, $unit ?: '%MC', $meter, $row['id'], $cid]);
            $n++;
        }
    }
    return $n;
}
