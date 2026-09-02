import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { MarcaComponent } from '../marca.component';

@Component({
  selector: 'app-registro',
  standalone: true,
  imports: [FormsModule, RouterLink, MarcaComponent],
  template: `
    <div class="auth-shell">
      <app-marca [frase]="modoDueno() ? 'Panel del salón,' : 'Empezá a ordenar tu agenda,'" />
      <main class="auth-panel">
        <div class="auth-card">
          <h1 class="titulo">{{ modoDueno() ? 'Crear cuenta de administrador' : 'Crear cuenta' }}</h1>
          <p class="subtitulo">
            {{ modoDueno() ? 'Registro del dueño del negocio.' : 'Unos datos y listo.' }}
          </p>

          @if (error()) {
            <div class="alerta alerta-error">{{ error() }}</div>
          }


          <div class="fila-2">
            <div class="campo">
              <label for="nombre">Nombre</label>
              <input id="nombre" [(ngModel)]="nombre" autocomplete="given-name" />
            </div>
            <div class="campo">
              <label for="apellido">Apellido</label>
              <input id="apellido" [(ngModel)]="apellido" autocomplete="family-name" />
            </div>
          </div>
          <div class="campo">
            <label for="email">Email</label>
            <input id="email" type="email" [(ngModel)]="email" autocomplete="email" />
          </div>
          <div class="campo">
            <label for="telefono">Teléfono</label>
            <input id="telefono" type="tel" [(ngModel)]="telefono" autocomplete="tel" placeholder="Opcional" />
          </div>
          <div class="campo">
            <label for="password">Contraseña</label>
            <input id="password" type="password" [(ngModel)]="password" autocomplete="new-password" placeholder="Mínimo 8 caracteres" (keyup.enter)="registrarse()" />
          </div>

          @if (modoDueno()) {
            <div class="campo">
              <label for="codigo">Código de administrador</label>
              <input id="codigo" [(ngModel)]="codigoDueno" placeholder="El código provisto" />
            </div>
          }

          <button class="btn btn-primary" [disabled]="cargando()" (click)="registrarse()">
            {{ cargando() ? 'Creando…' : 'Crear cuenta' }}
          </button>

          <p class="auth-links">
            ¿Ya tenés cuenta? <a routerLink="/login">Iniciar sesión</a>
          </p>
        </div>
      </main>
    </div>
  `,
})
export class RegistroComponent implements OnInit {
  nombre = '';
  apellido = '';
  email = '';
  telefono = '';
  password = '';
  codigoDueno = '';
  modoDueno = signal(false);
  cargando = signal(false);
  error = signal('');

  constructor(private auth: AuthService, private router: Router, private route: ActivatedRoute) {}

  ngOnInit() {
    // Modo dueño si la URL trae ?dueno=1 (la "URL especial de dueño").
    this.modoDueno.set(this.route.snapshot.queryParamMap.get('dueno') === '1');
  }

  registrarse() {
    if (!this.nombre || !this.apellido || !this.email || !this.password) {
      this.error.set('Completá nombre, apellido, email y contraseña.');
      return;
    }
    if (this.password.length < 8) {
      this.error.set('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (this.modoDueno() && !this.codigoDueno.trim()) {
      this.error.set('Ingresá el código de administrador.');
      return;
    }
    this.cargando.set(true);
    this.error.set('');
    this.auth.registrar({
      nombre: this.nombre, apellido: this.apellido, email: this.email,
      telefono: this.telefono || undefined, password: this.password,
      codigoDueno: this.modoDueno() ? this.codigoDueno.trim() : undefined,
    }).subscribe({
      next: () => this.router.navigate([this.auth.rutaSegunRol()]),
      error: (e) => {
        this.error.set(e.error?.error || 'No se pudo crear la cuenta.');
        this.cargando.set(false);
      },
    });
  }

}
