import { Resend } from 'resend';

// ============================================================
//  SERVICIO DE EMAIL
// ============================================================
//  Usa Resend si hay RESEND_API_KEY configurada.
//  Si NO hay key, cae en "modo simulación": imprime el link en
//  consola en vez de mandar el mail. Esto te deja probar todo el
//  flujo de recuperación sin haber configurado el email todavía.
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
