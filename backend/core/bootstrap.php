<?php

declare(strict_types=1);

ini_set('display_errors', getenv('DRYLOG_DEBUG') ? '1' : '0');
error_reporting(E_ALL);

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

require_once __DIR__ . '/response.php';
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/auth.php';

function drylog_cors(): void {
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    $allowed = getenv('DRYLOG_CORS_ORIGIN') ?: '';
    if ($allowed && $origin && ($allowed === '*' || $allowed === $origin)) {
        header('Access-Control-Allow-Origin: ' . ($allowed === '*' ? '*' : $origin));
        header('Vary: Origin');
        header('Access-Control-Allow-Credentials: true');
        header('Access-Control-Allow-Headers: Content-Type, X-DryLog-User-Id');
        header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
    }
    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
}

drylog_cors();
