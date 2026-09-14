import { describe, it, expect, beforeAll } from 'vitest';
import { api, auth, resetDB, crearDueno, proximoLunes } from './helpers.js';

describe('PANEL DE ADMINISTRACIÓN', () => {
  let h; // headers con token de dueño
  let servicioId, servicio2Id, profesionalId, bloqueoId, turnoId;
  const fecha = proximoLunes(); // fecha futura (lunes) para evitar slots del pasado

  beforeAll(async () => {
    await resetDB();
    const token = await crearDueno();
    h = auth(token);
  });

  // ── Servicios ─────────────────────────────────────────────────────────────

  describe('Servicios', () => {
    it('crea un servicio', async () => {
      const res = await api.post('/api/servicios').set(h)
        .send({ nombre: 'Corte de cabello', duracion_min: 30, precio: 5000 });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ nombre: 'Corte de cabello', duracion_min: 30, precio: 5000 });
      expect(res.body.id).toBeTypeOf('number');
      servicioId = res.body.id;
    });

    it('crea un segundo servicio con seña', async () => {
      const res = await api.post('/api/servicios').set(h)
        .send({ nombre: 'Coloración', duracion_min: 90, precio: 15000, sena_monto: 3000 });
      expect(res.status).toBe(201);
      expect(Number(res.body.sena_monto)).toBe(3000);
      servicio2Id = res.body.id;
    });

    it('lista todos los servicios', async () => {
      const res = await api.get('/api/servicios').set(h);
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(2);
      expect(res.body.map(s => s.nombre)).toContain('Corte de cabello');
    });

    it('401 al crear servicio sin autenticar', async () => {
      const res = await api.post('/api/servicios')
        .send({ nombre: 'Hack', duracion_min: 10, precio: 0 });
      expect(res.status).toBe(401);
    });
  });

  // ── Profesionales ─────────────────────────────────────────────────────────

  describe('Profesionales', () => {
    it('crea un profesional', async () => {
      const res = await api.post('/api/profesionales').set(h)
        .send({ nombre: 'Julia García', email: 'juli@test.com', color_agenda: '#b5573a' });
      expect(res.status).toBe(201);
      expect(res.body.nombre).toBe('Julia García');
      profesionalId = res.body.id;
    });

    it('lista los profesionales', async () => {
      const res = await api.get('/api/profesionales').set(h);
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1);
    });

    it('asigna servicios al profesional', async () => {
      const res = await api.put(`/api/profesionales/${profesionalId}/servicios`).set(h)
        .send({ servicioIds: [servicioId, servicio2Id] });
      expect(res.status).toBe(200);

      const check = await api.get(`/api/profesionales/${profesionalId}/servicios`).set(h);
      expect(check.body.length).toBe(2);
    });

    it('configura horarios laborales (lunes y martes 9-18)', async () => {
      const res = await api.put(`/api/profesionales/${profesionalId}/horarios`).set(h)
        .send({
          horarios: [
            { dia_semana: 1, hora_inicio: '09:00', hora_fin: '18:00' }, // lunes
            { dia_semana: 2, hora_inicio: '09:00', hora_fin: '18:00' }, // martes
          ],
        });
      expect(res.status).toBe(200);
      expect(res.body.horarios.length).toBe(2);
    });

    it('reemplaza los horarios al configurar de nuevo', async () => {
      const res = await api.put(`/api/profesionales/${profesionalId}/horarios`).set(h)
        .send({
          horarios: [{ dia_semana: 1, hora_inicio: '09:00', hora_fin: '18:00' }],
        });
      expect(res.status).toBe(200);
      expect(res.body.horarios.length).toBe(1);
    });
  });

  // ── Turnos desde el panel ─────────────────────────────────────────────────

  describe('Turnos (panel interno)', () => {
    let clienteId;

    it('crea un cliente', async () => {
      const res = await api.post('/api/clientes').set(h)
        .send({ nombre: 'Ana Pérez', telefono: '1155550001', email: 'ana@test.com' });
      expect(res.status).toBe(201);
      clienteId = res.body.id;
    });

    it('crea un turno interno para el lunes', async () => {
      // Primer slot disponible: 09:00 en el próximo lunes
      const res = await api.post('/api/turnos').set(h).send({
        clienteId,
        profesionalId,
        servicioId,
        inicio: `${fecha} 09:00:00`,
      });
      expect(res.status).toBe(201);
      expect(res.body.estado).toBe('pendiente');
      turnoId = res.body.id;
    });

    it('lista los turnos del día', async () => {
      const res = await api.get(`/api/turnos?desde=${fecha}&hasta=${fecha} 23:59:59`).set(h);
      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
      expect(res.body[0]).toHaveProperty('cliente');
      expect(res.body[0]).toHaveProperty('servicio');
    });

    it('confirma el turno', async () => {
      const res = await api.patch(`/api/turnos/${turnoId}/estado`).set(h)
        .send({ estado: 'confirmado' });
      expect(res.status).toBe(200);
      expect(res.body.estado).toBe('confirmado');
    });

    it('rechaza un estado inválido', async () => {
      const res = await api.patch(`/api/turnos/${turnoId}/estado`).set(h)
        .send({ estado: 'volando' });
      expect(res.status).toBe(400);
    });

    it('cancela el turno', async () => {
      const res = await api.patch(`/api/turnos/${turnoId}/estado`).set(h)
        .send({ estado: 'cancelado' });
      expect(res.status).toBe(200);
      expect(res.body.estado).toBe('cancelado');
    });

    it('rechaza un turno en slot ya ocupado', async () => {
      // Primero creamos uno válido en 10:00
      const ok = await api.post('/api/turnos').set(h).send({
        clienteId, profesionalId, servicioId,
        inicio: `${fecha} 10:00:00`,
      });
      expect(ok.status).toBe(201);

      // Intentamos crear otro en el mismo slot
      const dup = await api.post('/api/turnos').set(h).send({
        clienteId, profesionalId, servicioId,
        inicio: `${fecha} 10:00:00`,
      });
      expect(dup.status).toBe(400);
      expect(dup.body.error).toMatch(/no está disponible/i);
    });

    it('elimina un turno', async () => {
      const crearRes = await api.post('/api/turnos').set(h).send({
        clienteId, profesionalId, servicioId,
        inicio: `${fecha} 11:00:00`,
      });
      const id = crearRes.body.id;
      const del = await api.delete(`/api/turnos/${id}`).set(h);
      expect(del.status).toBe(200);
      expect(del.body.eliminado).toBe(true);
    });
  });

  // ── Bloqueos / Avisos / Cierres ───────────────────────────────────────────

  describe('Bloqueos y cierres', () => {
    it('crea un cierre de local (bloqueo sin profesional)', async () => {
      const res = await api.post('/api/bloqueos').set(h).send({
        inicio: `${fecha} 14:00:00`,
        fin:    `${fecha} 16:00:00`,
        motivo: 'Reunión de personal',
      });
      expect(res.status).toBe(201);
      expect(res.body.motivo).toBe('Reunión de personal');
      expect(res.body.profesionalId).toBeNull();
      bloqueoId = res.body.id;
    });

    it('crea un bloqueo para un profesional puntual', async () => {
      const res = await api.post('/api/bloqueos').set(h).send({
        profesionalId,
        inicio: `${fecha} 16:00:00`,
        fin:    `${fecha} 18:00:00`,
        motivo: 'Turno particular',
      });
      expect(res.status).toBe(201);
      expect(res.body.profesionalId).toBe(profesionalId);
    });

    it('lista los bloqueos del día', async () => {
      const res = await api.get(`/api/bloqueos?desde=${fecha}&hasta=${fecha} 23:59:59`).set(h);
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(2);
    });

    it('rechaza bloqueo con fin anterior al inicio', async () => {
      const res = await api.post('/api/bloqueos').set(h).send({
        inicio: `${fecha} 16:00:00`,
        fin:    `${fecha} 14:00:00`,
      });
      expect(res.status).toBe(400);
    });

    it('elimina un bloqueo', async () => {
      const res = await api.delete(`/api/bloqueos/${bloqueoId}`).set(h);
      expect(res.status).toBe(200);
      expect(res.body.eliminado).toBe(true);
    });

    it('devuelve 400 al eliminar un bloqueo inexistente', async () => {
      const res = await api.delete('/api/bloqueos/99999').set(h);
      expect(res.status).toBe(400);
    });
  });

  // ── Clientes ──────────────────────────────────────────────────────────────

  describe('Clientes', () => {
    it('lista los clientes', async () => {
      const res = await api.get('/api/clientes').set(h);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('busca clientes por nombre', async () => {
      const res = await api.get('/api/clientes?q=Ana').set(h);
      expect(res.status).toBe(200);
      expect(res.body.some(c => c.nombre.includes('Ana'))).toBe(true);
    });
  });
});
