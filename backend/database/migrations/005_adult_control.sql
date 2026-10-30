-- Controle parental (bloqueio de categorias adultas com PIN), por conta de espectador.
ALTER TABLE viewer_accounts
  ADD COLUMN adult_control_enabled TINYINT(1) NOT NULL DEFAULT 0 AFTER status,
  ADD COLUMN adult_pin_hash VARCHAR(100) NULL AFTER adult_control_enabled;
