import { pool } from '../config/db.js';
import { calcularSlotsLibres } from './disponibilidad.service.js';
import { enviarNotificacionReserva } from './email.service.js';

export async function profesionalesDeServicio(servicioId) {
  const { rows } = await pool.query(
    `SELECT p.id, p.nombre, p.color_agenda
       FROM profesionales p
       JOIN profesional_servicio ps ON ps.profesional_id = p.id
      WHERE ps.servicio_id = $1 AND p.activo = TRUE
      ORDER BY p.nombre`,
    [servicioId]
  );
  if (rows.length > 0) return rows;

  const { rows: todos } = await pool.query(
    'SELECT id, nombre, color_agenda FROM profesionales WHERE activo = TRUE ORDER BY nombre'
  );
  return todos;
}

export async function disponibilidadCualquiera(servicioId, fecha) {
  const profs = await profesionalesDeServicio(servicioId);
  const mapa = new Map();

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

export async function reservaPublica({
  servicioId, profesionalId = null, fecha, hora, cliente, usuarioId = null,
}) {
  if (!servicioId || !fecha || !hora || !cliente?.nombre) {
    throw new Error('Faltan datos para la reserva');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: servicios } = await client.query(
      'SELECT nombre, duracion_min, precio, sena_monto FROM servicios WHERE id = $1 AND activo = TRUE',
      [servicioId]
    );
    if (servicios.length === 0) throw new Error('Servicio no encontrado o inactivo');
    const serv = servicios[0];

    let profFinal = profesionalId;
    if (!profFinal) {
      const disp = await disponibilidadCualquiera(servicioId, fecha);
      const slot = disp.find((s) => s.hora === hora);
      if (!slot || slot.profesionales.length === 0) {
        throw new Error('Ese horario ya no está disponible');
      }
      profFinal = slot.profesionales[0];
    }

    const libres = await calcularSlotsLibres(profFinal, servicioId, fecha);
    if (!libres.includes(hora)) {
      throw new Error('Ese horario ya no está disponible');
    }

    const { rows: [profRow] } = await client.query('SELECT nombre FROM profesionales WHERE id = $1', [profFinal]);
    const nombreProfesional = profRow?.nombre || '';

    let clienteId;
    const tel = cliente.telefono?.trim() || null;
    const email = cliente.email?.trim().toLowerCase() || null;
    let existente = [];

    if (usuarioId) {
      const { rows } = await client.query('SELECT id FROM clientes WHERE usuario_id = $1 LIMIT 1', [usuarioId]);
      existente = rows;
    }
    if (existente.length === 0 && tel) {
      const { rows } = await client.query('SELECT id FROM clientes WHERE telefono = $1 LIMIT 1', [tel]);
      existente = rows;
    }
    if (existente.length === 0 && email) {
      const { rows } = await client.query('SELECT id FROM clientes WHERE email = $1 LIMIT 1', [email]);
      existente = rows;
    }

    if (existente.length > 0) {
      clienteId = existente[0].id;
      if (usuarioId) {
        await client.query(
          'UPDATE clientes SET usuario_id = $1 WHERE id = $2 AND usuario_id IS NULL',
          [usuarioId, clienteId]
        );
      }
    } else {
      const { rows: [nuevo] } = await client.query(
        'INSERT INTO clientes (nombre, telefono, email, usuario_id) VALUES ($1, $2, $3, $4) RETURNING id',
        [cliente.nombre.trim(), tel, email, usuarioId]
      );
      clienteId = nuevo.id;
    }

    const [Y, M, D] = fecha.split('-').map(Number);
    const [hh, mm] = hora.split(':').map(Number);
    const dFin = new Date(Y, M - 1, D, hh, mm + serv.duracion_min);
    const p = (n) => String(n).padStart(2, '0');
    const inicio = `${fecha} ${hora}:00`;
    const fin = `${dFin.getFullYear()}-${p(dFin.getMonth() + 1)}-${p(dFin.getDate())} ${p(dFin.getHours())}:${p(dFin.getMinutes())}:00`;

    const { rows: [result] } = await client.query(
      `INSERT INTO turnos
        (cliente_id, profesional_id, servicio_id, inicio, fin, estado,
         sena_requerida, sena_pagada, precio_snapshot, origen)
       VALUES ($1, $2, $3, $4, $5, 'pendiente', $6, FALSE, $7, 'online')
       RETURNING id`,
      [clienteId, profFinal, servicioId, inicio, fin, serv.sena_monto, serv.precio]
    );

    await client.query('COMMIT');

    enviarNotificacionReserva({
      servicio: serv.nombre,
      profesional: nombreProfesional,
      inicio,
      cliente,
    }).catch((e) => console.error('[email] Notificación de reserva falló:', e.message));

    return {
      turnoId: result.id,
      inicio, fin,
      servicio: serv.nombre,
      precio: serv.precio,
      sena: serv.sena_monto,
      profesionalId: profFinal,
      requierePago: Number(serv.sena_monto) > 0,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function turnoPublico(turnoId) {
  const { rows } = await pool.query(
    `SELECT t.id, t.inicio, t.fin, t.estado, t.sena_requerida, t.sena_pagada,
            t.precio_snapshot, s.nombre AS servicio, p.nombre AS profesional,
            c.nombre AS cliente
       FROM turnos t
       JOIN servicios s ON s.id = t.servicio_id
       JOIN profesionales p ON p.id = t.profesional_id
       JOIN clientes c ON c.id = t.cliente_id
      WHERE t.id = $1`,
    [turnoId]
  );
  if (rows.length === 0) throw new Error('Turno no encontrado');
  return rows[0];
}

export async function misTurnos(usuarioId) {
  const { rows } = await pool.query(
    `SELECT t.id, t.inicio, t.fin, t.estado, t.sena_requerida, t.sena_pagada,
            t.precio_snapshot, s.nombre AS servicio, p.nombre AS profesional
       FROM turnos t
       JOIN clientes c ON c.id = t.cliente_id
       JOIN servicios s ON s.id = t.servicio_id
       JOIN profesionales p ON p.id = t.profesional_id
      WHERE c.usuario_id = $1
      ORDER BY t.inicio DESC`,
    [usuarioId]
  );
  return rows;
}

export async function cancelarMiTurno(usuarioId, turnoId) {
  const { rows } = await pool.query(
    `SELECT t.id FROM turnos t
       JOIN clientes c ON c.id = t.cliente_id
      WHERE t.id = $1 AND c.usuario_id = $2`,
    [turnoId, usuarioId]
  );
  if (rows.length === 0) throw new Error('Turno no encontrado o no te pertenece');
  await pool.query(`UPDATE turnos SET estado = 'cancelado' WHERE id = $1`, [turnoId]);
  return { turnoId, estado: 'cancelado' };
}
