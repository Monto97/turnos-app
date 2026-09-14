import supertest from 'supertest';
import { app } from '../src/app.js';
import { pool } from '../src/config/db.js';

export const api = supertest(app);

// Retorna { Authorization: 'Bearer <token>' }
export function auth(token) {
  return { Authorization: `Bearer ${token}` };
}

// Obtiene token de un usuario por email/password
export async function getToken(email, password) {
  const res = await api.post('/api/auth/login').send({ email, password });
  if (!res.body.token) throw new Error(`Login falló para ${email}: ${JSON.stringify(res.body)}`);
  return res.body.token;
}

// Vacía todas las tablas (orden seguro por FK) entre tests
export async function resetDB() {
  const conn = await pool.getConnection();
  try {
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const t of [
      'recordatorios', 'turnos', 'bloqueos',
      'profesional_servicio', 'horarios_laborales',
      'clientes', 'profesionales', 'servicios',
      'password_resets', 'usuarios',
    ]) {
      await conn.query(`TRUNCATE TABLE ${t}`);
    }
    await conn.query('SET FOREIGN_KEY_CHECKS = 1');
  } finally {
    conn.release();
  }
}

// Registra un dueño de prueba y devuelve su token
export async function crearDueno({ email = 'dueno@test.com', password = 'Test1234!' } = {}) {
  const res = await api.post('/api/auth/registro').send({
    nombre: 'Admin', apellido: 'Test',
    email, password,
    codigoDueno: 'TEST-DUENO',
  });
  if (res.status !== 201) throw new Error(`No se pudo crear dueño: ${JSON.stringify(res.body)}`);
  return res.body.token;
}

// Registra un cliente de prueba y devuelve su token
export async function crearCliente({ email = 'cliente@test.com', password = 'Test1234!' } = {}) {
  const res = await api.post('/api/auth/registro').send({
    nombre: 'Cliente', apellido: 'Test',
    email, password,
  });
  if (res.status !== 201) throw new Error(`No se pudo crear cliente: ${JSON.stringify(res.body)}`);
  return res.body.token;
}

// Devuelve el próximo lunes en formato YYYY-MM-DD (fecha futura segura)
export function proximoLunes() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

// Crea un profesional con servicio y horario de lunes 9-18 vía API de admin
export async function seedBase(tokenDueno) {
  const h = auth(tokenDueno);

  const srvRes = await api.post('/api/servicios').set(h)
    .send({ nombre: 'Corte de cabello', duracion_min: 30, precio: 5000 });
  const servicioId = srvRes.body.id;

  const profRes = await api.post('/api/profesionales').set(h)
    .send({ nombre: 'Julia García', color_agenda: '#b5573a' });
  const profesionalId = profRes.body.id;

  await api.put(`/api/profesionales/${profesionalId}/servicios`).set(h)
    .send({ servicioIds: [servicioId] });

  // Lunes (dia_semana=1), 9:00–18:00
  await api.put(`/api/profesionales/${profesionalId}/horarios`).set(h)
    .send({ horarios: [{ dia_semana: 1, hora_inicio: '09:00', hora_fin: '18:00' }] });

  return { servicioId, profesionalId };
}
