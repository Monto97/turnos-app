import { pool } from '../config/db.js';

const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN || '';
const BACKEND_URL  = process.env.BACKEND_URL  || 'http://localhost:3000';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:4200';

let MercadoPagoConfig, Preference, Payment;
async function cargarSDK() {
  if (!MercadoPagoConfig) {
    const mp = await import('mercadopago');
    MercadoPagoConfig = mp.MercadoPagoConfig;
    Preference = mp.Preference;
    Payment = mp.Payment;
  }
}

export async function crearPreferenciaSena(turnoId) {
  const { rows } = await pool.query(
    `SELECT t.id, t.sena_requerida, t.estado, s.nombre AS servicio, c.email AS cliente_email
       FROM turnos t
       JOIN servicios s ON s.id = t.servicio_id
       JOIN clientes c ON c.id = t.cliente_id
      WHERE t.id = $1`,
    [turnoId]
  );
  if (rows.length === 0) throw new Error('Turno no encontrado');
  const turno = rows[0];
  if (Number(turno.sena_requerida) <= 0) {
    throw new Error('Este turno no requiere seña');
  }

  if (!ACCESS_TOKEN) {
    const url = `${FRONTEND_URL}/pago-simulado?turno=${turnoId}&monto=${turno.sena_requerida}`;
    return { url, simulado: true };
  }

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
    external_reference: String(turnoId),
    payer: turno.cliente_email ? { email: turno.cliente_email } : undefined,
    back_urls: {
      success: `${FRONTEND_URL}/reserva-confirmada?turno=${turnoId}`,
      failure: `${FRONTEND_URL}/reserva-confirmada?turno=${turnoId}&estado=fallo`,
      pending: `${FRONTEND_URL}/reserva-confirmada?turno=${turnoId}&estado=pendiente`,
    },
    auto_return: 'approved',
    notification_url: `${BACKEND_URL}/api/publico/mp-webhook`,
  };

  const res = await preference.create({ body });
  return { url: res.init_point, simulado: false, preferenceId: res.id };
}

export async function confirmarPagoSena(turnoId) {
  const result = await pool.query(
    `UPDATE turnos SET sena_pagada = TRUE, estado = 'confirmado'
      WHERE id = $1 AND estado <> 'cancelado'`,
    [turnoId]
  );
  if (result.rowCount === 0) throw new Error('No se pudo confirmar el turno');
  return { turnoId, confirmado: true };
}

export async function procesarWebhook(query, body) {
  if (!ACCESS_TOKEN) return { ignorado: true };

  const tipo   = query.type || body?.type;
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
