import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { pool } from '../config/db.js';
import { enviarEmailRecuperacion } from './email.service.js';

// ============================================================
//  SERVICIO DE AUTENTICACIÓN
// ============================================================
//  - Registro con email + contraseña (hasheada con bcrypt)
//  - Login que devuelve un JWT
//  - Recuperación de contraseña por email con token de un solo uso
// ============================================================

const JWT_SECRET = process.env.JWT_SECRET || 'cambiar_este_secreto_en_produccion';
const JWT_EXPIRA = '7d';           // el token de sesión dura 7 días
const RESET_EXPIRA_MIN = 30;        // el token de recuperación dura 30 minutos
const BCRYPT_ROUNDS = 10;           // costo del hash (10 es el estándar razonable)
// Código secreto para registrarse como dueño. Va en el .env.
const CODIGO_DUENO = process.env.CODIGO_DUENO || 'DUENO-2026';

// Genera el JWT de sesión con los datos mínimos del usuario (incluye el rol).
function generarToken(usuario) {
  return jwt.sign(
    { id: usuario.id, email: usuario.email, nombre: usuario.nombre, rol: usuario.rol },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRA }
  );
}

// Quita el hash de contraseña antes de devolver el usuario al cliente.
// NUNCA mandamos el password_hash al frontend.
function sanitizar(usuario) {
  const { password_hash, google_id, ...limpio } = usuario;
  return limpio;
}

/**
 * REGISTRO con email + contraseña.
 * Si viene codigoDueno válido, el usuario se registra como 'dueño'.
 * Si no, es 'cliente' (el caso normal).
 */
