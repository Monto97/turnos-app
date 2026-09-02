import { Routes } from '@angular/router';
import { authGuard, guestGuard, duenoGuard } from './core/auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/login/login.component').then(m => m.LoginComponent),
  },
  {
    path: 'registro',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/registro/registro.component').then(m => m.RegistroComponent),
  },
  {
    path: 'recuperar',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/recuperar/recuperar.component').then(m => m.RecuperarComponent),
  },
  {
    path: 'reset-password',
    loadComponent: () => import('./pages/reset/reset.component').then(m => m.ResetComponent),
  },
  // --- Rutas públicas de reserva (sin login) ---
  {
    path: 'reservar',
    loadComponent: () => import('./pages/reserva/reserva.component').then(m => m.ReservaComponent),
  },
  {
    path: 'reserva-confirmada',
    loadComponent: () => import('./pages/reserva/reserva-confirmada.component').then(m => m.ReservaConfirmadaComponent),
  },
  {
    path: 'pago-simulado',
    loadComponent: () => import('./pages/reserva/pago-simulado.component').then(m => m.PagoSimuladoComponent),
  },
  // --- Cliente logueado ---
  {
    path: 'mis-turnos',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/mis-turnos/mis-turnos.component').then(m => m.MisTurnosComponent),
  },
  // --- Panel del dueño (protegido por rol) ---
  {
    path: 'panel',
    canActivate: [duenoGuard],
    loadComponent: () => import('./pages/panel/panel.component').then(m => m.PanelComponent),
    children: [
      { path: '', redirectTo: 'agenda', pathMatch: 'full' },
      { path: 'agenda', loadComponent: () => import('./pages/panel/agenda.component').then(m => m.AgendaComponent) },
      { path: 'configuracion', loadComponent: () => import('./pages/panel/configuracion.component').then(m => m.ConfiguracionComponent) },
      { path: 'avisos', loadComponent: () => import('./pages/panel/avisos.component').then(m => m.AvisosComponent) },
      { path: 'clientes', loadComponent: () => import('./pages/panel/clientes.component').then(m => m.ClientesComponent) },
    ],
  },
  { path: 'home', redirectTo: 'panel/agenda' },
  { path: '**', redirectTo: 'login' },
];
