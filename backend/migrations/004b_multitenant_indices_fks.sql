-- =====================================================================
-- Migración 004b — Índices, claves candidatas y FKs compuestos
-- =====================================================================
--
-- Continúa la 004, que cortó en la sección 6 por asumir una columna
-- `fecha` que no existe (el esquema real usa inicio/fin datetime).
-- Las secciones 1-5 de la 004 YA están aplicadas: no las vuelvas a correr.
--
-- Correr:
--   Get-Content .\migrations\004b_multitenant_indices_fks.sql | docker exec -i turnos_mysql mysql -u root -proot_password_dev turnos
--
-- Backup primero (MySQL commitea cada DDL, no hay rollback):
--   docker exec turnos_mysql mysqldump -u root -proot_password_dev turnos > backup_pre_004b.sql
--
-- ORDEN: primero los FKs compuestos, después los índices. Al revés no
-- funciona: varios índices viejos están sosteniendo los FKs actuales y
-- MySQL no deja tocarlos mientras el FK dependa de ellos (error 1553).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Claves candidatas para los FKs compuestos
-- ---------------------------------------------------------------------
-- Redundantes por sí solas (id ya es PK), pero necesarias como destino
-- de los FKs de la sección siguiente.
ALTER TABLE profesionales ADD UNIQUE KEY uq_prof_tenant (id, negocio_id);
ALTER TABLE servicios     ADD UNIQUE KEY uq_serv_tenant (id, negocio_id);
ALTER TABLE clientes      ADD UNIQUE KEY uq_cli_tenant  (id, negocio_id);


-- ---------------------------------------------------------------------
-- 2. Integridad de tenant a nivel base
-- ---------------------------------------------------------------------
-- Reemplaza los FKs simples por compuestos que incluyen negocio_id.
-- MySQL pasa a impedir FÍSICAMENTE que un turno del negocio A
-- referencie un cliente/profesional/servicio del negocio B, aunque el
-- código tenga un bug. Es la única defensa que no depende de que te
-- acuerdes del WHERE en cada query.

-- --- turnos ---
-- La más importante: acá un cruce de tenants significa mostrarle la
-- agenda de un negocio a otro.
-- cliente_id, profesional_id y servicio_id son NOT NULL, así que estos
-- tres FKs validan siempre (en un FK compuesto, un NULL en cualquier
-- columna hace que MySQL dé la restricción por satisfecha y no valide).
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

