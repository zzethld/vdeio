-- 用户表
CREATE TABLE IF NOT EXISTS users (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  dingtalk_id VARCHAR(64) UNIQUE,       -- 钉钉用户 ID
  name VARCHAR(64),
  phone VARCHAR(20),
  avatar VARCHAR(256),
  role ENUM('admin', 'operator') DEFAULT 'operator',
  status TINYINT DEFAULT 1,             -- 1 启用 0 禁用
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 门店表
CREATE TABLE IF NOT EXISTS stores (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(128),
  code VARCHAR(32) UNIQUE,              -- 门店编码
  region VARCHAR(64),                    -- 区域
  address VARCHAR(256),
  status TINYINT DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 用户-门店绑定
CREATE TABLE IF NOT EXISTS user_store_bindings (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT REFERENCES users(id),
  store_id BIGINT REFERENCES stores(id),
  UNIQUE KEY (user_id, store_id)
);

-- 设备表
CREATE TABLE IF NOT EXISTS devices (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  device_id VARCHAR(64) UNIQUE,          -- 设备唯一 ID
  store_id BIGINT REFERENCES stores(id),
  device_name VARCHAR(128),
  os_version VARCHAR(64),
  app_version VARCHAR(32),
  last_online_at TIMESTAMP,
  status ENUM('online', 'offline') DEFAULT 'offline',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 视频表
CREATE TABLE IF NOT EXISTS videos (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  title VARCHAR(256),
  description TEXT,
  category_id BIGINT,
  duration INT,                          -- 秒
  file_size BIGINT,                      -- 字节
  resolution VARCHAR(16),
  original_url VARCHAR(512),             -- MinIO 原始文件 URL
  hls_url VARCHAR(512),                  -- MinIO 加密 HLS URL
  cover_url VARCHAR(512),                -- 封面图
  encrypt_status ENUM('pending', 'encrypting', 'done', 'failed') DEFAULT 'pending',
  created_by BIGINT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL
);

-- 视频密钥表
CREATE TABLE IF NOT EXISTS video_keys (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  video_id BIGINT UNIQUE REFERENCES videos(id),
  key_id VARCHAR(64),                    -- 密钥 ID
  encrypted_key VARCHAR(256),            -- AES-256 加密后的密钥
  iv VARCHAR(64),                        -- 初始化向量
  status ENUM('active', 'expired', 'rotated') DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 营销活动表（核心业务实体）
CREATE TABLE IF NOT EXISTS campaigns (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  title VARCHAR(256),                    -- 活动名称，如"2026暑期促销"
  description TEXT,                      -- 活动说明
  status ENUM('draft', 'active', 'ended', 'archived') DEFAULT 'draft',
  start_time TIMESTAMP NOT NULL,         -- 活动开始时间
  end_time TIMESTAMP NOT NULL,           -- 活动结束时间
  created_by BIGINT,                     -- 创建人
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_status_time (status, start_time, end_time)
);

-- 活动-视频关联表（一个活动包含多个视频）
CREATE TABLE IF NOT EXISTS campaign_videos (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  campaign_id BIGINT REFERENCES campaigns(id),
  video_id BIGINT REFERENCES videos(id),
  sort_order INT DEFAULT 0,              -- 活动内视频排序
  UNIQUE KEY (campaign_id, video_id)
);

-- 活动-门店关联表（一个活动推送给多个门店）
CREATE TABLE IF NOT EXISTS campaign_stores (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  campaign_id BIGINT REFERENCES campaigns(id),
  store_id BIGINT REFERENCES stores(id),
  UNIQUE KEY (campaign_id, store_id)
);

-- 分类表
CREATE TABLE IF NOT EXISTS categories (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(64),
  parent_id BIGINT REFERENCES categories(id),
  sort_order INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 播放日志表
CREATE TABLE IF NOT EXISTS play_logs (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT,
  video_id BIGINT,
  campaign_id BIGINT,                    -- 记录从哪个活动播放
  device_id BIGINT,
  store_id BIGINT,
  event ENUM('start', 'pause', 'resume', 'end', 'seek'),
  position INT,                          -- 播放位置（秒）
  duration INT,                          -- 视频总长
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_video_time (video_id, created_at),
  INDEX idx_store_time (store_id, created_at),
  INDEX idx_campaign_time (campaign_id, created_at)
);

-- 管理员表
CREATE TABLE IF NOT EXISTS admins (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  username VARCHAR(64) UNIQUE,
  password_hash VARCHAR(256),            -- bcrypt
  name VARCHAR(64),
  role ENUM('super_admin', 'admin') DEFAULT 'admin',
  login_fail_count INT DEFAULT 0,
  locked_until TIMESTAMP NULL,
  status TINYINT DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 设备遥测表
CREATE TABLE IF NOT EXISTS device_telemetries (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  device_id VARCHAR(128) NOT NULL,
  cpu FLOAT,
  memory FLOAT,
  disk FLOAT,
  disk_free BIGINT,
  cache_size BIGINT,
  app_version VARCHAR(32),
  uptime BIGINT,
  network VARCHAR(32),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_device_id (device_id),
  INDEX idx_created_at (created_at)
);
