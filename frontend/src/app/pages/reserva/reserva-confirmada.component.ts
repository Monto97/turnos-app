import { Component, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ReservaService, TurnoPublico } from '../../core/reserva.service';
import { AuthService } from '../../core/auth.service';
import { DIAS, MESES, parseLocal } from '../panel/fecha.utils';

@Component({
  selector: 'app-reserva-confirmada',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="reserva-wrap">
      @if (cargando()) {
        <div class="cargando-c" style="margin-top:4rem;">Cargando tu turno…</div>
      } @else if (turno()) {
        <div class="exito">
          @if (pagoFallo()) {
            <div class="tilde" style="background:#f7e4e0;">
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#a83232" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>
            </div>
            <h1>Quedó pendiente</h1>
            <p>Tu turno quedó reservado pero la seña no se completó.</p>
            <p>Podés reintentar el pago o coordinar con el salón.</p>
          } @else {
            <div class="tilde">
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#4f7a4a" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>
            </div>
            <h1>¡Turno confirmado!</h1>
            <p>Te esperamos. Guardá estos datos:</p>
          }

          <div class="resumen" style="text-align:left;margin-top:1.4rem;">
            <div class="resumen-fila"><span class="lbl">Servicio</span><span class="val">{{ turno()!.servicio }}</span></div>
            <div class="resumen-fila"><span class="lbl">Profesional</span><span class="val">{{ turno()!.profesional }}</span></div>
            <div class="resumen-fila"><span class="lbl">Día y hora</span><span class="val">{{ fechaHora() }}</span></div>
            <div class="resumen-fila"><span class="lbl">A nombre de</span><span class="val">{{ turno()!.cliente }}</span></div>
            <div class="resumen-fila resumen-total">
              <span class="lbl">Estado</span>
              <span class="val">
                <span class="chip chip-{{ turno()!.estado }}">{{ turno()!.estado }}</span>
              </span>
            </div>
          </div>

          <a routerLink="/reservar" class="btn btn-primary" style="text-decoration:none;text-align:center;display:block;margin-top:1rem;">
            Reservar otro turno
          </a>
          @if (logueado()) {
            <a routerLink="/mis-turnos" class="btn btn-ghost" style="text-decoration:none;text-align:center;display:block;margin-top:0.6rem;">
              Ir a mis turnos
            </a>
          }

          @if (!logueado()) {
            <div class="card" style="margin-top:1.2rem;text-align:center;background:var(--bone-deep);">
              <p style="font-weight:600;margin-bottom:0.3rem;">¿Querés seguir tus turnos?</p>
              <p style="color:var(--ink-soft);font-size:0.88rem;margin-bottom:0.9rem;">
                Creá una cuenta con este mismo email o teléfono y vas a ver todas tus reservas en un solo lugar.
              </p>
              <a routerLink="/registro" class="btn btn-ghost btn-inline" style="text-decoration:none;">Crear mi cuenta</a>
            </div>
          }
        </div>
      } @else {
        <div class="cargando-c" style="margin-top:4rem;">No encontramos el turno.</div>
      }
    </div>
  `,
})
export class ReservaConfirmadaComponent implements OnInit {
  turno = signal<TurnoPublico | null>(null);
  cargando = signal(true);
  pagoFallo = signal(false);

  constructor(private route: ActivatedRoute, private rsv: ReservaService, private auth: AuthService) {}

  logueado = () => this.auth.estaLogueado();

  ngOnInit() {
    const turnoId = Number(this.route.snapshot.queryParamMap.get('turno'));
    const estado = this.route.snapshot.queryParamMap.get('estado');
    this.pagoFallo.set(estado === 'fallo');
    if (!turnoId) { this.cargando.set(false); return; }
    this.rsv.getTurno(turnoId).subscribe({
      next: (t) => { this.turno.set(t); this.cargando.set(false); },
      error: () => this.cargando.set(false),
    });
  }

  fechaHora() {
    const t = this.turno();
    if (!t) return '';
    const d = parseLocal(t.inicio);
    return `${DIAS[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()].slice(0, 3)}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
}