-- --- profesional_servicio (pivot) ---
ALTER TABLE profesional_servicio DROP FOREIGN KEY profesional_servicio_ibfk_1;
ALTER TABLE profesional_servicio DROP FOREIGN KEY profesional_servicio_ibfk_2;
ALTER TABLE profesional_servicio
  ADD CONSTRAINT fk_ps_profesional FOREIGN KEY (profesional_id, negocio_id)
    REFERENCES profesionales(id, negocio_id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_ps_servicio FOREIGN KEY (servicio_id, negocio_id)
    REFERENCES servicios(id, negocio_id) ON DELETE CASCADE;

-- --- bloqueos ---
-- profesional_id es NULLABLE acá (bloqueo de todo el negocio, ej. feriado).
-- Cuando es NULL el FK no valida nada, pero fk_bloqueos_negocio ya cubre
-- el tenant en ese caso.
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
-- quedan como están: el primero hereda el tenant del turno, el segundo
-- apunta a la tabla global de identidad.


-- ---------------------------------------------------------------------
-- 3. Índices del motor de disponibilidad
-- ---------------------------------------------------------------------
-- negocio_id va PRIMERO: ahora toda query arranca filtrando por tenant.
-- Un índice (inicio, negocio_id) no rinde igual.
--
-- Solo se AGREGAN índices, no se borra ninguno. Varios de los viejos
-- están sosteniendo FKs o son leftmost-prefix de algo. La limpieza va
-- aparte, con EXPLAIN sobre las queries reales (ver nota al final).

-- Vista semanal de agenda: rango de inicio dentro de un negocio.
ALTER TABLE turnos
  ADD KEY idx_turnos_agenda (negocio_id, inicio);

-- Cálculo de slots libres de un profesional en un rango.
-- Este es el índice caliente del sistema.
ALTER TABLE turnos
  ADD KEY idx_turnos_prof_agenda (negocio_id, profesional_id, inicio);

-- Bloqueos que se superponen con un rango consultado.
ALTER TABLE bloqueos
  ADD KEY idx_bloqueos_rango (negocio_id, inicio, fin);

-- Horarios del profesional por día de semana.
ALTER TABLE horarios_laborales
  ADD KEY idx_horarios_prof_negocio (negocio_id, profesional_id, dia_semana);


-- ---------------------------------------------------------------------
-- 4. Uniques faltantes
-- ---------------------------------------------------------------------
-- El diagnóstico mostró que los únicos uniques de la base estaban en
-- `usuarios` (email, google_id), y esos siguen siendo GLOBALES: son
-- identidad, no dependen de negocio. No se tocan.
-- Lo que faltaba son restricciones que hoy permiten datos sucios.

-- Pivot sin unique: hoy se puede cargar el mismo par dos veces.
ALTER TABLE profesional_servicio
  ADD UNIQUE KEY uq_prof_serv (profesional_id, servicio_id);

-- Un usuario registrado = una sola ficha de cliente por negocio.
-- Sin esto el flujo híbrido (reserva anónima + creación de cuenta) puede
-- generar una segunda ficha para la misma persona y partirle el
-- historial en dos. Clientes anónimos tienen usuario_id NULL y MySQL
-- permite múltiples NULL en un UNIQUE, así que no chocan entre sí.
ALTER TABLE clientes
  ADD UNIQUE KEY uq_cliente_usuario (negocio_id, usuario_id);


-- ---------------------------------------------------------------------
-- 5. Uniques con nombres de columna SIN VERIFICAR  [pueden fallar]
-- ---------------------------------------------------------------------
-- Van al final a propósito: asumo que existen clientes.telefono y
-- servicios.nombre. Si alguna no existe, falla acá y todo lo de arriba
-- ya quedó aplicado. Ajustá el nombre y corré solo estas dos líneas.
--
-- Verificado: 0 teléfonos duplicados actualmente.
-- Cuidado con los string vacíos: MySQL permite N filas con NULL, pero
-- dos '' chocan entre sí. Si el backend guarda '' en vez de NULL,
-- normalizalo antes o vas a tener altas fallidas.

ALTER TABLE clientes
  ADD UNIQUE KEY uq_cliente_tel (negocio_id, telefono);

ALTER TABLE servicios
  ADD UNIQUE KEY uq_servicio_nombre (negocio_id, nombre);


-- ---------------------------------------------------------------------
-- 6. Verificación
-- ---------------------------------------------------------------------
SELECT 'servicios' t, COUNT(*) total, SUM(negocio_id=1) en_negocio_1 FROM servicios
UNION ALL SELECT 'profesionales',        COUNT(*), SUM(negocio_id=1) FROM profesionales
UNION ALL SELECT 'clientes',             COUNT(*), SUM(negocio_id=1) FROM clientes
UNION ALL SELECT 'turnos',               COUNT(*), SUM(negocio_id=1) FROM turnos
UNION ALL SELECT 'bloqueos',             COUNT(*), SUM(negocio_id=1) FROM bloqueos
UNION ALL SELECT 'recordatorios',        COUNT(*), SUM(negocio_id=1) FROM recordatorios
UNION ALL SELECT 'horarios_laborales',   COUNT(*), SUM(negocio_id=1) FROM horarios_laborales
UNION ALL SELECT 'profesional_servicio', COUNT(*), SUM(negocio_id=1) FROM profesional_servicio
UNION ALL SELECT 'miembros',             COUNT(*), SUM(negocio_id=1) FROM negocio_miembros;


-- =====================================================================
-- PENDIENTE PARA DESPUÉS (no ahora)
-- =====================================================================
--
-- Limpieza de índices redundantes. Candidatos:
--   turnos.idx_turnos_prof_inicio  (profesional_id, inicio)
--   turnos.servicio_id             (servicio_id)   <- lo creó el FK viejo
--   turnos.idx_turnos_estado       (estado)        <- baja selectividad
--   bloqueos.idx_bloqueos_prof     (profesional_id, inicio, fin)
--   horarios_laborales.idx_horarios_prof_dia (profesional_id, dia_semana)
--
-- No los borres a ciegas: corré EXPLAIN sobre las queries reales del
-- motor de disponibilidad primero, y fijate que los FKs compuestos no
-- dependan de ellos.
--
-- Y ACTUALIZÁ backend/schema.sql con todo esto. Solo corre al crear el
-- volumen: el día que hagas `docker compose down -v` volvés al esquema
-- pre-multi-tenant sin darte cuenta.
