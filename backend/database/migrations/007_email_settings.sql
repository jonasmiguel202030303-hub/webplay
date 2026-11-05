CREATE TABLE email_settings (
  id TINYINT UNSIGNED NOT NULL DEFAULT 1,
  smtp_host VARCHAR(255) NULL,
  smtp_port SMALLINT UNSIGNED NULL,
  smtp_secure TINYINT(1) NOT NULL DEFAULT 0,
  smtp_user VARCHAR(255) NULL,
  smtp_pass_enc TEXT NULL,
  from_name VARCHAR(120) NULL,
  from_email VARCHAR(190) NULL,
  last_check_at DATETIME(3) NULL,
  last_check_ok TINYINT(1) NULL,
  last_check_message VARCHAR(300) NULL,
  updated_by BIGINT UNSIGNED NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
