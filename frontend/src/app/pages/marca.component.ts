import { Component, input } from '@angular/core';

// Panel de marca (columna izquierda) reutilizado en todas las pantallas de auth.
@Component({
  selector: 'app-marca',
  standalone: true,
  template: `
    <aside class="auth-marca">
      <div class="logo">Salón · Turnos</div>
      <p class="frase">{{ frase() }} <em>sin cuadernos</em>.</p>
      <p class="pie">Gestión de turnos para peluquerías y estudios.</p>
    </aside>
  `,
})
export class MarcaComponent {
  frase = input<string>('Tu agenda, ordenada y');
}
