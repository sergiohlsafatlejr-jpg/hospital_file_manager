import { and, eq, inArray } from "drizzle-orm";
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
import {
  obterSenhaParaRobo,
  validarCaminhoContidoXmlRpa,
  validarUrlPortalConvenio,
} from "./cofreCredenciais";
import { RoboBase, LoteParaEnvioRpa } from "./RoboBase";
import type { ResultadoCicloGrupoRpa, ResultadoEnvioLoteRpa } from "./RoboBase";
import { RoboUnimed } from "./robos/RoboUnimed";
import { RoboIpasgo } from "./robos/RoboIpasgo";
import { RoboCassi } from "./robos/RoboCassi";
import { RoboSaudeCaixa } from "./robos/RoboSaudeCaixa";

/**
 * A estrutura física da tabela `fila_envio_xml_portal` e das colunas adicionais de `credenciais_portais`
 * é gerida exclusivamente pela migração 0145 e seu executor restrito (sem DDL em runtime).
 */
export async function garantirTabelasRpaEnvio(_dbArg?: any): Promise<void> {
  // Sem CREATE/ALTER TABLE em requisições HTTP.
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

  return new RoboUnimed();
}

function toMysqlDateTime(date: Date = new Date()): string {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

function affectedRowsOf(res: any): number {
  const header = Array.isArray(res) ? res[0] : res;
  return Number(header?.affectedRows ?? header?.rowsAffected ?? 0);
}

/**
 * Executa um ciclo do Worker RPA agrupando lotes pendentes por (estabelecimentoId, convenioId).
 * Exige escopo hospitalar explícito, claim atômico por lote (LIBERADO_ENVIO -> PROCESSANDO_ROBO),
 * credencial proprietária do hospital e URL HTTPS aprovada por convênio.
 */
export async function executarCicloEnvioXmlRpa(opcoes: {
  loteIds?: number[];
  modoExecucao?: "simulacao" | "producao";
  estabelecimentoIdFiltro?: number | null;
  convenioIdFiltro?: number | null;
  estabelecimentosAutorizadosIds: number[];
  usuarioIdExecutor?: number;
  usuarioNomeExecutor?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");

  const autorizadosSet = new Set(
    (opcoes.estabelecimentosAutorizadosIds || [])
      .map((id) => Number(id))
      .filter((id) => Number.isSafeInteger(id) && id > 0)
  );
  if (autorizadosSet.size === 0) {
    throw new Error("Nenhum estabelecimento autorizado para execução do ciclo RPA.");
  }

  const modoExecucao = opcoes.modoExecucao || "simulacao";

  // 1. Buscar lotes na fila restritos aos hospitais autorizados e ao status LIBERADO_ENVIO
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
    .leftJoin(convenios, eq(filaEnvioXmlPortal.convenioId, convenios.id))
    .where(
      and(
        eq(filaEnvioXmlPortal.statusEsteira, "LIBERADO_ENVIO"),
        inArray(
          filaEnvioXmlPortal.estabelecimentoId,
          Array.from(autorizadosSet)
        )
      )
    );

  const lotesElegiveis = todosLotesFila
    .filter((lote) => {
      if (!autorizadosSet.has(Number(lote.estabelecimentoId))) {
        return false;
      }
      if (lote.statusEsteira !== "LIBERADO_ENVIO") {
        return false;
      }
      if (opcoes.loteIds && opcoes.loteIds.length > 0) {
        if (!opcoes.loteIds.includes(Number(lote.id))) return false;
      }
      if (
        opcoes.estabelecimentoIdFiltro &&
        Number(lote.estabelecimentoId) !== Number(opcoes.estabelecimentoIdFiltro)
      ) {
        return false;
      }
      if (
        opcoes.convenioIdFiltro &&
        Number(lote.convenioId) !== Number(opcoes.convenioIdFiltro)
      ) {
        return false;
      }
      return true;
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
      mensagem: "Nenhum lote autorizado na fila com status LIBERADO_ENVIO para processar.",
    };
  }

  // 2. Agrupar em memória por chave estrita: (estabelecimentoId, convenioId)
  const gruposEnvio = new Map<string, typeof lotesElegiveis>();
  for (const lote of lotesElegiveis) {
    const chave = `${lote.estabelecimentoId}::${lote.convenioId}`;
    const lista = gruposEnvio.get(chave) || [];
    lista.push(lote);
    gruposEnvio.set(chave, lista);
  }

  // Carregar credenciais apenas dos estabelecimentos autorizados (sem fallback entre hospitais ou credencial sem unidade)
  const todasCredenciais = await db
    .select()
    .from(credenciaisPortais)
    .where(
      inArray(
        credenciaisPortais.estabelecimentoId,
        Array.from(autorizadosSet)
      )
    );

  let totalLotesProcessados = 0;
  let protocolados = 0;
  let simuladosOk = 0;
  let erros = 0;
  const detalhesGrupos: any[] = [];

  // 3. Processar cada grupo (Hospital + Convênio) em uma sessão isolada
  for (const [, listaLotesCandidatos] of gruposEnvio.entries()) {
    const primeiro = listaLotesCandidatos[0];
    const estabId = Number(primeiro.estabelecimentoId);
    const convId = Number(primeiro.convenioId);

    // Exige credencial exclusivamente vinculada ao hospital proprietário e ao convênio (sem fallback nulo)
    const credEspecifica = todasCredenciais.find(
      (c: any) =>
        c.ativo === "sim" &&
        Number(c.convenioId) === convId &&
        Number(c.estabelecimentoId) === estabId
    );

    if (!credEspecifica) {
      const msgSemCred = `Credencial proprietária não cadastrada no Cofre para o hospital "${primeiro.estabelecimentoNome || `#${estabId}`}" no convênio "${primeiro.convenioNome || `#${convId}`}".`;
      for (const lote of listaLotesCandidatos) {
        await db
          .update(filaEnvioXmlPortal)
          .set({
            statusEsteira: "ERRO_CREDENCIAL",
            mensagemPortal: msgSemCred,
          })
          .where(
            and(
              eq(filaEnvioXmlPortal.id, lote.id),
              eq(filaEnvioXmlPortal.estabelecimentoId, estabId),
              eq(filaEnvioXmlPortal.statusEsteira, "LIBERADO_ENVIO")
            )
          );
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
        qtdLotes: listaLotesCandidatos.length,
      });
      continue;
    }

    if (credEspecifica.statusCredencial === "SENHA_INVALIDA") {
      const msgBloq = `Trava Anti-Bloqueio ativa: A credencial de "${primeiro.estabelecimentoNome}" para "${primeiro.convenioNome}" está marcada como SENHA_INVALIDA. Atualize a senha no Cofre antes de reenviar.`;
      for (const lote of listaLotesCandidatos) {
        await db
          .update(filaEnvioXmlPortal)
          .set({
            statusEsteira: "ERRO_CREDENCIAL",
            mensagemPortal: msgBloq,
          })
          .where(
            and(
              eq(filaEnvioXmlPortal.id, lote.id),
              eq(filaEnvioXmlPortal.estabelecimentoId, estabId),
              eq(filaEnvioXmlPortal.statusEsteira, "LIBERADO_ENVIO")
            )
          );
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
        qtdLotes: listaLotesCandidatos.length,
      });
      continue;
    }

    // Validar a URL do portal contra a allowlist HTTPS da operadora e decifrar a senha ANTES do claim
    let urlPortalValidada: string;
    let senhaPlana: string;
    try {
      urlPortalValidada = validarUrlPortalConvenio(
        credEspecifica.urlLogin ||
          "https://www.unimedgoiania.coop.br/wps/portal/usuariosunimed",
        primeiro.convenioNome,
        primeiro.registroAns || credEspecifica.registroAns
      );
      senhaPlana = obterSenhaParaRobo(credEspecifica.senha);
    } catch (errSeguranca: any) {
      const msgSeguranca =
        errSeguranca.message ||
        "Falha na validação de segurança da credencial/URL do portal.";
      for (const lote of listaLotesCandidatos) {
        await db
          .update(filaEnvioXmlPortal)
          .set({
            statusEsteira: "ERRO_CREDENCIAL",
            mensagemPortal: msgSeguranca,
          })
          .where(
            and(
              eq(filaEnvioXmlPortal.id, lote.id),
              eq(filaEnvioXmlPortal.estabelecimentoId, estabId),
              eq(filaEnvioXmlPortal.statusEsteira, "LIBERADO_ENVIO")
            )
          );
        erros++;
        totalLotesProcessados++;
      }
      detalhesGrupos.push({
        estabelecimentoId: estabId,
        estabelecimentoNome: primeiro.estabelecimentoNome,
        convenioId: convId,
        convenioNome: primeiro.convenioNome,
        sucessoLogin: false,
        mensagem: msgSeguranca,
        qtdLotes: listaLotesCandidatos.length,
      });
      continue;
    }

    // Claim atômico lote a lote: somente lotes que ainda estão em LIBERADO_ENVIO entram na sessão
    const listaLotesReivindicados: typeof listaLotesCandidatos = [];
    for (const candidato of listaLotesCandidatos) {
      try {
        validarCaminhoContidoXmlRpa(process.cwd(), candidato.caminhoArquivoXml);
      } catch (errPath: any) {
        await db
          .update(filaEnvioXmlPortal)
          .set({
            statusEsteira: "ERRO_ROBO",
            mensagemPortal: errPath.message || "Caminho de arquivo XML inválido.",
          })
          .where(
            and(
              eq(filaEnvioXmlPortal.id, candidato.id),
              eq(filaEnvioXmlPortal.estabelecimentoId, estabId),
              eq(filaEnvioXmlPortal.statusEsteira, "LIBERADO_ENVIO")
            )
          );
        erros++;
        totalLotesProcessados++;
        continue;
      }

      const claimRes = await db
        .update(filaEnvioXmlPortal)
        .set({
          statusEsteira: "PROCESSANDO_ROBO",
          modoExecucao,
        })
        .where(
          and(
            eq(filaEnvioXmlPortal.id, candidato.id),
            eq(filaEnvioXmlPortal.estabelecimentoId, estabId),
            eq(filaEnvioXmlPortal.convenioId, convId),
            eq(filaEnvioXmlPortal.statusEsteira, "LIBERADO_ENVIO")
          )
        );

      if (affectedRowsOf(claimRes) === 1) {
        listaLotesReivindicados.push(candidato);
      }
    }

    if (listaLotesReivindicados.length === 0) {
      continue;
    }

    const lotesParaAdapter: LoteParaEnvioRpa[] = listaLotesReivindicados.map((l) => ({
      filaId: l.id,
      numeroLote: l.numeroLote,
      nomeArquivo: l.nomeArquivo,
      caminhoXml: l.caminhoArquivoXml,
      qtdGuias: l.qtdGuias,
      valorTotal: Number(l.valorTotal || 0),
      fabricaContaId: l.fabricaContaId,
    }));

    const mensagemIncerta = "Resultado de envio incerto. Reconcilie o lote no portal antes de qualquer reenvio.";
    const resultadoIncerto = (lote: LoteParaEnvioRpa): ResultadoEnvioLoteRpa => ({
      filaId: lote.filaId,
      numeroLote: lote.numeroLote,
      sucesso: false,
      status: "AGUARDANDO_PORTAL",
      protocolo: null,
      mensagem: mensagemIncerta,
    });
    let resultadoGrupo: ResultadoCicloGrupoRpa;
    try {
      const adapter = obterAdapterEnvioConvenio(
        primeiro.convenioNome,
        primeiro.registroAns || credEspecifica.registroAns
      );
      resultadoGrupo = await adapter.enviarLotesXml(
        {
          url: urlPortalValidada,
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
      if (!resultadoGrupo || !Array.isArray(resultadoGrupo.resultadosLotes)) {
        throw new Error("Retorno de adapter RPA inválido.");
      }
    } catch {
      // O adapter pode ter transmitido antes de lançar (inclusive no finally).
      // Não divulgar a exceção, senha, XML, URL ou conteúdo da página.
      logger.error({
        message: "[RPA Envio] Adapter interrompido após claim; reconciliação obrigatória.",
        estabelecimentoId: estabId,
        convenioId: convId,
        qtdLotes: listaLotesReivindicados.length,
      });
      resultadoGrupo = {
        estabelecimentoId: estabId,
        convenioId: convId,
        loginSucesso: false,
        mensagemLogin: mensagemIncerta,
        resultadosLotes: [],
      };
    }

    // Todo claim recebe exatamente um desfecho, mesmo se o adapter omitir um
    // lote, duplicar resultados ou retornar outro grupo. Não deixar PROCESSANDO.
    const resultadosAdapter = resultadoGrupo.resultadosLotes;
    resultadoGrupo.resultadosLotes = lotesParaAdapter.map((lote) => {
      const correspondentes = resultadosAdapter.filter((r) => r && r.filaId === lote.filaId);
      if (resultadoGrupo.estabelecimentoId !== estabId ||
          resultadoGrupo.convenioId !== convId || correspondentes.length !== 1 ||
          correspondentes[0].numeroLote !== lote.numeroLote) return resultadoIncerto(lote);
      const resultado = correspondentes[0] as ResultadoEnvioLoteRpa & { envioIniciado?: boolean };
      const erro = ["ERRO_ROBO", "ERRO_PORTAL", "ERRO_CREDENCIAL"].includes(resultado.status);
      // Contrato aditivo: somente envioIniciado=false comprovado pelo adapter
      // autoriza um erro pré-envio a continuar elegível. Ausência é incerteza.
      const erroPreEnvio = resultado.envioIniciado === false ||
        (!resultadoGrupo.loginSucesso && resultadoGrupo.credencialInvalida &&
          resultado.status === "ERRO_CREDENCIAL");
      if (modoExecucao === "producao" &&
          ((erro && !erroPreEnvio) || resultado.status === "SIMULADO_OK")) {
        return { ...resultado, ...resultadoIncerto(lote) };
      }
      return resultado.status === "PROTOCOLADO" ? resultado : { ...resultado, protocolo: null };
    });

    // Atualizar status da credencial no Cofre apenas quando houve tentativa real em produção
    if (modoExecucao === "producao") {
      if (!resultadoGrupo.loginSucesso && resultadoGrupo.credencialInvalida) {
        await db
          .update(credenciaisPortais)
          .set({
            statusCredencial: "SENHA_INVALIDA",
            statusAcesso: "erro",
            mensagemErro:
              resultadoGrupo.mensagemLogin || "Usuário ou senha inválidos no portal",
            ultimoAcesso: new Date(),
          })
          .where(
            and(
              eq(credenciaisPortais.id, credEspecifica.id),
              eq(credenciaisPortais.estabelecimentoId, estabId)
            )
          );
      } else if (resultadoGrupo.loginSucesso) {
        await db
          .update(credenciaisPortais)
          .set({
            statusCredencial: "ATIVA",
            statusAcesso: "sucesso",
            mensagemErro: null,
            ultimoAcesso: new Date(),
          })
          .where(
            and(
              eq(credenciaisPortais.id, credEspecifica.id),
              eq(credenciaisPortais.estabelecimentoId, estabId)
            )
          );
      }
    }

    // Salvar o protocolo/evidência individual de cada lote reivindicado (somente se permanecer em PROCESSANDO_ROBO)
    for (const resLote of resultadoGrupo.resultadosLotes) {
      const loteOrig = listaLotesReivindicados.find((l) => l.id === resLote.filaId);
      if (!loteOrig) continue;

      const novasTentativas = Number(loteOrig.tentativas || 0) + 1;
      const now = new Date();
      const foiProtocoladoCorrelacionado =
        modoExecucao === "producao" &&
        resLote.sucesso &&
        resLote.status === "PROTOCOLADO" &&
        Boolean(resLote.protocolo && String(resLote.protocolo).trim().length >= 4);

      const statusFinal = foiProtocoladoCorrelacionado
        ? "PROTOCOLADO"
        : resLote.status === "PROTOCOLADO"
          ? "AGUARDANDO_PORTAL"
          : resLote.status;

      const updRes = await db
        .update(filaEnvioXmlPortal)
        .set({
          statusEsteira: statusFinal,
          protocoloRetorno: foiProtocoladoCorrelacionado ? resLote.protocolo : null,
          idRecebimentoPortal: modoExecucao === "producao" ? resLote.idRecebimento || null : null,
          mensagemPortal: resLote.mensagem,
          comprovanteUrl: resLote.evidenciaPath || null,
          screenshotBase64: resLote.screenshotBase64 || null,
          tentativas: novasTentativas,
          enviadoEm: foiProtocoladoCorrelacionado ? now : null,
        })
        .where(
          and(
            eq(filaEnvioXmlPortal.id, resLote.filaId),
            eq(filaEnvioXmlPortal.estabelecimentoId, estabId),
            eq(filaEnvioXmlPortal.statusEsteira, "PROCESSANDO_ROBO")
          )
        );

      if (affectedRowsOf(updRes) !== 1) {
        continue;
      }

      totalLotesProcessados++;
      if (statusFinal === "PROTOCOLADO") protocolados++;
      else if (statusFinal === "SIMULADO_OK") simuladosOk++;
      else if (!resLote.sucesso) erros++;

      // Avança a conta na Esteira exclusivamente quando PROTOCOLADO em produção com protocolo correlacionado
      if (
        loteOrig.fabricaContaId &&
        foiProtocoladoCorrelacionado &&
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
            usuarioId: opcoes.usuarioIdExecutor || null,
            usuarioNome: opcoes.usuarioNomeExecutor || "Robô RPA",
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
      qtdLotes: listaLotesReivindicados.length,
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
        ? `Ciclo de Simulação (Dry-Run) finalizado: ${simuladosOk} lote(s) validados localmente sem transmissão externa.`
        : `Ciclo de Envio RPA finalizado: ${protocolados} lote(s) protocolados, ${erros} erro(s) em ${gruposEnvio.size} sessão(ões).`,
  };
}
