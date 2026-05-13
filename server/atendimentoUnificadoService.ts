import { getDb } from "./db";
import { sql, eq } from "drizzle-orm";
import { warleineAtendimentosStaging } from "../drizzle/schema-integracao";

export async function popularDeWarleine(
  estabelecimentoId: number
): Promise<{ inseridos: number; total: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");

  // Fetch staging data
  const stagingData = await db
    .select()
    .from(warleineAtendimentosStaging)
    .where(eq(warleineAtendimentosStaging.estabelecimentoId, estabelecimentoId));

  if (stagingData.length === 0) return { inseridos: 0, total: 0 };

  // Remove existing
  const deleteQuery = `
    DELETE FROM atendimentos_unificados 
    WHERE origemSistema = 'WARLEINE' 
      AND estabelecimentoId = ${estabelecimentoId}
  `;
  await db.execute(sql.raw(deleteQuery));

  let registrosTransformados = 0;
  const BATCH_SIZE = 1000;

  for (let i = 0; i < stagingData.length; i += BATCH_SIZE) {
    const batch = stagingData.slice(i, i + BATCH_SIZE);
    
    const valuesPart = batch.map(row => {
      const dados = typeof row.dadosBrutos === 'string' ? JSON.parse(row.dadosBrutos) : (row.dadosBrutos as any);
      
      const uuid = String(dados?.numatend || row.id || '');
      const numero_atendimento = dados?.numatend || null;
      const convenio = dados?.nomeplaco || dados?.convenio || null;
      const paciente = dados?.nomepac || dados?.paciente || null;
      
      const dtEntradaStr = dados?.datatend || dados?.dataAdmissao || null;
      const dtSaidaStr = dados?.datasai || dados?.dataAlta || null;
      
      const dtEntradaSQL = dtEntradaStr ? `'${new Date(dtEntradaStr).toISOString().slice(0, 19).replace('T', ' ')}'` : 'NULL';
      const dtSaidaSQL = dtSaidaStr ? `'${new Date(dtSaidaStr).toISOString().slice(0, 19).replace('T', ' ')}'` : 'NULL';

      const tipo_atendimento = dados?.tipoatendimentodescricao || dados?.tipoAtendimento || null;
      const codigo_procedimento = dados?.procprin || dados?.procedimentoPrincipal || null;

      // Escape strings to prevent sql injection
      const escape = (str: string | null) => str ? `'${str.replace(/'/g, "''")}'` : 'NULL';

      return `(
        'WARLEINE',
        ${escape(uuid)},
        ${estabelecimentoId},
        ${escape(String(numero_atendimento || ''))},
        ${escape(convenio)},
        ${escape(paciente)},
        ${dtEntradaSQL},
        ${dtSaidaSQL},
        ${escape(tipo_atendimento)},
        ${escape(codigo_procedimento)}
      )`;
    }).join(',');

    if (!valuesPart) continue;

    const insertQuery = `
      INSERT INTO atendimentos_unificados (
        origemSistema, 
        origemId, 
        estabelecimentoId,
        numero_atendimento, 
        convenio, 
        paciente,
        data_entrada, 
        data_saida, 
        tipo_atendimento, 
        codigo_procedimento
      ) VALUES ${valuesPart}
    `;

    await db.execute(sql.raw(insertQuery));
    registrosTransformados += batch.length;
  }

  // Marcar como processado (não existe no schema novo, skip)

  return { inseridos: registrosTransformados, total: registrosTransformados };
}

export async function popularDeEasyvision(
  estabelecimentoId: number
): Promise<{ inseridos: number; total: number }> {
  console.log('Orquestrador Easyvision ainda não implementado.');
  return { inseridos: 0, total: 0 };
}