export async function registrar({ nombre, apellido, email, telefono, password, codigoDueno = null }) {
  if (!nombre || !apellido || !email || !password) {
    throw new Error('Faltan datos obligatorios: nombre, apellido, email, password');
  }
  if (password.length < 8) {
    throw new Error('La contraseña debe tener al menos 8 caracteres');
  }

  email = email.trim().toLowerCase();

  // Determinar el rol: dueño solo si el código coincide.
  let rol = 'cliente';
  if (codigoDueno) {
    if (codigoDueno !== CODIGO_DUENO) {
      throw new Error('El código de acceso de administrador no es válido');
    }
    rol = 'dueno';
  }

  // ¿Ya existe ese email?
  const [existe] = await pool.query('SELECT id FROM usuarios WHERE email = ?', [email]);
  if (existe.length > 0) {
    throw new Error('Ya existe una cuenta con ese email');
  }

  // Hasheamos la contraseña. bcrypt genera un salt automático por hash,
  // así dos usuarios con la misma contraseña tienen hashes distintos.
  const password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const [r] = await pool.query(
    `INSERT INTO usuarios (nombre, apellido, email, telefono, password_hash, rol)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [nombre.trim(), apellido.trim(), email, telefono || null, password_hash, rol]
  );
  const usuarioId = r.insertId;

  // Vincular reservas previas hechas como anónimo con este email o teléfono.
  // Así, si alguien reservó antes sin cuenta y ahora se registra, ve su historial.
  await pool.query(
    `UPDATE clientes SET usuario_id = ?
      WHERE usuario_id IS NULL AND (email = ? OR (telefono IS NOT NULL AND telefono = ?))`,
    [usuarioId, email, telefono || null]
  );

  const usuario = {
    id: usuarioId, nombre: nombre.trim(), apellido: apellido.trim(), email, telefono, rol,
  };
  const token = generarToken(usuario);
  return { usuario: sanitizar(usuario), token };
}

/**
 * LOGIN con email + contraseña.
 */
export async function login({ email, password }) {
  if (!email || !password) throw new Error('Email y contraseña son obligatorios');
  email = email.trim().toLowerCase();

  const [rows] = await pool.query('SELECT * FROM usuarios WHERE email = ?', [email]);
  // Mensaje de error genérico a propósito: no revelamos si el email existe
  // o si la contraseña es incorrecta (evita enumeración de cuentas).
  if (rows.length === 0) throw new Error('Email o contraseña incorrectos');

  const usuario = rows[0];

  // Si la cuenta se creó solo con Google, no tiene contraseña local.
  if (!usuario.password_hash) {
    throw new Error('Esta cuenta usa acceso con Google. Iniciá sesión con Google.');
  }

  const ok = await bcrypt.compare(password, usuario.password_hash);
  if (!ok) throw new Error('Email o contraseña incorrectos');

  const token = generarToken(usuario);
  return { usuario: sanitizar(usuario), token };
}

/**
 * SOLICITAR RECUPERACIÓN de contraseña.
 * Genera un token, guarda su hash, y envía el link por email.
 */
export async function solicitarReset(email) {
  email = (email || '').trim().toLowerCase();
  const [rows] = await pool.query('SELECT id, nombre FROM usuarios WHERE email = ?', [email]);

  // IMPORTANTE: respondemos igual exista o no el email. Así un atacante
  // no puede usar este endpoint para descubrir qué emails están registrados.
  if (rows.length === 0) {
    return { ok: true }; // silenciosamente no hacemos nada
  }

  const usuario = rows[0];

  // Token en crudo (va al email) y su hash (va a la base).
  const tokenPlano = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(tokenPlano).digest('hex');
  const expira = new Date(Date.now() + RESET_EXPIRA_MIN * 60 * 1000);

  // Invalidamos tokens anteriores no usados de ese usuario.
  await pool.query(
    'UPDATE password_resets SET usado = TRUE WHERE usuario_id = ? AND usado = FALSE',
    [usuario.id]
  );
  await pool.query(
    'INSERT INTO password_resets (usuario_id, token_hash, expira_en) VALUES (?, ?, ?)',
    [usuario.id, tokenHash, expira]
  );

  // El link apunta al frontend, que después llama a /reset-password con el token.
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:4200';
  const link = `${frontendUrl}/reset-password?token=${tokenPlano}`;

  await enviarEmailRecuperacion(email, usuario.nombre, link);
  return { ok: true };
}

/**
 * CONFIRMAR RESET: recibe el token del email y la nueva contraseña.
 */
export async function confirmarReset(tokenPlano, nuevaPassword) {
  if (!tokenPlano || !nuevaPassword) throw new Error('Token y nueva contraseña son obligatorios');
  if (nuevaPassword.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres');

  const tokenHash = crypto.createHash('sha256').update(tokenPlano).digest('hex');

  const [rows] = await pool.query(
    `SELECT pr.id, pr.usuario_id, pr.expira_en, pr.usado
       FROM password_resets pr
      WHERE pr.token_hash = ?`,
    [tokenHash]
  );
  if (rows.length === 0) throw new Error('Token inválido');

  const reset = rows[0];
  if (reset.usado) throw new Error('Este enlace ya fue utilizado');
  if (new Date(reset.expira_en) < new Date()) throw new Error('El enlace expiró, pedí uno nuevo');

  const password_hash = await bcrypt.hash(nuevaPassword, BCRYPT_ROUNDS);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('UPDATE usuarios SET password_hash = ? WHERE id = ?', [password_hash, reset.usuario_id]);
    await conn.query('UPDATE password_resets SET usado = TRUE WHERE id = ?', [reset.id]);
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
  return { ok: true };
}

// Middleware: protege rutas que requieren estar logueado.
// Lee el header 'Authorization: Bearer <token>', valida el JWT.
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No autenticado' });
  try {
    req.usuario = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Sesión inválida o expirada' });
  }
}

// Middleware de AUTORIZACIÓN por rol. Se usa DESPUÉS de requireAuth.
// Ejemplo: router.get('/panel', requireAuth, requireRol('dueño'), handler)
// Autenticación = "quién sos" (requireAuth); autorización = "qué podés hacer" (requireRol).
export function requireRol(...rolesPermitidos) {
  return (req, res, next) => {
    if (!req.usuario) return res.status(401).json({ error: 'No autenticado' });
    if (!rolesPermitidos.includes(req.usuario.rol)) {
      return res.status(403).json({ error: 'No tenés permiso para esta acción' });
    }
    next();
  };
}

// Middleware de auth OPCIONAL: si hay token válido, adjunta req.usuario;
// si no hay token o es inválido, sigue igual sin bloquear. Sirve para
// rutas públicas que se comportan distinto si el usuario está logueado
// (ej: la reserva, que vincula el turno a la cuenta si hay sesión).
export function optionalAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (token) {
    try {
      req.usuario = jwt.verify(token, JWT_SECRET);
    } catch {
      // Token inválido: lo ignoramos, seguimos como anónimo.
    }
  }
  next();
}
