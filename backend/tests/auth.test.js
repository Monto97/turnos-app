import { describe, it, expect, beforeAll } from 'vitest';
import { api, auth, resetDB, crearDueno, crearCliente } from './helpers.js';

describe('AUTH', () => {
  let tokenDueno;
  let tokenCliente;

  beforeAll(async () => {
    await resetDB();
    tokenDueno  = await crearDueno();
    tokenCliente = await crearCliente();
  });

  // ── Login ──────────────────────────────────────────────────────────────────

  describe('Login', () => {
    it('devuelve token con credenciales válidas de dueño', async () => {
      const res = await api.post('/api/auth/login')
        .send({ email: 'dueno@test.com', password: 'Test1234!' });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('token');
      expect(res.body.usuario.rol).toBe('dueno');
    });

    it('devuelve token con credenciales válidas de cliente', async () => {
      const res = await api.post('/api/auth/login')
        .send({ email: 'cliente@test.com', password: 'Test1234!' });
      expect(res.status).toBe(200);
      expect(res.body.usuario.rol).toBe('cliente');
    });

    it('rechaza contraseña incorrecta', async () => {
      const res = await api.post('/api/auth/login')
        .send({ email: 'dueno@test.com', password: 'incorrecta' });
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('rechaza email inexistente', async () => {
      const res = await api.post('/api/auth/login')
        .send({ email: 'nadie@test.com', password: 'Test1234!' });
      expect(res.status).toBe(400);
    });

    it('rechaza registro con email duplicado', async () => {
      const res = await api.post('/api/auth/registro').send({
        nombre: 'Otro', apellido: 'X',
        email: 'dueno@test.com', password: 'Test1234!',
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/ya existe/i);
    });

    it('rechaza registro con contraseña corta', async () => {
      const res = await api.post('/api/auth/registro').send({
        nombre: 'Nuevo', apellido: 'X',
        email: 'nuevo@test.com', password: '123',
      });
      expect(res.status).toBe(400);
    });
  });

  // ── /me ───────────────────────────────────────────────────────────────────

  describe('GET /api/auth/me', () => {
    it('devuelve datos del usuario logueado', async () => {
      const res = await api.get('/api/auth/me').set(auth(tokenDueno));
      expect(res.status).toBe(200);
      expect(res.body.email).toBe('dueno@test.com');
      expect(res.body).not.toHaveProperty('password_hash');
    });

    it('401 sin token', async () => {
      const res = await api.get('/api/auth/me');
      expect(res.status).toBe(401);
    });

    it('401 con token inválido', async () => {
      const res = await api.get('/api/auth/me').set(auth('token.falso.abc'));
      expect(res.status).toBe(401);
    });
  });

  // ── Guards de rol ─────────────────────────────────────────────────────────

  describe('Guards de rol en el panel', () => {
    it('401 al acceder al panel sin token', async () => {
      const res = await api.get('/api/servicios');
      expect(res.status).toBe(401);
    });

    it('403 cuando un cliente intenta acceder al panel de dueño', async () => {
      const res = await api.get('/api/servicios').set(auth(tokenCliente));
      expect(res.status).toBe(403);
    });

    it('200 cuando el dueño accede al panel', async () => {
      const res = await api.get('/api/servicios').set(auth(tokenDueno));
      expect(res.status).toBe(200);
    });
  });
});
