import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { MarcaComponent } from '../marca.component';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, RouterLink, MarcaComponent],
  template: `
    <div class="auth-shell">
      <app-marca frase="Bienvenido de nuevo a tu agenda," />
      <main class="auth-panel">
        <div class="auth-card">
          <h1 class="titulo">Iniciar sesión</h1>
          <p class="subtitulo">Entrá para gestionar tus turnos.</p>

          @if (error()) {
            <div class="alerta alerta-error">{{ error() }}</div>
          }

          <div class="campo">
            <label for="email">Email</label>
            <input id="email" type="email" [(ngModel)]="email" placeholder="tu@email.com" autocomplete="email" />
          </div>
          <div class="campo">
            <label for="password">Contraseña</label>
            <input id="password" type="password" [(ngModel)]="password" placeholder="••••••••" autocomplete="current-password" (keyup.enter)="entrar()" />
            <a routerLink="/recuperar" class="link-sutil">¿Olvidaste tu contraseña?</a>
          </div>

          <button class="btn btn-primary" [disabled]="cargando()" (click)="entrar()">
            {{ cargando() ? 'Entrando…' : 'Entrar' }}
          </button>

          <p class="auth-links">
            ¿No tenés cuenta? <a routerLink="/registro">Crear una</a>
          </p>

          <div class="demo-hint">
            <strong>Demo:</strong> admin&#64;studiobelle.com / Demo1234!
          </div>
        </div>
      </main>
    </div>
  `,
})
export class LoginComponent {
  email = '';
  password = '';
  cargando = signal(false);
  error = signal('');

  constructor(private auth: AuthService, private router: Router) {}

  entrar() {
    if (!this.email || !this.password) {
      this.error.set('Completá email y contraseña.');
      return;
    }
    this.cargando.set(true);
    this.error.set('');
    this.auth.login({ email: this.email, password: this.password }).subscribe({
      next: () => this.router.navigate([this.auth.rutaSegunRol()]),
      error: (e) => {
        this.error.set(e.error?.error || 'No se pudo iniciar sesión.');
        this.cargando.set(false);
      },
    });
  }
}
