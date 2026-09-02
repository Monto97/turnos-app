import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { Profesional, Servicio, HorarioLaboral } from '../../core/dominio.models';
import { DIAS } from './fecha.utils';

@Component({
  selector: 'app-configuracion',
  standalone: true,
  imports: [FormsModule],
  template: `
    <header class="panel-header">
      <div>
        <h1>Configuración</h1>
        <p class="sub">Cargá quién atiende, qué servicios ofrecés y los horarios.</p>
      </div>
    </header>

    <div class="panel-body">
      @if (mensaje()) { <div class="alerta alerta-ok">{{ mensaje() }}</div> }
      @if (error()) { <div class="alerta alerta-error">{{ error() }}</div> }

      <!-- SERVICIOS -->
      <div class="seccion-tit">Servicios</div>
      <div class="card" style="margin-bottom:0.8rem;">
        <div class="fila-2" style="grid-template-columns:2fr 1fr;">
          <div class="campo" style="margin-bottom:0.6rem;">
            <label>Nombre del servicio</label>
            <input [(ngModel)]="sNombre" placeholder="Ej: Corte, Color, Brushing" />
          </div>
          <div class="campo" style="margin-bottom:0.6rem;">
            <label>Duración (min)</label>
            <input type="number" [(ngModel)]="sDuracion" placeholder="30" />
          </div>
        </div>
        <div class="fila-2">
          <div class="campo" style="margin-bottom:0.6rem;">
            <label>Precio</label>
            <input type="number" [(ngModel)]="sPrecio" placeholder="0" />
          </div>
          <div class="campo" style="margin-bottom:0.6rem;">
            <label>Seña (0 = sin seña)</label>
            <input type="number" [(ngModel)]="sSena" placeholder="0" />
          </div>
        </div>
        <button class="btn btn-primary btn-inline" (click)="agregarServicio()">Agregar servicio</button>
      </div>
      <div class="lista" style="margin-bottom:1.4rem;">
        @for (s of servicios(); track s.id) {
          <div class="lista-item">
            <div class="info">
              <div class="nombre">{{ s.nombre }}</div>
              <div class="detalle">{{ s.duracion_min }} min · &#36;{{ s.precio }}
                @if (s.sena_monto > 0) { · seña &#36;{{ s.sena_monto }} }
              </div>
            </div>
          </div>
        } @empty {
          <p class="slots-vacio">Todavía no cargaste servicios.</p>
        }
      </div>

      <!-- PROFESIONALES -->
      <div class="seccion-tit">Profesionales</div>
      <div class="card" style="margin-bottom:0.8rem;">
        <div class="fila-2">
          <div class="campo" style="margin-bottom:0.6rem;">
            <label>Nombre</label>
            <input [(ngModel)]="pNombre" placeholder="Ej: María" />
          </div>
          <div class="campo" style="margin-bottom:0.6rem;">
            <label>Color en la agenda</label>
            <input type="color" [(ngModel)]="pColor" style="height:44px;padding:0.2rem;" />
          </div>
        </div>
        <button class="btn btn-primary btn-inline" (click)="agregarProfesional()">Agregar profesional</button>
      </div>
      <div class="lista">
        @for (p of profesionales(); track p.id) {
          <div class="lista-item" style="flex-direction:column;align-items:stretch;gap:0.8rem;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <div class="info">
                <div class="nombre">
                  <span class="punto-color" [style.background]="p.color_agenda"></span>{{ p.nombre }}
                </div>
              </div>
              <button class="btn btn-ghost btn-inline" (click)="toggleHorarios(p.id)">
                {{ editandoHorarios() === p.id ? 'Ocultar horarios' : 'Editar horarios' }}
              </button>
            </div>

            @if (editandoHorarios() === p.id) {
              <div style="border-top:1px solid var(--line);padding-top:0.8rem;">
                <p style="font-size:0.82rem;color:var(--ink-soft);margin-bottom:0.6rem;">
                  Marcá los días que trabaja y su horario. Dejá vacío un día para indicar que no atiende.
                </p>
                @for (dia of diasLaborales; track dia.n) {
                  <div style="display:flex;align-items:center;gap:0.6rem;margin-bottom:0.5rem;">
                    <label style="width:44px;font-size:0.85rem;font-weight:600;">{{ dia.label }}</label>
                    <input type="checkbox" [(ngModel)]="dia.activo" />
                    <input type="time" [(ngModel)]="dia.inicio" [disabled]="!dia.activo" style="padding:0.4rem;" />
                    <span style="color:var(--ink-soft);">a</span>
                    <input type="time" [(ngModel)]="dia.fin" [disabled]="!dia.activo" style="padding:0.4rem;" />
                  </div>
                }
                <button class="btn btn-primary btn-inline" style="margin-top:0.5rem;" (click)="guardarHorarios(p.id)">
                  Guardar horarios
                </button>
              </div>
            }
          </div>
        } @empty {
          <p class="slots-vacio">Todavía no cargaste profesionales.</p>
        }
      </div>
    </div>
  `,
})
export class ConfiguracionComponent implements OnInit {
  servicios = signal<Servicio[]>([]);
  profesionales = signal<Profesional[]>([]);
  editandoHorarios = signal<number | null>(null);
  mensaje = signal('');
  error = signal('');

