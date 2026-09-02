import { pool } from '../config/db.js';
import { calcularSlotsLibres } from './disponibilidad.service.js';

// ============================================================
//  RESERVA PÚBLICA (lado del cliente, sin login)
// ============================================================

/**
 * Devuelve los profesionales que ofrecen un servicio dado.
 * Si ninguno tiene el servicio asignado explícitamente, devolvemos
 * todos los activos (peluquería chica donde todos hacen de todo).
 */
export async function profesionalesDeServicio(servicioId) {
  const [rows] = await pool.query(
    `SELECT p.id, p.nombre, p.color_agenda
       FROM profesionales p
       JOIN profesional_servicio ps ON ps.profesional_id = p.id
      WHERE ps.servicio_id = ? AND p.activo = TRUE
      ORDER BY p.nombre`,
    [servicioId]
  );
  if (rows.length > 0) return rows;

  const [todos] = await pool.query(
    'SELECT id, nombre, color_agenda FROM profesionales WHERE activo = TRUE ORDER BY nombre'
  );
  return todos;
}

/**
 * Disponibilidad "cualquiera disponible": junta los slots libres de
 * TODOS los profesionales que hacen el servicio, y para cada horario
 * recuerda qué profesionales lo tienen libre. Así, cuando el cliente
 * elige un horario, asignamos un profesional automáticamente.
 *
 * Devuelve: [{ hora: '09:00', profesionales: [1,3] }, ...]
 */
export async function disponibilidadCualquiera(servicioId, fecha) {
  const profs = await profesionalesDeServicio(servicioId);
  const mapa = new Map(); // hora -> Set(profesionalId)

  for (const p of profs) {
    const slots = await calcularSlotsLibres(p.id, servicioId, fecha);
    for (const h of slots) {
      if (!mapa.has(h)) mapa.set(h, new Set());
      mapa.get(h).add(p.id);
    }
  }

  return [...mapa.entries()]
    .map(([hora, set]) => ({ hora, profesionales: [...set] }))
    .sort((a, b) => a.hora.localeCompare(b.hora));
}

/**
 * Crea la reserva desde el lado público. A diferencia del alta interna:
 *  - Crea o reutiliza el cliente por teléfono/email.
 *  - Si no viene profesionalId (caso "cualquiera"), elige uno libre.
 *  - Marca origen='online'.
 *  - Deja el turno en 'pendiente' (se confirma al pagar la seña, o a mano).
 */
