import { Injectable, computed, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import {
  AuthResponse, LoginPayload, RegistroPayload, Usuario,
} from './models';
import { environment } from '../../environments/environment';

const API = `${environment.apiUrl}/auth`;
const TOKEN_KEY = 'turnos_token';
const USER_KEY = 'turnos_user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private _usuario = signal<Usuario | null>(this.leerUsuarioGuardado());
  usuario = this._usuario.asReadonly();
  estaLogueado = computed(() => this._usuario() !== null);
  esDueno = computed(() => this._usuario()?.rol === 'dueño');

  rutaSegunRol(): string {
    return this._usuario()?.rol === 'dueño' ? '/panel' : '/mis-turnos';
  }

  constructor(private http: HttpClient) {}

  private leerUsuarioGuardado(): Usuario | null {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  }

  private guardarSesion(res: AuthResponse) {
    localStorage.setItem(TOKEN_KEY, res.token);
    localStorage.setItem(USER_KEY, JSON.stringify(res.usuario));
    this._usuario.set(res.usuario);
  }

  get token(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  registrar(payload: RegistroPayload): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${API}/registro`, payload)
      .pipe(tap((res) => this.guardarSesion(res)));
  }

  login(payload: LoginPayload): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${API}/login`, payload)
      .pipe(tap((res) => this.guardarSesion(res)));
  }

  recuperar(email: string): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(`${API}/recuperar`, { email });
  }

  resetPassword(token: string, password: string): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(`${API}/reset`, { token, password });
  }

  cargarPerfil(): Observable<Usuario> {
    return this.http.get<Usuario>(`${API}/me`);
  }

  misTurnos(): Observable<any[]> {
    return this.http.get<any[]>(`${API}/mis-turnos`);
  }

  cancelarMiTurno(turnoId: number): Observable<any> {
    return this.http.patch(`${API}/mis-turnos/${turnoId}/cancelar`, {});
  }

  logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    this._usuario.set(null);
  }
}
