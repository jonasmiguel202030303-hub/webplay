-- WebPlay Brasil — migração 001: esquema inicial
-- Todas as datas em UTC (a conexão define time_zone = '+00:00').

CREATE TABLE users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL,
  email_normalized VARCHAR(190) NOT NULL,
  password_hash VARCHAR(100) NOT NULL,
  role ENUM('master','admin','tenant_owner') NOT NULL,
  status ENUM('pending_activation','active','suspended') NOT NULL DEFAULT 'pending_activation',
  email_verified_at DATETIME(3) NULL,
  token_version INT UNSIGNED NOT NULL DEFAULT 0,
  failed_logins INT UNSIGNED NOT NULL DEFAULT 0,
  locked_until DATETIME(3) NULL,
  last_login_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email_normalized),
  KEY idx_users_role (role, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE tenants (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  owner_user_id BIGINT UNSIGNED NOT NULL,
  slug VARCHAR(40) NOT NULL,
  custom_domain VARCHAR(190) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tenants_slug (slug),
  UNIQUE KEY uq_tenants_owner (owner_user_id),
  UNIQUE KEY uq_tenants_domain (custom_domain),
  CONSTRAINT fk_tenants_owner FOREIGN KEY (owner_user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE tenant_branding (
  tenant_id BIGINT UNSIGNED NOT NULL,
  display_name VARCHAR(80) NOT NULL,
  short_name VARCHAR(20) NOT NULL,
  color_primary CHAR(7) NOT NULL DEFAULT '#7c3aed',
  color_secondary CHAR(7) NOT NULL DEFAULT '#2563eb',
  color_button CHAR(7) NOT NULL DEFAULT '#7c3aed',
  color_background CHAR(7) NOT NULL DEFAULT '#050505',
  logo_path VARCHAR(255) NULL,
  favicon_path VARCHAR(255) NULL,
  background_path VARCHAR(255) NULL,
  banner_path VARCHAR(255) NULL,
  login_image_path VARCHAR(255) NULL,
  menu_logo_path VARCHAR(255) NULL,
  content_logo_path VARCHAR(255) NULL,
  banner_title VARCHAR(120) NULL,
  banner_subtitle VARCHAR(240) NULL,
  welcome_text VARCHAR(500) NULL,
  support_text VARCHAR(500) NULL,
  whatsapp VARCHAR(20) NULL,
  external_links JSON NULL,
  notice VARCHAR(500) NULL,
  footer_text VARCHAR(300) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (tenant_id),
  CONSTRAINT fk_branding_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE tenant_settings (
  tenant_id BIGINT UNSIGNED NOT NULL,
  allow_viewer_signup TINYINT(1) NOT NULL DEFAULT 1,
  kids_profiles_enabled TINYINT(1) NOT NULL DEFAULT 1,
  max_viewers INT UNSIGNED NOT NULL DEFAULT 200,
  max_profiles_per_viewer TINYINT UNSIGNED NOT NULL DEFAULT 5,
  max_sessions_per_viewer TINYINT UNSIGNED NOT NULL DEFAULT 3,
  catalog_cache_ttl_seconds INT UNSIGNED NOT NULL DEFAULT 600,
  ui_sounds_enabled TINYINT(1) NOT NULL DEFAULT 0,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (tenant_id),
  CONSTRAINT fk_settings_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE subscriptions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  status ENUM('trial','active','pending_payment','expired','canceled','suspended') NOT NULL DEFAULT 'trial',
  trial_started_at DATETIME(3) NULL,
  trial_ends_at DATETIME(3) NULL,
  current_period_start DATETIME(3) NULL,
  current_period_end DATETIME(3) NULL,
  price_cents INT UNSIGNED NULL,
  suspended_reason VARCHAR(500) NULL,
  canceled_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_subscriptions_tenant (tenant_id),
  KEY idx_subscriptions_status (status),
  KEY idx_subscriptions_period_end (current_period_end),
  KEY idx_subscriptions_trial_end (trial_ends_at),
  CONSTRAINT fk_subscriptions_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE trial_usage (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  email_normalized VARCHAR(190) NOT NULL,
  ip_hash CHAR(64) NULL,
  started_at DATETIME(3) NOT NULL,
  ends_at DATETIME(3) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_trial_email (email_normalized),
  UNIQUE KEY uq_trial_tenant (tenant_id),
  KEY idx_trial_ip (ip_hash, started_at),
  CONSTRAINT fk_trial_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id),
  CONSTRAINT fk_trial_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE platform_settings (
  setting_key VARCHAR(80) NOT NULL,
  setting_value TEXT NOT NULL,
  updated_by BIGINT UNSIGNED NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (setting_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE payment_settings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  mode ENUM('test','production') NOT NULL,
  access_token_enc TEXT NULL,
  public_key VARCHAR(255) NULL,
  webhook_secret_enc TEXT NULL,
  last_check_at DATETIME(3) NULL,
  last_check_ok TINYINT(1) NULL,
  last_check_message VARCHAR(300) NULL,
  updated_by BIGINT UNSIGNED NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_payment_settings_mode (mode)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE payments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  subscription_id BIGINT UNSIGNED NOT NULL,
  provider VARCHAR(30) NOT NULL DEFAULT 'mercadopago',
  mode ENUM('test','production') NOT NULL,
  external_reference CHAR(36) NOT NULL,
  mp_payment_id VARCHAR(40) NULL,
  mp_preference_id VARCHAR(80) NULL,
  method ENUM('checkout','pix') NOT NULL,
  amount_cents INT UNSIGNED NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'BRL',
  period_months TINYINT UNSIGNED NOT NULL DEFAULT 12,
  status ENUM('pending','in_process','approved','rejected','cancelled','refunded','charged_back','expired') NOT NULL DEFAULT 'pending',
  status_detail VARCHAR(120) NULL,
  checkout_url TEXT NULL,
  pix_qr_code TEXT NULL,
  pix_qr_base64 MEDIUMTEXT NULL,
  pix_expires_at DATETIME(3) NULL,
  paid_at DATETIME(3) NULL,
  applied_at DATETIME(3) NULL,
  period_from DATETIME(3) NULL,
  period_to DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_payments_reference (external_reference),
  UNIQUE KEY uq_payments_mp (mode, mp_payment_id),
  KEY idx_payments_tenant (tenant_id, created_at),
  KEY idx_payments_status (status, created_at),
  CONSTRAINT fk_payments_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id),
  CONSTRAINT fk_payments_subscription FOREIGN KEY (subscription_id) REFERENCES subscriptions (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE payment_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  payment_id BIGINT UNSIGNED NOT NULL,
  event VARCHAR(60) NOT NULL,
  details JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_payment_events_payment (payment_id, created_at),
  CONSTRAINT fk_payment_events_payment FOREIGN KEY (payment_id) REFERENCES payments (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE payment_webhook_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  provider VARCHAR(30) NOT NULL DEFAULT 'mercadopago',
  mode ENUM('test','production') NOT NULL,
  event_key VARCHAR(190) NOT NULL,
  topic VARCHAR(60) NULL,
  resource_id VARCHAR(60) NULL,
  request_id VARCHAR(80) NULL,
  signature_valid TINYINT(1) NOT NULL DEFAULT 0,
  payload JSON NULL,
  status ENUM('received','processed','ignored','failed','invalid_signature') NOT NULL DEFAULT 'received',
  error_message VARCHAR(500) NULL,
  attempts INT UNSIGNED NOT NULL DEFAULT 1,
  received_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  processed_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_webhook_event_key (provider, mode, event_key),
  KEY idx_webhook_status (status, received_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE source_servers (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(80) NOT NULL,
  adapter VARCHAR(30) NOT NULL DEFAULT 'xtream',
  base_url VARCHAR(500) NOT NULL,
  username_enc TEXT NOT NULL,
  password_enc TEXT NOT NULL,
  status ENUM('unknown','online','offline','auth_failed','error') NOT NULL DEFAULT 'unknown',
  status_message VARCHAR(300) NULL,
  account_info JSON NULL,
  last_checked_at DATETIME(3) NULL,
  last_refresh_at DATETIME(3) NULL,
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  KEY idx_sources_tenant (tenant_id, deleted_at),
  CONSTRAINT fk_sources_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE source_categories_cache (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  server_id BIGINT UNSIGNED NOT NULL,
  content_type ENUM('live','vod','series') NOT NULL,
  category_id VARCHAR(40) NOT NULL,
  name VARCHAR(200) NOT NULL,
  parent_id VARCHAR(40) NULL,
  position INT UNSIGNED NOT NULL DEFAULT 0,
  fetched_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_categories (server_id, content_type, category_id),
  KEY idx_categories_tenant (tenant_id, server_id, content_type),
  CONSTRAINT fk_categories_server FOREIGN KEY (server_id) REFERENCES source_servers (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE viewer_accounts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL,
  email_normalized VARCHAR(190) NOT NULL,
  password_hash VARCHAR(100) NOT NULL,
  status ENUM('active','suspended') NOT NULL DEFAULT 'active',
  token_version INT UNSIGNED NOT NULL DEFAULT 0,
  failed_logins INT UNSIGNED NOT NULL DEFAULT 0,
  locked_until DATETIME(3) NULL,
  last_login_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_viewer_email (tenant_id, email_normalized),
  KEY idx_viewer_tenant (tenant_id, deleted_at, created_at),
  CONSTRAINT fk_viewer_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE viewer_profiles (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  viewer_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(40) NOT NULL,
  avatar VARCHAR(30) NOT NULL DEFAULT 'violet',
  is_kids TINYINT(1) NOT NULL DEFAULT 0,
  preferences JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  KEY idx_profiles_viewer (tenant_id, viewer_id, deleted_at),
  CONSTRAINT fk_profiles_viewer FOREIGN KEY (viewer_id) REFERENCES viewer_accounts (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE viewer_sessions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  viewer_id BIGINT UNSIGNED NOT NULL,
  jti CHAR(36) NOT NULL,
  user_agent VARCHAR(255) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_seen_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  expires_at DATETIME(3) NOT NULL,
  revoked_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_viewer_sessions_jti (jti),
  KEY idx_viewer_sessions_viewer (viewer_id, revoked_at, expires_at),
  CONSTRAINT fk_viewer_sessions_viewer FOREIGN KEY (viewer_id) REFERENCES viewer_accounts (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE viewer_favorites (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  profile_id BIGINT UNSIGNED NOT NULL,
  server_id BIGINT UNSIGNED NOT NULL,
  content_type ENUM('live','vod') NOT NULL,
  stream_id VARCHAR(40) NOT NULL,
  name VARCHAR(250) NOT NULL,
  icon VARCHAR(500) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_favorites (profile_id, server_id, content_type, stream_id),
  KEY idx_favorites_tenant (tenant_id, profile_id, created_at),
  CONSTRAINT fk_favorites_profile FOREIGN KEY (profile_id) REFERENCES viewer_profiles (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE viewer_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  profile_id BIGINT UNSIGNED NOT NULL,
  server_id BIGINT UNSIGNED NOT NULL,
  content_type ENUM('live','vod') NOT NULL,
  stream_id VARCHAR(40) NOT NULL,
  name VARCHAR(250) NOT NULL,
  icon VARCHAR(500) NULL,
  watch_count INT UNSIGNED NOT NULL DEFAULT 1,
  watched_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_history (profile_id, server_id, content_type, stream_id),
  KEY idx_history_profile (tenant_id, profile_id, watched_at),
  CONSTRAINT fk_history_profile FOREIGN KEY (profile_id) REFERENCES viewer_profiles (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE viewer_progress (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  profile_id BIGINT UNSIGNED NOT NULL,
  server_id BIGINT UNSIGNED NOT NULL,
  content_type ENUM('vod') NOT NULL DEFAULT 'vod',
  stream_id VARCHAR(40) NOT NULL,
  name VARCHAR(250) NOT NULL,
  icon VARCHAR(500) NULL,
  position_seconds INT UNSIGNED NOT NULL DEFAULT 0,
  duration_seconds INT UNSIGNED NOT NULL DEFAULT 0,
  completed TINYINT(1) NOT NULL DEFAULT 0,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_progress (profile_id, server_id, content_type, stream_id),
  KEY idx_progress_profile (tenant_id, profile_id, updated_at),
  CONSTRAINT fk_progress_profile FOREIGN KEY (profile_id) REFERENCES viewer_profiles (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE terms_versions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  doc_type ENUM('terms','privacy','legal') NOT NULL,
  version VARCHAR(20) NOT NULL,
  title VARCHAR(160) NOT NULL,
  content MEDIUMTEXT NOT NULL,
  is_current TINYINT(1) NOT NULL DEFAULT 0,
  published_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_terms_version (doc_type, version),
  KEY idx_terms_current (doc_type, is_current)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE terms_acceptances (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  terms_version_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NULL,
  viewer_id BIGINT UNSIGNED NULL,
  accepted_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  ip_hash CHAR(64) NULL,
  user_agent VARCHAR(255) NULL,
  PRIMARY KEY (id),
  KEY idx_acceptances_user (user_id),
  KEY idx_acceptances_viewer (viewer_id),
  CONSTRAINT fk_acceptances_version FOREIGN KEY (terms_version_id) REFERENCES terms_versions (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE notifications (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  tenant_id BIGINT UNSIGNED NULL,
  kind VARCHAR(40) NOT NULL,
  dedupe_key VARCHAR(120) NOT NULL,
  title VARCHAR(160) NOT NULL,
  body VARCHAR(500) NOT NULL,
  read_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_notifications_dedupe (user_id, dedupe_key),
  KEY idx_notifications_user (user_id, read_at, created_at),
  CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE audit_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  actor_user_id BIGINT UNSIGNED NULL,
  actor_role VARCHAR(20) NULL,
  tenant_id BIGINT UNSIGNED NULL,
  action VARCHAR(80) NOT NULL,
  entity_type VARCHAR(40) NULL,
  entity_id VARCHAR(64) NULL,
  result ENUM('success','failure','denied') NOT NULL DEFAULT 'success',
  reason VARCHAR(1000) NULL,
  metadata JSON NULL,
  ip VARCHAR(64) NULL,
  user_agent VARCHAR(255) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_audit_created (created_at),
  KEY idx_audit_tenant (tenant_id, created_at),
  KEY idx_audit_actor (actor_user_id, created_at),
  KEY idx_audit_action (action, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE password_reset_tokens (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  purpose ENUM('reset','activation') NOT NULL DEFAULT 'reset',
  user_id BIGINT UNSIGNED NULL,
  viewer_id BIGINT UNSIGNED NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  used_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_reset_token (token_hash),
  KEY idx_reset_user (user_id, purpose),
  KEY idx_reset_viewer (viewer_id, purpose),
  KEY idx_reset_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE email_outbox (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  to_email VARCHAR(190) NOT NULL,
  subject VARCHAR(200) NOT NULL,
  body_text TEXT NOT NULL,
  status ENUM('logged','sent','failed') NOT NULL,
  error VARCHAR(300) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_outbox_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE support_requests (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  subject VARCHAR(160) NOT NULL,
  message TEXT NOT NULL,
  status ENUM('open','answered','closed') NOT NULL DEFAULT 'open',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_support_tenant (tenant_id, created_at),
  KEY idx_support_status (status, created_at),
  CONSTRAINT fk_support_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE privacy_requests (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  subject_type ENUM('user','viewer') NOT NULL,
  subject_id BIGINT UNSIGNED NOT NULL,
  tenant_id BIGINT UNSIGNED NULL,
  request_type ENUM('access','correction','deletion','portability') NOT NULL,
  status ENUM('open','in_progress','done','rejected') NOT NULL DEFAULT 'open',
  notes VARCHAR(1000) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_privacy_status (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
