-- Chat entre espectadores de cada página (ligado por padrão) e controle do sininho de novidades do catálogo, por perfil.
ALTER TABLE tenant_settings
  ADD COLUMN chat_enabled TINYINT(1) NOT NULL DEFAULT 1 AFTER ui_sounds_enabled,
  ADD COLUMN chat_banned_words TEXT NULL AFTER chat_enabled;

ALTER TABLE viewer_profiles
  ADD COLUMN news_seen_at DATETIME(3) NULL,
  ADD COLUMN news_cleared_at DATETIME(3) NULL;

CREATE TABLE chat_messages (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  profile_id BIGINT UNSIGNED NOT NULL,
  author_name VARCHAR(40) NOT NULL,
  author_avatar VARCHAR(30) NOT NULL DEFAULT 'people-1',
  body VARCHAR(300) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_chat_tenant (tenant_id, id),
  KEY idx_chat_created (tenant_id, created_at),
  CONSTRAINT fk_chat_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
