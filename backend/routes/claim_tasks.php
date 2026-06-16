<?php
// claim_tasks.php — DryLog PRO per-claim task list management.
//
//   GET    /api/claim-tasks?claim_id=N                    list tasks for a claim with state
//   POST   /api/claim-tasks/seed                          body { claim_id, template }
//                                                         seed cat1/cat2/cat3 default config
//   POST   /api/claim-tasks/complete                      body { claim_id, code }
//                                                         response includes newly_available[]
//   POST   /api/claim-tasks/skip                          body { claim_id, code, reason }
//   POST   /api/claim-tasks/reopen                        body { claim_id, code }
//                                                         clear completed/skipped → recompute
//   POST   /api/claim-tasks/recompute                     body { claim_id }
//                                                         full re-eval (after config edits)
//   PUT    /api/claim-tasks/config                        body { claim_id, configs: [...] }
//                                                         bulk reorder / add / remove
//
// Spec: docs/F18-drylog-pro-spec.md §4, §7.3

require_once __DIR__ . '/../lib/drylog_pro_model.php';
require_once __DIR__ . '/../lib/tasks.php';

$db     = $GLOBALS['db'];
$method = $GLOBALS['method'];
$user   = require_auth($db);
$cid    = (int)$user['company_id'];

$_segs = explode('/', trim(parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH), '/'));
if (($_segs[0] ?? '') === 'api') array_shift($_segs);
$action = $_segs[1] ?? null;

// ── GET list ───────────────────────────────────────────────────────────────
if ($method === 'GET' && !$action) {
    $claim_id = (int)($_GET['claim_id'] ?? 0);
    if ($claim_id <= 0) json_error('claim_id required', 422);
    if (!tc_drylog_claim_for_company($db, $cid, $claim_id)) json_error('Claim not found', 404);
    json_list(tc_tasks_for_claim($db, $cid, $claim_id));
}

