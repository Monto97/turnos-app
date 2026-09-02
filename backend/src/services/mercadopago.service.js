import { pool } from '../config/db.js';

// ============================================================
//  MERCADO PAGO - Checkout Pro
// ============================================================
//  Patrón: creamos una "preferencia" con los datos del pago (la seña),
//  MP devuelve una URL (init_point) a la que redirigimos al cliente.
//  Al pagar, MP nos avisa por webhook y confirmamos el turno.
//
//  Si NO hay MP_ACCESS_TOKEN configurado, entra en "modo simulación":
//  genera una URL interna de pago falso para poder probar TODO el flujo
//  sin credenciales. Cuando pongas tu token de prueba, cobra de verdad
//  (en sandbox).
// ============================================================

const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN || '';
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:4200';

// Import perezoso del SDK: solo si hay token, para no romper si no está instalado.
let MercadoPagoConfig, Preference, Payment;
async function cargarSDK() {
  if (!MercadoPagoConfig) {
    const mp = await import('mercadopago');
    MercadoPagoConfig = mp.MercadoPagoConfig;
    Preference = mp.Preference;
    Payment = mp.Payment;
  }
}

/**
 * Crea la preferencia de pago para la seña de un turno.
 * Devuelve { url } donde redirigir al cliente.
 */
export async function crearPreferenciaSena(turnoId) {
  // Traemos el turno y su seña.
  const [rows] = await pool.query(
    `SELECT t.id, t.sena_requerida, t.estado, s.nombre AS servicio, c.email AS cliente_email
       FROM turnos t
       JOIN servicios s ON s.id = t.servicio_id
       JOIN clientes c ON c.id = t.cliente_id
      WHERE t.id = ?`,
    [turnoId]
  );
  if (rows.length === 0) throw new Error('Turno no encontrado');
  const turno = rows[0];
  if (Number(turno.sena_requerida) <= 0) {
    throw new Error('Este turno no requiere seña');
  }

  // --- MODO SIMULACIÓN (sin token) ---
  if (!ACCESS_TOKEN) {
    // Devolvemos una URL interna del frontend que simula el checkout.
    const url = `${FRONTEND_URL}/pago-simulado?turno=${turnoId}&monto=${turno.sena_requerida}`;
    return { url, simulado: true };
  }

  // --- MODO REAL (Checkout Pro) ---
  await cargarSDK();
  const client = new MercadoPagoConfig({ accessToken: ACCESS_TOKEN });
  const preference = new Preference(client);

  const body = {
    items: [{
      id: String(turnoId),
      title: `Seña - ${turno.servicio}`,
      quantity: 1,
      unit_price: Number(turno.sena_requerida),
      currency_id: 'ARS',
    }],
    // external_reference nos permite saber a qué turno corresponde el pago.
    external_reference: String(turnoId),
    payer: turno.cliente_email ? { email: turno.cliente_email } : undefined,
    back_urls: {
      success: `${FRONTEND_URL}/reserva-confirmada?turno=${turnoId}`,
      failure: `${FRONTEND_URL}/reserva-confirmada?turno=${turnoId}&estado=fallo`,
      pending: `${FRONTEND_URL}/reserva-confirmada?turno=${turnoId}&estado=pendiente`,
    },
    auto_return: 'approved',
    // Webhook donde MP nos notifica el pago.
    notification_url: `${BACKEND_URL}/api/publico/mp-webhook`,
  };

  const res = await preference.create({ body });
  return { url: res.init_point, simulado: false, preferenceId: res.id };
}

/**
 * Marca la seña como pagada y confirma el turno.
 * Se llama desde el webhook (pago real) o desde el pago simulado.
 */
export async function confirmarPagoSena(turnoId) {
  const [r] = await pool.query(
    `UPDATE turnos SET sena_pagada = TRUE, estado = 'confirmado'
      WHERE id = ? AND estado <> 'cancelado'`,
    [turnoId]
  );
  if (r.affectedRows === 0) throw new Error('No se pudo confirmar el turno');
  return { turnoId, confirmado: true };
}

/**
 * Procesa la notificación (webhook) de Mercado Pago.
 * MP manda el id del pago; consultamos su estado y, si está aprobado,
 * confirmamos el turno usando el external_reference.
 */
export async function procesarWebhook(query, body) {
  if (!ACCESS_TOKEN) return { ignorado: true };

  // MP puede notificar de varias formas; nos interesa el pago.
  const tipo = query.type || body?.type;
  const dataId = query['data.id'] || body?.data?.id;
  if (tipo !== 'payment' || !dataId) return { ignorado: true };

  await cargarSDK();
  const client = new MercadoPagoConfig({ accessToken: ACCESS_TOKEN });
  const payment = new Payment(client);
  const info = await payment.get({ id: dataId });

  if (info.status === 'approved' && info.external_reference) {
    await confirmarPagoSena(Number(info.external_reference));
    return { confirmado: true };
  }
  return { status: info.status };
}
