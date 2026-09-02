-- =====================================================================
-- Migración 004 — Multi-tenant
-- =====================================================================
--
-- ANTES DE CORRER:
--
-- 1) MySQL hace COMMIT implícito en cada DDL. No hay rollback.
--    Backup primero:
--      docker exec turnos_mysql mysqldump -u root -proot_password_dev turnos > backup_pre_004.sql
--
-- 2) Correr:
--      Get-Content .\migrations\004_multitenant.sql | docker exec -i turnos_mysql mysql -u root -proot_password_dev turnos
--
-- 3) Después de migrar, ACTUALIZAR backend/schema.sql con estos cambios.
--    Ese archivo solo corre al crear el volumen: si algún día borrás
--    turnos_data y levantás de cero, volvés al esquema viejo.
--
-- 4) La sección 9 (FKs compuestos de la pivot) está pendiente de los
--    nombres reales de los constraints actuales.
--
-- Esquema real: bloqueos, clientes, horarios_laborales, password_resets,
-- profesional_servicio, profesionales, recordatorios, servicios, turnos,
-- usuarios.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Tabla de negocios (el tenant)
-- ---------------------------------------------------------------------
CREATE TABLE negocios (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre              VARCHAR(120)  NOT NULL,
  -- slug: identificador de la URL pública -> /reservar/julie-peluqueria
  slug                VARCHAR(80)   NOT NULL,
  rubro               VARCHAR(60)   DEFAULT NULL,
  telefono            VARCHAR(30)   DEFAULT NULL,
  email_contacto      VARCHAR(160)  DEFAULT NULL,
  direccion           VARCHAR(200)  DEFAULT NULL,
  zona_horaria        VARCHAR(50)   NOT NULL DEFAULT 'America/Argentina/Buenos_Aires',

  -- Política de seña (Fase 4). Se define ahora para no remigrar después.
  --   nunca / siempre / condicional
  sena_modo           ENUM('nunca','siempre','condicional') NOT NULL DEFAULT 'nunca',
  sena_porcentaje     DECIMAL(5,2)  NOT NULL DEFAULT 30.00,
  sena_monto_minimo   DECIMAL(12,2) DEFAULT NULL,   -- pedir seña si el servicio supera este monto
  sena_ausencias_min  TINYINT UNSIGNED DEFAULT NULL, -- pedir seña si el cliente tiene N ausencias

  -- Suscripción
  plan                ENUM('trial','basico','pro') NOT NULL DEFAULT 'trial',
  activo              TINYINT(1)    NOT NULL DEFAULT 1,
  trial_hasta         DATE          DEFAULT NULL,

  creado_en           TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uq_negocios_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------
-- 2. Credenciales de Mercado Pago (tabla aparte)
-- ---------------------------------------------------------------------
-- Separadas de `negocios` porque son secretos y porque van cifradas.
--
-- SEGURIDAD: NO guardar el access_token en texto plano. Cifrar en el
-- backend (AES-256-GCM con el módulo crypto de Node) y guardar acá el
-- ciphertext. Si se filtra la base, se filtra la capacidad de cobrar
-- en nombre de tus clientes.
CREATE TABLE negocio_credenciales_mp (
  negocio_id          INT UNSIGNED  NOT NULL PRIMARY KEY,
  mp_user_id          VARCHAR(40)   DEFAULT NULL,
  access_token_enc    TEXT          DEFAULT NULL,
  refresh_token_enc   TEXT          DEFAULT NULL,
  public_key          VARCHAR(255)  DEFAULT NULL,
  expira_en           DATETIME      DEFAULT NULL,
  conectado_en        TIMESTAMP     NULL DEFAULT NULL,

  CONSTRAINT fk_mp_negocio FOREIGN KEY (negocio_id)
    REFERENCES negocios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------
-- 3. Negocio cero: el salón que ya está en producción
-- ---------------------------------------------------------------------
INSERT INTO negocios (id, nombre, slug, rubro, plan, activo)
VALUES (1, 'Salón', 'salon', 'peluqueria', 'pro', 1);


-- ---------------------------------------------------------------------
-- 4. Membresías (qué usuario administra qué negocio)
-- ---------------------------------------------------------------------
-- Reemplaza a un hipotético usuarios.negocio_id.
-- `usuarios` queda como identidad GLOBAL: un email = una persona,
-- aunque sea cliente de varios negocios. Sus uniques (email, google_id)
-- NO se tocan.
CREATE TABLE negocio_miembros (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  negocio_id   INT UNSIGNED NOT NULL,
  usuario_id   INT UNSIGNED NOT NULL,
  rol          ENUM('dueño','staff') NOT NULL DEFAULT 'dueño',
  creado_en    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE KEY uq_miembro (negocio_id, usuario_id),
  KEY idx_miembro_usuario (usuario_id),

  CONSTRAINT fk_miembro_negocio FOREIGN KEY (negocio_id)
    REFERENCES negocios(id) ON DELETE CASCADE,
  CONSTRAINT fk_miembro_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Backfill: los dueños actuales pasan a ser miembros del negocio 1.
-- Ajustá el literal si en tu ENUM está sin tilde.
INSERT INTO negocio_miembros (negocio_id, usuario_id, rol)
SELECT 1, id, 'dueño' FROM usuarios WHERE rol = 'dueño';


-- ---------------------------------------------------------------------
-- 5. negocio_id en las tablas de dominio
-- ---------------------------------------------------------------------
-- Patrón: agregar NULL -> backfill a 1 -> NOT NULL -> FK -> índice.
-- Tres pasos porque agregar NOT NULL directo sobre tabla con filas
-- falla o mete un default silencioso.
--
-- NO llevan negocio_id: `usuarios` (identidad global) y
-- `password_resets` (cuelga de usuarios).

-- --- servicios ---
ALTER TABLE servicios ADD COLUMN negocio_id INT UNSIGNED NULL AFTER id;
UPDATE servicios SET negocio_id = 1 WHERE negocio_id IS NULL;
ALTER TABLE servicios MODIFY COLUMN negocio_id INT UNSIGNED NOT NULL;
ALTER TABLE servicios
  ADD CONSTRAINT fk_servicios_negocio FOREIGN KEY (negocio_id) REFERENCES negocios(id),
  ADD KEY idx_servicios_negocio (negocio_id);

-- --- profesionales ---
ALTER TABLE profesionales ADD COLUMN negocio_id INT UNSIGNED NULL AFTER id;
UPDATE profesionales SET negocio_id = 1 WHERE negocio_id IS NULL;
ALTER TABLE profesionales MODIFY COLUMN negocio_id INT UNSIGNED NOT NULL;
ALTER TABLE profesionales
  ADD CONSTRAINT fk_profesionales_negocio FOREIGN KEY (negocio_id) REFERENCES negocios(id),
  ADD KEY idx_profesionales_negocio (negocio_id);

-- --- clientes ---
ALTER TABLE clientes ADD COLUMN negocio_id INT UNSIGNED NULL AFTER id;
UPDATE clientes SET negocio_id = 1 WHERE negocio_id IS NULL;
ALTER TABLE clientes MODIFY COLUMN negocio_id INT UNSIGNED NOT NULL;
ALTER TABLE clientes
  ADD CONSTRAINT fk_clientes_negocio FOREIGN KEY (negocio_id) REFERENCES negocios(id),
  ADD KEY idx_clientes_negocio (negocio_id);

-- --- turnos ---
ALTER TABLE turnos ADD COLUMN negocio_id INT UNSIGNED NULL AFTER id;
UPDATE turnos SET negocio_id = 1 WHERE negocio_id IS NULL;
ALTER TABLE turnos MODIFY COLUMN negocio_id INT UNSIGNED NOT NULL;
ALTER TABLE turnos
  ADD CONSTRAINT fk_turnos_negocio FOREIGN KEY (negocio_id) REFERENCES negocios(id);

-- --- bloqueos ---
ALTER TABLE bloqueos ADD COLUMN negocio_id INT UNSIGNED NULL AFTER id;
UPDATE bloqueos SET negocio_id = 1 WHERE negocio_id IS NULL;
ALTER TABLE bloqueos MODIFY COLUMN negocio_id INT UNSIGNED NOT NULL;
ALTER TABLE bloqueos
  ADD CONSTRAINT fk_bloqueos_negocio FOREIGN KEY (negocio_id) REFERENCES negocios(id),
  ADD KEY idx_bloqueos_negocio (negocio_id);

-- --- recordatorios ---
ALTER TABLE recordatorios ADD COLUMN negocio_id INT UNSIGNED NULL AFTER id;
UPDATE recordatorios SET negocio_id = 1 WHERE negocio_id IS NULL;
ALTER TABLE recordatorios MODIFY COLUMN negocio_id INT UNSIGNED NOT NULL;
ALTER TABLE recordatorios
  ADD CONSTRAINT fk_recordatorios_negocio FOREIGN KEY (negocio_id) REFERENCES negocios(id),
  ADD KEY idx_recordatorios_negocio (negocio_id);

-- --- horarios_laborales ---
-- Técnicamente hereda el tenant vía profesional_id, pero denormalizarlo
-- permite scopear en el repositorio sin JOIN. El motor de disponibilidad
-- consulta esta tabla en cada request: el JOIN extra se paga caro.
ALTER TABLE horarios_laborales ADD COLUMN negocio_id INT UNSIGNED NULL AFTER id;
UPDATE horarios_laborales SET negocio_id = 1 WHERE negocio_id IS NULL;
ALTER TABLE horarios_laborales MODIFY COLUMN negocio_id INT UNSIGNED NOT NULL;
ALTER TABLE horarios_laborales
  ADD CONSTRAINT fk_horarios_negocio FOREIGN KEY (negocio_id) REFERENCES negocios(id),
  ADD KEY idx_horarios_negocio (negocio_id);

-- --- profesional_servicio (pivot) ---
-- Ambos lados ya están scopeados, pero lo agregamos igual para poder
-- armar los FKs compuestos de la sección 9.
ALTER TABLE profesional_servicio ADD COLUMN negocio_id INT UNSIGNED NULL FIRST;
UPDATE profesional_servicio SET negocio_id = 1 WHERE negocio_id IS NULL;
ALTER TABLE profesional_servicio MODIFY COLUMN negocio_id INT UNSIGNED NOT NULL;


-- ---------------------------------------------------------------------
-- 6. Índices del motor de disponibilidad
-- ---------------------------------------------------------------------
-- negocio_id va PRIMERO en el compuesto: toda query arranca filtrando
-- por tenant. Un índice (fecha, negocio_id) no rinde igual.
--
-- Los índices viejos sobre (fecha) o (profesional_id, fecha) quedan
-- redundantes. Verificá con EXPLAIN que se usan los nuevos y borralos.
ALTER TABLE turnos
  ADD KEY idx_turnos_agenda (negocio_id, fecha, estado),
  ADD KEY idx_turnos_prof_fecha (negocio_id, profesional_id, fecha);

ALTER TABLE bloqueos
  ADD KEY idx_bloqueos_fecha (negocio_id, fecha);

ALTER TABLE horarios_laborales
  ADD KEY idx_horarios_prof (negocio_id, profesional_id);


-- ---------------------------------------------------------------------
-- 7. Uniques: nada que convertir, cosas que agregar
-- ---------------------------------------------------------------------
-- El diagnóstico mostró que los únicos uniques de la base están en
-- `usuarios` (email, google_id), y esos siguen siendo globales.
-- O sea: no hay nada que romper. Pero faltan restricciones que hoy
-- permiten datos sucios.

-- Pivot sin unique: hoy podés cargar el mismo par dos veces.
ALTER TABLE profesional_servicio
  ADD UNIQUE KEY uq_prof_serv (profesional_id, servicio_id);

-- Cliente duplicado por teléfono. Verificado: 0 duplicados actuales.
-- MySQL permite múltiples NULL en un UNIQUE, así que los clientes sin
-- teléfono no molestan. Los string vacíos SÍ chocan entre sí: si el
-- backend guarda '' en vez de NULL, normalizalo antes.
ALTER TABLE clientes
  ADD UNIQUE KEY uq_cliente_tel (negocio_id, telefono);

-- Un usuario registrado = una sola ficha de cliente por negocio.
-- Sin esto, el flujo híbrido (reserva anónima + cuenta) puede crear una
-- segunda ficha para la misma persona y partirle el historial en dos.
-- Los clientes anónimos tienen usuario_id NULL y no chocan entre sí.
ALTER TABLE clientes
  ADD UNIQUE KEY uq_cliente_usuario (negocio_id, usuario_id);

-- Nombre de servicio repetido dentro del mismo negocio.
ALTER TABLE servicios
  ADD UNIQUE KEY uq_servicio_nombre (negocio_id, nombre);


-- ---------------------------------------------------------------------
-- 8. Claves candidatas para los FKs compuestos
-- ---------------------------------------------------------------------
-- Redundantes por sí solas (id ya es PK), pero necesarias como destino
-- de los FKs compuestos de la sección 9.
ALTER TABLE profesionales ADD UNIQUE KEY uq_prof_tenant (id, negocio_id);
ALTER TABLE servicios     ADD UNIQUE KEY uq_serv_tenant (id, negocio_id);
ALTER TABLE clientes      ADD UNIQUE KEY uq_cli_tenant  (id, negocio_id);


-- ---------------------------------------------------------------------
-- 9. Integridad de tenant a nivel base
-- ---------------------------------------------------------------------
-- Reemplaza los FKs simples por compuestos que incluyen negocio_id.
-- Con esto MySQL impide FÍSICAMENTE que un turno del negocio A
-- referencie un cliente/profesional/servicio del negocio B, aunque el
-- código tenga un bug. Es la única defensa que no depende de acordarse
-- del WHERE.
--
-- Al hacer DROP FOREIGN KEY, MySQL deja el índice que había creado
-- automáticamente para ese FK. Quedan redundantes -> revisalos con
-- SHOW INDEXES después y borrá los que no use ningún EXPLAIN.
--
-- OJO con las columnas nullable: en un FK compuesto, si CUALQUIERA de
-- las columnas es NULL, MySQL da la restricción por satisfecha y no
-- valida nada. Si turnos.profesional_id puede ser NULL (opción
-- "cualquier profesional" sin resolver), ese FK no te protege.

-- --- profesional_servicio (pivot) ---
ALTER TABLE profesional_servicio DROP FOREIGN KEY profesional_servicio_ibfk_1;
ALTER TABLE profesional_servicio DROP FOREIGN KEY profesional_servicio_ibfk_2;
ALTER TABLE profesional_servicio
  ADD CONSTRAINT fk_ps_profesional FOREIGN KEY (profesional_id, negocio_id)
    REFERENCES profesionales(id, negocio_id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_ps_servicio FOREIGN KEY (servicio_id, negocio_id)
    REFERENCES servicios(id, negocio_id) ON DELETE CASCADE;

-- --- turnos ---
-- La tabla que más importa proteger: es donde un cruce de tenants
-- se traduce en mostrarle la agenda de un negocio a otro.
ALTER TABLE turnos DROP FOREIGN KEY turnos_ibfk_1;
ALTER TABLE turnos DROP FOREIGN KEY turnos_ibfk_2;
ALTER TABLE turnos DROP FOREIGN KEY turnos_ibfk_3;
ALTER TABLE turnos
  ADD CONSTRAINT fk_turnos_cliente FOREIGN KEY (cliente_id, negocio_id)
    REFERENCES clientes(id, negocio_id),
  ADD CONSTRAINT fk_turnos_profesional FOREIGN KEY (profesional_id, negocio_id)
    REFERENCES profesionales(id, negocio_id),
  ADD CONSTRAINT fk_turnos_servicio FOREIGN KEY (servicio_id, negocio_id)
    REFERENCES servicios(id, negocio_id);

-- --- bloqueos ---
ALTER TABLE bloqueos DROP FOREIGN KEY bloqueos_ibfk_1;
ALTER TABLE bloqueos
  ADD CONSTRAINT fk_bloqueos_profesional FOREIGN KEY (profesional_id, negocio_id)
    REFERENCES profesionales(id, negocio_id) ON DELETE CASCADE;

-- --- horarios_laborales ---
ALTER TABLE horarios_laborales DROP FOREIGN KEY horarios_laborales_ibfk_1;
ALTER TABLE horarios_laborales
  ADD CONSTRAINT fk_horarios_profesional FOREIGN KEY (profesional_id, negocio_id)
    REFERENCES profesionales(id, negocio_id) ON DELETE CASCADE;

-- `recordatorios.turno_id -> turnos` y `clientes.usuario_id -> usuarios`
-- se quedan como están: el primero hereda el tenant del turno, y el
-- segundo apunta a la tabla global de identidad.


-- ---------------------------------------------------------------------
-- 10. Verificación
-- ---------------------------------------------------------------------
SELECT 'servicios' t, COUNT(*) total, SUM(negocio_id=1) en_negocio_1 FROM servicios
UNION ALL SELECT 'profesionales',       COUNT(*), SUM(negocio_id=1) FROM profesionales
UNION ALL SELECT 'clientes',            COUNT(*), SUM(negocio_id=1) FROM clientes
UNION ALL SELECT 'turnos',              COUNT(*), SUM(negocio_id=1) FROM turnos
UNION ALL SELECT 'bloqueos',            COUNT(*), SUM(negocio_id=1) FROM bloqueos
UNION ALL SELECT 'recordatorios',       COUNT(*), SUM(negocio_id=1) FROM recordatorios
UNION ALL SELECT 'horarios_laborales',  COUNT(*), SUM(negocio_id=1) FROM horarios_laborales
UNION ALL SELECT 'profesional_servicio',COUNT(*), SUM(negocio_id=1) FROM profesional_servicio
UNION ALL SELECT 'miembros',            COUNT(*), SUM(negocio_id=1) FROM negocio_miembros;
