import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { MarcaComponent } from '../marca.component';

@Component({
  selector: 'app-reset',
  standalone: true,
  imports: [FormsModule, RouterLink, MarcaComponent],
  template: `
    <div class="auth-shell">
      <app-marca frase="Elegí una contraseña nueva," />
      <main class="auth-panel">
        <div class="auth-card">
          @if (!listo()) {
            <h1 class="titulo">Nueva contraseña</h1>
            <p class="subtitulo">Elegí una contraseña para tu cuenta.</p>

            @if (error()) {
              <div class="alerta alerta-error">{{ error() }}</div>
            }

            <div class="campo">
              <label for="p1">Nueva contraseña</label>
              <input id="p1" type="password" [(ngModel)]="password" placeholder="Mínimo 8 caracteres" autocomplete="new-password" />
            </div>
            <div class="campo">
              <label for="p2">Repetir contraseña</label>
              <input id="p2" type="password" [(ngModel)]="password2" autocomplete="new-password" (keyup.enter)="cambiar()" />
            </div>
            <button class="btn btn-primary" [disabled]="cargando()" (click)="cambiar()">
              {{ cargando() ? 'Guardando…' : 'Cambiar contraseña' }}
            </button>
          } @else {
            <h1 class="titulo">Listo</h1>
            <div class="alerta alerta-ok">
              Tu contraseña se cambió. Ya podés iniciar sesión.
            </div>
            <a routerLink="/login" class="btn btn-primary" style="text-decoration:none; text-align:center;">Ir a iniciar sesión</a>
          }
        </div>
      </main>
    </div>
  `,
})
export class ResetComponent implements OnInit {
  token = '';
  password = '';
  password2 = '';
  cargando = signal(false);
  listo = signal(false);
  error = signal('');

  constructor(
    private auth: AuthService,
    private route: ActivatedRoute,
    private router: Router,
  ) {}

  ngOnInit() {
    this.token = this.route.snapshot.queryParamMap.get('token') || '';
    if (!this.token) {
      this.error.set('Enlace inválido. Pedí uno nuevo desde "Recuperar contraseña".');
    }
  }

  cambiar() {
    if (!this.token) return;
    if (this.password.length < 8) {
      this.error.set('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (this.password !== this.password2) {
      this.error.set('Las contraseñas no coinciden.');
      return;
    }
    this.cargando.set(true);
    this.error.set('');
    this.auth.resetPassword(this.token, this.password).subscribe({
      next: () => { this.listo.set(true); this.cargando.set(false); },
      error: (e) => {
        this.error.set(e.error?.error || 'No se pudo cambiar la contraseña.');
        this.cargando.set(false);
      },
    });
  }
}
