-- ============================================================
--  SISTEMA DE TURNOS - Esquema PostgreSQL
-- ============================================================

-- USUARIOS
CREATE TABLE IF NOT EXISTS usuarios (
  id            SERIAL        PRIMARY KEY,
  nombre        VARCHAR(120)  NOT NULL,
  apellido      VARCHAR(120)  NOT NULL DEFAULT '',
  email         VARCHAR(160)  NOT NULL UNIQUE,
  telefono      VARCHAR(40),
  password_hash VARCHAR(255),
  google_id     VARCHAR(100)  UNIQUE,
  rol           TEXT          NOT NULL DEFAULT 'cliente'
                              CHECK (rol IN ('dueno','cliente','profesional')),
  creado_en     TIMESTAMP     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usuarios_email ON usuarios(email);

-- PASSWORD_RESETS
CREATE TABLE IF NOT EXISTS password_resets (
  id          SERIAL       PRIMARY KEY,
  usuario_id  INTEGER      NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  token_hash  VARCHAR(64)  NOT NULL UNIQUE,
  expira_en   TIMESTAMP    NOT NULL,
  usado       BOOLEAN      NOT NULL DEFAULT FALSE,
  creado_en   TIMESTAMP    NOT NULL DEFAULT NOW()
);

-- PROFESIONALES
CREATE TABLE IF NOT EXISTS profesionales (
  id            SERIAL        PRIMARY KEY,
  nombre        VARCHAR(120)  NOT NULL,
  email         VARCHAR(160),
  telefono      VARCHAR(40),
  color_agenda  VARCHAR(7)    DEFAULT '#4f46e5',
  activo        BOOLEAN       NOT NULL DEFAULT TRUE,
  creado_en     TIMESTAMP     NOT NULL DEFAULT NOW()
);

-- SERVICIOS
CREATE TABLE IF NOT EXISTS servicios (
  id            SERIAL        PRIMARY KEY,
  nombre        VARCHAR(120)  NOT NULL,
  duracion_min  INTEGER       NOT NULL,
  precio        NUMERIC(10,2) NOT NULL DEFAULT 0,
  sena_monto    NUMERIC(10,2) NOT NULL DEFAULT 0,
  activo        BOOLEAN       NOT NULL DEFAULT TRUE,
  creado_en     TIMESTAMP     NOT NULL DEFAULT NOW()
);

-- PROFESIONAL_SERVICIO (N:M)
CREATE TABLE IF NOT EXISTS profesional_servicio (
  profesional_id INTEGER NOT NULL REFERENCES profesionales(id) ON DELETE CASCADE,
  servicio_id    INTEGER NOT NULL REFERENCES servicios(id)     ON DELETE CASCADE,
  PRIMARY KEY (profesional_id, servicio_id)
);

-- HORARIOS_LABORALES
-- dia_semana: 0=domingo ... 6=sábado (estándar JS getDay())
CREATE TABLE IF NOT EXISTS horarios_laborales (
  id             SERIAL    PRIMARY KEY,
  profesional_id INTEGER   NOT NULL REFERENCES profesionales(id) ON DELETE CASCADE,
  dia_semana     SMALLINT  NOT NULL,
  hora_inicio    TIME      NOT NULL,
  hora_fin       TIME      NOT NULL,
  CONSTRAINT chk_franja CHECK (hora_fin > hora_inicio)
);

CREATE INDEX IF NOT EXISTS idx_horarios_prof_dia ON horarios_laborales(profesional_id, dia_semana);

-- BLOQUEOS
-- Si profesional_id es NULL, el bloqueo aplica a TODO el local.
CREATE TABLE IF NOT EXISTS bloqueos (
  id             SERIAL    PRIMARY KEY,
  profesional_id INTEGER   REFERENCES profesionales(id) ON DELETE CASCADE,
  inicio         TIMESTAMP NOT NULL,
  fin            TIMESTAMP NOT NULL,
  motivo         VARCHAR(200),
  CONSTRAINT chk_bloqueo CHECK (fin > inicio)
);

CREATE INDEX IF NOT EXISTS idx_bloqueos_prof ON bloqueos(profesional_id, inicio, fin);

-- CLIENTES
CREATE TABLE IF NOT EXISTS clientes (
  id            SERIAL       PRIMARY KEY,
  usuario_id    INTEGER      REFERENCES usuarios(id) ON DELETE SET NULL,
  nombre        VARCHAR(120) NOT NULL,
  telefono      VARCHAR(40),
  email         VARCHAR(160),
  notas         VARCHAR(500),
  creado_en     TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clientes_tel     ON clientes(telefono);
CREATE INDEX IF NOT EXISTS idx_clientes_usuario ON clientes(usuario_id);

-- TURNOS
CREATE TABLE IF NOT EXISTS turnos (
  id              SERIAL        PRIMARY KEY,
  cliente_id      INTEGER       NOT NULL REFERENCES clientes(id),
  profesional_id  INTEGER       NOT NULL REFERENCES profesionales(id),
  servicio_id     INTEGER       NOT NULL REFERENCES servicios(id),
  inicio          TIMESTAMP     NOT NULL,
  fin             TIMESTAMP     NOT NULL,
  estado          TEXT          NOT NULL DEFAULT 'pendiente'
                                CHECK (estado IN ('pendiente','confirmado','cancelado','completado','ausente')),
  sena_requerida  NUMERIC(10,2) NOT NULL DEFAULT 0,
  sena_pagada     BOOLEAN       NOT NULL DEFAULT FALSE,
  precio_snapshot NUMERIC(10,2) NOT NULL DEFAULT 0,
  origen          TEXT          NOT NULL DEFAULT 'interno'
                                CHECK (origen IN ('interno','online')),
  notas           VARCHAR(500),
  creado_en       TIMESTAMP     NOT NULL DEFAULT NOW(),
  actualizado_en  TIMESTAMP     NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_turno CHECK (fin > inicio)
);

CREATE INDEX IF NOT EXISTS idx_turnos_prof_inicio ON turnos(profesional_id, inicio);
CREATE INDEX IF NOT EXISTS idx_turnos_estado      ON turnos(estado);
CREATE INDEX IF NOT EXISTS idx_turnos_cliente     ON turnos(cliente_id);

-- Trigger para actualizar actualizado_en automáticamente
CREATE OR REPLACE FUNCTION set_actualizado_en()
RETURNS TRIGGER AS $$
BEGIN
  NEW.actualizado_en = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS turnos_set_actualizado_en ON turnos;
CREATE TRIGGER turnos_set_actualizado_en
  BEFORE UPDATE ON turnos
  FOR EACH ROW EXECUTE FUNCTION set_actualizado_en();

-- RECORDATORIOS
CREATE TABLE IF NOT EXISTS recordatorios (
  id          SERIAL    PRIMARY KEY,
  turno_id    INTEGER   NOT NULL REFERENCES turnos(id) ON DELETE CASCADE,
  canal       TEXT      NOT NULL DEFAULT 'email'
                        CHECK (canal IN ('email','whatsapp','sms')),
  programado  TIMESTAMP NOT NULL,
  enviado_en  TIMESTAMP,
  estado      TEXT      NOT NULL DEFAULT 'pendiente'
                        CHECK (estado IN ('pendiente','enviado','fallido'))
);

CREATE INDEX IF NOT EXISTS idx_recordatorios_pendientes ON recordatorios(estado, programado);
