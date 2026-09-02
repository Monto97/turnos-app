import { Component, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ReservaService } from '../../core/reserva.service';

// Pantalla que emula el checkout de Mercado Pago cuando NO hay
// credenciales configuradas. Permite probar el flujo completo
// (pagar la seña -> confirmar el turno) sin cobrar de verdad.
@Component({
  selector: 'app-pago-simulado',
  standalone: true,
  template: `
    <div class="reserva-wrap">
      <div class="reserva-top">
        <div class="negocio">Pago de seña</div>
        <div class="sub">Simulación de Mercado Pago (modo prueba)</div>
      </div>
      <div class="reserva-body">
        <div class="resumen" style="text-align:center;">
          <p style="color:var(--ink-soft);margin-bottom:0.5rem;">Monto de la seña</p>
          <div style="font-family:'Fraunces',serif;font-size:2.4rem;font-weight:600;">&#36;{{ monto() }}</div>
        </div>

        <p class="reserva-ayuda-paso" style="text-align:center;">
          Esto simula el checkout. En producción, acá se abre Mercado Pago real.
          Elegí un resultado para probar el flujo:
        </p>

        @if (procesando()) {
          <div class="cargando-c">Procesando…</div>
        } @else {
          <button class="btn btn-primary" style="margin-bottom:0.7rem;" (click)="pagar(true)">
            Simular pago aprobado ✓
          </button>
          <button class="btn btn-ghost" (click)="pagar(false)">
            Simular pago rechazado
          </button>
        }
      </div>
    </div>
  `,
})
export class PagoSimuladoComponent implements OnInit {
  monto = signal(0);
  turnoId = 0;
  procesando = signal(false);

  constructor(private route: ActivatedRoute, private router: Router, private rsv: ReservaService) {}

  ngOnInit() {
    this.turnoId = Number(this.route.snapshot.queryParamMap.get('turno'));
    this.monto.set(Number(this.route.snapshot.queryParamMap.get('monto')) || 0);
  }

  pagar(aprobado: boolean) {
    if (!aprobado) {
      this.router.navigate(['/reserva-confirmada'], { queryParams: { turno: this.turnoId, estado: 'fallo' } });
      return;
    }
    this.procesando.set(true);
    this.rsv.confirmarSimulado(this.turnoId).subscribe({
      next: () => this.router.navigate(['/reserva-confirmada'], { queryParams: { turno: this.turnoId } }),
      error: () => this.router.navigate(['/reserva-confirmada'], { queryParams: { turno: this.turnoId, estado: 'fallo' } }),
    });
  }
}
