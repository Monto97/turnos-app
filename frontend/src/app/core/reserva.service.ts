import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Servicio, Profesional } from './dominio.models';
import { environment } from '../../environments/environment';

const API = `${environment.apiUrl}/publico`;

export interface ResultadoReserva {
  turnoId: number;
  inicio: string;
  fin: string;
  servicio: string;
  precio: number;
  sena: number;
  profesionalId: number;
  requierePago: boolean;
}

export interface TurnoPublico {
  id: number;
  inicio: string;
  fin: string;
  estado: string;
  sena_requerida: number;
  sena_pagada: boolean | number;
  precio_snapshot: number;
  servicio: string;
  profesional: string;
  cliente: string;
}

@Injectable({ providedIn: 'root' })
export class ReservaService {
  constructor(private http: HttpClient) {}

  getServicios(): Observable<Servicio[]> {
    return this.http.get<Servicio[]>(`${API}/servicios`);
  }

  getProfesionales(servicioId: number): Observable<Profesional[]> {
    return this.http.get<Profesional[]>(`${API}/servicios/${servicioId}/profesionales`);
  }

  getDisponibilidad(servicioId: number, fecha: string, profesionalId?: number | null): Observable<{ fecha: string; slots: string[] }> {
    let url = `${API}/disponibilidad?servicioId=${servicioId}&fecha=${fecha}`;
    if (profesionalId) url += `&profesionalId=${profesionalId}`;
    return this.http.get<{ fecha: string; slots: string[] }>(url);
  }

  reservar(data: {
    servicioId: number;
    profesionalId?: number | null;
    fecha: string;
    hora: string;
    cliente: { nombre: string; telefono?: string; email?: string };
  }): Observable<ResultadoReserva> {
    return this.http.post<ResultadoReserva>(`${API}/reservar`, data);
  }

  getTurno(turnoId: number): Observable<TurnoPublico> {
    return this.http.get<TurnoPublico>(`${API}/turnos/${turnoId}`);
  }

  pagarSena(turnoId: number): Observable<{ url: string; simulado: boolean }> {
    return this.http.post<{ url: string; simulado: boolean }>(`${API}/pagar-sena/${turnoId}`, {});
  }

  confirmarSimulado(turnoId: number): Observable<any> {
    return this.http.post(`${API}/confirmar-simulado/${turnoId}`, {});
  }
}
