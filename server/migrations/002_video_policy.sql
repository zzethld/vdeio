-- 视频访问策略字段
ALTER TABLE videos
  ADD COLUMN access_mode ENUM('open', 'campaign', 'code') NOT NULL DEFAULT 'campaign' COMMENT '访问模式：open 公开, campaign 活动投放, code 授权码',
  ADD COLUMN offline_allowed TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否允许离线播放',
  ADD COLUMN key_ttl_hours INT NOT NULL DEFAULT 168 COMMENT '密钥缓存有效期（小时）';

-- 视频授权码表（用于 code 访问模式）
CREATE TABLE IF NOT EXISTS video_access_codes (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(32) NOT NULL UNIQUE,        -- 授权码
  video_id BIGINT NOT NULL,                -- 关联视频
  store_id BIGINT,                         -- 可选门店范围
  max_uses INT,                            -- 最大使用次数，NULL 表示无限制
  use_count INT NOT NULL DEFAULT 0,        -- 已使用次数
  expires_at TIMESTAMP NULL,               -- 过期时间
  status ENUM('active', 'disabled') NOT NULL DEFAULT 'active',
  created_by BIGINT,                       -- 创建人
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_video_id (video_id),
  INDEX idx_store_id (store_id)
);
