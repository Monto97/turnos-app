// Modelos del dominio de negocio (turnos, profesionales, servicios, etc.)

export interface Profesional {
  id: number;
  nombre: string;
  email?: string;
  telefono?: string;
  color_agenda: string;
  activo?: boolean;
}

export interface Servicio {
  id: number;
  nombre: string;
  duracion_min: number;
  precio: number;
  sena_monto: number;
  activo?: boolean;
}

export interface Cliente {
  id: number;
  nombre: string;
  telefono?: string;
  email?: string;
  notas?: string;
}

export type EstadoTurno = 'pendiente' | 'confirmado' | 'cancelado' | 'completado' | 'ausente';

export interface Turno {
  id: number;
  inicio: string;          // 'YYYY-MM-DD HH:mm:ss'
  fin: string;
  estado: EstadoTurno;
  origen: 'interno' | 'online';
  sena_requerida: number;
  sena_pagada: boolean | number;
  precio_snapshot: number;
  cliente: string;
  cliente_tel?: string;
  servicio: string;
  duracion_min: number;
  profesional: string;
  color_agenda: string;
}

export interface Bloqueo {
  id: number;
  profesional_id: number | null;
  profesional?: string | null;
  inicio: string;
  fin: string;
  motivo?: string;
}

export interface HorarioLaboral {
  dia_semana: number;      // 0=domingo .. 6=sábado
  hora_inicio: string;     // 'HH:mm'
  hora_fin: string;
}
