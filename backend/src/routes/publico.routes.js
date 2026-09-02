import { Router } from 'express';
import { servicios } from '../services/crud.service.js';
import { calcularSlotsLibres } from '../services/disponibilidad.service.js';
import { optionalAuth } from '../services/auth.service.js';
import {
  profesionalesDeServicio, disponibilidadCualquiera, reservaPublica, turnoPublico,
} from '../services/reserva.service.js';
import {
  crearPreferenciaSena, confirmarPagoSena, procesarWebhook,
} from '../services/mercadopago.service.js';

const router = Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

// Catálogo de servicios (público, para el paso 1).
router.get('/servicios', wrap(async (req, res) => {
  res.json(await servicios.listar());
}));

// Profesionales que hacen un servicio (paso 2).
router.get('/servicios/:id/profesionales', wrap(async (req, res) => {
  res.json(await profesionalesDeServicio(Number(req.params.id)));
}));

// Disponibilidad para un profesional puntual (paso 3).
router.get('/disponibilidad', wrap(async (req, res) => {
  const { servicioId, profesionalId, fecha } = req.query;
  if (!servicioId || !fecha) return res.status(400).json({ error: 'Faltan servicioId y fecha' });
  if (profesionalId) {
    const slots = await calcularSlotsLibres(Number(profesionalId), Number(servicioId), fecha);
    return res.json({ fecha, slots });
  }
  const disp = await disponibilidadCualquiera(Number(servicioId), fecha);
  res.json({ fecha, slots: disp.map((d) => d.hora), detalle: disp });
}));

// Crear la reserva (paso 4).
// optionalAuth: si el cliente está logueado, vinculamos el turno a su cuenta.
router.post('/reservar', optionalAuth, wrap(async (req, res) => {
  const usuarioId = req.usuario?.id || null;
  res.status(201).json(await reservaPublica({ ...req.body, usuarioId }));
}));

// Datos de un turno (pantalla de confirmación).
router.get('/turnos/:id', wrap(async (req, res) => {
  res.json(await turnoPublico(Number(req.params.id)));
}));

// Crea la preferencia de pago y devuelve la URL de checkout.
router.post('/pagar-sena/:turnoId', wrap(async (req, res) => {
  res.json(await crearPreferenciaSena(Number(req.params.turnoId)));
}));

// Confirmación del pago simulado (cuando no hay credenciales MP).
router.post('/confirmar-simulado/:turnoId', wrap(async (req, res) => {
  res.json(await confirmarPagoSena(Number(req.params.turnoId)));
}));

// Webhook de Mercado Pago (MP nos notifica el resultado del pago).
router.post('/mp-webhook', wrap(async (req, res) => {
  const resultado = await procesarWebhook(req.query, req.body);
  res.status(200).json(resultado); // siempre 200 para que MP no reintente en loop
}));

export default router;
