-- ============================================================
--  MIGRACIÓN: Autenticación de usuarios
-- ============================================================
--  Ejecutar sobre la base 'turnos' ya existente.
--  Agrega:
--    - usuarios          (login/registro con email+password o Google)
--    - password_resets   (tokens para recuperar contraseña)
-- ============================================================
USE turnos;

CREATE TABLE IF NOT EXISTS usuarios (
  id             INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  nombre         VARCHAR(80)  NOT NULL,
  apellido       VARCHAR(80)  NOT NULL,
  email          VARCHAR(160) NOT NULL,
  telefono       VARCHAR(40),
  -- password_hash es NULL cuando el usuario se registró SOLO con Google
  -- (no tiene contraseña local). Por eso permite NULL.
  password_hash  VARCHAR(255),
  -- google_id guarda el 'sub' de Google cuando se registra/loguea con OAuth.
  -- NULL si nunca usó Google.
  google_id      VARCHAR(64),
  email_verificado BOOLEAN NOT NULL DEFAULT FALSE,
  creado_en      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- El email es único: no puede haber dos cuentas con el mismo mail.
  UNIQUE KEY uq_usuarios_email (email),
  UNIQUE KEY uq_usuarios_google (google_id)
);

CREATE TABLE IF NOT EXISTS password_resets (
  id          INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  usuario_id  INT UNSIGNED NOT NULL,
  -- Guardamos el HASH del token, no el token en crudo. Si alguien
  -- accede a la base, no puede usar los tokens directamente.
  token_hash  VARCHAR(255) NOT NULL,
  expira_en   DATETIME NOT NULL,
  usado       BOOLEAN NOT NULL DEFAULT FALSE,
  creado_en   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);
CREATE INDEX idx_resets_token ON password_resets(token_hash);
