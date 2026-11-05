import { config } from '../config/env.js';

// Cores da marca (ver frontend/src/utils/theme.js e frontend/src/styles/index.css).
const BRAND = {
  primary: '#7c3aed',
  secondary: '#2563eb',
  bg: '#0b0710',
  card: '#13101b',
  text: '#1f1b2e',
  muted: '#6b6475',
};

const APP_URL = () => config.appUrl;

/** Selo do logotipo (quadrado roxo + triângulo "play"), igual ao BrandLogo.jsx, só que em HTML de e-mail. */
function logoBadge() {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="vertical-align:middle;padding-right:10px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="36" height="36" style="background:#ffffff;border-radius:10px;">
            <tr>
              <td align="center" valign="middle" style="width:36px;height:36px;color:${BRAND.primary};font-size:16px;line-height:36px;">&#9654;</td>
            </tr>
          </table>
        </td>
        <td style="vertical-align:middle;">
          <span style="font-size:18px;font-weight:700;color:#ffffff;font-family:Arial,Helvetica,sans-serif;">WebPlay Brasil</span>
        </td>
      </tr>
    </table>`;
}

/** Envelope visual comum a todos os e-mails transacionais da plataforma. */
function layout({ title, preheader = '', bodyHtml, footerNote = '' }) {
  const year = new Date().getFullYear();
  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
  </head>
  <body style="margin:0;padding:0;background:${BRAND.bg};font-family:Arial,Helvetica,sans-serif;">
    <span style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</span>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.bg};padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
            <tr>
              <td style="background:linear-gradient(135deg, ${BRAND.primary}, ${BRAND.secondary});border-radius:16px 16px 0 0;padding:20px 28px;">
                ${logoBadge()}
              </td>
            </tr>
            <tr>
              <td style="background:#ffffff;padding:32px 28px;border-radius:0 0 16px 16px;color:${BRAND.text};font-size:15px;line-height:1.6;">
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:20px 12px;text-align:center;color:${BRAND.muted};font-size:12px;line-height:1.5;">
                ${footerNote ? `${footerNote}<br/>` : ''}
                &copy; ${year} WebPlay Brasil. Todos os direitos reservados.<br/>
                Este é um e-mail automático, não é necessário responder.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function button(label, url) {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
      <tr>
        <td style="border-radius:10px;background:${BRAND.primary};">
          <a href="${url}" target="_blank" rel="noopener" style="display:inline-block;padding:13px 28px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">${label}</a>
        </td>
      </tr>
    </table>`;
}

const greet = (name) => `Olá${name ? `, <strong>${name}</strong>` : ''}!`;

/** E-mail de boas-vindas enviado logo após o cadastro do assinante (tenant_owner). */
export function welcomeEmailTemplate({ name, email, brandName }) {
  const loginUrl = `${APP_URL()}/entrar`;
  const subject = 'Bem-vindo(a) ao WebPlay Brasil! 🎬';
  const bodyHtml = `
    <h1 style="margin:0 0 16px;font-size:20px;color:${BRAND.text};">${greet(name)}</h1>
    <p style="margin:0 0 14px;">Sua conta no <strong>WebPlay Brasil</strong> foi criada com sucesso${brandName ? ` e sua marca <strong>${brandName}</strong> já está pronta` : ''}. Agora você pode configurar seus canais, filmes e séries e começar a atender seus assinantes.</p>
    <p style="margin:0 0 14px;">Use o e-mail <strong>${email}</strong> para entrar no seu painel administrativo quando quiser.</p>
    ${button('Acessar meu painel', loginUrl)}
    <p style="margin:18px 0 0;color:${BRAND.muted};font-size:13px;">Se precisar de ajuda, nossa equipe de suporte está à disposição.</p>
  `;
  const text = `${greet(name).replace(/<[^>]+>/g, '')}\n\nSua conta no WebPlay Brasil foi criada com sucesso. Acesse seu painel em: ${loginUrl}\n\nSe precisar de ajuda, fale com nosso suporte.`;
  return { subject, html: layout({ title: subject, preheader: 'Sua conta foi criada com sucesso.', bodyHtml }), text };
}

