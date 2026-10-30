-- Servidores guardam só a DNS; usuário/senha passam a ser do próprio cliente (linha Xtream).
ALTER TABLE source_servers MODIFY username_enc TEXT NULL, MODIFY password_enc TEXT NULL;

ALTER TABLE viewer_accounts
  ADD COLUMN server_id BIGINT UNSIGNED NULL AFTER tenant_id,
  ADD COLUMN xtream_username VARCHAR(120) NULL AFTER server_id,
  ADD COLUMN xtream_password_enc TEXT NULL AFTER xtream_username,
  ADD COLUMN account_info JSON NULL AFTER xtream_password_enc,
  ADD COLUMN account_checked_at DATETIME(3) NULL AFTER account_info;
