// Utilidades de fecha para la agenda. Trabajamos con strings locales
// 'YYYY-MM-DD HH:mm:ss' para evitar líos de zona horaria con Date/UTC.

export const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
export const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

const p = (n: number) => String(n).padStart(2, '0');

export function fechaISO(d: Date): string {
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export function fechaHoraISO(d: Date): string {
  return `${fechaISO(d)} ${p(d.getHours())}:${p(d.getMinutes())}:00`;
}

// Lunes de la semana que contiene a `d`.
export function inicioSemana(d: Date): Date {
  const r = new Date(d);
  const dow = r.getDay();               // 0=dom..6=sáb
  const diff = dow === 0 ? -6 : 1 - dow; // llevamos a lunes
  r.setDate(r.getDate() + diff);
  r.setHours(0, 0, 0, 0);
  return r;
}

export function sumarDias(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

// Convierte 'YYYY-MM-DD HH:mm:ss' a un Date local.
export function parseLocal(s: string): Date {
  const [f, h] = s.split(' ');
  const [Y, M, D] = f.split('-').map(Number);
  const [hh, mm] = (h || '00:00').split(':').map(Number);
  return new Date(Y, M - 1, D, hh, mm);
}

// Minutos desde medianoche de una fecha/hora string.
export function minutosDelDia(s: string): number {
  const d = parseLocal(s);
  return d.getHours() * 60 + d.getMinutes();
}

export function mismaFecha(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
         a.getMonth() === b.getMonth() &&
         a.getDate() === b.getDate();
}

export function rangoLabel(lunes: Date): string {
  const dom = sumarDias(lunes, 6);
  if (lunes.getMonth() === dom.getMonth()) {
    return `${lunes.getDate()}–${dom.getDate()} de ${MESES[lunes.getMonth()]}`;
  }
  return `${lunes.getDate()} ${MESES[lunes.getMonth()].slice(0, 3)} – ${dom.getDate()} ${MESES[dom.getMonth()].slice(0, 3)}`;
}