// ── GET /definitions — all task_definitions for the config editor ──────────
if ($method === 'GET' && $action === 'definitions') {
    $s = $db->prepare("
        SELECT id, code, name, description, category, default_templates, display_order
          FROM task_definitions
         WHERE is_active = 1
         ORDER BY display_order, code
    ");
    $s->execute();
    json_list($s->fetchAll());
}

// ── POST /seed ─────────────────────────────────────────────────────────────
if ($method === 'POST' && $action === 'seed') {
    $b = get_json_body();
    $claim_id = (int)($b['claim_id'] ?? 0);
    $template = trim((string)($b['template'] ?? ''));
    if ($claim_id <= 0) json_error('claim_id required', 422);
    if (!in_array($template, ['cat1','cat2','cat3'], true)) {
        json_error("template must be 'cat1', 'cat2', or 'cat3'", 422);
    }
    if (!tc_drylog_claim_for_company($db, $cid, $claim_id)) json_error('Claim not found', 404);
    try {
        $rows = tc_seed_claim_tasks($db, $cid, $claim_id, $template);
    } catch (Throwable $e) {
        json_error_with_log('claim_tasks.seed', 'Seed failed', $e, 500);
    }
    json_ok(['tasks' => $rows], 201);
}

// ── POST /complete ─────────────────────────────────────────────────────────
if ($method === 'POST' && $action === 'complete') {
    $b = get_json_body();
    $claim_id = (int)($b['claim_id'] ?? 0);
    $code     = trim((string)($b['code'] ?? ''));
    if ($claim_id <= 0) json_error('claim_id required', 422);
    if ($code === '')   json_error('code required', 422);
    if (!tc_drylog_claim_for_company($db, $cid, $claim_id)) json_error('Claim not found', 404);
    try {
        $newly = tc_task_mark_complete($db, $cid, $claim_id, $code, (int)$user['id']);
    } catch (RuntimeException $e) {
        json_error($e->getMessage(), 422);
    } catch (Throwable $e) {
        json_error_with_log('claim_tasks.complete', 'Complete failed', $e, 500);
    }
    json_ok([
        'newly_available' => $newly,
        'tasks' => tc_tasks_for_claim($db, $cid, $claim_id),
    ]);
}

// ── POST /skip ─────────────────────────────────────────────────────────────
if ($method === 'POST' && $action === 'skip') {
    $b = get_json_body();
    $claim_id = (int)($b['claim_id'] ?? 0);
    $code     = trim((string)($b['code'] ?? ''));
    $reason   = trim((string)($b['reason'] ?? ''));
    if ($claim_id <= 0) json_error('claim_id required', 422);
    if ($code === '')   json_error('code required', 422);
    if ($reason === '') json_error('reason required', 422);
    if (!tc_drylog_claim_for_company($db, $cid, $claim_id)) json_error('Claim not found', 404);
    try {
        $newly = tc_task_mark_skipped($db, $cid, $claim_id, $code, (int)$user['id'], $reason);
    } catch (RuntimeException $e) {
        json_error($e->getMessage(), 422);
    } catch (Throwable $e) {
        json_error_with_log('claim_tasks.skip', 'Skip failed', $e, 500);
    }
    json_ok([
        'newly_available' => $newly,
        'tasks' => tc_tasks_for_claim($db, $cid, $claim_id),
    ]);
}

// ── POST /reopen ───────────────────────────────────────────────────────────
// Sends a previously completed or skipped task back to its derived state
// (available / in_progress / locked depending on prereqs). Field techs use
// this when they tapped Done or Skip in error.
if ($method === 'POST' && $action === 'reopen') {
    $b = get_json_body();
    $claim_id = (int)($b['claim_id'] ?? 0);
    $code     = trim((string)($b['code'] ?? ''));
    if ($claim_id <= 0) json_error('claim_id required', 422);
    if ($code === '')   json_error('code required', 422);
    if (!tc_drylog_claim_for_company($db, $cid, $claim_id)) json_error('Claim not found', 404);
    try {
        $newly_locked = tc_task_reopen($db, $cid, $claim_id, $code, (int)$user['id']);
    } catch (RuntimeException $e) {
        json_error($e->getMessage(), 422);
    } catch (Throwable $e) {
        json_error_with_log('claim_tasks.reopen', 'Reopen failed', $e, 500);
    }
    json_ok([
        'newly_locked' => $newly_locked,
        'tasks' => tc_tasks_for_claim($db, $cid, $claim_id),
    ]);
}

// ── POST /recompute ────────────────────────────────────────────────────────
if ($method === 'POST' && $action === 'recompute') {
    $b = get_json_body();
    $claim_id = (int)($b['claim_id'] ?? 0);
    if ($claim_id <= 0) json_error('claim_id required', 422);
    if (!tc_drylog_claim_for_company($db, $cid, $claim_id)) json_error('Claim not found', 404);
    try {
        tc_task_recompute_all($db, $cid, $claim_id);
    } catch (Throwable $e) {
        json_error_with_log('claim_tasks.recompute', 'Recompute failed', $e, 500);
    }
    json_ok(['tasks' => tc_tasks_for_claim($db, $cid, $claim_id)]);
}

// ── PUT /config — bulk reorder / add / remove ─────────────────────────────
// Body: { claim_id, configs: [{ code, display_order, is_required }, ...] }
// Replaces the claim's claim_task_configs with the supplied list. Tasks not in
// the new list are removed (along with their state rows). Re-evaluation runs
// at the end so newly-eligible tasks land in the right state.
if ($method === 'PUT' && $action === 'config') {
    $b = get_json_body();
    $claim_id = (int)($b['claim_id'] ?? 0);
    $configs  = $b['configs'] ?? null;
    if ($claim_id <= 0) json_error('claim_id required', 422);
    if (!is_array($configs)) json_error('configs[] required', 422);
    if (!tc_drylog_claim_for_company($db, $cid, $claim_id)) json_error('Claim not found', 404);

    // Resolve codes → task_definition_ids.
    $codes = array_values(array_unique(array_filter(array_map(
        fn($c) => trim((string)($c['code'] ?? '')),
        $configs
    ))));
    if (empty($codes)) json_error('No valid codes in configs[]', 422);
    $ph = implode(',', array_fill(0, count($codes), '?'));
    $s = $db->prepare("SELECT id, code FROM task_definitions WHERE code IN ($ph)");
    $s->execute($codes);
    $code_to_id = [];
    foreach ($s->fetchAll() as $r) {
        $code_to_id[$r['code']] = (int)$r['id'];
    }
    foreach ($codes as $c) {
        if (!isset($code_to_id[$c])) {
            json_error("Unknown task code: $c", 422);
        }
    }

    $db->beginTransaction();
    try {
        // Snapshot existing per-task state by code so we can preserve it for
        // tasks that survive the config rebuild. A task that was 'complete'
        // shouldn't reset to 'locked' just because office tweaked the list.
        $prev = $db->prepare("
            SELECT td.code, st.state, st.started_at, st.completed_at,
                   st.completed_by_user_id, st.skip_reason
              FROM claim_task_states st
              JOIN task_definitions td ON td.id = st.task_definition_id
             WHERE st.claim_id = ? AND st.company_id = ?
        ");
        $prev->execute([$claim_id, $cid]);
        $prev_state_by_code = [];
        foreach ($prev->fetchAll() as $r) $prev_state_by_code[$r['code']] = $r;

        $db->prepare("DELETE FROM claim_task_configs WHERE claim_id = ? AND company_id = ?")
           ->execute([$claim_id, $cid]);
        $db->prepare("DELETE FROM claim_task_states  WHERE claim_id = ? AND company_id = ?")
           ->execute([$claim_id, $cid]);

        $ins_cfg = $db->prepare("
            INSERT INTO claim_task_configs
                (company_id, claim_id, task_definition_id, display_order, is_required)
            VALUES (?, ?, ?, ?, ?)
        ");
        $ins_state_locked = $db->prepare("
            INSERT INTO claim_task_states
                (company_id, claim_id, task_definition_id, state)
            VALUES (?, ?, ?, 'locked')
        ");
        $ins_state_preserved = $db->prepare("
            INSERT INTO claim_task_states
                (company_id, claim_id, task_definition_id, state,
                 started_at, completed_at, completed_by_user_id, skip_reason)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ");
        $order = 100;
        foreach ($configs as $c) {
            $code = trim((string)($c['code'] ?? ''));
            $disp = isset($c['display_order']) ? (int)$c['display_order'] : $order;
            $req  = array_key_exists('is_required', $c) ? ($c['is_required'] ? 1 : 0) : 1;
            $tid = $code_to_id[$code];
            $ins_cfg->execute([$cid, $claim_id, $tid, $disp, $req]);

            $prior = $prev_state_by_code[$code] ?? null;
            if ($prior && in_array($prior['state'], ['in_progress','complete','skipped'], true)) {
                $ins_state_preserved->execute([
                    $cid, $claim_id, $tid, $prior['state'],
                    $prior['started_at'], $prior['completed_at'],
                    $prior['completed_by_user_id'], $prior['skip_reason'],
                ]);
            } else {
                $ins_state_locked->execute([$cid, $claim_id, $tid]);
            }
            $order += 10;
        }

        tc_task_recompute_all($db, $cid, $claim_id);

        $db->commit();
    } catch (Throwable $e) {
        if ($db->inTransaction()) $db->rollBack();
        json_error_with_log('claim_tasks.config', 'Config update failed', $e, 500);
    }

    json_ok(['tasks' => tc_tasks_for_claim($db, $cid, $claim_id)]);
}

json_error('Not found', 404);
