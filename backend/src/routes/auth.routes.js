import { Router } from 'express';
import {
  registrar, login, solicitarReset, confirmarReset, requireAuth,
} from '../services/auth.service.js';
import { misTurnos, cancelarMiTurno } from '../services/reserva.service.js';
import { pool } from '../config/db.js';

const router = Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

// POST /api/auth/registro
router.post('/registro', wrap(async (req, res) => {
  res.status(201).json(await registrar(req.body));
}));

// POST /api/auth/login
router.post('/login', wrap(async (req, res) => {
  res.json(await login(req.body));
}));

// POST /api/auth/recuperar   { email }
router.post('/recuperar', wrap(async (req, res) => {
  res.json(await solicitarReset(req.body.email));
}));

// POST /api/auth/reset       { token, password }
router.post('/reset', wrap(async (req, res) => {
  res.json(await confirmarReset(req.body.token, req.body.password));
}));

// GET /api/auth/me  -> datos del usuario logueado (ruta protegida)
// Sirve para que el frontend verifique la sesión y sepa el rol.
router.get('/me', requireAuth, wrap(async (req, res) => {
  const [rows] = await pool.query(
    'SELECT id, nombre, apellido, email, telefono, rol, creado_en FROM usuarios WHERE id = ?',
    [req.usuario.id]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });
  res.json(rows[0]);
}));

// GET /api/auth/mis-turnos  -> turnos del cliente logueado
router.get('/mis-turnos', requireAuth, wrap(async (req, res) => {
  res.json(await misTurnos(req.usuario.id));
}));

// PATCH /api/auth/mis-turnos/:id/cancelar -> el cliente cancela su propio turno
router.patch('/mis-turnos/:id/cancelar', requireAuth, wrap(async (req, res) => {
  res.json(await cancelarMiTurno(req.usuario.id, Number(req.params.id)));
}));

// --- Placeholder para Google OAuth (lo conectamos después) ---
// POST /api/auth/google  { credential }  <- token de Google Identity Services
router.post('/google', wrap(async (req, res) => {
  res.status(501).json({
    error: 'Login con Google todavía no configurado. Falta el Client ID de Google Cloud.',
  });
}));

export default router;