export async function reservaPublica({
  servicioId, profesionalId = null, fecha, hora, cliente, usuarioId = null,
}) {
  if (!servicioId || !fecha || !hora || !cliente?.nombre) {
    throw new Error('Faltan datos para la reserva');
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Datos del servicio (duración, precio, seña).
    const [servicios] = await conn.query(
      'SELECT nombre, duracion_min, precio, sena_monto FROM servicios WHERE id = ? AND activo = TRUE',
      [servicioId]
    );
    if (servicios.length === 0) throw new Error('Servicio no encontrado o inactivo');
    const serv = servicios[0];

    // Si no eligió profesional, buscamos uno con ese horario libre.
    let profFinal = profesionalId;
    if (!profFinal) {
      const disp = await disponibilidadCualquiera(servicioId, fecha);
      const slot = disp.find((s) => s.hora === hora);
      if (!slot || slot.profesionales.length === 0) {
        throw new Error('Ese horario ya no está disponible');
      }
      profFinal = slot.profesionales[0]; // el primero libre
    }

    // Revalidar que el profesional elegido tenga ese slot libre.
    const libres = await calcularSlotsLibres(profFinal, servicioId, fecha);
    if (!libres.includes(hora)) {
      throw new Error('Ese horario ya no está disponible');
    }

    // Crear o reutilizar cliente.
    // Prioridad de identificación:
    //  1. Si hay usuario logueado, buscamos SU registro de cliente (usuario_id).
    //  2. Si no, por teléfono, y si no, por email.
    let clienteId;
    const tel = cliente.telefono?.trim() || null;
    const email = cliente.email?.trim().toLowerCase() || null;
    let existente = [];

    if (usuarioId) {
      [existente] = await conn.query(
        'SELECT id FROM clientes WHERE usuario_id = ? LIMIT 1', [usuarioId]
      );
    }
    if (existente.length === 0 && tel) {
      [existente] = await conn.query('SELECT id FROM clientes WHERE telefono = ? LIMIT 1', [tel]);
    }
    if (existente.length === 0 && email) {
      [existente] = await conn.query('SELECT id FROM clientes WHERE email = ? LIMIT 1', [email]);
    }

    if (existente.length > 0) {
      clienteId = existente[0].id;
      // Si el cliente existe pero no estaba vinculado y ahora hay usuario, lo vinculamos.
      if (usuarioId) {
        await conn.query(
          'UPDATE clientes SET usuario_id = ? WHERE id = ? AND usuario_id IS NULL',
          [usuarioId, clienteId]
        );
      }
    } else {
      const [r] = await conn.query(
        'INSERT INTO clientes (nombre, telefono, email, usuario_id) VALUES (?, ?, ?, ?)',
        [cliente.nombre.trim(), tel, email, usuarioId]
      );
      clienteId = r.insertId;
    }

    // Calcular fin.
    const [Y, M, D] = fecha.split('-').map(Number);
    const [hh, mm] = hora.split(':').map(Number);
    const dFin = new Date(Y, M - 1, D, hh, mm + serv.duracion_min);
    const p = (n) => String(n).padStart(2, '0');
    const inicio = `${fecha} ${hora}:00`;
    const fin = `${dFin.getFullYear()}-${p(dFin.getMonth() + 1)}-${p(dFin.getDate())} ${p(dFin.getHours())}:${p(dFin.getMinutes())}:00`;

    const [result] = await conn.query(
      `INSERT INTO turnos
        (cliente_id, profesional_id, servicio_id, inicio, fin, estado,
         sena_requerida, sena_pagada, precio_snapshot, origen)
       VALUES (?, ?, ?, ?, ?, 'pendiente', ?, FALSE, ?, 'online')`,
      [clienteId, profFinal, servicioId, inicio, fin, serv.sena_monto, serv.precio]
    );

    await conn.commit();
    return {
      turnoId: result.insertId,
      inicio, fin,
      servicio: serv.nombre,
      precio: serv.precio,
      sena: serv.sena_monto,
      profesionalId: profFinal,
      requierePago: serv.sena_monto > 0,
    };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/** Datos públicos de un turno (para la pantalla de confirmación). */
export async function turnoPublico(turnoId) {
  const [rows] = await pool.query(
    `SELECT t.id, t.inicio, t.fin, t.estado, t.sena_requerida, t.sena_pagada,
            t.precio_snapshot, s.nombre AS servicio, p.nombre AS profesional,
            c.nombre AS cliente
       FROM turnos t
       JOIN servicios s ON s.id = t.servicio_id
       JOIN profesionales p ON p.id = t.profesional_id
       JOIN clientes c ON c.id = t.cliente_id
      WHERE t.id = ?`,
    [turnoId]
  );
  if (rows.length === 0) throw new Error('Turno no encontrado');
  return rows[0];
}

/**
 * Turnos de un usuario cliente (su historial). Busca todos los registros
 * de cliente vinculados a su cuenta y trae sus turnos.
 */
export async function misTurnos(usuarioId) {
  const [rows] = await pool.query(
    `SELECT t.id, t.inicio, t.fin, t.estado, t.sena_requerida, t.sena_pagada,
            t.precio_snapshot, s.nombre AS servicio, p.nombre AS profesional
       FROM turnos t
       JOIN clientes c ON c.id = t.cliente_id
       JOIN servicios s ON s.id = t.servicio_id
       JOIN profesionales p ON p.id = t.profesional_id
      WHERE c.usuario_id = ?
      ORDER BY t.inicio DESC`,
    [usuarioId]
  );
  return rows;
}

/**
 * Cancela un turno, pero solo si pertenece al usuario que lo pide.
 * Verifica la propiedad antes de cancelar (autorización a nivel de dato).
 */
export async function cancelarMiTurno(usuarioId, turnoId) {
  const [rows] = await pool.query(
    `SELECT t.id FROM turnos t
       JOIN clientes c ON c.id = t.cliente_id
      WHERE t.id = ? AND c.usuario_id = ?`,
    [turnoId, usuarioId]
  );
  if (rows.length === 0) throw new Error('Turno no encontrado o no te pertenece');
  await pool.query(`UPDATE turnos SET estado = 'cancelado' WHERE id = ?`, [turnoId]);
  return { turnoId, estado: 'cancelado' };
}
