-- ============================================================
--  SISTEMA DE TURNOS - Esquema de base de datos (MySQL 8+)
-- ============================================================
--  Todas las tablas usan CREATE TABLE IF NOT EXISTS (idempotente).
--  Los índices se definen inline para evitar errores si el schema
--  se ejecuta más de una vez (migrate.js lo garantiza igualmente).
--
--  Para dev local, docker-compose crea la DB via MYSQL_DATABASE y la
--  selecciona antes de ejecutar los init scripts. El USE de abajo es un
--  fallback por si el cliente no la selecciona automáticamente.
--  scripts/migrate.js lo elimina antes de ejecutar en Railway.
-- ============================================================

-- Fallback: seleccionar la base de datos para ejecución manual / docker init.
-- migrate.js elimina esta línea (ya conecta a la DB correcta).
USE turnos;

-- ------------------------------------------------------------
-- USUARIOS
-- Cuentas de acceso al sistema. google_id queda preparado para
-- OAuth futuro; password_hash puede ser NULL si usa solo Google.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usuarios (
  id            INT UNSIGNED  PRIMARY KEY AUTO_INCREMENT,
  nombre        VARCHAR(120)  NOT NULL,
  apellido      VARCHAR(120)  NOT NULL DEFAULT '',
  email         VARCHAR(160)  NOT NULL,
  telefono      VARCHAR(40),
  password_hash VARCHAR(255),
  google_id     VARCHAR(100),
  rol           ENUM('cliente','dueño','profesional') NOT NULL DEFAULT 'cliente',
  creado_en     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_email (email),
  UNIQUE KEY uq_google_id (google_id),
  KEY idx_usuarios_email (email)
);

