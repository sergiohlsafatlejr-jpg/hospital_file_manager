import nodemailer from "nodemailer";
import { ENV } from "./_core/env";

// Criar transporter SMTP reutilizável
let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (!transporter) {
    const port = parseInt(ENV.smtpPort, 10);
    transporter = nodemailer.createTransport({
      host: ENV.smtpHost,
      port,
      secure: port === 465,
      requireTLS: port !== 465,
      auth: {
        user: ENV.smtpUser,
        pass: ENV.smtpPass,
      },
      tls: {
        rejectUnauthorized: true,
      },
    });
  }
  return transporter;
}

export async function verificarConexaoSMTP(): Promise<{ ok: boolean; error?: string }> {
  try {
    if (!ENV.smtpHost || !ENV.smtpUser || !ENV.smtpPass) {
      return { ok: false, error: "Credenciais SMTP não configuradas" };
    }
    await getTransporter().verify();
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err.message || "Erro ao conectar ao servidor SMTP" };
  }
}

export interface EmailNotificacao {
  destinatario: string;
  assunto: string;
  conteudoHtml: string;
  conteudoTexto?: string;
}

export async function enviarEmail(email: EmailNotificacao): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  try {
    if (!ENV.smtpHost || !ENV.smtpUser || !ENV.smtpPass) {
      return { ok: false, error: "Credenciais SMTP não configuradas. Configure nas Configurações > Secrets." };
    }

    const info = await getTransporter().sendMail({
      from: ENV.smtpFrom || ENV.smtpUser,
      to: email.destinatario,
      subject: email.assunto,
      html: email.conteudoHtml,
      text: email.conteudoTexto || "",
    });

    return { ok: true, messageId: info.messageId };
  } catch (err: any) {
    console.error("[EmailService] Erro ao enviar e-mail:", err.message);
    return { ok: false, error: err.message || "Erro ao enviar e-mail" };
  }
}

export function gerarHtmlNotificacaoAtendimentos(dados: {
  estabelecimentoNome: string;
  totalAtendimentos: number;
  atendimentos: Array<{
    paciente: string;
    numatend: string;
    tipoAtendimento: string;
    plano: string;
    diasParado: number;
    dataEntrada: string;
    observacao?: string;
  }>;
  mensagemPersonalizada?: string;
}): string {
  const linhasTabela = dados.atendimentos
    .map(
      (a) => `
    <tr>
      <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb;">${a.paciente}</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb;">${a.numatend}</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb;">${a.tipoAtendimento}</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb;">${a.plano}</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">
        <span style="background-color: ${a.diasParado > 30 ? '#ef4444' : a.diasParado > 15 ? '#f59e0b' : '#22c55e'}; color: white; padding: 2px 8px; border-radius: 12px; font-size: 12px;">
          ${a.diasParado} dias
        </span>
      </td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb;">${a.dataEntrada}</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; font-size: 12px; color: #6b7280;">${a.observacao || '-'}</td>
    </tr>`
    )
    .join("");

  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f3f4f6;">
  <div style="max-width: 800px; margin: 0 auto; padding: 20px;">
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%); padding: 24px 32px; border-radius: 12px 12px 0 0;">
      <h1 style="color: #ffffff; margin: 0; font-size: 20px;">
        🏥 Portal Safatle - Notificação de Atendimentos
      </h1>
      <p style="color: #94a3b8; margin: 8px 0 0 0; font-size: 14px;">
        ${dados.estabelecimentoNome}
      </p>
    </div>

    <!-- Content -->
    <div style="background-color: #ffffff; padding: 24px 32px; border: 1px solid #e5e7eb;">
      <!-- Summary -->
      <div style="background-color: #f0f9ff; border-left: 4px solid #0ea5e9; padding: 16px; margin-bottom: 20px; border-radius: 0 8px 8px 0;">
        <p style="margin: 0; color: #0c4a6e; font-weight: 600;">
          📋 Total de atendimentos parados: <strong>${dados.totalAtendimentos}</strong>
        </p>
      </div>

      ${dados.mensagemPersonalizada ? `
      <div style="background-color: #fffbeb; border-left: 4px solid #f59e0b; padding: 16px; margin-bottom: 20px; border-radius: 0 8px 8px 0;">
        <p style="margin: 0; color: #78350f;">${dados.mensagemPersonalizada}</p>
      </div>
      ` : ""}

      <!-- Table -->
      <div style="overflow-x: auto;">
        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
          <thead>
            <tr style="background-color: #f8fafc;">
              <th style="padding: 10px 12px; text-align: left; border-bottom: 2px solid #e5e7eb; color: #475569;">Paciente</th>
              <th style="padding: 10px 12px; text-align: left; border-bottom: 2px solid #e5e7eb; color: #475569;">Nº Atend.</th>
              <th style="padding: 10px 12px; text-align: left; border-bottom: 2px solid #e5e7eb; color: #475569;">Tipo</th>
              <th style="padding: 10px 12px; text-align: left; border-bottom: 2px solid #e5e7eb; color: #475569;">Plano</th>
              <th style="padding: 10px 12px; text-align: center; border-bottom: 2px solid #e5e7eb; color: #475569;">Dias Parado</th>
              <th style="padding: 10px 12px; text-align: left; border-bottom: 2px solid #e5e7eb; color: #475569;">Data Entrada</th>
              <th style="padding: 10px 12px; text-align: left; border-bottom: 2px solid #e5e7eb; color: #475569;">Observação</th>
            </tr>
          </thead>
          <tbody>
            ${linhasTabela}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Footer -->
    <div style="background-color: #f8fafc; padding: 16px 32px; border-radius: 0 0 12px 12px; border: 1px solid #e5e7eb; border-top: none;">
      <p style="margin: 0; color: #94a3b8; font-size: 12px; text-align: center;">
        Este e-mail foi enviado automaticamente pelo Portal Safatle - Gestão Inteligente de Faturamento Hospitalar.
        <br>Data de envio: ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
      </p>
    </div>
  </div>
</body>
</html>`;
}
