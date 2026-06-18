<?php
// DryLog PRO task engine.
//
// The field app treats tasks as guidance, not a hard workflow prison. This
// engine keeps the configured task list ordered, derives locked/available
// states from prerequisites, and preserves completed/skipped decisions.

if (!function_exists('tc_tasks_for_claim')) {

function tc_tasks_for_claim(PDO $db, int $cid, int $claim_id): array {
    $s = $db->prepare("
        SELECT cfg.display_order, cfg.is_required,
               td.id AS task_definition_id, td.code, td.name, td.description,
               td.category,
               COALESCE(st.state, 'locked') AS state,
               st.started_at, st.completed_at, st.completed_by_user_id,
               st.skip_reason
          FROM claim_task_configs cfg
          JOIN task_definitions td ON td.id = cfg.task_definition_id
          LEFT JOIN claim_task_states st
                 ON st.claim_id = cfg.claim_id
                AND st.company_id = cfg.company_id
                AND st.task_definition_id = cfg.task_definition_id
         WHERE cfg.company_id = ? AND cfg.claim_id = ?
         ORDER BY cfg.display_order, td.display_order, td.code
    ");
    $s->execute([$cid, $claim_id]);
    $rows = $s->fetchAll(PDO::FETCH_ASSOC);
    if (!$rows) return [];

    $ids = array_map(fn($r) => (int)$r['task_definition_id'], $rows);
    $prereqs = tc_task_prereq_codes($db, $ids);
    foreach ($rows as &$r) {
        $r['prereqs'] = $prereqs[(int)$r['task_definition_id']] ?? [];
    }
    unset($r);
    return $rows;
}

function tc_seed_claim_tasks(PDO $db, int $cid, int $claim_id, string $template): array {
    if (!in_array($template, ['cat1', 'cat2', 'cat3'], true)) {
        throw new RuntimeException('Unknown task template');
    }

    $defs = $db->prepare("
        SELECT id, display_order
          FROM task_definitions
         WHERE is_active = 1
           AND FIND_IN_SET(?, REPLACE(COALESCE(default_templates, ''), ' ', '')) > 0
         ORDER BY display_order, code
    ");
    $defs->execute([$template]);
    $rows = $defs->fetchAll(PDO::FETCH_ASSOC);
    if (!$rows) throw new RuntimeException('No task definitions found for template');

    $db->beginTransaction();
    try {
        $cfg = $db->prepare("
            INSERT IGNORE INTO claim_task_configs
                (company_id, claim_id, task_definition_id, display_order, is_required)
            VALUES (?, ?, ?, ?, 1)
        ");
        $st = $db->prepare("
            INSERT IGNORE INTO claim_task_states
                (company_id, claim_id, task_definition_id, state)
            VALUES (?, ?, ?, 'locked')
        ");
        foreach ($rows as $r) {
            $tid = (int)$r['id'];
            $cfg->execute([$cid, $claim_id, $tid, (int)$r['display_order']]);
            $st->execute([$cid, $claim_id, $tid]);
        }
        tc_task_recompute_all($db, $cid, $claim_id);
        $db->commit();
    } catch (Throwable $e) {
        if ($db->inTransaction()) $db->rollBack();
        throw $e;
    }

    return tc_tasks_for_claim($db, $cid, $claim_id);
}

function tc_task_mark_complete(PDO $db, int $cid, int $claim_id, string $code, int $user_id): array {
    $task = tc_task_configured_definition($db, $cid, $claim_id, $code);
    if (!$task) throw new RuntimeException('Task is not configured for this claim');

    $state = tc_task_state($db, $cid, $claim_id, (int)$task['id']);
    if ($state === 'locked') throw new RuntimeException('Task is locked by prerequisites');

    $db->prepare("
        INSERT INTO claim_task_states
            (company_id, claim_id, task_definition_id, state, completed_at, completed_by_user_id, skip_reason)
        VALUES (?, ?, ?, 'complete', NOW(), ?, NULL)
        ON DUPLICATE KEY UPDATE
            state = 'complete',
            completed_at = NOW(),
            completed_by_user_id = VALUES(completed_by_user_id),
            skip_reason = NULL
    ")->execute([$cid, $claim_id, (int)$task['id'], $user_id]);

    return tc_task_recompute_all($db, $cid, $claim_id);
}

function tc_task_mark_skipped(PDO $db, int $cid, int $claim_id, string $code, int $user_id, string $reason): array {
    $task = tc_task_configured_definition($db, $cid, $claim_id, $code);
    if (!$task) throw new RuntimeException('Task is not configured for this claim');

    $state = tc_task_state($db, $cid, $claim_id, (int)$task['id']);
    if ($state === 'locked') throw new RuntimeException('Task is locked by prerequisites');

    $db->prepare("
        INSERT INTO claim_task_states
            (company_id, claim_id, task_definition_id, state, completed_at, completed_by_user_id, skip_reason)
        VALUES (?, ?, ?, 'skipped', NOW(), ?, ?)
        ON DUPLICATE KEY UPDATE
            state = 'skipped',
            completed_at = NOW(),
            completed_by_user_id = VALUES(completed_by_user_id),
            skip_reason = VALUES(skip_reason)
    ")->execute([$cid, $claim_id, (int)$task['id'], $user_id, $reason]);

    return tc_task_recompute_all($db, $cid, $claim_id);
}

function tc_task_reopen(PDO $db, int $cid, int $claim_id, string $code, int $user_id): array {
    $task = tc_task_configured_definition($db, $cid, $claim_id, $code);
    if (!$task) throw new RuntimeException('Task is not configured for this claim');

    $db->prepare("
        UPDATE claim_task_states
           SET state = 'locked',
               completed_at = NULL,
               completed_by_user_id = NULL,
               skip_reason = NULL
         WHERE company_id = ? AND claim_id = ? AND task_definition_id = ?
    ")->execute([$cid, $claim_id, (int)$task['id']]);

    return tc_task_recompute_all($db, $cid, $claim_id);
}

function tc_task_recompute_all(PDO $db, int $cid, int $claim_id): array {
    $rows = tc_tasks_for_claim($db, $cid, $claim_id);
    if (!$rows) return [];

    $byCode = [];
    foreach ($rows as $r) $byCode[$r['code']] = $r;

    $newlyAvailable = [];
    foreach ($rows as $r) {
        if (in_array($r['state'], ['complete', 'skipped'], true)) continue;

        $ready = true;
        foreach (($r['prereqs'] ?? []) as $preCode) {
            $preState = $byCode[$preCode]['state'] ?? null;
            if (!in_array($preState, ['complete', 'skipped'], true)) {
                $ready = false;
                break;
            }
        }
        $nextState = $ready ? 'available' : 'locked';
        if ($r['state'] !== $nextState) {
            $db->prepare("
                INSERT INTO claim_task_states
                    (company_id, claim_id, task_definition_id, state)
                VALUES (?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE state = VALUES(state)
            ")->execute([$cid, $claim_id, (int)$r['task_definition_id'], $nextState]);
            if ($nextState === 'available') $newlyAvailable[] = $r['code'];
        }
    }

    return $newlyAvailable;
}

function tc_task_configured_definition(PDO $db, int $cid, int $claim_id, string $code): ?array {
    $s = $db->prepare("
        SELECT td.*
          FROM task_definitions td
          JOIN claim_task_configs cfg ON cfg.task_definition_id = td.id
         WHERE cfg.company_id = ? AND cfg.claim_id = ? AND td.code = ?
         LIMIT 1
    ");
    $s->execute([$cid, $claim_id, $code]);
    $row = $s->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}

function tc_task_state(PDO $db, int $cid, int $claim_id, int $task_definition_id): string {
    $s = $db->prepare("
        SELECT state
          FROM claim_task_states
         WHERE company_id = ? AND claim_id = ? AND task_definition_id = ?
         LIMIT 1
    ");
    $s->execute([$cid, $claim_id, $task_definition_id]);
    return (string)($s->fetchColumn() ?: 'locked');
}

function tc_task_prereq_codes(PDO $db, array $taskDefinitionIds): array {
    if (!$taskDefinitionIds) return [];
    $ph = implode(',', array_fill(0, count($taskDefinitionIds), '?'));
    $s = $db->prepare("
        SELECT d.task_definition_id, p.code AS prereq_code
          FROM task_dependencies d
          JOIN task_definitions p ON p.id = d.prereq_definition_id
         WHERE d.task_definition_id IN ($ph)
         ORDER BY p.display_order, p.code
    ");
    $s->execute(array_values($taskDefinitionIds));
    $out = [];
    foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $tid = (int)$r['task_definition_id'];
        $out[$tid] = $out[$tid] ?? [];
        $out[$tid][] = $r['prereq_code'];
    }
    return $out;
}

}
