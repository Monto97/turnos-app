import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  Profesional, Servicio, Cliente, Turno, Bloqueo, HorarioLaboral, EstadoTurno,
} from './dominio.models';
import { environment } from '../../environments/environment';

const API = environment.apiUrl;

@Injectable({ providedIn: 'root' })
export class ApiService {
  constructor(private http: HttpClient) {}

  // --- Profesionales ---
  getProfesionales(): Observable<Profesional[]> {
    return this.http.get<Profesional[]>(`${API}/profesionales`);
  }
  crearProfesional(data: Partial<Profesional>): Observable<Profesional> {
    return this.http.post<Profesional>(`${API}/profesionales`, data);
  }
  setHorarios(profId: number, horarios: HorarioLaboral[]): Observable<any> {
    return this.http.put(`${API}/profesionales/${profId}/horarios`, { horarios });
  }
  asignarServicios(profId: number, servicioIds: number[]): Observable<any> {
    return this.http.put(`${API}/profesionales/${profId}/servicios`, { servicioIds });
  }
  getServiciosDeProfesional(profId: number): Observable<Servicio[]> {
    return this.http.get<Servicio[]>(`${API}/profesionales/${profId}/servicios`);
  }

  // --- Servicios ---
  getServicios(): Observable<Servicio[]> {
    return this.http.get<Servicio[]>(`${API}/servicios`);
  }
  crearServicio(data: Partial<Servicio>): Observable<Servicio> {
    return this.http.post<Servicio>(`${API}/servicios`, data);
  }

  // --- Clientes ---
  getClientes(q?: string): Observable<Cliente[]> {
    const query = q ? `?q=${encodeURIComponent(q)}` : '';
    return this.http.get<Cliente[]>(`${API}/clientes${query}`);
  }
  crearCliente(data: Partial<Cliente>): Observable<Cliente> {
    return this.http.post<Cliente>(`${API}/clientes`, data);
  }

  // --- Disponibilidad ---
  getDisponibilidad(profId: number, servId: number, fecha: string): Observable<{ fecha: string; slots: string[] }> {
    return this.http.get<{ fecha: string; slots: string[] }>(
      `${API}/disponibilidad?profesionalId=${profId}&servicioId=${servId}&fecha=${fecha}`
    );
  }

  // --- Turnos ---
  getTurnos(desde: string, hasta: string, profId?: number): Observable<Turno[]> {
    let url = `${API}/turnos?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`;
    if (profId) url += `&profesionalId=${profId}`;
    return this.http.get<Turno[]>(url);
  }
  crearTurno(data: {
    clienteId: number; profesionalId: number; servicioId: number; inicio: string; notas?: string;
  }): Observable<any> {
    return this.http.post(`${API}/turnos`, data);
  }
  editarTurno(id: number, data: { profesionalId?: number; servicioId?: number; inicio?: string }): Observable<any> {
    return this.http.put(`${API}/turnos/${id}`, data);
  }
  cambiarEstadoTurno(id: number, estado: EstadoTurno): Observable<any> {
    return this.http.patch(`${API}/turnos/${id}/estado`, { estado });
  }
  eliminarTurno(id: number): Observable<any> {
    return this.http.delete(`${API}/turnos/${id}`);
  }

  // --- Bloqueos ---
  getBloqueos(desde: string, hasta: string): Observable<Bloqueo[]> {
    return this.http.get<Bloqueo[]>(`${API}/bloqueos?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`);
  }
  crearBloqueo(data: { profesionalId?: number | null; inicio: string; fin: string; motivo?: string }): Observable<any> {
    return this.http.post(`${API}/bloqueos`, data);
  }
  eliminarBloqueo(id: number): Observable<any> {
    return this.http.delete(`${API}/bloqueos/${id}`);
  }
}