/** E-mail de redefinição de senha ("esqueci minha senha"). */
export function passwordResetEmailTemplate({ name, link, expiresInText = '1 hora' }) {
  const subject = 'Redefinição de senha — WebPlay Brasil';
  const bodyHtml = `
    <h1 style="margin:0 0 16px;font-size:20px;color:${BRAND.text};">${greet(name)}</h1>
    <p style="margin:0 0 14px;">Recebemos um pedido para redefinir a senha da sua conta no WebPlay Brasil.</p>
    ${button('Redefinir minha senha', link)}
    <p style="margin:0 0 10px;color:${BRAND.muted};font-size:13px;">Este link é válido por ${expiresInText} e só pode ser usado uma vez.</p>
    <p style="margin:0;color:${BRAND.muted};font-size:13px;">Se você não solicitou essa alteração, pode ignorar este e-mail com segurança — sua senha não será alterada.</p>
  `;
  const text = `Recebemos um pedido para redefinir sua senha.\n\nAcesse (válido por ${expiresInText}, uso único):\n${link}\n\nSe não foi você, ignore este e-mail.`;
  return { subject, html: layout({ title: subject, preheader: 'Redefina sua senha com segurança.', bodyHtml }), text };
}

/** E-mail de confirmação de pagamento aprovado. */
export function paymentConfirmedEmailTemplate({ name, amountFormatted, periodToFormatted, panelUrl }) {
  const subject = 'Pagamento confirmado — WebPlay Brasil';
  const bodyHtml = `
    <h1 style="margin:0 0 16px;font-size:20px;color:${BRAND.text};">${greet(name)}</h1>
    <p style="margin:0 0 14px;">Seu pagamento de <strong>${amountFormatted}</strong> foi <strong style="color:#059669;">confirmado</strong> com sucesso. 🎉</p>
    <p style="margin:0 0 14px;">Sua assinatura do WebPlay Brasil está ativa até <strong>${periodToFormatted}</strong>.</p>
    ${button('Ver meu painel', panelUrl)}
    <p style="margin:18px 0 0;color:${BRAND.muted};font-size:13px;">Obrigado por continuar com a gente!</p>
  `;
  const text = `Seu pagamento de ${amountFormatted} foi confirmado.\n\nSua assinatura está ativa até ${periodToFormatted}.\n\nAcesse seu painel: ${panelUrl}`;
  return { subject, html: layout({ title: subject, preheader: 'Seu pagamento foi aprovado.', bodyHtml }), text };
}

/** E-mail de aviso de vencimento próximo (30/7/1 dias restantes). */
export function subscriptionExpiringEmailTemplate({ name, daysLeftText, endsAtFormatted, renewUrl }) {
  const subject = `Sua assinatura vence em ${daysLeftText} — WebPlay Brasil`;
  const bodyHtml = `
    <h1 style="margin:0 0 16px;font-size:20px;color:${BRAND.text};">${greet(name)}</h1>
    <p style="margin:0 0 14px;">Sua assinatura do WebPlay Brasil vence em <strong>${daysLeftText}</strong>, no dia <strong>${endsAtFormatted}</strong>.</p>
    <p style="margin:0 0 14px;">Renove com antecedência para não perder o acesso aos seus canais, filmes e séries. Os dias restantes do plano atual são mantidos.</p>
    ${button('Renovar assinatura', renewUrl)}
    <p style="margin:18px 0 0;color:${BRAND.muted};font-size:13px;">Se você já renovou, pode ignorar este aviso.</p>
  `;
  const text = `Sua assinatura vence em ${daysLeftText} (${endsAtFormatted}).\n\nRenove com antecedência: ${renewUrl}\n\nSe você já renovou, ignore este aviso.`;
  return { subject, html: layout({ title: subject, preheader: `Faltam ${daysLeftText} para o vencimento.`, bodyHtml }), text };
}
