/**
 * Seed de demo — Studio Belle
 * Pobla la BD local con datos realistas para mostrar el panel.
 * Es idempotente: si los datos ya existen, los omite sin explotar.
 *
 * Uso: node scripts/seed-demo.js
 */
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const pool = mysql.createPool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     Number(process.env.DB_PORT || 3306),
  user:     process.env.DB_USER     || 'turnos_user',
  password: process.env.DB_PASSWORD || 'turnos_pass_dev',
  database: process.env.DB_NAME     || 'turnos',
  dateStrings: true,
});

// ── Helpers ────────────────────────────────────────────────────────────────

const pad = (n) => String(n).padStart(2, '0');

/** Devuelve 'YYYY-MM-DD' sumando `dias` a hoy. */
function fecha(dias = 0) {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Devuelve 'YYYY-MM-DD HH:MM:00' sumando `dias` a hoy. */
function dt(dias, hora) {
  return `${fecha(dias)} ${hora}:00`;
}

/** Suma minutos a un datetime 'YYYY-MM-DD HH:MM:00'. */
function sumar(datetime, min) {
  const [d, t] = datetime.split(' ');
  const [Y, M, D] = d.split('-').map(Number);
  const [h, m] = t.split(':').map(Number);
  const r = new Date(Y, M - 1, D, h, m + min);
  return `${r.getFullYear()}-${pad(r.getMonth()+1)}-${pad(r.getDate())} ${pad(r.getHours())}:${pad(r.getMinutes())}:00`;
}

const NEGOCIO = 1;

async function upsertServicio(conn, { nombre, duracion_min, precio, sena_monto = 0 }) {
  const [ex] = await conn.query('SELECT id FROM servicios WHERE nombre = ? AND negocio_id = ?', [nombre, NEGOCIO]);
  if (ex.length) return ex[0].id;
  const [r] = await conn.query(
    'INSERT INTO servicios (negocio_id, nombre, duracion_min, precio, sena_monto) VALUES (?,?,?,?,?)',
    [NEGOCIO, nombre, duracion_min, precio, sena_monto]
  );
  console.log(`  ✓ Servicio: ${nombre}`);
  return r.insertId;
}

async function upsertProfesional(conn, { nombre, color_agenda }) {
  const [ex] = await conn.query('SELECT id FROM profesionales WHERE nombre = ? AND negocio_id = ?', [nombre, NEGOCIO]);
  if (ex.length) return ex[0].id;
  const [r] = await conn.query(
    'INSERT INTO profesionales (negocio_id, nombre, color_agenda) VALUES (?,?,?)',
    [NEGOCIO, nombre, color_agenda]
  );
  console.log(`  ✓ Profesional: ${nombre}`);
  return r.insertId;
}

async function setHorarios(conn, profesionalId, horarios) {
  await conn.query('DELETE FROM horarios_laborales WHERE profesional_id = ?', [profesionalId]);
  for (const h of horarios) {
    await conn.query(
      'INSERT INTO horarios_laborales (negocio_id, profesional_id, dia_semana, hora_inicio, hora_fin) VALUES (?,?,?,?,?)',
      [NEGOCIO, profesionalId, h.dia, h.desde, h.hasta]
    );
  }
}

async function asignarServicios(conn, profesionalId, servicioIds) {
  await conn.query('DELETE FROM profesional_servicio WHERE profesional_id = ?', [profesionalId]);
  for (const sid of servicioIds) {
    await conn.query(
      'INSERT INTO profesional_servicio (negocio_id, profesional_id, servicio_id) VALUES (?,?,?)',
      [NEGOCIO, profesionalId, sid]
    );
  }
}

async function upsertCliente(conn, { nombre, telefono, email = null }) {
  const [ex] = await conn.query('SELECT id FROM clientes WHERE telefono = ?', [telefono]);
  if (ex.length) return ex[0].id;
  const [r] = await conn.query(
    'INSERT INTO clientes (negocio_id, nombre, telefono, email) VALUES (?,?,?,?)',
    [NEGOCIO, nombre, telefono, email]
  );
  return r.insertId;
}

async function insertTurno(conn, { clienteId, profesionalId, servicioId, inicio, duracion, estado, origen = 'online' }) {
  const fin = sumar(inicio, duracion);
  // Verificar que no choque con otro turno del mismo profesional
  const [choque] = await conn.query(
    `SELECT id FROM turnos
      WHERE profesional_id = ? AND estado NOT IN ('cancelado')
        AND inicio < ? AND fin > ?`,
    [profesionalId, fin, inicio]
  );
  if (choque.length) return null; // ya hay algo en ese slot, lo saltamos

  const [serv] = await conn.query('SELECT precio, sena_monto FROM servicios WHERE id = ?', [servicioId]);
  const { precio, sena_monto } = serv[0];
  const [r] = await conn.query(
    `INSERT INTO turnos
       (negocio_id, cliente_id, profesional_id, servicio_id, inicio, fin,
        estado, sena_requerida, sena_pagada, precio_snapshot, origen)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [NEGOCIO, clienteId, profesionalId, servicioId, inicio, fin,
     estado, sena_monto, estado === 'confirmado', precio, origen]
  );
  return r.insertId;
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const conn = await pool.getConnection();
  try {
    console.log('\n🌱 Seed Studio Belle\n');

    // ── Servicios ──────────────────────────────────────────────────────────
    console.log('Servicios:');
    const sCorte     = await upsertServicio(conn, { nombre: 'Corte',     duracion_min: 40, precio: 10000, sena_monto: 2000 });
    const sColor     = await upsertServicio(conn, { nombre: 'Color',     duracion_min: 60, precio: 20000, sena_monto: 3000 });
    const sBrushing  = await upsertServicio(conn, { nombre: 'Brushing',  duracion_min: 30, precio: 8000  });
    const sKeratina  = await upsertServicio(conn, { nombre: 'Keratina',  duracion_min: 120, precio: 45000, sena_monto: 10000 });
    const sMechas    = await upsertServicio(conn, { nombre: 'Mechas',    duracion_min: 90,  precio: 35000, sena_monto: 8000 });
    const sTinte     = await upsertServicio(conn, { nombre: 'Tinte',     duracion_min: 60,  precio: 25000, sena_monto: 5000 });

    // ── Profesionales ──────────────────────────────────────────────────────
    console.log('\nProfesionales:');
    // Juliana ya existe (id=1), la tomamos; Camila nueva
    const pJuliana = await upsertProfesional(conn, { nombre: 'Juliana', color_agenda: '#fcbaa6' });
    const pCamila  = await upsertProfesional(conn, { nombre: 'Camila',  color_agenda: '#7c9e6f' });

    // Horarios: Lu-Sab 9-18 para Juliana, Lu-Vi 10-19 para Camila
    const diasBase = [
      { dia: 1, desde: '09:00', hasta: '18:00' }, // Lunes
      { dia: 2, desde: '09:00', hasta: '18:00' },
      { dia: 3, desde: '09:00', hasta: '18:00' },
      { dia: 4, desde: '09:00', hasta: '18:00' },
      { dia: 5, desde: '09:00', hasta: '18:00' },
      { dia: 6, desde: '09:00', hasta: '18:00' }, // Sábado
    ];
    await setHorarios(conn, pJuliana, diasBase);
    await setHorarios(conn, pCamila, [
      { dia: 1, desde: '10:00', hasta: '19:00' },
      { dia: 2, desde: '10:00', hasta: '19:00' },
      { dia: 3, desde: '10:00', hasta: '19:00' },
      { dia: 4, desde: '10:00', hasta: '19:00' },
      { dia: 5, desde: '10:00', hasta: '19:00' },
    ]);
    console.log('  ✓ Horarios configurados');

    // Asignar todos los servicios a ambas profesionales
    const todosServ = [sCorte, sColor, sBrushing, sKeratina, sMechas, sTinte];
    await asignarServicios(conn, pJuliana, todosServ);
    await asignarServicios(conn, pCamila,  todosServ);
    console.log('  ✓ Servicios asignados');

    // ── Clientes ───────────────────────────────────────────────────────────
    console.log('\nClientes:');
    const clientes = [
      { nombre: 'Valentina Sosa',      telefono: '1123450001' },
      { nombre: 'Luciana Fernández',   telefono: '1123450002' },
      { nombre: 'Agustina Romero',     telefono: '1123450003' },
      { nombre: 'Sol Martínez',        telefono: '1123450004' },
      { nombre: 'Rocío Gómez',         telefono: '1123450005' },
      { nombre: 'Florencia López',     telefono: '1123450006' },
      { nombre: 'Camila Torres',       telefono: '1123450007' },
      { nombre: 'Sofía Peralta',       telefono: '1123450008' },
      { nombre: 'Daniela Castillo',    telefono: '1123450009' },
      { nombre: 'Micaela Herrera',     telefono: '1123450010' },
    ];
    const cIds = [];
    for (const c of clientes) {
      const id = await upsertCliente(conn, c);
      cIds.push(id);
      console.log(`  ✓ ${c.nombre}`);
    }
    const [c0,c1,c2,c3,c4,c5,c6,c7,c8,c9] = cIds;

    // ── Turnos ─────────────────────────────────────────────────────────────
    // Hoy = día 0. Offset positivo = días hacia adelante.
    // dia_semana de hoy (jueves=4): ajustamos para que la agenda tenga datos
    // esta semana y la próxima.
    console.log('\nTurnos:');

    const turnos = [
      // ── HOY (jueves) ─────────────────────────────────────────────────────
      { c: c0, p: pJuliana, s: sCorte,    inicio: dt(0,'09:00'), dur: 40,  e: 'confirmado', o: 'online'   },
      { c: c1, p: pJuliana, s: sColor,    inicio: dt(0,'10:00'), dur: 60,  e: 'confirmado', o: 'online'   },
      { c: c2, p: pJuliana, s: sBrushing, inicio: dt(0,'11:30'), dur: 30,  e: 'pendiente',  o: 'online'   },
      { c: c3, p: pJuliana, s: sMechas,   inicio: dt(0,'14:00'), dur: 90,  e: 'confirmado', o: 'interno'  },
      { c: c4, p: pJuliana, s: sCorte,    inicio: dt(0,'16:00'), dur: 40,  e: 'pendiente',  o: 'online'   },
      { c: c5, p: pCamila,  s: sBrushing, inicio: dt(0,'10:00'), dur: 30,  e: 'confirmado', o: 'interno'  },
      { c: c6, p: pCamila,  s: sTinte,    inicio: dt(0,'11:00'), dur: 60,  e: 'confirmado', o: 'online'   },
      { c: c7, p: pCamila,  s: sKeratina, inicio: dt(0,'13:00'), dur: 120, e: 'pendiente',  o: 'online'   },
      { c: c8, p: pCamila,  s: sCorte,    inicio: dt(0,'16:00'), dur: 40,  e: 'confirmado', o: 'interno'  },

      // ── MAÑANA (viernes) ─────────────────────────────────────────────────
      { c: c9, p: pJuliana, s: sColor,    inicio: dt(1,'09:00'), dur: 60,  e: 'confirmado', o: 'online'   },
      { c: c0, p: pJuliana, s: sMechas,   inicio: dt(1,'10:30'), dur: 90,  e: 'confirmado', o: 'interno'  },
      { c: c1, p: pJuliana, s: sCorte,    inicio: dt(1,'13:00'), dur: 40,  e: 'pendiente',  o: 'online'   },
      { c: c2, p: pJuliana, s: sBrushing, inicio: dt(1,'14:00'), dur: 30,  e: 'confirmado', o: 'online'   },
      { c: c3, p: pCamila,  s: sKeratina, inicio: dt(1,'10:00'), dur: 120, e: 'confirmado', o: 'online'   },
      { c: c4, p: pCamila,  s: sTinte,    inicio: dt(1,'13:00'), dur: 60,  e: 'pendiente',  o: 'online'   },
      { c: c5, p: pCamila,  s: sCorte,    inicio: dt(1,'15:00'), dur: 40,  e: 'confirmado', o: 'interno'  },

      // ── PASADO MAÑANA (sábado) ────────────────────────────────────────────
      { c: c6, p: pJuliana, s: sCorte,    inicio: dt(2,'09:00'), dur: 40,  e: 'confirmado', o: 'online'   },
      { c: c7, p: pJuliana, s: sColor,    inicio: dt(2,'10:00'), dur: 60,  e: 'confirmado', o: 'online'   },
      { c: c8, p: pJuliana, s: sBrushing, inicio: dt(2,'11:30'), dur: 30,  e: 'pendiente',  o: 'online'   },
      { c: c9, p: pJuliana, s: sCorte,    inicio: dt(2,'14:00'), dur: 40,  e: 'cancelado',  o: 'online'   },

      // ── SEMANA QUE VIENE ──────────────────────────────────────────────────
      { c: c0, p: pJuliana, s: sKeratina, inicio: dt(4,'09:00'), dur: 120, e: 'confirmado', o: 'online'   },
      { c: c1, p: pJuliana, s: sCorte,    inicio: dt(4,'12:00'), dur: 40,  e: 'pendiente',  o: 'online'   },
      { c: c2, p: pJuliana, s: sColor,    inicio: dt(4,'14:00'), dur: 60,  e: 'pendiente',  o: 'online'   },
      { c: c3, p: pCamila,  s: sMechas,   inicio: dt(4,'10:00'), dur: 90,  e: 'confirmado', o: 'online'   },
      { c: c4, p: pCamila,  s: sBrushing, inicio: dt(4,'13:00'), dur: 30,  e: 'pendiente',  o: 'online'   },

      { c: c5, p: pJuliana, s: sCorte,    inicio: dt(5,'09:00'), dur: 40,  e: 'confirmado', o: 'interno'  },
      { c: c6, p: pJuliana, s: sTinte,    inicio: dt(5,'10:00'), dur: 60,  e: 'confirmado', o: 'online'   },
      { c: c7, p: pJuliana, s: sMechas,   inicio: dt(5,'13:00'), dur: 90,  e: 'pendiente',  o: 'online'   },
      { c: c8, p: pCamila,  s: sColor,    inicio: dt(5,'10:00'), dur: 60,  e: 'confirmado', o: 'online'   },
      { c: c9, p: pCamila,  s: sCorte,    inicio: dt(5,'12:00'), dur: 40,  e: 'pendiente',  o: 'interno'  },

      { c: c0, p: pJuliana, s: sCorte,    inicio: dt(7,'09:00'), dur: 40,  e: 'confirmado', o: 'online'   },
      { c: c1, p: pJuliana, s: sKeratina, inicio: dt(7,'10:00'), dur: 120, e: 'confirmado', o: 'online'   },
      { c: c2, p: pCamila,  s: sMechas,   inicio: dt(7,'10:00'), dur: 90,  e: 'pendiente',  o: 'online'   },
      { c: c3, p: pCamila,  s: sTinte,    inicio: dt(7,'13:00'), dur: 60,  e: 'confirmado', o: 'online'   },
    ];

    let ok = 0, skip = 0;
    for (const t of turnos) {
      const id = await insertTurno(conn, {
        clienteId: t.c, profesionalId: t.p, servicioId: t.s,
        inicio: t.inicio, duracion: t.dur, estado: t.e, origen: t.o,
      });
      if (id) ok++; else skip++;
    }
    console.log(`  ✓ ${ok} turnos insertados, ${skip} omitidos por superposición`);

    // ── Bloqueo de ejemplo ─────────────────────────────────────────────────
    console.log('\nBloqueos:');
    const [exB] = await conn.query('SELECT id FROM bloqueos WHERE motivo = ?', ['Feriado nacional']);
    if (!exB.length) {
      await conn.query(
        'INSERT INTO bloqueos (negocio_id, inicio, fin, motivo) VALUES (?,?,?,?)',
        [NEGOCIO, dt(9,'00:00'), dt(9,'23:59'), 'Feriado nacional']
      );
      console.log('  ✓ Cierre de local: Feriado nacional (en 9 días)');
    }

    console.log('\n✅ Seed completado.\n');
  } finally {
    conn.release();
    await pool.end();
  }
}

main().catch((e) => { console.error('Error en seed:', e.message); process.exit(1); });
