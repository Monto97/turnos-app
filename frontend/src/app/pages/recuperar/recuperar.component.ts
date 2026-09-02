import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { MarcaComponent } from '../marca.component';

@Component({
  selector: 'app-recuperar',
  standalone: true,
  imports: [FormsModule, RouterLink, MarcaComponent],
  template: `
    <div class="auth-shell">
      <app-marca frase="Recuperá el acceso a tu agenda," />
      <main class="auth-panel">
        <div class="auth-card">
          @if (!enviado()) {
            <h1 class="titulo">Recuperar contraseña</h1>
            <p class="subtitulo">Te mandamos un enlace para elegir una nueva.</p>

            @if (error()) {
              <div class="alerta alerta-error">{{ error() }}</div>
            }

            <div class="campo">
              <label for="email">Email de tu cuenta</label>
              <input id="email" type="email" [(ngModel)]="email" placeholder="tu@email.com" autocomplete="email" (keyup.enter)="enviar()" />
            </div>
            <button class="btn btn-primary" [disabled]="cargando()" (click)="enviar()">
              {{ cargando() ? 'Enviando…' : 'Enviar enlace' }}
            </button>
          } @else {
            <h1 class="titulo">Revisá tu email</h1>
            <p class="subtitulo">
              Si <strong>{{ email }}</strong> tiene una cuenta, te enviamos un enlace
              para cambiar la contraseña. Vence en 30 minutos.
            </p>
            <div class="alerta alerta-ok">
              Enlace enviado. Revisá también la carpeta de spam.
            </div>
          }

          <p class="auth-links">
            <a routerLink="/login">Volver a iniciar sesión</a>
          </p>
        </div>
      </main>
    </div>
  `,
})
export class RecuperarComponent {
  email = '';
  cargando = signal(false);
  enviado = signal(false);
  error = signal('');

  constructor(private auth: AuthService) {}

  enviar() {
    if (!this.email) {
      this.error.set('Ingresá tu email.');
      return;
    }
    this.cargando.set(true);
    this.error.set('');
    this.auth.recuperar(this.email).subscribe({
      next: () => { this.enviado.set(true); this.cargando.set(false); },
      error: () => {
        // Por seguridad el backend responde OK igual; si hay error de red:
        this.error.set('No se pudo enviar. Probá de nuevo.');
        this.cargando.set(false);
      },
    });
  }
}
