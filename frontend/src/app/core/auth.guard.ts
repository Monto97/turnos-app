import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { HttpInterceptorFn } from '@angular/common/http';
import { AuthService } from './auth.service';

// Guard: bloquea el acceso a rutas protegidas si no hay sesión.
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.estaLogueado()) return true;
  router.navigate(['/login']);
  return false;
};

// Guard inverso: si YA está logueado, no dejamos ver login/registro.
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.estaLogueado()) return true;
  router.navigate([auth.rutaSegunRol()]);
  return false;
};

// Guard de rol: solo dueños pueden entrar al panel.
// Un cliente logueado que intente /panel por URL es redirigido a sus turnos.
export const duenoGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.estaLogueado()) { router.navigate(['/login']); return false; }
  if (auth.esDueno()) return true;
  router.navigate(['/mis-turnos']);
  return false;
};

// Interceptor: agrega el token JWT al header de cada request saliente.
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const token = auth.token;
  if (token) {
    req = req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
  }
  return next(req);
};
