import { Component, OnInit, computed, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { DIAS, MESES, parseLocal } from '../panel/fecha.utils';

interface MiTurno {
  id: number;
  inicio: string;
  fin: string;
  estado: string;
  servicio: string;
  profesional: string;
  precio_snapshot: number;
  sena_requerida: number;
  sena_pagada: boolean | number;
}

@Component({
  selector: 'app-mis-turnos',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="reserva-wrap">
      <div class="reserva-top" style="display:flex;justify-content:space-between;align-items:center;text-align:left;">
        <div>
          <div class="negocio" style="font-size:1.3rem;">Hola, {{ auth.usuario()?.nombre }}</div>
          <div class="sub">Tus turnos</div>
        </div>
        <button class="btn-volver" (click)="salir()" style="margin:0;">Salir</button>
      </div>

      <div class="reserva-body">
        <a routerLink="/reservar" class="btn btn-primary" style="text-decoration:none;text-align:center;display:block;margin-bottom:1.4rem;">
          + Reservar nuevo turno
        </a>

        @if (cargando()) {
          <div class="cargando-c">Cargando tus turnos…</div>
        } @else if (turnos().length === 0) {
          <div class="card vacio-estado">
            <span class="emoji">📅</span>
            <p>Todavía no tenés turnos.</p>
            <p style="margin-top:0.3rem;">Cuando reserves, van a aparecer acá.</p>
          </div>
        } @else {
          @if (proximos().length > 0) {
            <div class="seccion-tit" style="margin-top:0;">Próximos</div>
            @for (t of proximos(); track t.id) {
              <div class="card" style="margin-bottom:0.7rem;">
                <div style="display:flex;justify-content:space-between;align-items:start;">
                  <div>
                    <div style="font-weight:600;">{{ t.servicio }}</div>
                    <div style="color:var(--ink-soft);font-size:0.88rem;margin-top:0.2rem;">
                      {{ fechaHora(t.inicio) }} · {{ t.profesional }}
                    </div>
                  </div>
                  <span class="chip chip-{{ t.estado }}">{{ t.estado }}</span>
                </div>
                @if (puedeCancelar(t)) {
                  <button class="btn btn-peligro btn-inline" style="margin-top:0.8rem;width:100%;"
                          (click)="cancelar(t)">Cancelar turno</button>
                }
              </div>
            }
          }

          @if (pasados().length > 0) {
            <div class="seccion-tit">Anteriores</div>
            @for (t of pasados(); track t.id) {
              <div class="card" style="margin-bottom:0.7rem;opacity:0.75;">
                <div style="display:flex;justify-content:space-between;align-items:start;">
                  <div>
                    <div style="font-weight:600;">{{ t.servicio }}</div>
                    <div style="color:var(--ink-soft);font-size:0.88rem;margin-top:0.2rem;">
                      {{ fechaHora(t.inicio) }} · {{ t.profesional }}
                    </div>
                  </div>
                  <span class="chip chip-{{ t.estado }}">{{ t.estado }}</span>
                </div>
              </div>
            }
          }
        }

        @if (error()) { <div class="alerta alerta-error">{{ error() }}</div> }
      </div>
    </div>
  `,
})
export class MisTurnosComponent implements OnInit {
  turnos = signal<MiTurno[]>([]);
  cargando = signal(true);
  error = signal('');

  constructor(public auth: AuthService, private router: Router) {}

  ngOnInit() { this.cargar(); }

  cargar() {
    this.cargando.set(true);
    this.auth.misTurnos().subscribe({
      next: (t) => { this.turnos.set(t); this.cargando.set(false); },
      error: () => { this.error.set('No se pudieron cargar los turnos.'); this.cargando.set(false); },
    });
  }

  // Próximos: futuros y no cancelados. Pasados: el resto.
  proximos = computed(() =>
    this.turnos()
      .filter((t) => parseLocal(t.inicio) >= new Date() && t.estado !== 'cancelado')
      .sort((a, b) => parseLocal(a.inicio).getTime() - parseLocal(b.inicio).getTime())
  );
  pasados = computed(() =>
    this.turnos()
      .filter((t) => parseLocal(t.inicio) < new Date() || t.estado === 'cancelado')
  );

  puedeCancelar(t: MiTurno) {
    return t.estado !== 'cancelado' && t.estado !== 'completado' && parseLocal(t.inicio) >= new Date();
  }

  cancelar(t: MiTurno) {
    if (!confirm('¿Seguro que querés cancelar este turno?')) return;
    this.auth.cancelarMiTurno(t.id).subscribe({
      next: () => this.cargar(),
      error: (e) => this.error.set(e.error?.error || 'No se pudo cancelar.'),
    });
  }

  fechaHora(s: string) {
    const d = parseLocal(s);
    return `${DIAS[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()].slice(0, 3)}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  salir() {
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}
