import { Component, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ReservaService, ResultadoReserva } from '../../core/reserva.service';
import { Servicio, Profesional } from '../../core/dominio.models';
import { DIAS, MESES, fechaISO, parseLocal } from '../panel/fecha.utils';

const WA_JULI = '5492241689216';

@Component({
  selector: 'app-reserva',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="reserva-wrap">
      <div class="reserva-top">
        <div class="negocio">Salón</div>
        <div class="sub">{{ modoConsulta() ? 'Cita de asesoramiento' : 'Reservá tu turno online' }}</div>
      </div>

      @if (!modoConsulta()) {
        <div class="pasos">
          @for (n of [1,2,3,4]; track n) {
            <div class="paso-punto" [class.activo]="paso() === n" [class.hecho]="paso() > n"></div>
          }
        </div>
      }

      <div class="reserva-body">
        <!-- ===== MODO CONSULTA: Asesoramiento de Tocado ===== -->
        @if (modoConsulta()) {
          <button class="btn-volver" (click)="salirConsulta()">‹ Volver</button>
          <h1 class="reserva-titulo-paso">Cita online con Juli</h1>
          <p class="reserva-ayuda-paso">15 minutos para asesorarte sobre tu tocado — sin costo.</p>

          <div class="card-info-consulta">
            <div class="card-info-icon">💬</div>
            <div>
              <div class="card-info-titulo">¿No sabés qué tocado hacerte?</div>
              <div class="card-info-texto">Juli te asesora por videollamada para ayudarte a elegir el tocado ideal para tu evento. También podés consultarla si tenés alguna duda.</div>
            </div>
          </div>

          @if (error()) { <div class="alerta alerta-error">{{ error() }}</div> }

          <div class="campo">
            <label>Tu nombre</label>
            <input [(ngModel)]="cNombre" placeholder="Nombre y apellido" />
          </div>
          <div class="campo">
            <label>Teléfono (opcional)</label>
            <input [(ngModel)]="cTel" type="tel" placeholder="Para coordinar la videollamada" />
          </div>
        }

        <!-- ===== PASO 1: SERVICIO ===== -->
        @if (!modoConsulta() && paso() === 1) {
          <h1 class="reserva-titulo-paso">¿Qué te querés hacer?</h1>
          <p class="reserva-ayuda-paso">Elegí el servicio.</p>
          @if (cargando()) { <div class="cargando-c">Cargando servicios…</div> }
          @for (s of servicios(); track s.id) {
            <div class="opcion" [class.sel]="servSel()?.id === s.id" (click)="elegirServicio(s)">
              <div class="op-info">
                <div class="op-nombre">{{ s.nombre }}</div>
                <div class="op-detalle">{{ s.duracion_min }} min</div>
              </div>
              <div class="op-precio">&#36;{{ s.precio }}</div>
            </div>
          } @empty {
            @if (!cargando()) {
              <div class="cargando-c">Todavía no hay servicios disponibles para reservar.</div>
            }
          }

          @if (!cargando()) {
            <div class="consulta-sep">o si querés un tocado personalizado</div>
            <div class="opcion opcion-personalizado" (click)="elegirTocadoPersonalizado()">
              <div class="op-info">
                <div class="op-nombre">Tocado personalizado</div>
                <div class="op-detalle">Cita online de 15 min con Juli · Asesoramiento gratuito</div>
              </div>
              <div class="op-precio-consulta">Gratis</div>
            </div>
          }
        }

        <!-- ===== PASO 2: PROFESIONAL ===== -->
        @if (!modoConsulta() && paso() === 2) {
          <button class="btn-volver" (click)="volver()">‹ Volver</button>
          <h1 class="reserva-titulo-paso">¿Con quién?</h1>
          <p class="reserva-ayuda-paso">Elegí profesional o dejá que te asignemos el primero disponible.</p>

          <div class="opcion opcion-con-avatar" [class.sel]="profSel() === 'cualquiera'"
               (click)="elegirProfesional('cualquiera')">
            <div class="op-avatar" style="background:var(--olive);">★</div>
            <div class="op-info">
              <div class="op-nombre">Cualquiera disponible</div>
              <div class="op-detalle">El primer horario libre, sin preferencia</div>
            </div>
          </div>

          @for (p of profesionales(); track p.id) {
            <div class="opcion opcion-con-avatar" [class.sel]="profSel() === p.id"
                 (click)="elegirProfesional(p.id)">
              <div class="op-avatar" [style.background]="p.color_agenda">{{ inicial(p.nombre) }}</div>
              <div class="op-info">
                <div class="op-nombre">{{ p.nombre }}</div>
              </div>
            </div>
          }
        }

        <!-- ===== PASO 3: DÍA Y HORA ===== -->
        @if (!modoConsulta() && paso() === 3) {
          <button class="btn-volver" (click)="volver()">‹ Volver</button>
          <h1 class="reserva-titulo-paso">¿Cuándo?</h1>
          <p class="reserva-ayuda-paso">Elegí el día y el horario que más te sirva.</p>

          <div class="cal-mes-header">
            <button class="flecha" (click)="mesAnterior()" [disabled]="esMesActual()">‹</button>
            <span class="cal-mes-titulo">{{ mesNombre() }} {{ anioVista() }}</span>
            <button class="flecha" (click)="mesSiguiente()">›</button>
          </div>

          <div class="cal-mes-semana">
            @for (n of ['Lu','Ma','Mi','Ju','Vi','Sa','Do']; track n) {
              <div class="cal-mes-dia-nom">{{ n }}</div>
            }
          </div>

          <div class="cal-mes-grid">
            @for (d of diasCalendario(); track d.key) {
              @if (d.vacio) {
                <div></div>
              } @else {
                <div class="cal-mes-celda"
                     [class.hoy]="d.iso === hoyISO"
                     [class.sel]="fechaSel() === d.iso"
                     [class.pasado]="d.pasado"
                     (click)="d.pasado ? null : elegirFecha(d.iso)">
                  {{ d.num }}
                </div>
              }
            }
          </div>

          @if (!fechaSel()) {
            <p class="reserva-ayuda-paso">Elegí un día para ver los horarios.</p>
          } @else if (cargandoSlots()) {
            <div class="cargando-c">Buscando horarios…</div>
          } @else if (slots().length === 0) {
            <div class="cargando-c">No hay horarios libres ese día. Probá con otro.</div>
          } @else {
            <div class="horarios-grid">
              @for (h of slots(); track h) {
                <button class="hora-btn" [class.sel]="horaSel() === h" (click)="elegirHora(h)">{{ h }}</button>
              }
            </div>
          }
        }

        <!-- ===== PASO 4: DATOS Y CONFIRMAR ===== -->
        @if (!modoConsulta() && paso() === 4) {
          <button class="btn-volver" (click)="volver()">‹ Volver</button>
          <h1 class="reserva-titulo-paso">Tus datos</h1>
          <p class="reserva-ayuda-paso">Para confirmar y avisarte del turno.</p>

          <div class="resumen">
            <div class="resumen-fila"><span class="lbl">Servicio</span><span class="val">{{ servSel()?.nombre }}</span></div>
            <div class="resumen-fila"><span class="lbl">Profesional</span><span class="val">{{ nombreProfResumen() }}</span></div>
            <div class="resumen-fila"><span class="lbl">Día y hora</span><span class="val">{{ fechaLegible() }}, {{ horaSel() }}</span></div>
            <div class="resumen-fila resumen-total">
              <span class="lbl">Total</span><span class="val">&#36;{{ servSel()?.precio }}</span>
            </div>
            @if ((servSel()?.sena_monto || 0) > 0) {
              <div style="text-align:center;">
                <span class="badge-sena">Seña de &#36;{{ servSel()?.sena_monto }} para confirmar</span>
              </div>
            }
          </div>

          @if (error()) { <div class="alerta alerta-error">{{ error() }}</div> }

          <div class="campo">
            <label>Nombre y apellido</label>
            <input [(ngModel)]="cNombre" placeholder="Tu nombre" />
          </div>
          <div class="campo">
            <label>Teléfono</label>
            <input [(ngModel)]="cTel" type="tel" placeholder="Para avisarte" />
          </div>
          <div class="campo">
            <label>Email (opcional)</label>
            <input [(ngModel)]="cEmail" type="email" placeholder="tu@email.com" />
          </div>
        }
      </div>

      <!-- FOOTER con botón de avanzar -->
      <div class="reserva-footer">
        @if (modoConsulta()) {
          <button class="btn btn-whatsapp" (click)="abrirWhatsApp()">Consultar por WhatsApp</button>
        } @else if (paso() === 1) {
          <button class="btn btn-primary" [disabled]="!servSel()" (click)="siguiente()">Continuar</button>
        } @else if (paso() === 2) {
          <button class="btn btn-primary" [disabled]="!profSel()" (click)="siguiente()">Continuar</button>
        } @else if (paso() === 3) {
          <button class="btn btn-primary" [disabled]="!horaSel()" (click)="siguiente()">Continuar</button>
        } @else if (paso() === 4) {
          <button class="btn btn-primary" [disabled]="reservando()" (click)="confirmar()">
            {{ reservando() ? 'Reservando…' : textoBotonFinal() }}
          </button>
        }
      </div>
    </div>
  `,
})
export class ReservaComponent implements OnInit {
  paso = signal(1);
  modoConsulta = signal(false);
  cargando = signal(false);
  cargandoSlots = signal(false);
  reservando = signal(false);
  error = signal('');

  servicios = signal<Servicio[]>([]);
  profesionales = signal<Profesional[]>([]);
  slots = signal<string[]>([]);

  servSel = signal<Servicio | null>(null);
  profSel = signal<number | 'cualquiera' | null>(null);
  fechaSel = signal<string>('');
  horaSel = signal<string>('');

  cNombre = '';
  cTel = '';
  cEmail = '';

  constructor(private rsv: ReservaService, private router: Router) {}

  ngOnInit() {
    this.cargando.set(true);
    this.rsv.getServicios().subscribe({
      next: (s) => { this.servicios.set(s); this.cargando.set(false); },
      error: () => { this.error.set('No se pudieron cargar los servicios.'); this.cargando.set(false); },
    });
  }

  // --- Calendario mensual ---
  private _hoy = (() => { const d = new Date(); d.setHours(0,0,0,0); return d; })();
  hoyISO = fechaISO(this._hoy);

  mesVista = signal({ year: this._hoy.getFullYear(), month: this._hoy.getMonth() });

  mesNombre = computed(() => MESES[this.mesVista().month]);
  anioVista = computed(() => this.mesVista().year);

  esMesActual = computed(() => {
    const { year, month } = this.mesVista();
    return year === this._hoy.getFullYear() && month === this._hoy.getMonth();
  });

  diasCalendario = computed(() => {
    const { year, month } = this.mesVista();
    const primerDia = new Date(year, month, 1);
    const diasEnMes = new Date(year, month + 1, 0).getDate();
    let primerDow = primerDia.getDay();
    primerDow = primerDow === 0 ? 6 : primerDow - 1; // lunes = 0

    const celdas: Array<{ key: string; vacio: boolean; iso: string; num: number; pasado: boolean }> = [];
    for (let i = 0; i < primerDow; i++) {
      celdas.push({ key: `e${i}`, vacio: true, iso: '', num: 0, pasado: false });
    }
    for (let d = 1; d <= diasEnMes; d++) {
      const fecha = new Date(year, month, d);
      fecha.setHours(0, 0, 0, 0);
      const iso = fechaISO(fecha);
      celdas.push({ key: iso, vacio: false, iso, num: d, pasado: fecha < this._hoy });
    }
    return celdas;
  });

  mesAnterior() {
    const { year, month } = this.mesVista();
    this.mesVista.set(month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 });
  }
  mesSiguiente() {
    const { year, month } = this.mesVista();
    this.mesVista.set(month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 });
  }

  inicial(nombre: string) { return nombre.trim().charAt(0).toUpperCase(); }

  // --- Paso 1 ---
  elegirServicio(s: Servicio) { this.servSel.set(s); }

  // --- Paso 2 ---
  elegirProfesional(p: number | 'cualquiera') { this.profSel.set(p); }

  // --- Paso 3 ---
  elegirFecha(iso: string) {
    this.fechaSel.set(iso);
    this.horaSel.set('');
    this.cargarSlots();
  }
  elegirHora(h: string) { this.horaSel.set(h); }

  cargarSlots() {
    const serv = this.servSel();
    if (!serv || !this.fechaSel()) return;
    const prof = this.profSel() === 'cualquiera' ? null : (this.profSel() as number);
    this.cargandoSlots.set(true);
    this.rsv.getDisponibilidad(serv.id, this.fechaSel(), prof).subscribe({
      next: (r) => { this.slots.set(r.slots); this.cargandoSlots.set(false); },
      error: () => { this.slots.set([]); this.cargandoSlots.set(false); },
    });
  }

  // --- Navegación ---
  siguiente() {
    const p = this.paso();
    if (p === 1 && this.servSel()) {
      // Al pasar a profesional, cargamos los que hacen ese servicio.
      this.rsv.getProfesionales(this.servSel()!.id).subscribe((profs) => this.profesionales.set(profs));
      this.paso.set(2);
    } else if (p === 2 && this.profSel()) {
      this.paso.set(3);
    } else if (p === 3 && this.horaSel()) {
      this.paso.set(4);
    }
  }
  volver() {
    if (this.paso() > 1) this.paso.set(this.paso() - 1);
  }

  // --- Resumen ---
  nombreProfResumen() {
    if (this.profSel() === 'cualquiera') return 'Primero disponible';
    const p = this.profesionales().find((x) => x.id === this.profSel());
    return p?.nombre || '';
  }
  fechaLegible() {
    if (!this.fechaSel()) return '';
    const d = parseLocal(this.fechaSel() + ' 00:00');
    return `${DIAS[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()].slice(0, 3)}`;
  }
  textoBotonFinal() {
    return (this.servSel()?.sena_monto || 0) > 0 ? 'Reservar y pagar seña' : 'Confirmar turno';
  }

  // --- Tocado personalizado ---
  elegirTocadoPersonalizado() {
    this.modoConsulta.set(true);
    this.cNombre = '';
    this.cTel = '';
    this.error.set('');
  }

  salirConsulta() {
    this.modoConsulta.set(false);
    this.error.set('');
  }

  abrirWhatsApp() {
    this.error.set('');
    if (!this.cNombre.trim()) { this.error.set('Ingresá tu nombre para continuar.'); return; }
    const partes = [
      `Hola Juli! Te escribo desde Studio Belle.`,
      `Me gustaría tener una cita online de 15 min para asesorarme sobre un tocado personalizado.`,
      ``,
      `Nombre: ${this.cNombre.trim()}`,
    ];
    if (this.cTel.trim()) partes.push(`Teléfono: ${this.cTel.trim()}`);
    window.open(`https://wa.me/${WA_JULI}?text=${encodeURIComponent(partes.join('\n'))}`, '_blank');
  }

  // --- Confirmar reserva ---
  confirmar() {
    this.error.set('');
    if (!this.cNombre.trim()) { this.error.set('Ingresá tu nombre.'); return; }
    if (!this.cTel.trim()) { this.error.set('Ingresá un teléfono de contacto.'); return; }

    this.reservando.set(true);
    const prof = this.profSel() === 'cualquiera' ? null : (this.profSel() as number);
    this.rsv.reservar({
      servicioId: this.servSel()!.id,
      profesionalId: prof,
      fecha: this.fechaSel(),
      hora: this.horaSel(),
      cliente: { nombre: this.cNombre.trim(), telefono: this.cTel.trim(), email: this.cEmail.trim() || undefined },
    }).subscribe({
      next: (res) => this.trasReservar(res),
      error: (e) => {
        this.reservando.set(false);
        this.error.set(e.error?.error || 'No se pudo crear la reserva. Probá otro horario.');
      },
    });
  }

  private trasReservar(res: ResultadoReserva) {
    if (res.requierePago) {
      // Pedimos la URL de pago (real o simulada) y redirigimos.
      this.rsv.pagarSena(res.turnoId).subscribe({
        next: (pago) => { window.location.href = pago.url; },
        error: () => {
          this.reservando.set(false);
          // Si falla el pago, igual la reserva quedó pendiente: vamos a la confirmación.
          this.router.navigate(['/reserva-confirmada'], { queryParams: { turno: res.turnoId } });
        },
      });
    } else {
      this.router.navigate(['/reserva-confirmada'], { queryParams: { turno: res.turnoId } });
    }
  }
}
