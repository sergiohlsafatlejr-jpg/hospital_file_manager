import { beforeEach, describe, expect, it, vi } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { clienteDaUnidade, recebivelDaUnidade, transacaoDaUnidade } from "./financeiroEscopo";

vi.mock("./db", async original => ({ ...await original<typeof import("./db")>(), getDb: vi.fn(), verificarPermissaoEstabelecimento: vi.fn() }));
import { getDb, verificarPermissaoEstabelecimento } from "./db";
import { financeiroRouter } from "./routers/financeiroRouter";
const unit=2160001, other=2160002, company=60001;
const caller=() => financeiroRouter.createCaller({ user:{ id:1, role:"admin" },req:{},res:{} } as any);
const row={ descricao:"Conta sintética", valor:"100.00", dataVencimento:"2026-10-25", dataRecebimento:"2026-10-25", recebido:"sim" as const, clienteId:19 };
const dialect = new MySqlDialect();
function mockDb({ companyExists=true, clientExists=true, existing=false, fail=false }={}) {
  const inserted:any[]=[];
  const select=() => ({ from(table:any) {
    const tableName = table?.[Symbol.for("drizzle:Name")];
    const data = tableName==="fin_empresas" ? (companyExists ? [{id:company}] : []) : tableName==="fin_clientes" ? (clientExists ? [{id:19}] : []) : tableName==="fin_recebiveis" ? (existing ? [{descricao:row.descricao,valor:row.valor,dataVencimento:new Date("2026-10-25T12:00:00Z")}] : []) : [];
    const q:any = Promise.resolve(data);q.where=()=>({limit:()=>Promise.resolve(data),for:()=>Promise.resolve(data),then:(fn:any)=>Promise.resolve(data).then(fn)});return q;
  }});
  const tx={ select, insert:()=>({values:async(rows:any)=>{if(fail)throw Error("falha simulada");inserted.push(rows)}}) };
  const transaction=vi.fn(async(fn:any)=>fn(tx));
  vi.mocked(getDb).mockResolvedValue({ select, transaction } as any);
  return {inserted,transaction};
}
describe("financeiro: estabelecimento obrigatório",()=>{
  beforeEach(()=>{vi.clearAllMocks();vi.mocked(verificarPermissaoEstabelecimento).mockResolvedValue(true)});
  it("predicados SQL para recebíveis, clientes e despesas contêm o mesmo ID de unidade",()=>{
    for(const predicate of [recebivelDaUnidade(unit),clienteDaUnidade(unit),transacaoDaUnidade(unit)]) {
      const query=dialect.sqlToQuery(predicate);
      expect(query.sql).toContain("estabelecimentoId");
      expect(query.params).toEqual([unit]);
    }
  });
  it("nega ID de outra unidade mesmo para usuário autenticado",async()=>{
    mockDb({companyExists:false});
    await expect(caller().importador.importarContasReceber({estabelecimentoId:other,empresaId:company,items:[row]})).rejects.toThrow();
  });
  it("nega cliente alheio antes de abrir transação",async()=>{
    const {transaction}=mockDb({clientExists:false});
    await expect(caller().importador.importarContasReceber({estabelecimentoId:unit,empresaId:company,items:[row]})).rejects.toThrow();
    expect(transaction).not.toHaveBeenCalled();
  });
  it("nega dois lançamentos repetidos antes de gravar",async()=>{
    const {transaction}=mockDb();
    await expect(caller().importador.importarContasReceber({estabelecimentoId:unit,empresaId:company,items:[row,row]})).rejects.toThrow("repetidas");
    expect(transaction).not.toHaveBeenCalled();
  });
  it("não reimporta lançamento coincidente",async()=>{
    const {inserted}=mockDb({existing:true});
    await expect(caller().importador.importarContasReceber({estabelecimentoId:unit,empresaId:company,items:[row]})).rejects.toThrow("coincidentes");
    expect(inserted).toHaveLength(0);
  });
  it("trata zeros à esquerda no valor como mesmo recebível",async()=>{
    const {inserted}=mockDb({existing:true});
    await expect(caller().importador.importarContasReceber({estabelecimentoId:unit,empresaId:company,items:[{...row,valor:"0100.00"}]})).rejects.toThrow("coincidentes");
    expect(inserted).toHaveLength(0);
  });
  it("não baixa despesa por ID sem provar que pertence à unidade",async()=>{
    mockDb();
    await expect(caller().transacoes.marcarPago({id:51, estabelecimentoId:unit})).rejects.toThrow("não pertence");
  });
  it("propaga falha da única transação e não retorna sucesso parcial",async()=>{
    const {inserted,transaction}=mockDb({fail:true});
    await expect(caller().importador.importarContasReceber({estabelecimentoId:unit,empresaId:company,items:[row]})).rejects.toThrow("falha simulada");
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(inserted).toHaveLength(0);
  });
  it("não abre banco quando não há permissão de editar na unidade",async()=>{
    const {transaction}=mockDb();
    vi.mocked(verificarPermissaoEstabelecimento).mockResolvedValue(false);
    await expect(caller().importador.importarContasReceber({estabelecimentoId:unit,empresaId:company,items:[row]})).rejects.toThrow();
    expect(transaction).not.toHaveBeenCalled();
  });
});
