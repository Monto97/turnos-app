-- ============================================================
--  MIGRACIÓN: Roles de usuario
-- ============================================================
--  Ejecutar sobre la base 'turnos'.
--  - Agrega columna 'rol' a usuarios (dueño / cliente / profesional).
--  - Agrega 'usuario_id' a clientes para vincular reservas con cuentas.
-- ============================================================
USE turnos;

-- Rol del usuario. Por defecto 'cliente' (el caso más común).
ALTER TABLE usuarios
  ADD COLUMN rol ENUM('dueño', 'cliente', 'profesional')
  NOT NULL DEFAULT 'cliente' AFTER email_verificado;

-- Vínculo opcional entre un registro de cliente (quien reserva) y una
-- cuenta de usuario. NULL = cliente anónimo que reservó sin cuenta.
-- Cuando alguien se registra, asociamos sus reservas previas por email/tel.
ALTER TABLE clientes
  ADD COLUMN usuario_id INT UNSIGNED NULL AFTER id,
  ADD CONSTRAINT fk_clientes_usuario
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL;

CREATE INDEX idx_clientes_usuario ON clientes(usuario_id);
