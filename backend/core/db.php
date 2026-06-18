<?php

function drylog_env(string $key, ?string $default = null): ?string {
    $value = getenv($key);
    return $value === false ? $default : $value;
}

function get_db(): PDO {
    static $db = null;
    if ($db instanceof PDO) return $db;

    $dsn = drylog_env('DRYLOG_DB_DSN');
    if (!$dsn) {
        $host = drylog_env('DRYLOG_DB_HOST', '127.0.0.1');
        $port = drylog_env('DRYLOG_DB_PORT', '3306');
        $name = drylog_env('DRYLOG_DB_NAME', 'drylogpro');
        $charset = drylog_env('DRYLOG_DB_CHARSET', 'utf8mb4');
        $dsn = "mysql:host=$host;port=$port;dbname=$name;charset=$charset";
    }

    $user = drylog_env('DRYLOG_DB_USER', 'root');
    $pass = drylog_env('DRYLOG_DB_PASS', '');

    $db = new PDO($dsn, $user, $pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    return $db;
}
