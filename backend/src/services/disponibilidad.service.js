import { pool } from '../config/db.js';

function horaAMinutos(hora) {
  const [h, m] = hora.split(':').map(Number);
  return h * 60 + m;
}

function minutosAHora(min) {
  const h = String(Math.floor(min / 60)).padStart(2, '0');
  const m = String(min % 60).padStart(2, '0');
  return `${h}:${m}`;
}

function seSolapan(a1, a2, b1, b2) {
  return a1 < b2 && b1 < a2;
}

/**
 * Calcula los slots libres.
 * @param {number} profesionalId
 * @param {number} servicioId
 * @param {string} fecha  'YYYY-MM-DD'
 * @param {number} intervaloMin
 * @param {number|null} excluirTurnoId
 */
export async function calcularSlotsLibres(profesionalId, servicioId, fecha, intervaloMin = 15, excluirTurnoId = null) {
  // Duración del servicio
  const { rows: servicios } = await pool.query(
    'SELECT duracion_min FROM servicios WHERE id = $1 AND activo = TRUE',
    [servicioId]
  );
  if (servicios.length === 0) throw new Error('Servicio no encontrado o inactivo');
  const duracion = servicios[0].duracion_min;

  // Día de la semana
  const [anio, mes, dia] = fecha.split('-').map(Number);
  const diaSemana = new Date(anio, mes - 1, dia).getDay();

  // Franjas laborales
  const { rows: franjas } = await pool.query(
    `SELECT hora_inicio::text, hora_fin::text
       FROM horarios_laborales
      WHERE profesional_id = $1 AND dia_semana = $2
      ORDER BY hora_inicio`,
    [profesionalId, diaSemana]
  );
  if (franjas.length === 0) return [];

  // Turnos ocupados ese día
  const { rows: turnos } = await pool.query(
    `SELECT inicio::text, fin::text
       FROM turnos
      WHERE profesional_id = $1
        AND inicio::date = $2::date
        AND estado IN ('pendiente','confirmado','completado')
        AND ($3::integer IS NULL OR id <> $3)`,
    [profesionalId, fecha, excluirTurnoId]
  );

  // Bloqueos aplicables
  const { rows: bloqueos } = await pool.query(
    `SELECT inicio::text, fin::text
       FROM bloqueos
      WHERE (profesional_id = $1 OR profesional_id IS NULL)
        AND inicio::date <= $2::date AND fin::date >= $2::date`,
    [profesionalId, fecha]
  );

  // Normalizar a minutos desde medianoche
  const ocupados = [];
  for (const t of [...turnos, ...bloqueos]) {
    const ini = horaAMinutos(t.inicio.split(' ')[1] || t.inicio);
    const fin = horaAMinutos(t.fin.split(' ')[1] || t.fin);
    ocupados.push([ini, fin]);
  }

  // Descartar horas pasadas si es hoy
  const ahora = new Date();
  const esHoy =
    ahora.getFullYear() === anio &&
    ahora.getMonth() === mes - 1 &&
    ahora.getDate() === dia;
  const minutosAhora = ahora.getHours() * 60 + ahora.getMinutes();

  const libres = [];
  for (const franja of franjas) {
    const inicioFranja = horaAMinutos(franja.hora_inicio);
    const finFranja = horaAMinutos(franja.hora_fin);

    for (let t = inicioFranja; t + duracion <= finFranja; t += intervaloMin) {
      const slotInicio = t;
      const slotFin = t + duracion;

      if (esHoy && slotInicio <= minutosAhora) continue;

      const chocado = ocupados.some(([oIni, oFin]) =>
        seSolapan(slotInicio, slotFin, oIni, oFin)
      );
      if (chocado) continue;

      libres.push(minutosAHora(slotInicio));
    }
  }

  return libres;
}
