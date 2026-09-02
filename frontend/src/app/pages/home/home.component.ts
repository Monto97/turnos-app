import { Component, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { Usuario } from '../../core/models';

@Component({
  selector: 'app-home',
  standalone: true,
  template: `
    <div class="home-wrap">
      <header class="home-top">
        <div class="logo">Salón · Turnos</div>
        <button class="salir" (click)="salir()">Cerrar sesión</button>
      </header>

      <main class="home-main">
        <p class="saludo-eyebrow">Sesión iniciada</p>
        <h1 class="saludo">Hola, {{ usuario()?.nombre }}.</h1>
        <p class="saludo-sub">
          El login funciona. Este es tu panel; desde acá vamos a construir
          la agenda de turnos.
        </p>

        @if (perfil()) {
          <div class="tarjeta-perfil">
            <p class="tp-titulo">Datos verificados contra el servidor</p>
            <dl>
              <div><dt>Nombre</dt><dd>{{ perfil()?.nombre }} {{ perfil()?.apellido }}</dd></div>
              <div><dt>Email</dt><dd>{{ perfil()?.email }}</dd></div>
              <div><dt>Teléfono</dt><dd>{{ perfil()?.telefono || '—' }}</dd></div>
            </dl>
            <span class="badge-ok">Token JWT válido ✓</span>
          </div>
        }

        @if (errorPerfil()) {
          <div class="alerta alerta-error">{{ errorPerfil() }}</div>
        }
      </main>
    </div>
  `,
  styles: [`
    .home-wrap { min-height: 100dvh; }
    .home-top {
      display: flex; justify-content: space-between; align-items: center;
      padding: 1.3rem 2rem; border-bottom: 1px solid var(--line);
      background: var(--white);
    }
    .home-top .logo {
      font-family: 'Fraunces', serif; font-weight: 600; font-size: 1.15rem;
    }
    .salir {
      background: none; border: 1px solid var(--line); color: var(--ink-soft);
      padding: 0.5rem 1rem; border-radius: var(--radius-sm); cursor: pointer;
      font-family: 'Inter', sans-serif; font-size: 0.85rem; font-weight: 500;
      transition: background 0.18s;
    }
    .salir:hover { background: var(--bone-deep); }
    .home-main { max-width: 620px; margin: 0 auto; padding: 4rem 2rem; }
    .saludo-eyebrow {
      text-transform: uppercase; letter-spacing: 0.12em; font-size: 0.72rem;
      font-weight: 600; color: var(--clay); margin-bottom: 0.6rem;
    }
    .saludo { font-size: 2.6rem; margin-bottom: 0.7rem; }
    .saludo-sub { color: var(--ink-soft); font-size: 1.05rem; margin-bottom: 2.4rem; max-width: 46ch; }
    .tarjeta-perfil {
      background: var(--white); border: 1px solid var(--line);
      border-radius: var(--radius); padding: 1.6rem; box-shadow: var(--shadow-sm);
    }
    .tp-titulo {
      font-size: 0.8rem; color: var(--ink-soft); margin-bottom: 1rem;
      text-transform: uppercase; letter-spacing: 0.06em;
    }
    .tarjeta-perfil dl { display: grid; gap: 0.8rem; margin-bottom: 1.2rem; }
    .tarjeta-perfil dl > div { display: flex; justify-content: space-between; align-items: baseline; }
    .tarjeta-perfil dt { color: var(--ink-soft); font-size: 0.9rem; }
    .tarjeta-perfil dd { font-weight: 500; }
    .badge-ok {
      display: inline-block; background: #e4efe1; color: var(--ok);
      padding: 0.35rem 0.7rem; border-radius: 999px; font-size: 0.8rem; font-weight: 500;
    }
    .alerta { padding: 0.75rem 0.9rem; border-radius: var(--radius-sm); font-size: 0.88rem; }
    .alerta-error { background: #f7e4e0; color: var(--error); }
  `],
})
export class HomeComponent implements OnInit {
  usuario = signal<Usuario | null>(null);
  perfil = signal<Usuario | null>(null);
  errorPerfil = signal('');

  constructor(private auth: AuthService, private router: Router) {}

  ngOnInit() {
    this.usuario.set(this.auth.usuario());
    // Verificamos la sesión contra el backend (ruta protegida con JWT).
    this.auth.cargarPerfil().subscribe({
      next: (u) => this.perfil.set(u),
      error: () => this.errorPerfil.set('No se pudo verificar la sesión con el servidor.'),
    });
  }

  salir() {
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}
