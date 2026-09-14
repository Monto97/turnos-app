import { Resend } from 'resend';

// ============================================================
//  SERVICIO DE EMAIL
// ============================================================
//  Usa Resend si hay RESEND_API_KEY configurada.
//  Sin key: modo simulación — imprime en consola. Sirve para
//  probar el flujo completo sin necesitar cuenta de Resend.
// ============================================================

const apiKey = process.env.RESEND_API_KEY;
const FROM = process.env.EMAIL_FROM || 'onboarding@resend.dev';

const resend = apiKey ? new Resend(apiKey) : null;

export async function enviarEmailRecuperacion(destino, nombre, link) {
  const asunto = 'Recuperá tu contraseña - Turnos';
  const html = `
    <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color:#4f46e5;">Recuperar contraseña</h2>
      <p>Hola ${nombre},</p>
      <p>Recibimos un pedido para restablecer tu contraseña. Hacé clic en el botón
      para elegir una nueva. El enlace vence en 30 minutos.</p>
      <p style="text-align:center; margin: 28px 0;">
        <a href="${link}"
           style="background:#4f46e5; color:#fff; padding:12px 24px;
                  border-radius:8px; text-decoration:none; display:inline-block;">
          Cambiar contraseña
        </a>
      </p>
      <p style="color:#666; font-size:13px;">Si no pediste esto, ignorá este email.
      Tu contraseña no va a cambiar.</p>
    </div>
  `;

  // Modo simulación: sin API key, mostramos el link en consola.
  if (!resend) {
    console.log('\n' + '='.repeat(60));
    console.log('  [EMAIL SIMULADO] (configurá RESEND_API_KEY para enviar de verdad)');
    console.log(`  Para: ${destino}`);
    console.log(`  Asunto: ${asunto}`);
    console.log(`  LINK DE RECUPERACIÓN:\n  ${link}`);
    console.log('='.repeat(60) + '\n');
    return { simulado: true };
  }

  // Envío real con Resend.
  const { data, error } = await resend.emails.send({
    from: FROM,
    to: destino,
    subject: asunto,
    html,
  });
  if (error) {
    console.error('Error enviando email:', error);
    throw new Error('No se pudo enviar el email de recuperación');
  }
  return { id: data?.id, simulado: false };
}

// ============================================================
//  NOTIFICACIÓN DE NUEVA RESERVA (para el dueño del negocio)
// ============================================================
export async function enviarNotificacionReserva({ servicio, profesional, inicio, cliente }) {
  const destino = process.env.OWNER_EMAIL;
  if (!destino) return; // sin configurar, no hacemos nada

  const [fecha, horaConSeg] = inicio.split(' ');
  const hora = horaConSeg.slice(0, 5);
  const [Y, M, D] = fecha.split('-');
  const fechaLegible = `${D}/${M}/${Y}`;
  const panelUrl = (process.env.FRONTEND_URL || 'http://localhost:4200') + '/panel';

  const asunto = `Nueva reserva: ${servicio} — ${D}/${M} a las ${hora}`;

  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;background:#f6f3ec;padding:24px;border-radius:14px;">
      <div style="background:#fff;border-radius:12px;padding:28px 32px;border:1px solid #ddd5c7;">

        <p style="margin:0 0 2px;font-size:12px;text-transform:uppercase;letter-spacing:0.08em;color:#6b635a;">Studio Belle</p>
        <h2 style="font-family:Georgia,serif;font-size:22px;color:#2a2622;margin:0 0 24px;font-weight:500;">
          Nueva reserva recibida
        </h2>

        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="color:#6b635a;font-size:13px;padding:5px 0;width:100px;vertical-align:top;">Servicio</td>
            <td style="font-weight:600;font-size:15px;color:#2a2622;padding:5px 0;">${servicio}</td>
          </tr>
          <tr>
            <td style="color:#6b635a;font-size:13px;padding:5px 0;vertical-align:top;">Profesional</td>
            <td style="font-size:15px;color:#2a2622;padding:5px 0;">${profesional}</td>
          </tr>
          <tr>
            <td style="color:#6b635a;font-size:13px;padding:5px 0;vertical-align:top;">Fecha y hora</td>
            <td style="font-weight:600;font-size:15px;color:#b5573a;padding:5px 0;">${fechaLegible} a las ${hora}</td>
          </tr>
        </table>

        <div style="border-top:1px solid #ddd5c7;margin:20px 0;"></div>

        <p style="margin:0 0 10px;font-size:12px;text-transform:uppercase;letter-spacing:0.08em;color:#6b635a;">Cliente</p>
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="color:#6b635a;font-size:13px;padding:4px 0;width:100px;">Nombre</td>
            <td style="font-weight:600;font-size:14px;color:#2a2622;padding:4px 0;">${cliente.nombre}</td>
          </tr>
          ${cliente.telefono ? `<tr>
            <td style="color:#6b635a;font-size:13px;padding:4px 0;">Teléfono</td>
            <td style="font-size:14px;color:#2a2622;padding:4px 0;">${cliente.telefono}</td>
          </tr>` : ''}
          ${cliente.email ? `<tr>
            <td style="color:#6b635a;font-size:13px;padding:4px 0;">Email</td>
            <td style="font-size:14px;color:#2a2622;padding:4px 0;">${cliente.email}</td>
          </tr>` : ''}
        </table>

        <div style="text-align:center;margin-top:28px;">
          <a href="${panelUrl}"
             style="background:#b5573a;color:#fff;padding:12px 28px;border-radius:8px;
                    text-decoration:none;font-weight:600;font-size:14px;display:inline-block;">
            Ver en el panel
          </a>
        </div>

      </div>
    </div>
  `;

  if (!resend) {
    console.log('\n' + '='.repeat(60));
    console.log('  [NUEVA RESERVA - EMAIL SIMULADO] (configurá RESEND_API_KEY para enviar de verdad)');
    console.log(`  Para: ${destino}`);
    console.log(`  Asunto: ${asunto}`);
    console.log(`  Cliente: ${cliente.nombre} ${cliente.telefono || ''}`);
    console.log('='.repeat(60) + '\n');
    return { simulado: true };
  }

  const { data, error } = await resend.emails.send({ from: FROM, to: destino, subject: asunto, html });
  if (error) console.error('Error enviando notificación de reserva:', error);
  return { id: data?.id, simulado: false };
}
