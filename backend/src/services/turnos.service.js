import { pool } from '../config/db.js';
import { calcularSlotsLibres } from './disponibilidad.service.js';

function sumarMinutos(fechaHora, minutos) {
  const [fecha, hora] = fechaHora.split(' ');
  const [anio, mes, dia] = fecha.split('-').map(Number);
  const [h, m] = hora.split(':').map(Number);
  const d = new Date(anio, mes - 1, dia, h, m + minutos);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
         `${p(d.getHours())}:${p(d.getMinutes())}:00`;
}

export async function crearTurno({
  clienteId, profesionalId, servicioId, inicio, origen = 'interno', notas = null,
}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: servicios } = await client.query(
      'SELECT duracion_min, precio, sena_monto FROM servicios WHERE id = $1 AND activo = TRUE',
      [servicioId]
    );
    if (servicios.length === 0) throw new Error('Servicio no encontrado o inactivo');
    const { duracion_min, precio, sena_monto } = servicios[0];

    const fin = sumarMinutos(inicio, duracion_min);
    const fecha = inicio.split(' ')[0];
    const horaInicio = inicio.split(' ')[1].slice(0, 5);

    const libres = await calcularSlotsLibres(profesionalId, servicioId, fecha);
    if (!libres.includes(horaInicio)) {
      throw new Error('El horario seleccionado ya no está disponible');
    }

    const { rows: [result] } = await client.query(
      `INSERT INTO turnos
        (cliente_id, profesional_id, servicio_id, inicio, fin, estado,
         sena_requerida, sena_pagada, precio_snapshot, origen, notas)
       VALUES ($1, $2, $3, $4, $5, 'pendiente', $6, FALSE, $7, $8, $9)
       RETURNING id`,
      [clienteId, profesionalId, servicioId, inicio, fin, sena_monto, precio, origen, notas]
    );

    await client.query('COMMIT');
    return { id: result.id, inicio, fin, estado: 'pendiente' };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function listarTurnos({ desde, hasta, profesionalId = null }) {
  const params = [desde, hasta];
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
     WHERE t.inicio >= $1 AND t.inicio < $2`;

  if (profesionalId) {
    params.push(profesionalId);
    sql += ` AND t.profesional_id = $${params.length}`;
  }
  sql += ' ORDER BY t.inicio';

  const { rows } = await pool.query(sql, params);
  return rows;
}

export async function cambiarEstado(turnoId, estado) {
  const validos = ['pendiente', 'confirmado', 'cancelado', 'completado', 'ausente'];
  if (!validos.includes(estado)) throw new Error('Estado inválido');
  const result = await pool.query('UPDATE turnos SET estado = $1 WHERE id = $2', [estado, turnoId]);
  if (result.rowCount === 0) throw new Error('Turno no encontrado');
  return { id: turnoId, estado };
}

export async function editarTurno(turnoId, { profesionalId, servicioId, inicio }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: actuales } = await client.query('SELECT * FROM turnos WHERE id = $1', [turnoId]);
    if (actuales.length === 0) throw new Error('Turno no encontrado');
    const actual = actuales[0];

    const nuevoProf  = profesionalId ?? actual.profesional_id;
    const nuevoServ  = servicioId   ?? actual.servicio_id;
    const nuevoInicio = inicio      ?? actual.inicio;

    const { rows: servicios } = await client.query(
      'SELECT duracion_min, precio, sena_monto FROM servicios WHERE id = $1 AND activo = TRUE',
      [nuevoServ]
    );
    if (servicios.length === 0) throw new Error('Servicio no encontrado o inactivo');
    const { duracion_min, precio, sena_monto } = servicios[0];

    const nuevoFin  = sumarMinutos(nuevoInicio, duracion_min);
    const fecha     = nuevoInicio.split(' ')[0];
    const horaInicio = nuevoInicio.split(' ')[1].slice(0, 5);

    const libres = await calcularSlotsLibres(nuevoProf, nuevoServ, fecha, 15, turnoId);
    if (!libres.includes(horaInicio)) {
      throw new Error('El nuevo horario no está disponible');
    }

    await client.query(
      `UPDATE turnos
          SET profesional_id = $1, servicio_id = $2, inicio = $3, fin = $4,
              sena_requerida = $5, precio_snapshot = $6
        WHERE id = $7`,
      [nuevoProf, nuevoServ, nuevoInicio, nuevoFin, sena_monto, precio, turnoId]
    );

    await client.query('COMMIT');
    return { id: turnoId, profesionalId: nuevoProf, servicioId: nuevoServ, inicio: nuevoInicio, fin: nuevoFin };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function eliminarTurno(turnoId) {
  const result = await pool.query('DELETE FROM turnos WHERE id = $1', [turnoId]);
  if (result.rowCount === 0) throw new Error('Turno no encontrado');
  return { id: turnoId, eliminado: true };
}

export async function listarBloqueos({ desde, hasta }) {
  const { rows } = await pool.query(
    `SELECT b.id, b.profesional_id, b.inicio, b.fin, b.motivo,
            p.nombre AS profesional
       FROM bloqueos b
       LEFT JOIN profesionales p ON p.id = b.profesional_id
      WHERE b.inicio < $1 AND b.fin > $2
      ORDER BY b.inicio`,
    [hasta, desde]
  );
  return rows;
}

export async function crearBloqueo({ profesionalId = null, inicio, fin, motivo = null }) {
  if (!inicio || !fin) throw new Error('Faltan inicio y fin del bloqueo');
  if (new Date(fin) <= new Date(inicio)) throw new Error('El fin debe ser posterior al inicio');
  const { rows: [r] } = await pool.query(
    'INSERT INTO bloqueos (profesional_id, inicio, fin, motivo) VALUES ($1, $2, $3, $4) RETURNING id',
    [profesionalId, inicio, fin, motivo]
  );
  return { id: r.id, profesionalId, inicio, fin, motivo };
}

export async function eliminarBloqueo(bloqueoId) {
  const result = await pool.query('DELETE FROM bloqueos WHERE id = $1', [bloqueoId]);
  if (result.rowCount === 0) throw new Error('Bloqueo no encontrado');
  return { id: bloqueoId, eliminado: true };
}
