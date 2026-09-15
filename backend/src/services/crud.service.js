import { pool } from '../config/db.js';

// --- PROFESIONALES ---
export const profesionales = {
  listar: async () => {
    const { rows } = await pool.query(
      'SELECT * FROM profesionales WHERE activo = TRUE ORDER BY nombre'
    );
    return rows;
  },
  crear: async ({ nombre, email = null, telefono = null, color_agenda = '#4f46e5' }) => {
    const { rows: [r] } = await pool.query(
      'INSERT INTO profesionales (nombre, email, telefono, color_agenda) VALUES ($1, $2, $3, $4) RETURNING id',
      [nombre, email, telefono, color_agenda]
    );
    return { id: r.id, nombre, email, telefono, color_agenda };
  },
  asignarServicios: async (profesionalId, servicioIds) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM profesional_servicio WHERE profesional_id = $1', [profesionalId]);
      for (const sid of servicioIds) {
        await client.query(
          'INSERT INTO profesional_servicio (profesional_id, servicio_id) VALUES ($1, $2)',
          [profesionalId, sid]
        );
      }
      await client.query('COMMIT');
      return { profesionalId, servicios: servicioIds };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  },
  setHorarios: async (profesionalId, horarios) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM horarios_laborales WHERE profesional_id = $1', [profesionalId]);
      for (const h of horarios) {
        await client.query(
          `INSERT INTO horarios_laborales (profesional_id, dia_semana, hora_inicio, hora_fin)
           VALUES ($1, $2, $3, $4)`,
          [profesionalId, h.dia_semana, h.hora_inicio, h.hora_fin]
        );
      }
      await client.query('COMMIT');
      return { profesionalId, horarios };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  },
};

// --- SERVICIOS ---
export const servicios = {
  listar: async () => {
    const { rows } = await pool.query(
      'SELECT * FROM servicios WHERE activo = TRUE ORDER BY nombre'
    );
    return rows;
  },
  crear: async ({ nombre, duracion_min, precio = 0, sena_monto = 0 }) => {
    const { rows: [r] } = await pool.query(
      'INSERT INTO servicios (nombre, duracion_min, precio, sena_monto) VALUES ($1, $2, $3, $4) RETURNING id',
      [nombre, duracion_min, precio, sena_monto]
    );
    return { id: r.id, nombre, duracion_min, precio, sena_monto };
  },
  porProfesional: async (profesionalId) => {
    const { rows } = await pool.query(
      `SELECT s.* FROM servicios s
         JOIN profesional_servicio ps ON ps.servicio_id = s.id
        WHERE ps.profesional_id = $1 AND s.activo = TRUE
        ORDER BY s.nombre`,
      [profesionalId]
    );
    return rows;
  },
};

// --- CLIENTES ---
export const clientes = {
  listar: async (busqueda = null) => {
    if (busqueda) {
      const like = `%${busqueda}%`;
      const { rows } = await pool.query(
        'SELECT * FROM clientes WHERE nombre ILIKE $1 OR telefono ILIKE $1 ORDER BY nombre LIMIT 50',
        [like]
      );
      return rows;
    }
    const { rows } = await pool.query('SELECT * FROM clientes ORDER BY creado_en DESC LIMIT 50');
    return rows;
  },
  crear: async ({ nombre, telefono = null, email = null, notas = null }) => {
    const { rows: [r] } = await pool.query(
      'INSERT INTO clientes (nombre, telefono, email, notas) VALUES ($1, $2, $3, $4) RETURNING id',
      [nombre, telefono, email, notas]
    );
    return { id: r.id, nombre, telefono, email, notas };
  },
};
