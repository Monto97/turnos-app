import { pool } from '../config/db.js';
import { calcularSlotsLibres } from './disponibilidad.service.js';

// Suma minutos a una fecha/hora 'YYYY-MM-DD HH:mm:ss' y devuelve
// el mismo formato.
function sumarMinutos(fechaHora, minutos) {
  const [fecha, hora] = fechaHora.split(' ');
  const [anio, mes, dia] = fecha.split('-').map(Number);
  const [h, m] = hora.split(':').map(Number);
  const d = new Date(anio, mes - 1, dia, h, m + minutos);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
         `${p(d.getHours())}:${p(d.getMinutes())}:00`;
}

/**
 * Crea un turno validando que el horario siga libre.
 * Evita la "condición de carrera": dos personas reservando el mismo
 * slot casi al mismo tiempo. Por eso revalidamos dentro de una
 * transacción antes de insertar.
 */
export async function crearTurno({
  clienteId, profesionalId, servicioId, inicio, origen = 'interno', notas = null,
}) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Traemos duración, precio y seña del servicio (snapshot).
    const [servicios] = await conn.query(
      'SELECT duracion_min, precio, sena_monto FROM servicios WHERE id = ? AND activo = TRUE',
      [servicioId]
    );
    if (servicios.length === 0) throw new Error('Servicio no encontrado o inactivo');
    const { duracion_min, precio, sena_monto } = servicios[0];

    const fin = sumarMinutos(inicio, duracion_min);
    const fecha = inicio.split(' ')[0];
    const horaInicio = inicio.split(' ')[1].slice(0, 5); // 'HH:mm'

    // Revalidar disponibilidad: el slot pedido debe estar en la lista de libres.
    const libres = await calcularSlotsLibres(profesionalId, servicioId, fecha);
    if (!libres.includes(horaInicio)) {
      throw new Error('El horario seleccionado ya no está disponible');
    }

    const [result] = await conn.query(
      `INSERT INTO turnos
        (cliente_id, profesional_id, servicio_id, inicio, fin, estado,
         sena_requerida, sena_pagada, precio_snapshot, origen, notas)
       VALUES (?, ?, ?, ?, ?, 'pendiente', ?, FALSE, ?, ?, ?)`,
      [clienteId, profesionalId, servicioId, inicio, fin, sena_monto, precio, origen, notas]
    );

    await conn.commit();
    return { id: result.insertId, inicio, fin, estado: 'pendiente' };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/** Lista turnos en un rango de fechas, con datos de cliente/servicio para la agenda. */
export async function listarTurnos({ desde, hasta, profesionalId = null }) {
  let sql = `
    SELECT t.id, t.inicio, t.fin, t.estado, t.origen,
           t.sena_requerida, t.sena_pagada, t.precio_snapshot,
           c.nombre AS cliente, c.telefono AS cliente_tel,
           s.nombre AS servicio, s.duracion_min,
           p.nombre AS profesional, p.color_agenda
      FROM turnos t
      JOIN clientes c      ON c.id = t.cliente_id
      JOIN servicios s     ON s.id = t.servicio_id
      JOIN profesionales p ON p.id = t.profesional_id
     WHERE t.inicio >= ? AND t.inicio < ?`;
  const params = [desde, hasta];
  if (profesionalId) {
    sql += ' AND t.profesional_id = ?';
    params.push(profesionalId);
  }
  sql += ' ORDER BY t.inicio';
  const [rows] = await pool.query(sql, params);
  return rows;
}

/** Cambia el estado de un turno (confirmar, cancelar, marcar ausente, etc.). */
export async function cambiarEstado(turnoId, estado) {
  const validos = ['pendiente', 'confirmado', 'cancelado', 'completado', 'ausente'];
  if (!validos.includes(estado)) throw new Error('Estado inválido');
  const [r] = await pool.query('UPDATE turnos SET estado = ? WHERE id = ?', [estado, turnoId]);
  if (r.affectedRows === 0) throw new Error('Turno no encontrado');
  return { id: turnoId, estado };
}

