import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { Bloqueo, Profesional } from '../../core/dominio.models';
import { parseLocal, DIAS, MESES, fechaISO } from './fecha.utils';

@Component({
  selector: 'app-avisos',
  standalone: true,
  imports: [FormsModule],
  template: `
    <header class="panel-header">
      <div>
        <h1>Avisos y cierres</h1>
        <p class="sub">Marcá días u horas en que no se atiende. No se van a ofrecer turnos ahí.</p>
      </div>
    </header>

    <div class="panel-body">
      @if (mensaje()) { <div class="alerta alerta-ok">{{ mensaje() }}</div> }
      @if (error()) { <div class="alerta alerta-error">{{ error() }}</div> }

      <div class="card" style="margin-bottom:1.4rem;">
        <div class="seccion-tit" style="margin-top:0;">Nuevo cierre</div>
        <div class="campo">
          <label>¿A quién afecta?</label>
          <select [(ngModel)]="bProf"
                  style="width:100%;padding:0.8rem 0.9rem;border-radius:9px;border:1px solid var(--line);background:var(--white);">
            <option [ngValue]="null">Todo el local (cierra todo)</option>
            @for (p of profesionales(); track p.id) {
              <option [ngValue]="p.id">Solo {{ p.nombre }}</option>
            }
          </select>
        </div>
        <div class="fila-2">
          <div class="campo">
            <label>Desde</label>
            <input type="datetime-local" [(ngModel)]="bDesde" />
          </div>
          <div class="campo">
            <label>Hasta</label>
            <input type="datetime-local" [(ngModel)]="bHasta" />
          </div>
        </div>
        <div class="campo">
          <label>Motivo (opcional)</label>
          <input [(ngModel)]="bMotivo" placeholder="Ej: Feriado, Vacaciones, Turno médico" />
        </div>
        <button class="btn btn-primary btn-inline" (click)="crear()">Agregar cierre</button>
      </div>

      <div class="seccion-tit">Cierres cargados</div>
      <div class="lista">
        @for (b of bloqueos(); track b.id) {
          <div class="lista-item">
            <div class="info">
              <div class="nombre">{{ b.motivo || 'Cerrado' }}</div>
              <div class="detalle">
                {{ rango(b) }}
                · {{ b.profesional ? 'Solo ' + b.profesional : 'Todo el local' }}
              </div>
            </div>
            <button class="btn btn-peligro btn-inline" (click)="eliminar(b.id)">Eliminar</button>
          </div>
        } @empty {
          <p class="slots-vacio">No hay cierres cargados para las próximas semanas.</p>
        }
      </div>
    </div>
  `,
})
export class AvisosComponent implements OnInit {
  bloqueos = signal<Bloqueo[]>([]);
  profesionales = signal<Profesional[]>([]);
  mensaje = signal('');
  error = signal('');

  bProf: number | null = null;
  bDesde = '';
  bHasta = '';
  bMotivo = '';

  constructor(private api: ApiService) {}

  ngOnInit() {
    this.api.getProfesionales().subscribe((p) => this.profesionales.set(p));
    this.recargar();
  }

  recargar() {
    // Traemos un rango amplio: desde hoy hasta 3 meses adelante.
    const hoy = new Date();
    const fin = new Date(); fin.setMonth(fin.getMonth() + 3);
    const desde = fechaISO(hoy) + ' 00:00:00';
    const hasta = fechaISO(fin) + ' 00:00:00';
    this.api.getBloqueos(desde, hasta).subscribe((b) => this.bloqueos.set(b));
  }

  private flash(msg: string) {
    this.mensaje.set(msg);
    setTimeout(() => this.mensaje.set(''), 2500);
  }

  crear() {
    this.error.set('');
    if (!this.bDesde || !this.bHasta) {
      this.error.set('Completá desde y hasta.');
      return;
    }
    // El input datetime-local da 'YYYY-MM-DDTHH:mm'; lo pasamos a 'YYYY-MM-DD HH:mm:ss'.
    const inicio = this.bDesde.replace('T', ' ') + ':00';
    const fin = this.bHasta.replace('T', ' ') + ':00';
    this.api.crearBloqueo({ profesionalId: this.bProf, inicio, fin, motivo: this.bMotivo.trim() || undefined })
      .subscribe({
        next: () => {
          this.bDesde = ''; this.bHasta = ''; this.bMotivo = ''; this.bProf = null;
          this.recargar(); this.flash('Cierre agregado.');
        },
        error: (e) => this.error.set(e.error?.error || 'No se pudo agregar el cierre.'),
      });
  }

  eliminar(id: number) {
    if (!confirm('¿Eliminar este cierre?')) return;
    this.api.eliminarBloqueo(id).subscribe({
      next: () => this.recargar(),
      error: (e) => this.error.set(e.error?.error || 'No se pudo eliminar.'),
    });
  }

  rango(b: Bloqueo): string {
    const ini = parseLocal(b.inicio);
    const fin = parseLocal(b.fin);
    const f = (d: Date) => `${DIAS[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()].slice(0, 3)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    return `${f(ini)} → ${f(fin)}`;
  }
}
