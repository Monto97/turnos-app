import { Router } from 'express';
import {
  registrar, login, solicitarReset, confirmarReset, requireAuth,
} from '../services/auth.service.js';
import { misTurnos, cancelarMiTurno } from '../services/reserva.service.js';
import { pool } from '../config/db.js';

const router = Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

router.post('/registro', wrap(async (req, res) => {
  res.status(201).json(await registrar(req.body));
}));

router.post('/login', wrap(async (req, res) => {
  res.json(await login(req.body));
}));

router.post('/recuperar', wrap(async (req, res) => {
  res.json(await solicitarReset(req.body.email));
}));

router.post('/reset', wrap(async (req, res) => {
  res.json(await confirmarReset(req.body.token, req.body.password));
}));

router.get('/me', requireAuth, wrap(async (req, res) => {
  const { rows } = await pool.query(
    'SELECT id, nombre, apellido, email, telefono, rol, creado_en FROM usuarios WHERE id = $1',
    [req.usuario.id]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });
  res.json(rows[0]);
}));

router.get('/mis-turnos', requireAuth, wrap(async (req, res) => {
  res.json(await misTurnos(req.usuario.id));
}));

router.patch('/mis-turnos/:id/cancelar', requireAuth, wrap(async (req, res) => {
  res.json(await cancelarMiTurno(req.usuario.id, Number(req.params.id)));
}));

router.post('/google', wrap(async (req, res) => {
  res.status(501).json({
    error: 'Login con Google todavía no configurado. Falta el Client ID de Google Cloud.',
  });
}));

export default router;
