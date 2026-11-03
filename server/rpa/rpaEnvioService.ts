import { and, eq, inArray, sql } from "drizzle-orm";
import {
  convenios,
  credenciaisPortais,
  estabelecimentos,
  fabricaContas,
  fabricaHistoricoFluxo,
  filaEnvioXmlPortal,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { logger } from "../_core/logger";
import { obterSenhaParaRobo } from "./cofreCredenciais";
import { RoboBase, LoteParaEnvioRpa } from "./RoboBase";
import { RoboUnimed } from "./robos/RoboUnimed";
import { RoboIpasgo } from "./robos/RoboIpasgo";
import { RoboCassi } from "./robos/RoboCassi";
import { RoboSaudeCaixa } from "./robos/RoboSaudeCaixa";

let _schemaVerificado = false;

/**
 * Garante de forma idempotente que a tabela fila_envio_xml_portal e as novas colunas
 * do Cofre Multi-Hospital existam no banco MySQL ativo.
 */
export async function garantirTabelasRpaEnvio(dbArg?: any): Promise<void> {
  if (_schemaVerificado) return;
  const db = dbArg || (await getDb());
  if (!db) return;

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS fila_envio_xml_portal (
        id int NOT NULL AUTO_INCREMENT,
        estabelecimento_id int NOT NULL,
        convenio_id int NOT NULL,
        fabrica_conta_id int DEFAULT NULL,
        arquivo_id int DEFAULT NULL,
        usuario_upload_id int NOT NULL,
        usuario_upload_nome varchar(255) DEFAULT NULL,
        nome_arquivo varchar(255) NOT NULL,
        numero_lote varchar(80) NOT NULL,
        versao_tiss varchar(20) DEFAULT NULL,
        registro_ans varchar(20) DEFAULT NULL,
        codigo_prestador_xml varchar(80) DEFAULT NULL,
        cnpj_prestador_xml varchar(20) DEFAULT NULL,
        qtd_guias int NOT NULL DEFAULT 0,
        qtd_itens int NOT NULL DEFAULT 0,
        valor_total decimal(14,2) NOT NULL DEFAULT '0.00',
        hash_xml varchar(64) NOT NULL,
        caminho_arquivo_xml varchar(512) NOT NULL,
        resumo_guias_json json DEFAULT NULL,
        status_esteira varchar(40) NOT NULL DEFAULT 'IMPORTADO',
        modo_execucao varchar(20) NOT NULL DEFAULT 'producao',
        protocolo_retorno varchar(120) DEFAULT NULL,
        id_recebimento_portal varchar(120) DEFAULT NULL,
        mensagem_portal text,
        comprovante_url varchar(512) DEFAULT NULL,
        screenshot_base64 longtext,
        tentativas int NOT NULL DEFAULT 0,
        enviado_em timestamp NULL DEFAULT NULL,
        created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_fila_xml_status_estab (status_esteira, estabelecimento_id, convenio_id),
        KEY idx_fila_xml_hash_estab (estabelecimento_id, convenio_id, hash_xml),
        KEY idx_fila_xml_fabrica_conta (fabrica_conta_id)
      )
    `);

    const colunasExtras = [
      "ALTER TABLE credenciais_portais ADD COLUMN codigoPrestadorOperadora varchar(80) DEFAULT NULL",
      "ALTER TABLE credenciais_portais ADD COLUMN registroAns varchar(20) DEFAULT NULL",
      "ALTER TABLE credenciais_portais ADD COLUMN parametrosExtras json DEFAULT NULL",
      "ALTER TABLE credenciais_portais ADD COLUMN statusCredencial varchar(40) DEFAULT 'ATIVA'",
    ];

    for (const ddl of colunasExtras) {
      try {
        await db.execute(sql.raw(ddl));
      } catch {
        // Coluna já existe
      }
    }

    _schemaVerificado = true;
  } catch (err: any) {
    logger.warn({
      message: `[RPA Envio] Aviso ao verificar estrutura de tabelas: ${err.message}`,
    });
  }
}

export function obterAdapterEnvioConvenio(
  convenioNome?: string | null,
  registroAns?: string | null
): RoboBase {
  const nomeNorm = String(convenioNome || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
  const ansLimpo = String(registroAns || "").replace(/\D/g, "");

  if (nomeNorm.includes("UNIMED") || ansLimpo === "382876") {
    return new RoboUnimed();
  }
  if (nomeNorm.includes("IPASGO") || ansLimpo === "417548") {
    return new RoboIpasgo();
  }
  if (nomeNorm.includes("CASSI") || ansLimpo === "346659") {
    return new RoboCassi();
  }
  if (nomeNorm.includes("CAIXA") || ansLimpo === "312924") {
    return new RoboSaudeCaixa();
  }

  // Fallback padrão usa o adaptador Unimed/Genérico TISS (que suporta urlEnvioXml e busca de input[type='file'] em iframes)
  return new RoboUnimed();
}

function toMysqlDateTime(date: Date = new Date()): string {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

/**
 * Executa um ciclo do Worker RPA agrupando todos os lotes pendentes por (estabelecimentoId, convenioId).
 * Faz 1 único login por Hospital + Convênio, envia os lotes em sequência na mesma sessão e fecha o browser.
 */
export async function executarCicloEnvioXmlRpa(opcoes?: {
  loteIds?: number[];
  modoExecucao?: "simulacao" | "producao";
  estabelecimentoIdFiltro?: number | null;
  convenioIdFiltro?: number | null;
  usuarioIdExecutor?: number;
  usuarioNomeExecutor?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  await garantirTabelasRpaEnvio(db);

  const modoExecucao = opcoes?.modoExecucao || "producao";

  // 1. Buscar lotes elegíveis na fila
  const todosLotesFila = await db
    .select({
      id: filaEnvioXmlPortal.id,
      estabelecimentoId: filaEnvioXmlPortal.estabelecimentoId,
      convenioId: filaEnvioXmlPortal.convenioId,
      fabricaContaId: filaEnvioXmlPortal.fabricaContaId,
      nomeArquivo: filaEnvioXmlPortal.nomeArquivo,
      numeroLote: filaEnvioXmlPortal.numeroLote,
      registroAns: filaEnvioXmlPortal.registroAns,
      qtdGuias: filaEnvioXmlPortal.qtdGuias,
      valorTotal: filaEnvioXmlPortal.valorTotal,
      caminhoArquivoXml: filaEnvioXmlPortal.caminhoArquivoXml,
      statusEsteira: filaEnvioXmlPortal.statusEsteira,
      tentativas: filaEnvioXmlPortal.tentativas,
      estabelecimentoNome: estabelecimentos.nome,
      convenioNome: convenios.nome,
    })
    .from(filaEnvioXmlPortal)
    .leftJoin(
      estabelecimentos,
      eq(filaEnvioXmlPortal.estabelecimentoId, estabelecimentos.id)
    )
    .leftJoin(convenios, eq(filaEnvioXmlPortal.convenioId, convenios.id));

  const lotesElegiveis = todosLotesFila
    .filter((lote) => {
      if (opcoes?.loteIds && opcoes.loteIds.length > 0) {
        return opcoes.loteIds.includes(Number(lote.id));
      }
      if (
        opcoes?.estabelecimentoIdFiltro &&
        Number(lote.estabelecimentoId) !== Number(opcoes.estabelecimentoIdFiltro)
      ) {
        return false;
      }
      if (
        opcoes?.convenioIdFiltro &&
        Number(lote.convenioId) !== Number(opcoes.convenioIdFiltro)
      ) {
        return false;
      }
      return lote.statusEsteira === "LIBERADO_ENVIO";
    })
    .sort((a, b) => {
      if (a.estabelecimentoId !== b.estabelecimentoId) {
        return a.estabelecimentoId - b.estabelecimentoId;
      }
      if (a.convenioId !== b.convenioId) {
        return a.convenioId - b.convenioId;
      }
      return a.id - b.id;
    });

  if (lotesElegiveis.length === 0) {
    return {
      totalGrupos: 0,
      totalLotesProcessados: 0,
      protocolados: 0,
      simuladosOk: 0,
      erros: 0,
      detalhesGrupos: [],
      mensagem: "Nenhum lote na fila com status LIBERADO_ENVIO para processar.",
    };
  }

  // 2. Agrupar em memória por chave: (estabelecimentoId, convenioId)
  const gruposEnvio = new Map<string, typeof lotesElegiveis>();
  for (const lote of lotesElegiveis) {
    const chave = `${lote.estabelecimentoId}::${lote.convenioId}`;
    const lista = gruposEnvio.get(chave) || [];
    lista.push(lote);
    gruposEnvio.set(chave, lista);
  }

  // Carregar todas as credenciais cadastradas
  const todasCredenciais = await db.select().from(credenciaisPortais);

  let totalLotesProcessados = 0;
  let protocolados = 0;
  let simuladosOk = 0;
  let erros = 0;
  const detalhesGrupos: any[] = [];

  // 3. Processar cada grupo (Hospital + Convênio) em uma sessão isolada do navegador
  for (const [, listaLotes] of gruposEnvio.entries()) {
    const primeiro = listaLotes[0];
    const estabId = Number(primeiro.estabelecimentoId);
    const convId = Number(primeiro.convenioId);

    // Buscar credencial específica do Hospital + Convênio (ou fallback do Convênio sem hospital fixo)
    const credEspecifica =
      todasCredenciais.find(
        (c: any) =>
          c.ativo === "sim" &&
          Number(c.convenioId) === convId &&
          Number(c.estabelecimentoId) === estabId
      ) ||
      todasCredenciais.find(
        (c: any) =>
          c.ativo === "sim" &&
          Number(c.convenioId) === convId &&
          !c.estabelecimentoId
      );

    if (!credEspecifica) {
      const msgSemCred = `Credencial não cadastrada no Cofre para o hospital "${primeiro.estabelecimentoNome || `#${estabId}`}" no convênio "${primeiro.convenioNome || `#${convId}`}".`;
      for (const lote of listaLotes) {
        await db
          .update(filaEnvioXmlPortal)
          .set({
            statusEsteira: "ERRO_CREDENCIAL",
            mensagemPortal: msgSemCred,
          })
          .where(eq(filaEnvioXmlPortal.id, lote.id));
        erros++;
        totalLotesProcessados++;
      }
      detalhesGrupos.push({
        estabelecimentoId: estabId,
        estabelecimentoNome: primeiro.estabelecimentoNome,
        convenioId: convId,
        convenioNome: primeiro.convenioNome,
        sucessoLogin: false,
        mensagem: msgSemCred,
        qtdLotes: listaLotes.length,
      });
      continue;
    }

    if (credEspecifica.statusCredencial === "SENHA_INVALIDA") {
      const msgBloq = `Trava Anti-Bloqueio ativa: A credencial de "${primeiro.estabelecimentoNome}" para "${primeiro.convenioNome}" está marcada como SENHA_INVALIDA. Atualize a senha no Cofre antes de reenviar.`;
      for (const lote of listaLotes) {
        await db
          .update(filaEnvioXmlPortal)
          .set({
            statusEsteira: "ERRO_CREDENCIAL",
            mensagemPortal: msgBloq,
          })
          .where(eq(filaEnvioXmlPortal.id, lote.id));
        erros++;
        totalLotesProcessados++;
      }
      detalhesGrupos.push({
        estabelecimentoId: estabId,
        estabelecimentoNome: primeiro.estabelecimentoNome,
        convenioId: convId,
        convenioNome: primeiro.convenioNome,
        sucessoLogin: false,
        mensagem: msgBloq,
        qtdLotes: listaLotes.length,
      });
      continue;
    }

    // Marcar todos os lotes do grupo como PROCESSANDO_ROBO
    const idsGrupo = listaLotes.map((l) => l.id);
    await db
      .update(filaEnvioXmlPortal)
      .set({
        statusEsteira: "PROCESSANDO_ROBO",
        modoExecucao,
      })
      .where(inArray(filaEnvioXmlPortal.id, idsGrupo));

    // Descriptografar senha apenas em memória RAM para o Worker
    const senhaPlana = obterSenhaParaRobo(credEspecifica.senha);

    const adapter = obterAdapterEnvioConvenio(
      primeiro.convenioNome,
      primeiro.registroAns || credEspecifica.registroAns
    );

    const lotesParaAdapter: LoteParaEnvioRpa[] = listaLotes.map((l) => ({
      filaId: l.id,
      numeroLote: l.numeroLote,
      nomeArquivo: l.nomeArquivo,
      caminhoXml: l.caminhoArquivoXml,
      qtdGuias: l.qtdGuias,
      valorTotal: Number(l.valorTotal || 0),
      fabricaContaId: l.fabricaContaId,
    }));

    const resultadoGrupo = await adapter.enviarLotesXml(
      {
        url:
          credEspecifica.urlLogin ||
          "https://www.unimedgoiania.coop.br/wps/portal/usuariosunimed",
        login: credEspecifica.login,
        senha: senhaPlana,
        estabelecimentoId: estabId,
        convenioId: convId,
        codigoPrestadorOperadora: credEspecifica.codigoPrestadorOperadora,
        registroAns: credEspecifica.registroAns,
        parametrosExtras: (credEspecifica.parametrosExtras as any) || null,
      },
      lotesParaAdapter,
      { modoExecucao }
    );

    // Atualizar status da credencial no Cofre (Circuit Breaker Anti-Bloqueio)
    if (!resultadoGrupo.loginSucesso && resultadoGrupo.credencialInvalida) {
      await db
        .update(credenciaisPortais)
        .set({
          statusCredencial: "SENHA_INVALIDA",
          statusAcesso: "erro",
          mensagemErro: resultadoGrupo.mensagemLogin || "Usuário ou senha inválidos no portal",
          ultimoAcesso: new Date(),
        })
        .where(eq(credenciaisPortais.id, credEspecifica.id));
    } else if (resultadoGrupo.loginSucesso) {
      await db
        .update(credenciaisPortais)
        .set({
          statusCredencial: "ATIVA",
          statusAcesso: "sucesso",
          mensagemErro: null,
          ultimoAcesso: new Date(),
        })
        .where(eq(credenciaisPortais.id, credEspecifica.id));
    }

    // Salvar o protocolo/evidência individual de cada lote do grupo
    for (const resLote of resultadoGrupo.resultadosLotes) {
      const loteOrig = listaLotes.find((l) => l.id === resLote.filaId);
      const novasTentativas = Number(loteOrig?.tentativas || 0) + 1;
      const now = new Date();

      await db
        .update(filaEnvioXmlPortal)
        .set({
          statusEsteira: resLote.status,
          protocoloRetorno: resLote.protocolo || null,
          idRecebimentoPortal: resLote.idRecebimento || null,
          mensagemPortal: resLote.mensagem,
          comprovanteUrl: resLote.evidenciaPath || null,
          screenshotBase64: resLote.screenshotBase64 || null,
          tentativas: novasTentativas,
          enviadoEm: resLote.sucesso ? now : null,
        })
        .where(eq(filaEnvioXmlPortal.id, resLote.filaId));

      totalLotesProcessados++;
      if (resLote.status === "PROTOCOLADO") protocolados++;
      else if (resLote.status === "SIMULADO_OK") simuladosOk++;
      else if (!resLote.sucesso) erros++;

      // Se o lote estava amarrado a uma conta na Esteira (fabrica_contas) e foi PROTOCOLADO em produção, avança a conta!
      if (
        loteOrig?.fabricaContaId &&
        resLote.status === "PROTOCOLADO" &&
        resLote.protocolo
      ) {
        try {
          const nowStr = toMysqlDateTime(now);
          await db
            .update(fabricaContas)
            .set({
              setorAtual: "enviado_convenio",
              statusSetor: "concluido",
              protocoloEnvioConvenio: resLote.protocolo,
              metodoEnvioConvenio: "rpa_portal",
              dataEnvioConvenio: nowStr,
            })
            .where(
              and(
                eq(fabricaContas.id, Number(loteOrig.fabricaContaId)),
                eq(fabricaContas.hospitalEstabelecimentoId, estabId)
              )
            );

          await db.insert(fabricaHistoricoFluxo).values({
            fabricaContaId: Number(loteOrig.fabricaContaId),
            hospitalEstabelecimentoId: estabId,
            setorOrigem: "limpeza_prontuario",
            setorDestino: "enviado_convenio",
            acao: "enviado_convenio",
            usuarioId: opcoes?.usuarioIdExecutor || null,
            usuarioNome: opcoes?.usuarioNomeExecutor || "Robô RPA",
            dataEntradaSetor: nowStr,
            dataSaidaSetor: nowStr,
            duracaoSegundos: 0,
            valorMovimentado: String(loteOrig.valorTotal || "0.00"),
            observacao: `Enviado automaticamente via Robô RPA (${primeiro.convenioNome}). Protocolo: ${resLote.protocolo}`,
          });
        } catch (errFab: any) {
          logger.warn({
            message: `[RPA Envio] Aviso ao atualizar fabrica_contas #${loteOrig.fabricaContaId}: ${errFab.message}`,
          });
        }
      }
    }

    detalhesGrupos.push({
      estabelecimentoId: estabId,
      estabelecimentoNome: primeiro.estabelecimentoNome,
      convenioId: convId,
      convenioNome: primeiro.convenioNome,
      sucessoLogin: resultadoGrupo.loginSucesso,
      credencialInvalida: resultadoGrupo.credencialInvalida,
      mensagem: resultadoGrupo.mensagemLogin,
      qtdLotes: listaLotes.length,
      resultados: resultadoGrupo.resultadosLotes,
    });
  }

  return {
    totalGrupos: gruposEnvio.size,
    totalLotesProcessados,
    protocolados,
    simuladosOk,
    erros,
    detalhesGrupos,
    mensagem:
      modoExecucao === "simulacao"
        ? `Ciclo de Simulação (Dry-Run) finalizado: ${simuladosOk} lote(s) validados em ${gruposEnvio.size} sessão(ões) Hospital x Convênio.`
        : `Ciclo de Envio RPA finalizado: ${protocolados} lote(s) protocolados, ${erros} erro(s) em ${gruposEnvio.size} sessão(ões).`,
  };
}