/**
 * Edita un turno: permite moverlo de horario y/o cambiar el servicio.
 * Revalida disponibilidad excluyendo el propio turno (si no, chocaría
 * consigo mismo). Útil para reprogramar arrastrando en el calendario.
 */
export async function editarTurno(turnoId, { profesionalId, servicioId, inicio }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Traemos el turno actual para saber qué cambia.
    const [actuales] = await conn.query('SELECT * FROM turnos WHERE id = ?', [turnoId]);
    if (actuales.length === 0) throw new Error('Turno no encontrado');
    const actual = actuales[0];

    // Valores nuevos (o los actuales si no se mandan).
    const nuevoProf = profesionalId ?? actual.profesional_id;
    const nuevoServ = servicioId ?? actual.servicio_id;
    const nuevoInicio = inicio ?? actual.inicio;

    const [servicios] = await conn.query(
      'SELECT duracion_min, precio, sena_monto FROM servicios WHERE id = ? AND activo = TRUE',
      [nuevoServ]
    );
    if (servicios.length === 0) throw new Error('Servicio no encontrado o inactivo');
    const { duracion_min, precio, sena_monto } = servicios[0];

    const nuevoFin = sumarMinutos(nuevoInicio, duracion_min);
    const fecha = nuevoInicio.split(' ')[0];
    const horaInicio = nuevoInicio.split(' ')[1].slice(0, 5);

    // Revalidar disponibilidad EXCLUYENDO este turno del cálculo.
    const libres = await calcularSlotsLibres(nuevoProf, nuevoServ, fecha, 15, turnoId);
    if (!libres.includes(horaInicio)) {
      throw new Error('El nuevo horario no está disponible');
    }

    await conn.query(
      `UPDATE turnos
          SET profesional_id = ?, servicio_id = ?, inicio = ?, fin = ?,
              sena_requerida = ?, precio_snapshot = ?
        WHERE id = ?`,
      [nuevoProf, nuevoServ, nuevoInicio, nuevoFin, sena_monto, precio, turnoId]
    );

    await conn.commit();
    return { id: turnoId, profesionalId: nuevoProf, servicioId: nuevoServ, inicio: nuevoInicio, fin: nuevoFin };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/** Elimina un turno de forma definitiva. */
export async function eliminarTurno(turnoId) {
  const [r] = await pool.query('DELETE FROM turnos WHERE id = ?', [turnoId]);
  if (r.affectedRows === 0) throw new Error('Turno no encontrado');
  return { id: turnoId, eliminado: true };
}

// ============================================================
//  BLOQUEOS / AVISOS (cerrado tal día, vacaciones, feriados)
// ============================================================

export async function listarBloqueos({ desde, hasta }) {
  const [rows] = await pool.query(
    `SELECT b.id, b.profesional_id, b.inicio, b.fin, b.motivo,
            p.nombre AS profesional
       FROM bloqueos b
       LEFT JOIN profesionales p ON p.id = b.profesional_id
      WHERE b.inicio < ? AND b.fin > ?
      ORDER BY b.inicio`,
    [hasta, desde]
  );
  return rows;
}

export async function crearBloqueo({ profesionalId = null, inicio, fin, motivo = null }) {
  if (!inicio || !fin) throw new Error('Faltan inicio y fin del bloqueo');
  if (new Date(fin) <= new Date(inicio)) throw new Error('El fin debe ser posterior al inicio');
  const [r] = await pool.query(
    'INSERT INTO bloqueos (profesional_id, inicio, fin, motivo) VALUES (?, ?, ?, ?)',
    [profesionalId, inicio, fin, motivo]
  );
  return { id: r.insertId, profesionalId, inicio, fin, motivo };
}

export async function eliminarBloqueo(bloqueoId) {
  const [r] = await pool.query('DELETE FROM bloqueos WHERE id = ?', [bloqueoId]);
  if (r.affectedRows === 0) throw new Error('Bloqueo no encontrado');
  return { id: bloqueoId, eliminado: true };
}