  sNombre = ''; sDuracion: number | null = null; sPrecio: number | null = 0; sSena: number | null = 0;
  pNombre = ''; pColor = '#b5573a';

  diasLaborales: { n: number; label: string; activo: boolean; inicio: string; fin: string }[] = [];

  constructor(private api: ApiService) {
    // Lunes a sábado por defecto (índices 1..6)
    for (const n of [1, 2, 3, 4, 5, 6]) {
      this.diasLaborales.push({ n, label: DIAS[n], activo: false, inicio: '09:00', fin: '18:00' });
    }
  }

  ngOnInit() { this.recargar(); }

  recargar() {
    this.api.getServicios().subscribe((s) => this.servicios.set(s));
    this.api.getProfesionales().subscribe((p) => this.profesionales.set(p));
  }

  private flash(msg: string) {
    this.mensaje.set(msg);
    setTimeout(() => this.mensaje.set(''), 2500);
  }

  agregarServicio() {
    this.error.set('');
    if (!this.sNombre.trim() || !this.sDuracion) {
      this.error.set('El servicio necesita nombre y duración.');
      return;
    }
    this.api.crearServicio({
      nombre: this.sNombre.trim(), duracion_min: this.sDuracion,
      precio: this.sPrecio || 0, sena_monto: this.sSena || 0,
    }).subscribe({
      next: () => {
        this.sNombre = ''; this.sDuracion = null; this.sPrecio = 0; this.sSena = 0;
        this.recargar(); this.flash('Servicio agregado.');
      },
      error: (e) => this.error.set(e.error?.error || 'No se pudo agregar el servicio.'),
    });
  }

  agregarProfesional() {
    this.error.set('');
    if (!this.pNombre.trim()) {
      this.error.set('El profesional necesita un nombre.');
      return;
    }
    this.api.crearProfesional({ nombre: this.pNombre.trim(), color_agenda: this.pColor })
      .subscribe({
        next: () => { this.pNombre = ''; this.recargar(); this.flash('Profesional agregado.'); },
        error: (e) => this.error.set(e.error?.error || 'No se pudo agregar el profesional.'),
      });
  }

  toggleHorarios(profId: number) {
    this.editandoHorarios.set(this.editandoHorarios() === profId ? null : profId);
  }

  guardarHorarios(profId: number) {
    const horarios: HorarioLaboral[] = this.diasLaborales
      .filter((d) => d.activo)
      .map((d) => ({ dia_semana: d.n, hora_inicio: d.inicio, hora_fin: d.fin }));
    this.api.setHorarios(profId, horarios).subscribe({
      next: () => { this.flash('Horarios guardados.'); this.editandoHorarios.set(null); },
      error: (e) => this.error.set(e.error?.error || 'No se pudieron guardar los horarios.'),
    });
  }
}
