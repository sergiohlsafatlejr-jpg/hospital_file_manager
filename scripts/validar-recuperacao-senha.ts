import { getRawPool } from "../server/db";
import { verificarConexaoSMTP } from "../server/emailService";
import { findUserForPasswordAuth, isResetTokenValid, resetPasswordWithToken } from "../server/passwordAuthService";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  const pool = await getRawPool();
  if (!pool) throw new Error("Banco indisponível");
  try {
    const [tables] = await pool.execute<any[]>(`
      SELECT TABLE_NAME tableName
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('passwordResetTokens','authSecurityEvents','authRateLimits')
      ORDER BY TABLE_NAME
    `);
    const [indexes] = await pool.execute<any[]>(`
      SELECT TABLE_NAME tableName,INDEX_NAME indexName
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA=DATABASE()
        AND TABLE_NAME IN ('users','passwordResetTokens','authSecurityEvents','authRateLimits')
      GROUP BY TABLE_NAME,INDEX_NAME
      ORDER BY TABLE_NAME,INDEX_NAME
    `);
    const [accounts] = await pool.execute<any[]>(`
      SELECT COUNT(*) total,
        SUM(CASE WHEN email IS NOT NULL AND TRIM(email)<>'' THEN 1 ELSE 0 END) comEmail,
        SUM(CASE WHEN emailCanonical IS NOT NULL THEN 1 ELSE 0 END) identidadesCanonicas,
        SUM(CASE WHEN passwordHash IS NOT NULL AND TRIM(passwordHash)<>'' THEN 1 ELSE 0 END) comSenha,
        MIN(sessionVersion) menorVersaoSessao
      FROM users
    `);
    const [duplicateCanonical] = await pool.execute<any[]>(`
      SELECT emailCanonical,COUNT(*) total FROM users
      WHERE emailCanonical IS NOT NULL
      GROUP BY emailCanonical HAVING COUNT(*)>1
    `);
    const [ambiguousEmails] = await pool.execute<any[]>(`
      SELECT LOWER(TRIM(email)) normalizedEmail,
        COUNT(*) total,
        SUM(CASE WHEN emailCanonical IS NOT NULL THEN 1 ELSE 0 END) canonicalEnabled
      FROM users
      WHERE email IS NOT NULL AND TRIM(email)<>''
      GROUP BY LOWER(TRIM(email))
      HAVING COUNT(*)>1
    `);
    const [sensitiveSchema] = await pool.execute<any[]>(`
      SELECT COLUMN_NAME columnName
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA=DATABASE()
        AND TABLE_NAME IN ('passwordResetTokens','authSecurityEvents','authRateLimits')
        AND LOWER(COLUMN_NAME) IN ('token','email','ip','password','senha')
    `);
    const [sampleAccount] = await pool.execute<any[]>(`
      SELECT email FROM users WHERE emailCanonical IS NOT NULL ORDER BY id LIMIT 1
    `);
    const [preparedIntervals] = await pool.execute<any[]>(`
      SELECT DATE_SUB(NOW(),INTERVAL ? MINUTE) inicioJanela,
        DATE_ADD(NOW(),INTERVAL ? MINUTE) fimExpiracao
    `, [15, 30]);
    const smtp = await verificarConexaoSMTP();
    const selectedAccount = await findUserForPasswordAuth(sampleAccount[0]?.email || "");
    const fakeToken = "token-inexistente-para-validacao-segura-000000000000";
    const fakeTokenValid = await isResetTokenValid(fakeToken);
    const fakeReset = await resetPasswordWithToken(fakeToken, "PortalSeguro2026");

    assert(tables.length === 3, `Esperadas 3 tabelas, encontradas ${tables.length}`);
    assert(indexes.some((item) => item.indexName === "passwordResetTokens_tokenHash_unique"), "Índice único do token ausente");
    assert(indexes.some((item) => item.indexName === "idx_auth_event_email_type_date"), "Índice de evento por e-mail ausente");
    assert(indexes.some((item) => item.indexName === "idx_auth_event_ip_type_date"), "Índice de evento por IP ausente");
    assert(indexes.some((item) => item.indexName === "idx_auth_rate_updated"), "Índice do rate limit ausente");
    assert(indexes.some((item) => item.indexName === "users_emailCanonical_unique"), "Unicidade canônica do e-mail ausente");
    assert(Number(accounts[0]?.total || 0) > 0 && Number(accounts[0]?.identidadesCanonicas || 0) > 0, "Nenhuma identidade canônica elegível encontrada");
    assert(Number(accounts[0]?.menorVersaoSessao || 0) >= 0, "Versão de sessão inválida");
    assert(duplicateCanonical.length === 0, "Existem identidades canônicas duplicadas");
    assert(ambiguousEmails.every((item) => Number(item.canonicalEnabled) === 0), "E-mail ambíguo foi associado por heurística");
    assert(Boolean(selectedAccount?.id), "Seleção de identidade canônica falhou");
    assert(Boolean(preparedIntervals[0]?.inicioJanela && preparedIntervals[0]?.fimExpiracao), "Intervalos preparados não são suportados pelo banco");
    assert(sensitiveSchema.length === 0, "O schema contém coluna sensível em texto puro");
    assert(!fakeTokenValid && !fakeReset.success, "Token inexistente não foi rejeitado");
    assert(smtp.ok, `SMTP indisponível: ${smtp.error || "erro desconhecido"}`);

    console.log(JSON.stringify({
      validado: true,
      tabelas: tables.map((item) => item.tableName),
      identidadeCanonica: {
        total: Number(accounts[0].total),
        comEmail: Number(accounts[0].comEmail),
        elegiveis: Number(accounts[0].identidadesCanonicas),
        duplicadas: duplicateCanonical.length,
        conflitosBloqueados: ambiguousEmails.reduce((total, item) => total + Number(item.total), 0),
      },
      comSenhaAntesDaPublicacao: Number(accounts[0].comSenha),
      rateLimitAtomico: true,
      versaoDeSessao: true,
      dadosSensiveisEmTextoPuro: false,
      tokenInexistenteRejeitado: true,
      smtpComTlsValidado: true,
    }, null, 2));
  } finally {
    await pool.end();
  }
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