-- ------------------------------------------------------------
-- PASSWORD_RESETS
-- Tokens de un solo uso para recuperación de contraseña.
-- Guardamos el HASH del token (never store plain tokens in DB).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS password_resets (
  id          INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  usuario_id  INT UNSIGNED NOT NULL,
  token_hash  VARCHAR(64)  NOT NULL,
  expira_en   DATETIME     NOT NULL,
  usado       BOOLEAN      NOT NULL DEFAULT FALSE,
  creado_en   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_token_hash (token_hash),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

-- ------------------------------------------------------------
-- PROFESIONALES
-- Cada persona que atiende. El caso "una sola" es simplemente
-- una única fila en esta tabla: el modelo no cambia.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS profesionales (
  id            INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  nombre        VARCHAR(120)  NOT NULL,
  email         VARCHAR(160),
  telefono      VARCHAR(40),
  color_agenda  VARCHAR(7)    DEFAULT '#4f46e5',
  activo        BOOLEAN       NOT NULL DEFAULT TRUE,
  creado_en     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------
-- SERVICIOS
-- duracion_min es CLAVE: con esto se calculan los slots.
-- precio y sena_monto habilitan el flujo de señas.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS servicios (
  id            INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  nombre        VARCHAR(120)  NOT NULL,
  duracion_min  SMALLINT UNSIGNED NOT NULL,
  precio        DECIMAL(10,2) NOT NULL DEFAULT 0,
  sena_monto    DECIMAL(10,2) NOT NULL DEFAULT 0,
  activo        BOOLEAN       NOT NULL DEFAULT TRUE,
  creado_en     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------
-- PROFESIONAL_SERVICIO  (relación N:M)
-- Define qué servicios ofrece cada profesional.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS profesional_servicio (
  profesional_id INT UNSIGNED NOT NULL,
  servicio_id    INT UNSIGNED NOT NULL,
  PRIMARY KEY (profesional_id, servicio_id),
  FOREIGN KEY (profesional_id) REFERENCES profesionales(id) ON DELETE CASCADE,
  FOREIGN KEY (servicio_id)    REFERENCES servicios(id)     ON DELETE CASCADE
);

-- ------------------------------------------------------------
-- HORARIOS_LABORALES
-- Franjas de trabajo recurrentes por profesional y día de semana.
-- dia_semana: 0=domingo ... 6=sábado (estándar JS getDay()).
-- Permite varias franjas por día (ej: 9-13 y 16-20).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS horarios_laborales (
  id             INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  profesional_id INT UNSIGNED NOT NULL,
  dia_semana     TINYINT UNSIGNED NOT NULL,
  hora_inicio    TIME NOT NULL,
  hora_fin       TIME NOT NULL,
  FOREIGN KEY (profesional_id) REFERENCES profesionales(id) ON DELETE CASCADE,
  CONSTRAINT chk_franja CHECK (hora_fin > hora_inicio),
  KEY idx_horarios_prof_dia (profesional_id, dia_semana)
);

-- ------------------------------------------------------------
-- BLOQUEOS
-- Excepciones puntuales: vacaciones, feriados, cierre del local.
-- Si profesional_id es NULL, el bloqueo aplica a TODO el local.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bloqueos (
  id             INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  profesional_id INT UNSIGNED,
  inicio         DATETIME NOT NULL,
  fin            DATETIME NOT NULL,
  motivo         VARCHAR(200),
  FOREIGN KEY (profesional_id) REFERENCES profesionales(id) ON DELETE CASCADE,
  CONSTRAINT chk_bloqueo CHECK (fin > inicio),
  KEY idx_bloqueos_prof (profesional_id, inicio, fin)
);

-- ------------------------------------------------------------
-- CLIENTES
-- Personas que reservan turnos. Pueden tener o no cuenta de usuario.
-- usuario_id vincula el perfil anónimo con su cuenta cuando se registra.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clientes (
  id            INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  usuario_id    INT UNSIGNED,
  nombre        VARCHAR(120) NOT NULL,
  telefono      VARCHAR(40),
  email         VARCHAR(160),
  notas         VARCHAR(500),
  creado_en     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL,
  KEY idx_clientes_tel (telefono),
  KEY idx_clientes_usuario (usuario_id)
);

-- ------------------------------------------------------------
-- TURNOS
-- El corazón del sistema. Guardamos inicio y fin calculados
-- para simplificar las consultas de disponibilidad.
--
-- estado:
--   pendiente  -> reservado, esperando confirmación/seña
--   confirmado -> confirmado (seña pagada o confirmado manualmente)
--   cancelado  -> cancelado por cliente o local
--   completado -> el cliente asistió y se atendió
--   ausente    -> no se presentó (no-show)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS turnos (
  id             INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  cliente_id     INT UNSIGNED NOT NULL,
  profesional_id INT UNSIGNED NOT NULL,
  servicio_id    INT UNSIGNED NOT NULL,
  inicio         DATETIME NOT NULL,
  fin            DATETIME NOT NULL,
  estado         ENUM('pendiente','confirmado','cancelado','completado','ausente')
                 NOT NULL DEFAULT 'pendiente',
  sena_requerida DECIMAL(10,2) NOT NULL DEFAULT 0,
  sena_pagada    BOOLEAN       NOT NULL DEFAULT FALSE,
  precio_snapshot DECIMAL(10,2) NOT NULL DEFAULT 0,
  origen         ENUM('interno','online') NOT NULL DEFAULT 'interno',
  notas          VARCHAR(500),
  creado_en      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (cliente_id)     REFERENCES clientes(id),
  FOREIGN KEY (profesional_id) REFERENCES profesionales(id),
  FOREIGN KEY (servicio_id)    REFERENCES servicios(id),
  CONSTRAINT chk_turno CHECK (fin > inicio),
  KEY idx_turnos_prof_inicio (profesional_id, inicio),
  KEY idx_turnos_estado      (estado),
  KEY idx_turnos_cliente     (cliente_id)
);

-- ------------------------------------------------------------
-- RECORDATORIOS  (preparado para automatización futura)
-- Registra los avisos enviados/a enviar por turno.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS recordatorios (
  id          INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  turno_id    INT UNSIGNED NOT NULL,
  canal       ENUM('email','whatsapp','sms') NOT NULL DEFAULT 'email',
  programado  DATETIME NOT NULL,
  enviado_en  DATETIME,
  estado      ENUM('pendiente','enviado','fallido') NOT NULL DEFAULT 'pendiente',
  FOREIGN KEY (turno_id) REFERENCES turnos(id) ON DELETE CASCADE,
  KEY idx_recordatorios_pendientes (estado, programado)
);
