// Modelos compartidos de autenticación.

export interface Usuario {
  id: number;
  nombre: string;
  apellido: string;
  email: string;
  telefono?: string;
  rol?: 'dueño' | 'cliente' | 'profesional';
  creado_en?: string;
}

export interface AuthResponse {
  usuario: Usuario;
  token: string;
}

export interface RegistroPayload {
  nombre: string;
  apellido: string;
  email: string;
  telefono?: string;
  password: string;
  codigoDueno?: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}
