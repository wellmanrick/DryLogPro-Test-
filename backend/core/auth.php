<?php

function require_auth(PDO $db): array {
    $userId = null;
    if (!empty($_SESSION['user_id'])) {
        $userId = (int)$_SESSION['user_id'];
    } elseif (!empty($_SERVER['HTTP_X_DRYLOG_USER_ID'])) {
        $userId = (int)$_SERVER['HTTP_X_DRYLOG_USER_ID'];
    } elseif (getenv('DRYLOG_DEV_USER_ID')) {
        $userId = (int)getenv('DRYLOG_DEV_USER_ID');
    }

    if (!$userId) json_error('Authentication required', 401);

    $s = $db->prepare("
        SELECT id, company_id, username, display_name, role
          FROM users
         WHERE id = ?
         LIMIT 1
    ");
    $s->execute([$userId]);
    $user = $s->fetch();
    if (!$user) json_error('Authentication required', 401);
    return $user;
}

function require_role(array $user, string ...$roles): void {
    $role = (string)($user['role'] ?? '');
    if (!in_array($role, $roles, true)) json_error('Forbidden', 403);
}
