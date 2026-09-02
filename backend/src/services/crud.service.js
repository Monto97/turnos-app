import { pool } from '../config/db.js';

// ============================================================
//  CRUD genérico para las entidades de configuración.
//  Mantiene el código DRY: en vez de repetir la misma lógica
//  para cada tabla, centralizamos las operaciones comunes.
// ============================================================

// --- PROFESIONALES ---
export const profesionales = {
  listar: async () => {
    const [rows] = await pool.query(
      'SELECT * FROM profesionales WHERE activo = TRUE ORDER BY nombre'
    );
    return rows;
  },
  crear: async ({ nombre, email = null, telefono = null, color_agenda = '#4f46e5' }) => {
    const [r] = await pool.query(
      'INSERT INTO profesionales (nombre, email, telefono, color_agenda) VALUES (?, ?, ?, ?)',
      [nombre, email, telefono, color_agenda]
    );
    return { id: r.insertId, nombre, email, telefono, color_agenda };
  },
  // Asocia servicios que ofrece un profesional.
  asignarServicios: async (profesionalId, servicioIds) => {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query('DELETE FROM profesional_servicio WHERE profesional_id = ?', [profesionalId]);
      for (const sid of servicioIds) {
        await conn.query(
          'INSERT INTO profesional_servicio (profesional_id, servicio_id) VALUES (?, ?)',
          [profesionalId, sid]
        );
      }
      await conn.commit();
      return { profesionalId, servicios: servicioIds };
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  },
  // Define los horarios laborales (reemplaza los existentes).
  setHorarios: async (profesionalId, horarios) => {
    // horarios: [{ dia_semana, hora_inicio, hora_fin }, ...]
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query('DELETE FROM horarios_laborales WHERE profesional_id = ?', [profesionalId]);
      for (const h of horarios) {
        await conn.query(
          `INSERT INTO horarios_laborales (profesional_id, dia_semana, hora_inicio, hora_fin)
           VALUES (?, ?, ?, ?)`,
          [profesionalId, h.dia_semana, h.hora_inicio, h.hora_fin]
        );
      }
      await conn.commit();
      return { profesionalId, horarios };
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  },
};

// --- SERVICIOS ---
export const servicios = {
  listar: async () => {
    const [rows] = await pool.query(
      'SELECT * FROM servicios WHERE activo = TRUE ORDER BY nombre'
    );
    return rows;
  },
  crear: async ({ nombre, duracion_min, precio = 0, sena_monto = 0 }) => {
    const [r] = await pool.query(
      'INSERT INTO servicios (nombre, duracion_min, precio, sena_monto) VALUES (?, ?, ?, ?)',
      [nombre, duracion_min, precio, sena_monto]
    );
    return { id: r.insertId, nombre, duracion_min, precio, sena_monto };
  },
  // Servicios que ofrece un profesional puntual.
  porProfesional: async (profesionalId) => {
    const [rows] = await pool.query(
      `SELECT s.* FROM servicios s
         JOIN profesional_servicio ps ON ps.servicio_id = s.id
        WHERE ps.profesional_id = ? AND s.activo = TRUE
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
      const [rows] = await pool.query(
        'SELECT * FROM clientes WHERE nombre LIKE ? OR telefono LIKE ? ORDER BY nombre LIMIT 50',
        [like, like]
      );
      return rows;
    }
    const [rows] = await pool.query('SELECT * FROM clientes ORDER BY creado_en DESC LIMIT 50');
    return rows;
  },
  crear: async ({ nombre, telefono = null, email = null, notas = null }) => {
    const [r] = await pool.query(
      'INSERT INTO clientes (nombre, telefono, email, notas) VALUES (?, ?, ?, ?)',
      [nombre, telefono, email, notas]
    );
    return { id: r.insertId, nombre, telefono, email, notas };
  },
};
