-- =====================================================================
-- Migración 006 — Normalizar ENUMs corruptos por encoding
-- =====================================================================
--
-- CONTEXTO
-- Pasar archivos .sql por el pipe de PowerShell (Get-Content | docker
-- exec) reencodea el contenido y convierte los caracteres no-ASCII en
-- '?' (0x3F). Resultado: enum('due??o', ...) en vez de enum('dueño',...).
--
-- Afecta a:
--   usuarios.rol            <- corrupto desde una migración anterior
--   negocio_miembros.rol    <- corrupto en la 004
--   negocios.nombre (dato)  <- corrupto en la 004
--
-- CRITERIO: los ENUM son ESQUEMA, no contenido. Se normalizan a ASCII
-- ('dueno' sin ñ). Los acentos van en los datos, donde la collation
-- utf8mb4 los maneja bien. Esto evita que el problema se repita en cada
-- dump, restore y migración futura.
--
-- ⚠ REQUIERE CAMBIO DE CÓDIGO: buscar 'dueño' en el backend y el
--   frontend y reemplazar por 'dueno'. Ver checklist al final.
--
-- CÓMO CORRER (NO usar el pipe de PowerShell):
--   docker cp .\migrations\006_fix_enums.sql turnos_mysql:/tmp/006.sql
--   docker exec -i turnos_mysql sh -c "mysql --default-character-set=utf8mb4 -u root -proot_password_dev turnos < /tmp/006.sql"
--
--   docker cp copia el archivo byte por byte: no hay reencoding.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Diagnóstico previo
-- ---------------------------------------------------------------------
-- Si esto devuelve filas, hay usuarios con el rol corrupto que deben
-- migrarse en el paso 2. Si devuelve vacío, el paso 2 igual es seguro.
SELECT id, email, rol FROM usuarios WHERE rol NOT IN ('cliente','profesional');


-- ---------------------------------------------------------------------
-- 2. usuarios.rol
-- ---------------------------------------------------------------------
-- Patrón de tres pasos para no perder datos: se agrega el valor nuevo
-- al ENUM, se migran las filas, y recién ahí se saca el viejo.
-- Cambiar el ENUM de una con filas usando el valor viejo las convierte
-- en '' (string vacío) silenciosamente.

-- 2a. Convivencia temporal de ambos valores.
ALTER TABLE usuarios
  MODIFY COLUMN rol ENUM('due??o','dueno','cliente','profesional')
  NOT NULL DEFAULT 'cliente';

-- 2b. Migrar las filas que tengan el valor corrupto.
UPDATE usuarios SET rol = 'dueno' WHERE rol = 'due??o';

-- 2c. Sacar el valor corrupto.
ALTER TABLE usuarios
  MODIFY COLUMN rol ENUM('dueno','cliente','profesional')
  NOT NULL DEFAULT 'cliente';


-- ---------------------------------------------------------------------
-- 3. negocio_miembros.rol
-- ---------------------------------------------------------------------
-- Tabla vacía (el backfill no matcheó nada porque no había dueños),
-- así que va directo.
ALTER TABLE negocio_miembros
  MODIFY COLUMN rol ENUM('dueno','staff') NOT NULL DEFAULT 'dueno';


-- ---------------------------------------------------------------------
-- 4. negocios.nombre (dato, no esquema)
-- ---------------------------------------------------------------------
-- Acá sí va con acento: es contenido y la columna es utf8mb4.
-- Se escribe en hexa para que el valor no dependa del encoding del
-- archivo ni de la terminal. C3B3 es la 'ó' en UTF-8.
UPDATE negocios
SET nombre = CONVERT(UNHEX('53616CC3B36E') USING utf8mb4)
WHERE id = 1;


-- ---------------------------------------------------------------------
-- 5. Verificación
-- ---------------------------------------------------------------------
SHOW COLUMNS FROM usuarios LIKE 'rol';
SHOW COLUMNS FROM negocio_miembros LIKE 'rol';

-- Tiene que devolver 'Salón' y el hex 53616CC3B36E
SELECT id, nombre, HEX(nombre) FROM negocios WHERE id = 1;

-- Estado de los usuarios
SELECT rol, COUNT(*) total FROM usuarios GROUP BY rol;


-- =====================================================================
-- DESPUÉS DE ESTA MIGRACIÓN
-- =====================================================================
--
-- A) CÓDIGO — reemplazar 'dueño' por 'dueno':
--      backend: middleware requireRol, registro con código secreto,
--               cualquier comparación de rol en services/controllers
--      frontend: guards de ruta, redirección post-login por rol,
--                condicionales de UI que muestren el panel
--    Buscá con: grep -rn "dueño" backend/src frontend/src
--
-- B) CREAR EL USUARIO DUEÑO
--    Hoy tenés 2 usuarios y los dos son 'cliente': no hay ninguna
--    cuenta de dueño en esta base. Registrate por el flujo normal con
--    el código secreto, y después asociá la membresía:
--
--      SELECT id, email, rol FROM usuarios;
--      INSERT INTO negocio_miembros (negocio_id, usuario_id, rol)
--      VALUES (1, <PONER_EL_ID_ACA>, 'dueno');
--
-- C) ACTUALIZAR backend/schema.sql
--    Sigue teniendo el esquema pre-multi-tenant Y el ENUM con ñ.
--    Guardalo en UTF-8 sin BOM y sin acentos en identificadores.
--
-- D) POWERSHELL — no volver a usar Get-Content | docker exec.
--    Usar siempre: docker cp + redirección adentro del contenedor.
-- =====================================================================
