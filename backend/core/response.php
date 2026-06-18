<?php

function json_send($payload, int $status = 200): void {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_SLASHES);
    exit;
}

function json_ok($data = null, int $status = 200): void {
    json_send(['ok' => true, 'data' => $data], $status);
}

function json_list(array $rows, int $status = 200): void {
    json_send(['ok' => true, 'data' => $rows], $status);
}

function json_error(string $message, int $status = 400, array $extra = []): void {
    json_send(array_merge(['ok' => false, 'error' => $message], $extra), $status);
}

function json_error_with_log(string $scope, string $message, Throwable $e, int $status = 500): void {
    error_log("[$scope] " . $e->getMessage() . "\n" . $e->getTraceAsString());
    json_error($message, $status);
}

function get_json_body(): array {
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') return [];
    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) json_error('Invalid JSON body', 400);
    return $decoded;
}

function pick(array $source, array $keys): array {
    $out = [];
    foreach ($keys as $key) {
        if (array_key_exists($key, $source)) $out[$key] = $source[$key];
    }
    return $out;
}
