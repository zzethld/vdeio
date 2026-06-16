-- vdeio 数据库初始化脚本
-- Docker MySQL 容器首次启动时自动执行

CREATE DATABASE IF NOT EXISTS vdeio CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- MQTT 用户认证表（供 EMQX MySQL 认证后端使用）
CREATE TABLE IF NOT EXISTS vdeio.mqtt_user (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(128) NOT NULL UNIQUE,
    password_hash VARCHAR(256) NOT NULL,
    salt VARCHAR(128) DEFAULT '',
    is_superuser TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
