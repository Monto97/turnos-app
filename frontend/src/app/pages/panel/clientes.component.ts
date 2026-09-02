import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { Cliente } from '../../core/dominio.models';

@Component({
  selector: 'app-clientes',
  standalone: true,
  imports: [FormsModule],
  template: `
    <header class="panel-header">
      <div>
        <h1>Clientes</h1>
        <p class="sub">Quienes ya reservaron. Buscá por nombre o teléfono.</p>
      </div>
    </header>

    <div class="panel-body">
      <div class="campo" style="max-width:360px;">
        <input [(ngModel)]="busqueda" (ngModelChange)="buscar()" placeholder="Buscar cliente…" />
      </div>

      <div class="lista">
        @for (c of clientes(); track c.id) {
          <div class="lista-item">
            <div class="info">
              <div class="nombre">{{ c.nombre }}</div>
              <div class="detalle">
                {{ c.telefono || 'Sin teléfono' }}
                @if (c.email) { · {{ c.email }} }
              </div>
            </div>
          </div>
        } @empty {
          <p class="slots-vacio">
            @if (busqueda) { No se encontraron clientes con ese criterio. }
            @else { Todavía no hay clientes. Se cargan solos cuando reservás un turno. }
          </p>
        }
      </div>
    </div>
  `,
})
export class ClientesComponent implements OnInit {
  clientes = signal<Cliente[]>([]);
  busqueda = '';
  private timer: any;

  constructor(private api: ApiService) {}

  ngOnInit() { this.cargar(); }

  cargar() {
    this.api.getClientes(this.busqueda || undefined).subscribe((c) => this.clientes.set(c));
  }

  // Debounce simple para no pegarle al backend en cada tecla.
  buscar() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.cargar(), 300);
  }
}
