/**
 * Serviço para Marcar Itens como Glosados
 * 
 * Permite que o usuário marque manualmente um item desassociado (código 9999)
 * como "glosado", confirmando que foi realmente uma glosa sem motivo informado.
 */

import { getDb, getRawPool } from "./db";
import { sql } from "drizzle-orm";

interface MarcarGlosadoInput {
  itemId: number;
  estabelecimentoId: number;
  motivo?: string; // Motivo opcional que o usuário pode informar
}

interface ResultadoMarcarGlosado {
  sucesso: boolean;
  mensagem: string;
  item?: {
    id: number;
    codigoItem: string;
    descricaoItem: string;
    statusAnterior: string;
    statusNovo: string;
    valorGlosa: number;
  };
}

/**
 * Marca um item desassociado como "glosado"
 * Mantém a glosa, apenas muda o status para indicar que foi confirmado como glosa
 */
export async function marcarItemComoGlosado(
  input: MarcarGlosadoInput
): Promise<ResultadoMarcarGlosado> {
  const db = await getDb();
  const pool = await getRawPool();
  if (!db || !pool) throw new Error("Database não disponível");

  try {
    // PASSO 1: Buscar o item
    const [itens] = await (pool as any).execute(`
      SELECT 
        id,
        numeroGuia,
        codigoItem,
        descricaoItem,
        statusConciliacao,
        codigoGlosa,
        valorGlosa,
        valorFaturado
      FROM conciliados_automatico
      WHERE id = ${input.itemId}
        AND estabelecimentoId = ${input.estabelecimentoId}
    `);

    if (!itens || itens.length === 0) {
      return {
        sucesso: false,
        mensagem: "Item não encontrado",
      };
    }

    const item = itens[0];

    // PASSO 2: Validar se é um item desassociado com código 9999
    if (item.codigoGlosa !== "9999") {
      return {
        sucesso: false,
        mensagem: `Item tem código de glosa '${item.codigoGlosa}', esperado '9999'`,
      };
    }

    if (item.statusConciliacao !== "glosa_total") {
      return {
        sucesso: false,
        mensagem: `Item tem status '${item.statusConciliacao}', esperado 'glosa_total'`,
      };
    }

    // PASSO 3: Atualizar o item para status "glosado"
    const motivoGlosa = input.motivo || "Glosa confirmada manualmente - sem motivo informado";

    await (pool as any).execute(`
      UPDATE conciliados_automatico
      SET statusConciliacao = 'glosado',
          metodoConciliacao = 'manual_confirmacao',
          motivoGlosa = '${motivoGlosa.replace(/'/g, "''")}',
          executadoPorNome = 'Usuário - Marcação Manual'
      WHERE id = ${input.itemId}
        AND estabelecimentoId = ${input.estabelecimentoId}
    `);

    return {
      sucesso: true,
      mensagem: `Item ${item.codigoItem} marcado como glosado (R$ ${Number(item.valorGlosa).toFixed(2)})`,
      item: {
        id: item.id,
        codigoItem: item.codigoItem,
        descricaoItem: item.descricaoItem,
        statusAnterior: "glosa_total",
        statusNovo: "glosado",
        valorGlosa: Number(item.valorGlosa),
      },
    };
  } catch (erro) {
    console.error("[MarcarGlosado] Erro ao marcar item como glosado:", erro);
    return {
      sucesso: false,
      mensagem: `Erro ao marcar item: ${erro instanceof Error ? erro.message : "Erro desconhecido"}`,
    };
  }
}

/**
 * Desfazer marcação de glosado (reverter para glosa_total)
 */
export async function desfazerMarcarGlosado(
  itemId: number,
  estabelecimentoId: number
): Promise<ResultadoMarcarGlosado> {
  const db = await getDb();
  const pool = await getRawPool();
  if (!db || !pool) throw new Error("Database não disponível");

  try {
    // PASSO 1: Buscar o item
    const [itens] = await (pool as any).execute(`
      SELECT 
        id,
        codigoItem,
        descricaoItem,
        statusConciliacao,
        valorGlosa
      FROM conciliados_automatico
      WHERE id = ${itemId}
        AND estabelecimentoId = ${estabelecimentoId}
    `);

    if (!itens || itens.length === 0) {
      return {
        sucesso: false,
        mensagem: "Item não encontrado",
      };
    }

    const item = itens[0];

    // PASSO 2: Validar se é um item glosado
    if (item.statusConciliacao !== "glosado") {
      return {
        sucesso: false,
        mensagem: `Item tem status '${item.statusConciliacao}', esperado 'glosado'`,
      };
    }

    // PASSO 3: Reverter para glosa_total
    await (pool as any).execute(`
      UPDATE conciliados_automatico
      SET statusConciliacao = 'glosa_total',
          metodoConciliacao = NULL,
          motivoGlosa = 'Glosa não informada pela operadora',
          executadoPorNome = NULL
      WHERE id = ${itemId}
        AND estabelecimentoId = ${estabelecimentoId}
    `);

    return {
      sucesso: true,
      mensagem: `Marcação de glosado removida do item ${item.codigoItem}`,
      item: {
        id: item.id,
        codigoItem: item.codigoItem,
        descricaoItem: item.descricaoItem,
        statusAnterior: "glosado",
        statusNovo: "glosa_total",
        valorGlosa: Number(item.valorGlosa),
      },
    };
  } catch (erro) {
    console.error("[MarcarGlosado] Erro ao desfazer marcação:", erro);
    return {
      sucesso: false,
      mensagem: `Erro ao desfazer: ${erro instanceof Error ? erro.message : "Erro desconhecido"}`,
    };
  }
}
