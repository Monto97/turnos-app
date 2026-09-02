-- =====================================================================
-- Migración 005 — Pagos, OAuth de Mercado Pago y suscripción
-- =====================================================================
--
-- Requiere la 004 y la 004b aplicadas.
--
-- Backup:
--   docker exec turnos_mysql mysqldump -u root -proot_password_dev turnos > backup_pre_005.sql
-- Correr:
--   Get-Content .\migrations\005_pagos_oauth.sql | docker exec -i turnos_mysql mysql -u root -proot_password_dev turnos
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Clave candidata que falta en turnos
-- ---------------------------------------------------------------------
-- La 004b creó uq_*_tenant en profesionales, servicios y clientes, pero
-- no en turnos. Hace falta como destino del FK compuesto de `pagos`.
ALTER TABLE turnos ADD UNIQUE KEY uq_turno_tenant (id, negocio_id);


-- ---------------------------------------------------------------------
-- 2. oauth_states — el handshake de PKCE
-- ---------------------------------------------------------------------
-- Guarda el estado entre /panel/mp/conectar y /oauth/mp/callback, que
-- son dos requests distintas.
--
-- POR QUÉ EN LA BASE Y NO EN LA SESIÓN: el callback lo dispara el
-- navegador volviendo desde MP y no siempre trae la cookie de sesión
-- intacta (SameSite en redirects cross-site). Guardarlo acá evita ese
-- dolor de cabeza y funciona igual si mañana corrés varias instancias.
--
-- EL `state` DEBE SER ALEATORIO, nunca el negocio_id en texto plano.
-- Si es adivinable, un atacante puede lograr que la cuenta de MP de una
-- víctima quede vinculada a un negocio ajeno. Generalo con
-- crypto.randomBytes(32).toString('hex').
CREATE TABLE oauth_states (
  state         VARCHAR(64)  NOT NULL PRIMARY KEY,
  negocio_id    INT UNSIGNED NOT NULL,
  -- Quién inició el flujo. Sirve para auditar y para verificar en el
  -- callback que sigue siendo el mismo usuario logueado.
  usuario_id    INT UNSIGNED NOT NULL,
  -- PKCE: el verifier son 43-128 caracteres. Se manda al intercambiar
  -- el code por el token. Es de vida corta y no sirve sin el code,
  -- así que no hace falta cifrarlo.
  code_verifier VARCHAR(128) NOT NULL,
  -- El code de MP vale 10 minutos; damos 15 de margen.
  expira_en     DATETIME     NOT NULL,
  -- Un state se usa UNA sola vez. Marcarlo evita replays.
  usado_en      DATETIME     NULL DEFAULT NULL,
  creado_en     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,

  KEY idx_oauth_expira (expira_en),

  CONSTRAINT fk_oauth_negocio FOREIGN KEY (negocio_id)
    REFERENCES negocios(id) ON DELETE CASCADE,
  CONSTRAINT fk_oauth_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Limpieza: esta tabla crece con cada intento de conexión y nunca se
-- vacía sola. Programá un DELETE diario desde el backend:
--   DELETE FROM oauth_states WHERE expira_en < NOW() - INTERVAL 1 DAY;


-- ---------------------------------------------------------------------
-- 3. Estado de la conexión con MP
-- ---------------------------------------------------------------------
-- Columnas extra sobre negocio_credenciales_mp (creada en la 004).
-- El token dura 180 días: hay que renovar alrededor del día 150, no
-- esperar al vencimiento.
ALTER TABLE negocio_credenciales_mp
  ADD COLUMN estado ENUM('conectado','desconectado','error') NOT NULL DEFAULT 'desconectado' AFTER negocio_id,
  ADD COLUMN ultimo_refresh_en DATETIME NULL DEFAULT NULL,
  ADD COLUMN ultimo_error VARCHAR(300) NULL DEFAULT NULL;

-- NOTA SOBRE EL REFRESH (no es schema, es código, pero se olvida):
-- El refresh_token de MP es de UN SOLO USO y cada renovación devuelve
-- uno nuevo. Si dos requests refrescan en paralelo, la segunda invalida
-- a la primera y perdés el vínculo con el negocio.
-- Tomá la fila con SELECT ... FOR UPDATE dentro de una transacción
-- antes de llamar a /oauth/token.
--
-- CIFRADO: access_token_enc y refresh_token_enc van con AES-256-GCM.
-- Guardá los tres componentes concatenados en base64, ej:
--   `${iv}:${authTag}:${ciphertext}`
-- La clave maestra va en variable de entorno, NUNCA en la base ni en
-- el repo.


-- ---------------------------------------------------------------------
-- 4. pagos — registro de cada seña cobrada
-- ---------------------------------------------------------------------
-- Reemplaza al flag `turnos.sena_pagada`, que no permite auditar, ni
-- manejar reembolsos, ni distinguir "pendiente" de "rechazado".
-- El flag se mantiene por compatibilidad; se puede deprecar después.
--
-- mp_payment_id ÚNICO es la clave de idempotencia: MP reintenta las
-- notificaciones y podés recibir el mismo evento varias veces. El
-- handler hace INSERT ... ON DUPLICATE KEY UPDATE.
CREATE TABLE pagos (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  negocio_id        INT UNSIGNED NOT NULL,
  turno_id          INT UNSIGNED NOT NULL,

  -- Identificadores de Mercado Pago
  mp_payment_id     BIGINT UNSIGNED NOT NULL,
  mp_preference_id  VARCHAR(64)  NULL DEFAULT NULL,
  -- external_reference que mandamos en la preferencia (= turno_id).
  -- Se guarda tal cual vino para poder detectar inconsistencias.
  external_ref      VARCHAR(64)  NULL DEFAULT NULL,

  -- Estados tal como los devuelve MP. No los traduzcas al guardar:
  -- guardá el valor crudo y traducí en la capa de presentación.
  estado            ENUM('pending','approved','authorized','in_process',
                         'in_mediation','rejected','cancelled',
                         'refunded','charged_back') NOT NULL DEFAULT 'pending',
  estado_detalle    VARCHAR(80)  NULL DEFAULT NULL,  -- status_detail

  monto             DECIMAL(10,2) NOT NULL,
  monto_reembolsado DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  moneda            CHAR(3)       NOT NULL DEFAULT 'ARS',

  medio_pago        VARCHAR(40)  NULL DEFAULT NULL,  -- payment_method_id
  tipo_pago         VARCHAR(40)  NULL DEFAULT NULL,  -- payment_type_id
  payer_email       VARCHAR(160) NULL DEFAULT NULL,

  aprobado_en       DATETIME     NULL DEFAULT NULL,
  creado_en         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uq_pago_mp (mp_payment_id),
  KEY idx_pagos_negocio_fecha (negocio_id, creado_en),
  KEY idx_pagos_turno (turno_id),

  CONSTRAINT fk_pagos_negocio FOREIGN KEY (negocio_id)
    REFERENCES negocios(id),
  -- FK compuesto: un pago del negocio A no puede apuntar a un turno
  -- del negocio B, aunque el código se equivoque.
  CONSTRAINT fk_pagos_turno FOREIGN KEY (turno_id, negocio_id)
    REFERENCES turnos(id, negocio_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------
-- 5. mp_webhook_eventos — log crudo de notificaciones
-- ---------------------------------------------------------------------
-- Los webhooks son lo más difícil de debuggear de toda la integración:
-- fallan en producción, no los podés reproducir, y MP no te muestra qué
-- te mandó. Tener el payload crudo guardado vale oro el día que algo
-- no cuadre.
--
-- ES UN LOG, NO UNA TABLA DE DOMINIO: crece rápido y hay que podarlo.
-- Si preferís mantener el esquema chico, se puede resolver con logs a
-- archivo en vez de tabla.
CREATE TABLE mp_webhook_eventos (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  -- negocio_id sale del path /webhooks/mp/:negocioId. Nullable porque
  -- una notificación mal formada o un ataque puede traer uno inválido,
  -- y aun así la querés registrar.
  negocio_id    INT UNSIGNED NULL DEFAULT NULL,
  tipo          VARCHAR(40)  NULL DEFAULT NULL,  -- payment, merchant_order...
  data_id       VARCHAR(64)  NULL DEFAULT NULL,  -- id del recurso notificado
  -- Resultado de validar el header x-signature (HMAC).
  -- Si esto viene en 0, alguien te está posteando eventos falsos.
  firma_valida  TINYINT(1)   NOT NULL DEFAULT 0,
  procesado     TINYINT(1)   NOT NULL DEFAULT 0,
  error         VARCHAR(300) NULL DEFAULT NULL,
  payload       JSON         NULL DEFAULT NULL,
  creado_en     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,

  KEY idx_wh_fecha (creado_en),
  KEY idx_wh_data (tipo, data_id)
  -- Sin FK a negocios a propósito: tiene que poder registrar
  -- notificaciones con un negocio_id que no existe.
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Poda sugerida (mensual):
--   DELETE FROM mp_webhook_eventos WHERE creado_en < NOW() - INTERVAL 90 DAY;


-- ---------------------------------------------------------------------
-- 6. Suscripción del negocio (abono mensual)
-- ---------------------------------------------------------------------
-- Una sola columna alcanza para la lógica de corte de acceso: si
-- vigente_hasta < hoy y el trial venció, el panel pasa a solo lectura.
-- La cobranza en sí arranca manual (transferencia) — no la automatices
-- hasta tener suficientes clientes para que valga la pena.
ALTER TABLE negocios
  ADD COLUMN suscripcion_vigente_hasta DATE NULL DEFAULT NULL AFTER trial_hasta,
  ADD COLUMN abono_mensual DECIMAL(10,2) NULL DEFAULT NULL AFTER suscripcion_vigente_hasta;

-- El negocio 1 (el salón) es cliente cero: sin vencimiento.
UPDATE negocios SET suscripcion_vigente_hasta = '2099-12-31' WHERE id = 1;


-- ---------------------------------------------------------------------
-- 7. Verificación
-- ---------------------------------------------------------------------
SELECT TABLE_NAME, TABLE_ROWS
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = 'turnos'
  AND TABLE_NAME IN ('pagos','oauth_states','mp_webhook_eventos',
                     'negocio_credenciales_mp','negocios')
ORDER BY TABLE_NAME;

SELECT id, nombre, slug, plan, trial_hasta, suscripcion_vigente_hasta
FROM negocios;
