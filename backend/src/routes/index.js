import { Router } from 'express';
import { profesionales, servicios, clientes } from '../services/crud.service.js';
import { calcularSlotsLibres } from '../services/disponibilidad.service.js';
import { requireAuth, requireRol } from '../services/auth.service.js';
import {
  crearTurno, listarTurnos, cambiarEstado, editarTurno, eliminarTurno,
  listarBloqueos, crearBloqueo, eliminarBloqueo,
} from '../services/turnos.service.js';

const router = Router();

// Helper: envuelve un handler async y manda los errores al middleware.
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

// TODAS las rutas de este router son del PANEL y requieren ser dueño.
// Aplicamos los middlewares a nivel de router: primero autenticación
// (¿quién sos?), después autorización (¿sos dueño?).
router.use(requireAuth, requireRol('dueno'));

// ---------- PROFESIONALES ----------
router.get('/profesionales', wrap(async (req, res) => {
  res.json(await profesionales.listar());
}));
router.post('/profesionales', wrap(async (req, res) => {
  res.status(201).json(await profesionales.crear(req.body));
}));
router.put('/profesionales/:id/servicios', wrap(async (req, res) => {
  res.json(await profesionales.asignarServicios(Number(req.params.id), req.body.servicioIds));
}));
router.put('/profesionales/:id/horarios', wrap(async (req, res) => {
  res.json(await profesionales.setHorarios(Number(req.params.id), req.body.horarios));
}));

// ---------- SERVICIOS ----------
router.get('/servicios', wrap(async (req, res) => {
  res.json(await servicios.listar());
}));
router.post('/servicios', wrap(async (req, res) => {
  res.status(201).json(await servicios.crear(req.body));
}));
router.get('/profesionales/:id/servicios', wrap(async (req, res) => {
  res.json(await servicios.porProfesional(Number(req.params.id)));
}));

// ---------- CLIENTES ----------
router.get('/clientes', wrap(async (req, res) => {
  res.json(await clientes.listar(req.query.q || null));
}));
router.post('/clientes', wrap(async (req, res) => {
  res.status(201).json(await clientes.crear(req.body));
}));

// ---------- DISPONIBILIDAD ----------
// GET /api/disponibilidad?profesionalId=1&servicioId=2&fecha=2026-08-05
router.get('/disponibilidad', wrap(async (req, res) => {
  const { profesionalId, servicioId, fecha } = req.query;
  if (!profesionalId || !servicioId || !fecha) {
    return res.status(400).json({ error: 'Faltan parámetros: profesionalId, servicioId, fecha' });
  }
  const slots = await calcularSlotsLibres(Number(profesionalId), Number(servicioId), fecha);
  res.json({ fecha, slots });
}));

// ---------- TURNOS ----------
router.get('/turnos', wrap(async (req, res) => {
  const { desde, hasta, profesionalId } = req.query;
  if (!desde || !hasta) {
    return res.status(400).json({ error: 'Faltan parámetros: desde, hasta' });
  }
  res.json(await listarTurnos({ desde, hasta, profesionalId: profesionalId ? Number(profesionalId) : null }));
}));
router.post('/turnos', wrap(async (req, res) => {
  res.status(201).json(await crearTurno(req.body));
}));
router.patch('/turnos/:id/estado', wrap(async (req, res) => {
  res.json(await cambiarEstado(Number(req.params.id), req.body.estado));
}));
router.put('/turnos/:id', wrap(async (req, res) => {
  res.json(await editarTurno(Number(req.params.id), req.body));
}));
router.delete('/turnos/:id', wrap(async (req, res) => {
  res.json(await eliminarTurno(Number(req.params.id)));
}));

// ---------- BLOQUEOS / AVISOS ----------
router.get('/bloqueos', wrap(async (req, res) => {
  const { desde, hasta } = req.query;
  if (!desde || !hasta) return res.status(400).json({ error: 'Faltan parámetros: desde, hasta' });
  res.json(await listarBloqueos({ desde, hasta }));
}));
router.post('/bloqueos', wrap(async (req, res) => {
  res.status(201).json(await crearBloqueo(req.body));
}));
router.delete('/bloqueos/:id', wrap(async (req, res) => {
  res.json(await eliminarBloqueo(Number(req.params.id)));
}));

export default router;
