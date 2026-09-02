import { pool } from '../config/db.js';

// ============================================================
//  MOTOR DE DISPONIBILIDAD
// ============================================================
//  Dado un profesional, un servicio y un día, calcula los
//  horarios (slots) libres para reservar.
//
//  Algoritmo:
//   1. Obtener las franjas laborales del profesional ese día.
//   2. Obtener turnos ya agendados y bloqueos que se solapen.
//   3. Generar slots candidatos según la duración del servicio.
//   4. Descartar los que chocan con turnos/bloqueos.
//   5. Descartar los que ya pasaron (si el día es hoy).
// ============================================================

// Convierte 'HH:mm:ss' o 'HH:mm' a minutos desde medianoche.
function horaAMinutos(hora) {
  const [h, m] = hora.split(':').map(Number);
  return h * 60 + m;
}

// Convierte minutos desde medianoche a 'HH:mm'.
function minutosAHora(min) {
  const h = String(Math.floor(min / 60)).padStart(2, '0');
  const m = String(min % 60).padStart(2, '0');
  return `${h}:${m}`;
}

// Dos intervalos [a1,a2) y [b1,b2) se solapan si a1 < b2 && b1 < a2.
function seSolapan(a1, a2, b1, b2) {
  return a1 < b2 && b1 < a2;
}

/**
 * Calcula los slots libres.
 * @param {number} profesionalId
 * @param {number} servicioId
 * @param {string} fecha  formato 'YYYY-MM-DD'
 * @param {number} intervaloMin  cada cuántos minutos se ofrece un slot (default 15)
 * @param {number|null} excluirTurnoId  turno a ignorar (al editar, para que no choque consigo mismo)
 * @returns {Promise<string[]>} lista de horas de inicio libres, ej: ['09:00','09:15',...]
 */
export async function calcularSlotsLibres(profesionalId, servicioId, fecha, intervaloMin = 15, excluirTurnoId = null) {
  // --- 1. Duración del servicio ---
  const [servicios] = await pool.query(
    'SELECT duracion_min FROM servicios WHERE id = ? AND activo = TRUE',
    [servicioId]
  );
  if (servicios.length === 0) {
    throw new Error('Servicio no encontrado o inactivo');
  }
  const duracion = servicios[0].duracion_min;

  // --- 2. Día de la semana (0=domingo..6=sábado) ---
  // Interpretamos la fecha como local para que el día no se corra
  // por zona horaria.
  const [anio, mes, dia] = fecha.split('-').map(Number);
  const diaSemana = new Date(anio, mes - 1, dia).getDay();

  // --- 3. Franjas laborales de ese profesional ese día ---
  const [franjas] = await pool.query(
    `SELECT hora_inicio, hora_fin
       FROM horarios_laborales
      WHERE profesional_id = ? AND dia_semana = ?
      ORDER BY hora_inicio`,
    [profesionalId, diaSemana]
  );
  if (franjas.length === 0) {
    return []; // ese día no trabaja
  }

  // --- 4. Turnos ocupados ese día (los que no están cancelados) ---
  // Si excluirTurnoId viene, lo ignoramos (caso: editar un turno existente).
  const [turnos] = await pool.query(
    `SELECT inicio, fin
       FROM turnos
      WHERE profesional_id = ?
        AND DATE(inicio) = ?
        AND estado IN ('pendiente','confirmado','completado')
        AND (? IS NULL OR id <> ?)`,
    [profesionalId, fecha, excluirTurnoId, excluirTurnoId]
  );

  // --- 5. Bloqueos que apliquen (del profesional o de todo el local) ---
  const [bloqueos] = await pool.query(
    `SELECT inicio, fin
       FROM bloqueos
      WHERE (profesional_id = ? OR profesional_id IS NULL)
        AND DATE(inicio) <= ? AND DATE(fin) >= ?`,
    [profesionalId, fecha, fecha]
  );

  // Normalizamos ocupados a minutos desde medianoche del día pedido.
  const ocupados = [];
  for (const t of [...turnos, ...bloqueos]) {
    // 'YYYY-MM-DD HH:mm:ss' -> tomamos la parte de hora.
    const ini = horaAMinutos(t.inicio.split(' ')[1]);
    const fin = horaAMinutos(t.fin.split(' ')[1]);
    ocupados.push([ini, fin]);
  }

  // --- 6. Si la fecha es hoy, descartamos horas que ya pasaron ---
  const ahora = new Date();
  const esHoy =
    ahora.getFullYear() === anio &&
    ahora.getMonth() === mes - 1 &&
    ahora.getDate() === dia;
  const minutosAhora = ahora.getHours() * 60 + ahora.getMinutes();

  // --- 7. Generar slots candidatos y filtrar ---
  const libres = [];
  for (const franja of franjas) {
    const inicioFranja = horaAMinutos(franja.hora_inicio);
    const finFranja = horaAMinutos(franja.hora_fin);

    // Avanzamos de intervaloMin en intervaloMin. Un slot es válido
    // si el servicio COMPLETO entra dentro de la franja.
    for (let t = inicioFranja; t + duracion <= finFranja; t += intervaloMin) {
      const slotInicio = t;
      const slotFin = t + duracion;

      // ¿Ya pasó? (solo si es hoy)
      if (esHoy && slotInicio <= minutosAhora) continue;

      // ¿Choca con algún turno o bloqueo?
      const chocado = ocupados.some(([oIni, oFin]) =>
        seSolapan(slotInicio, slotFin, oIni, oFin)
      );
      if (chocado) continue;

      libres.push(minutosAHora(slotInicio));
    }
  }

  return libres;
}
