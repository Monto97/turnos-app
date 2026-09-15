import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { pool } from '../config/db.js';
import { enviarEmailRecuperacion } from './email.service.js';

const JWT_SECRET = process.env.JWT_SECRET || 'cambiar_este_secreto_en_produccion';
const JWT_EXPIRA = '7d';
const RESET_EXPIRA_MIN = 30;
const BCRYPT_ROUNDS = 10;
const CODIGO_DUENO = process.env.CODIGO_DUENO || 'DUENO-2026';

function generarToken(usuario) {
  return jwt.sign(
    { id: usuario.id, email: usuario.email, nombre: usuario.nombre, rol: usuario.rol },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRA }
  );
}

function sanitizar(usuario) {
  const { password_hash, google_id, ...limpio } = usuario;
  return limpio;
}

export async function registrar({ nombre, apellido, email, telefono, password, codigoDueno = null }) {
  if (!nombre || !apellido || !email || !password) {
    throw new Error('Faltan datos obligatorios: nombre, apellido, email, password');
  }
  if (password.length < 8) {
    throw new Error('La contraseña debe tener al menos 8 caracteres');
  }

  email = email.trim().toLowerCase();

  let rol = 'cliente';
  if (codigoDueno) {
    if (codigoDueno !== CODIGO_DUENO) {
      throw new Error('El código de acceso de administrador no es válido');
    }
    rol = 'dueno';
  }

  const { rows: existe } = await pool.query('SELECT id FROM usuarios WHERE email = $1', [email]);
  if (existe.length > 0) {
    throw new Error('Ya existe una cuenta con ese email');
  }

  const password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const { rows: [nuevo] } = await pool.query(
    `INSERT INTO usuarios (nombre, apellido, email, telefono, password_hash, rol)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [nombre.trim(), apellido.trim(), email, telefono || null, password_hash, rol]
  );
  const usuarioId = nuevo.id;

  await pool.query(
    `UPDATE clientes SET usuario_id = $1
      WHERE usuario_id IS NULL AND (email = $2 OR (telefono IS NOT NULL AND telefono = $3))`,
    [usuarioId, email, telefono || null]
  );

  const usuario = {
    id: usuarioId, nombre: nombre.trim(), apellido: apellido.trim(), email, telefono, rol,
  };
  const token = generarToken(usuario);
  return { usuario: sanitizar(usuario), token };
}

export async function login({ email, password }) {
  if (!email || !password) throw new Error('Email y contraseña son obligatorios');
  email = email.trim().toLowerCase();

  const { rows } = await pool.query('SELECT * FROM usuarios WHERE email = $1', [email]);
  if (rows.length === 0) throw new Error('Email o contraseña incorrectos');

  const usuario = rows[0];

  if (!usuario.password_hash) {
    throw new Error('Esta cuenta usa acceso con Google. Iniciá sesión con Google.');
  }

  const ok = await bcrypt.compare(password, usuario.password_hash);
  if (!ok) throw new Error('Email o contraseña incorrectos');

  const token = generarToken(usuario);
  return { usuario: sanitizar(usuario), token };
}

export async function solicitarReset(email) {
  email = (email || '').trim().toLowerCase();
  const { rows } = await pool.query('SELECT id, nombre FROM usuarios WHERE email = $1', [email]);

  if (rows.length === 0) {
    return { ok: true };
  }

  const usuario = rows[0];

  const tokenPlano = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(tokenPlano).digest('hex');
  const expira = new Date(Date.now() + RESET_EXPIRA_MIN * 60 * 1000);

  await pool.query(
    'UPDATE password_resets SET usado = TRUE WHERE usuario_id = $1 AND usado = FALSE',
    [usuario.id]
  );
  await pool.query(
    'INSERT INTO password_resets (usuario_id, token_hash, expira_en) VALUES ($1, $2, $3)',
    [usuario.id, tokenHash, expira]
  );

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:4200';
  const link = `${frontendUrl}/reset-password?token=${tokenPlano}`;

  await enviarEmailRecuperacion(email, usuario.nombre, link);
  return { ok: true };
}

export async function confirmarReset(tokenPlano, nuevaPassword) {
  if (!tokenPlano || !nuevaPassword) throw new Error('Token y nueva contraseña son obligatorios');
  if (nuevaPassword.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres');

  const tokenHash = crypto.createHash('sha256').update(tokenPlano).digest('hex');

  const { rows } = await pool.query(
    `SELECT pr.id, pr.usuario_id, pr.expira_en, pr.usado
       FROM password_resets pr
      WHERE pr.token_hash = $1`,
    [tokenHash]
  );
  if (rows.length === 0) throw new Error('Token inválido');

  const reset = rows[0];
  if (reset.usado) throw new Error('Este enlace ya fue utilizado');
  if (new Date(reset.expira_en) < new Date()) throw new Error('El enlace expiró, pedí uno nuevo');

  const password_hash = await bcrypt.hash(nuevaPassword, BCRYPT_ROUNDS);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE usuarios SET password_hash = $1 WHERE id = $2', [password_hash, reset.usuario_id]);
    await client.query('UPDATE password_resets SET usado = TRUE WHERE id = $1', [reset.id]);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  return { ok: true };
}

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

export function requireRol(...rolesPermitidos) {
  return (req, res, next) => {
    if (!req.usuario) return res.status(401).json({ error: 'No autenticado' });
    if (!rolesPermitidos.includes(req.usuario.rol)) {
      return res.status(403).json({ error: 'No tenés permiso para esta acción' });
    }
    next();
  };
}

export function optionalAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (token) {
    try {
      req.usuario = jwt.verify(token, JWT_SECRET);
    } catch {
      // Token inválido: seguimos como anónimo.
    }
  }
  next();
}
