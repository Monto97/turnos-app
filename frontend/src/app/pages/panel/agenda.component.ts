import { Component, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { Profesional, Servicio, Turno, Bloqueo, Cliente, EstadoTurno } from '../../core/dominio.models';
import {
  DIAS, fechaISO, fechaHoraISO, inicioSemana, sumarDias, parseLocal,
  minutosDelDia, mismaFecha, rangoLabel,
} from './fecha.utils';

// Rango horario visible de la grilla (8:00 a 21:00).
const HORA_INI = 8;
const HORA_FIN = 21;
const PX_POR_MIN = 48 / 60; // cada hora mide 48px

interface EventoPos {
  turno: Turno;
  col: number;      // 0..6 (día de la semana, lunes=0)
  top: number;      // px desde el inicio de la grilla
  alto: number;     // px
}
interface BloqueoPos {
  bloqueo: Bloqueo;
  col: number; top: number; alto: number;
}

@Component({
  selector: 'app-agenda',
  standalone: true,
  imports: [FormsModule],
  template: `
    <header class="panel-header">
      <div>
        <h1>Agenda</h1>
        <p class="sub">Tus turnos de la semana. Tocá un hueco para reservar.</p>
      </div>
      <button class="btn btn-primary btn-inline" (click)="abrirNuevo()">+ Nuevo turno</button>
    </header>

    <div class="panel-body">
      <div class="agenda-toolbar">
        <div class="nav-fechas">
          <button class="flecha" (click)="semanaAnterior()" aria-label="Semana anterior">‹</button>
          <button class="flecha" (click)="hoy()" title="Hoy" style="width:auto;padding:0 0.7rem;font-size:0.85rem;">Hoy</button>
          <button class="flecha" (click)="semanaSiguiente()" aria-label="Semana siguiente">›</button>
        </div>
        <div class="fecha-titulo">{{ tituloRango() }}</div>
        <div class="spacer"></div>
        <select [(ngModel)]="filtroProf" (ngModelChange)="cargar()">
          <option [ngValue]="null">Todos los profesionales</option>
          @for (p of profesionales(); track p.id) {
            <option [ngValue]="p.id">{{ p.nombre }}</option>
          }
        </select>
      </div>

      @if (profesionales().length === 0) {
        <div class="card vacio-estado">
          <span class="emoji">✂️</span>
          <p>Todavía no cargaste profesionales ni servicios.</p>
          <p style="margin-top:0.4rem;">
            Andá a <strong>Configuración</strong> para dar de alta quién atiende
            y qué servicios ofrecés. Después vas a poder cargar turnos acá.
          </p>
        </div>
      } @else {
        <div class="cal">
          <div class="cal-head">
            <div class="celda-esquina"></div>
            @for (d of diasSemana(); track d.getTime()) {
              <div class="celda-dia" [class.hoy]="esHoy(d)">
                {{ nombreDia(d) }}
                <span class="num">{{ d.getDate() }}</span>
              </div>
            }
          </div>
          <div class="cal-body">
            <div class="cal-horas">
              @for (h of horas; track h) {
                <div class="cal-hora">{{ h }}:00</div>
              }
            </div>
            @for (col of [0,1,2,3,4,5,6]; track col) {
              <div class="cal-col">
                @for (h of horas; track h) {
                  <div class="cal-slot" (click)="clickSlot(col, h)"></div>
                }
                <!-- Bloqueos de esta columna -->
                @for (b of bloqueosPos(); track b.bloqueo.id) {
                  @if (b.col === col) {
                    <div class="bloqueo-franja" [style.top.px]="b.top" [style.height.px]="b.alto"
                         [title]="b.bloqueo.motivo || 'Cerrado'">
                      {{ b.bloqueo.motivo || 'Cerrado' }}
                    </div>
                  }
                }
                <!-- Turnos de esta columna -->
                @for (e of eventosPos(); track e.turno.id) {
                  @if (e.col === col) {
                    <div class="evento" [class]="e.turno.estado"
                         [style.top.px]="e.top" [style.height.px]="e.alto"
                         [style.background]="e.turno.color_agenda"
                         (click)="abrirDetalle(e.turno, $event)">
                      <div class="ev-hora">{{ horaDe(e.turno.inicio) }}</div>
                      <div class="ev-cliente">{{ e.turno.cliente }}</div>
                      <div class="ev-serv">{{ e.turno.servicio }}</div>
                    </div>
                  }
                }
              </div>
            }
          </div>
        </div>
      }
    </div>

    <!-- ===== MODAL NUEVO / EDITAR TURNO ===== -->
    @if (modalNuevo()) {
      <div class="modal-fondo" (click)="cerrarModales()">
        <div class="modal" (click)="$event.stopPropagation()">
          <div class="modal-head">
            <h2>Nuevo turno</h2>
            <button class="cerrar" (click)="cerrarModales()">×</button>
          </div>
          <div class="modal-body">
            @if (errorModal()) { <div class="alerta alerta-error">{{ errorModal() }}</div> }

            <div class="campo">
              <label>Profesional</label>
              <select [(ngModel)]="fProf" (ngModelChange)="onCambioFormulario()"
                      style="width:100%;padding:0.8rem 0.9rem;border-radius:9px;border:1px solid var(--line);background:var(--white);">
                <option [ngValue]="null" disabled>Elegí…</option>
                @for (p of profesionales(); track p.id) {
                  <option [ngValue]="p.id">{{ p.nombre }}</option>
                }
              </select>
            </div>

            <div class="campo">
              <label>Servicio</label>
              <select [(ngModel)]="fServ" (ngModelChange)="onCambioFormulario()"
                      style="width:100%;padding:0.8rem 0.9rem;border-radius:9px;border:1px solid var(--line);background:var(--white);">
                <option [ngValue]="null" disabled>Elegí…</option>
                @for (s of serviciosDisponibles(); track s.id) {
                  <option [ngValue]="s.id">{{ s.nombre }} · {{ s.duracion_min }}min · &#36;{{ s.precio }}</option>
                }
              </select>
            </div>

            <div class="fila-2">
              <div class="campo">
                <label>Fecha</label>
                <input type="date" [(ngModel)]="fFecha" (ngModelChange)="onCambioFormulario()" />
              </div>
            </div>

            <div class="campo">
              <label>Horario disponible</label>
              @if (cargandoSlots()) {
                <p class="slots-vacio">Buscando horarios…</p>
              } @else if (!fProf || !fServ || !fFecha) {
                <p class="slots-vacio">Elegí profesional, servicio y fecha.</p>
              } @else if (slots().length === 0) {
                <p class="slots-vacio">No hay horarios libres ese día.</p>
              } @else {
                <div class="slots-grid">
                  @for (s of slots(); track s) {
                    <button class="slot-btn" [class.sel]="fHora === s" (click)="fHora = s">{{ s }}</button>
                  }
                </div>
              }
            </div>

            <div class="seccion-tit" style="font-size:1rem;margin:1.2rem 0 0.6rem;">Cliente</div>
            <div class="fila-2">
              <div class="campo">
                <label>Nombre</label>
                <input [(ngModel)]="cNombre" placeholder="Nombre y apellido" />
              </div>
              <div class="campo">
                <label>Teléfono</label>
                <input [(ngModel)]="cTel" placeholder="Opcional" />
              </div>
            </div>

            <div class="modal-acciones">
              <button class="btn btn-ghost btn-inline" (click)="cerrarModales()">Cancelar</button>
              <button class="btn btn-primary btn-inline" [disabled]="guardando()" (click)="guardarNuevo()">
                {{ guardando() ? 'Guardando…' : 'Reservar turno' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    }

    <!-- ===== MODAL DETALLE ===== -->
    @if (detalle()) {
      <div class="modal-fondo" (click)="cerrarModales()">
        <div class="modal" (click)="$event.stopPropagation()">
          <div class="modal-head">
            <h2>Turno</h2>
            <button class="cerrar" (click)="cerrarModales()">×</button>
          </div>
          <div class="modal-body">
            @if (errorModal()) { <div class="alerta alerta-error">{{ errorModal() }}</div> }
            <div class="card" style="margin-bottom:1rem;">
              <div style="display:flex;justify-content:space-between;align-items:start;">
                <div>
                  <div style="font-weight:600;font-size:1.1rem;">{{ detalle()!.cliente }}</div>
                  <div style="color:var(--ink-soft);font-size:0.88rem;margin-top:0.2rem;">
                    {{ detalle()!.cliente_tel || 'Sin teléfono' }}
                  </div>
                </div>
                <span class="chip chip-{{ detalle()!.estado }}">{{ detalle()!.estado }}</span>
              </div>
              <hr style="border:none;border-top:1px solid var(--line);margin:0.9rem 0;">
              <div style="font-size:0.9rem;line-height:1.8;">
                <div><strong>{{ detalle()!.servicio }}</strong> · {{ detalle()!.duracion_min }} min</div>
                <div>{{ fechaLarga(detalle()!.inicio) }}, {{ horaDe(detalle()!.inicio) }}–{{ horaDe(detalle()!.fin) }}</div>
                <div>{{ detalle()!.profesional }}</div>
                <div style="color:var(--ink-soft);">Precio: &#36;{{ detalle()!.precio_snapshot }}
                  @if (detalle()!.sena_requerida > 0) {
                    · Seña: &#36;{{ detalle()!.sena_requerida }}
                    {{ detalle()!.sena_pagada ? '(pagada)' : '(pendiente)' }}
                  }
                </div>
              </div>
            </div>

            <label style="font-size:0.82rem;color:var(--ink-soft);font-weight:500;">Cambiar estado</label>
            <div class="slots-grid" style="grid-template-columns:repeat(3,1fr);margin:0.4rem 0 0.6rem;">
              @for (e of estadosPosibles; track e) {
                <button class="slot-btn" [class.sel]="detalle()!.estado === e"
                        (click)="cambiarEstado(e)">{{ e }}</button>
              }
            </div>

            <div class="modal-acciones">
              <button class="btn btn-peligro btn-inline" (click)="eliminar()">Eliminar</button>
              <button class="btn btn-ghost btn-inline" (click)="cerrarModales()">Cerrar</button>
            </div>
          </div>
        </div>
      </div>
    }
  `,
})
export class AgendaComponent implements OnInit {
  horas: number[] = [];
  estadosPosibles: EstadoTurno[] = ['pendiente', 'confirmado', 'completado', 'ausente', 'cancelado'];

  // Estado de la vista
  lunes = signal<Date>(inicioSemana(new Date()));
  profesionales = signal<Profesional[]>([]);
  servicios = signal<Servicio[]>([]);
  turnos = signal<Turno[]>([]);
  bloqueos = signal<Bloqueo[]>([]);
  filtroProf: number | null = null;

  // Modales
  modalNuevo = signal(false);
  detalle = signal<Turno | null>(null);
  errorModal = signal('');
  guardando = signal(false);

  // Formulario de nuevo turno
  fProf: number | null = null;
  fServ: number | null = null;
  fFecha = '';
  fHora = '';
  cNombre = '';
  cTel = '';
  slots = signal<string[]>([]);
  cargandoSlots = signal(false);
  serviciosDisponibles = signal<Servicio[]>([]);

  constructor(private api: ApiService) {
    for (let h = HORA_INI; h < HORA_FIN; h++) this.horas.push(h);
  }

  ngOnInit() {
    this.api.getProfesionales().subscribe((p) => this.profesionales.set(p));
    this.api.getServicios().subscribe((s) => {
      this.servicios.set(s);
      this.serviciosDisponibles.set(s);
    });
    this.cargar();
  }

  // --- Navegación de semanas ---
  diasSemana = computed(() => {
    const base = this.lunes();
    return [0, 1, 2, 3, 4, 5, 6].map((i) => sumarDias(base, i));
  });
  tituloRango = computed(() => rangoLabel(this.lunes()));
  semanaAnterior() { this.lunes.set(sumarDias(this.lunes(), -7)); this.cargar(); }
  semanaSiguiente() { this.lunes.set(sumarDias(this.lunes(), 7)); this.cargar(); }
  hoy() { this.lunes.set(inicioSemana(new Date())); this.cargar(); }

  esHoy(d: Date) { return mismaFecha(d, new Date()); }
  nombreDia(d: Date) { return DIAS[d.getDay()]; }

  cargar() {
    const desde = fechaISO(this.lunes()) + ' 00:00:00';
    const hasta = fechaISO(sumarDias(this.lunes(), 7)) + ' 00:00:00';
    this.api.getTurnos(desde, hasta, this.filtroProf ?? undefined)
      .subscribe((t) => this.turnos.set(t));
    this.api.getBloqueos(desde, hasta).subscribe((b) => this.bloqueos.set(b));
  }

  // --- Posicionamiento de eventos en la grilla ---
  eventosPos = computed<EventoPos[]>(() => {
    const base = this.lunes();
    const res: EventoPos[] = [];
    for (const t of this.turnos()) {
      const ini = parseLocal(t.inicio);
      const col = Math.floor((new Date(ini.getFullYear(), ini.getMonth(), ini.getDate()).getTime()
        - new Date(base.getFullYear(), base.getMonth(), base.getDate()).getTime()) / 86400000);
      if (col < 0 || col > 6) continue;
      const minIni = minutosDelDia(t.inicio) - HORA_INI * 60;
      const minFin = minutosDelDia(t.fin) - HORA_INI * 60;
      res.push({
        turno: t,
        col,
        top: Math.max(0, minIni * PX_POR_MIN),
        alto: Math.max(18, (minFin - minIni) * PX_POR_MIN - 2),
      });
    }
    return res;
  });

  bloqueosPos = computed<BloqueoPos[]>(() => {
    const base = this.lunes();
    const res: BloqueoPos[] = [];
    for (const b of this.bloqueos()) {
      const ini = parseLocal(b.inicio);
      const col = Math.floor((new Date(ini.getFullYear(), ini.getMonth(), ini.getDate()).getTime()
        - new Date(base.getFullYear(), base.getMonth(), base.getDate()).getTime()) / 86400000);
      if (col < 0 || col > 6) continue;
      const minIni = Math.max(0, minutosDelDia(b.inicio) - HORA_INI * 60);
      const minFin = Math.min((HORA_FIN - HORA_INI) * 60, minutosDelDia(b.fin) - HORA_INI * 60);
      if (minFin <= minIni) continue;
      res.push({
        bloqueo: b, col,
        top: minIni * PX_POR_MIN,
        alto: (minFin - minIni) * PX_POR_MIN,
      });
    }
    return res;
  });

  horaDe(s: string) {
    const d = parseLocal(s);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  fechaLarga(s: string) {
    const d = parseLocal(s);
    return `${DIAS[d.getDay()]} ${d.getDate()}`;
  }

  // --- Nuevo turno ---
  abrirNuevo() {
    this.limpiarFormulario();
    this.modalNuevo.set(true);
  }
  clickSlot(col: number, hora: number) {
    const dia = sumarDias(this.lunes(), col);
    this.limpiarFormulario();
    this.fFecha = fechaISO(dia);
    this.fHora = `${String(hora).padStart(2, '0')}:00`;
    this.modalNuevo.set(true);
  }
  limpiarFormulario() {
    this.fProf = this.filtroProf ?? null;
    this.fServ = null; this.fFecha = ''; this.fHora = '';
    this.cNombre = ''; this.cTel = '';
    this.slots.set([]); this.errorModal.set('');
    this.serviciosDisponibles.set(this.servicios());
  }

  onCambioFormulario() {
    this.fHora = '';
    // Si hay profesional, filtramos servicios que ofrece.
    if (this.fProf) {
      this.api.getServiciosDeProfesional(this.fProf).subscribe((s) => {
        this.serviciosDisponibles.set(s.length ? s : this.servicios());
      });
    }
    if (this.fProf && this.fServ && this.fFecha) {
      this.cargandoSlots.set(true);
      this.api.getDisponibilidad(this.fProf, this.fServ, this.fFecha).subscribe({
        next: (r) => { this.slots.set(r.slots); this.cargandoSlots.set(false); },
        error: () => { this.slots.set([]); this.cargandoSlots.set(false); },
      });
    }
  }

  guardarNuevo() {
    this.errorModal.set('');
    if (!this.fProf || !this.fServ || !this.fFecha || !this.fHora) {
      this.errorModal.set('Completá profesional, servicio, fecha y horario.');
      return;
    }
    if (!this.cNombre.trim()) {
      this.errorModal.set('Ingresá el nombre del cliente.');
      return;
    }
    this.guardando.set(true);
    const inicio = `${this.fFecha} ${this.fHora}:00`;

    // Creamos (o reutilizamos) el cliente y después el turno.
    this.api.crearCliente({ nombre: this.cNombre.trim(), telefono: this.cTel.trim() || undefined })
      .subscribe({
        next: (cli) => this.crearTurnoCon(cli.id, inicio),
        error: (e) => this.finError(e),
      });
  }
  private crearTurnoCon(clienteId: number, inicio: string) {
    this.api.crearTurno({
      clienteId, profesionalId: this.fProf!, servicioId: this.fServ!, inicio,
    }).subscribe({
      next: () => { this.guardando.set(false); this.cerrarModales(); this.cargar(); },
      error: (e) => this.finError(e),
    });
  }
  private finError(e: any) {
    this.guardando.set(false);
    this.errorModal.set(e.error?.error || 'No se pudo crear el turno.');
  }

  // --- Detalle / edición ---
  abrirDetalle(t: Turno, ev: Event) {
    ev.stopPropagation();
    this.errorModal.set('');
    this.detalle.set(t);
  }
  cambiarEstado(estado: EstadoTurno) {
    const t = this.detalle();
    if (!t) return;
    this.api.cambiarEstadoTurno(t.id, estado).subscribe({
      next: () => { this.detalle.set({ ...t, estado }); this.cargar(); },
      error: (e) => this.errorModal.set(e.error?.error || 'No se pudo cambiar el estado.'),
    });
  }
  eliminar() {
    const t = this.detalle();
    if (!t) return;
    if (!confirm('¿Eliminar este turno? No se puede deshacer.')) return;
    this.api.eliminarTurno(t.id).subscribe({
      next: () => { this.cerrarModales(); this.cargar(); },
      error: (e) => this.errorModal.set(e.error?.error || 'No se pudo eliminar.'),
    });
  }

  cerrarModales() {
    this.modalNuevo.set(false);
    this.detalle.set(null);
    this.errorModal.set('');
  }
}
