import "dotenv/config";
import nodemailer from "nodemailer";

export const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.skymail.net.br",
  port: Number(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_PORT === "465",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  tls: { rejectUnauthorized: false }
});

export async function enviarBoletoPorEmail(to: string, base64Pdf: string, codigoBoleto: string, valor: string, base64Nf?: string) {
  if (!process.env.SMTP_USER) {
    console.log("SMTP não configurado. Ignorando envio de e-mail.");
    return false;
  }
  
  try {
    const atts: Array<{ filename: string; content: string; encoding: string }> = [
      {
        filename: `Boleto_${codigoBoleto}.pdf`,
        content: base64Pdf,
        encoding: 'base64'
      }
    ];
    if (base64Nf) {
      atts.push({
        filename: `Nota_Fiscal_${codigoBoleto}.pdf`,
        content: base64Nf,
        encoding: 'base64'
      });
    }
    
    const remetente = process.env.SMTP_FROM || process.env.SMTP_USER || "sergio.jr@safatle.com.br";
    const info = await transporter.sendMail({
      from: `"Financeiro Safatle" <${remetente}>`,
      to,
      bcc: remetente,
      subject: `Boleto Gerado com Sucesso - Safatle`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
          <h2>Olá!</h2>
          <p>O seu boleto do <strong>Hospital Safatle</strong> no valor de <strong>R$ ${Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong> foi gerado com sucesso.</p>
          ${base64Nf ? `<p>Aqui está também o seu documento fiscal (Nota Fiscal) em anexo junto do boleto.</p>` : `<p>Enviamos o PDF em anexo neste e-mail para que você possa efetuar o pagamento com tranquilidade.</p>`}
          <br/>
          <p>Atenciosamente,<br/>Equipe Financeiro Safatle</p>
        </div>
      `,
      attachments: atts
    });
    console.log("E-mail enviado com sucesso:", info.messageId);
    return true;
  } catch (error) {
    console.error("Erro ao enviar e-mail no nodemailer:", error);
    return false;
  }
}

export async function enviarNotaFiscalPorEmail(to: string, base64Nf: string, valor: string) {
  if (!process.env.SMTP_USER) {
    console.log("SMTP não configurado. Ignorando envio de e-mail.");
    return false;
  }
  
  try {
    const remetente = process.env.SMTP_FROM || process.env.SMTP_USER || "sergio.jr@safatle.com.br";
    const info = await transporter.sendMail({
      from: `"Financeiro Safatle" <${remetente}>`,
      to,
      bcc: remetente,
      subject: `Nota Fiscal Emitida com Sucesso - Safatle`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
          <h2>Olá!</h2>
          <p>O serviço referente ao valor de <strong>R$ ${Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong> foi faturado e registrado.</p>
          <p>Em anexo neste e-mail consta a sua <strong>Nota Fiscal</strong> oficial em PDF para os seus registros contábeis. Nós agradecemos a preferência!</p>
          <br/>
          <p>Atenciosamente,<br/>Equipe Financeiro Safatle</p>
        </div>
      `,
      attachments: [{
        filename: `Nota_Fiscal_Safatle.pdf`,
        content: base64Nf,
        encoding: 'base64'
      }]
    });
    console.log("E-mail com NF isolada enviado com sucesso:", info.messageId);
    return true;
  } catch (error) {
    console.error("Erro ao enviar e-mail com NF Isolada no nodemailer:", error);
    return false;
  }
}
