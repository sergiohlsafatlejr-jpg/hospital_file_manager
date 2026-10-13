import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { prepararConfirmacaoBanco, agruparLotesXmlBanco, type BancoItemFaturado, type BancoEventoRetorno } from "./bancoConciliacaoContrato";
const item: BancoItemFaturado={id:1,loteId:1,estabelecimentoId:1260036,convenioId:7,competencia:"2026/08",origemRegistroId:"hop_hup:teste:1",conta:"CONTA-TESTE",guiaPrestador:"GUIA-TESTE",guiaOperadora:"GUIA-OPERADORA",codigoTuss:"12345678",dataItem:"2026-08-10",receber:"S",quantidade:"1",valorFaturado:"10.0001"};
const evento: BancoEventoRetorno={id:4,arquivoId:10,estabelecimentoId:1260036,convenioId:7,arquivoProcessado:true,guia:"GUIA-TESTE",codigoTuss:"12345678",dataItem:"2026-08-10",codigoPrestador:"1234",loteRetorno:"LOTE-TESTE",protocoloRetorno:"PROTOCOLO-TESTE",dataPagamento:"2026-09-01",valorPago:"8.0000",valorGlosa:"2.0000",codigoGlosa:"123"};
function params(i:BancoItemFaturado=item,e:BancoEventoRetorno=evento){return {item:i,evento:e,itensDoRecorte:[i],eventosDoRecorte:[e],itensJaVinculados:[],eventosJaVinculados:[],prestadoresAutorizados:["1234"],confirmadoPor:9,revisado:true};}
describe("Banco: contrato de confirmação revisada",()=>{
  it("preserva quatro casas sem Number ou mistura de recebido Hop",()=>{const x=prepararConfirmacaoBanco(params());expect(x.diferenca).toBe("0.0001");expect(x.valorPago).toBe("8.0000");expect(x.metodo).toBe("guia_tuss_data_revisado");});
  it("não transforma zero informado em dado ausente",()=>{const x=prepararConfirmacaoBanco(params(item,{...evento,valorPago:"0",valorGlosa:"0",codigoGlosa:null}));expect(x.valorPago).toBe("0.0000");expect(x.diferenca).toBe("10.0001");});
  it("não calcula pagamento ou glosa ausentes",()=>{expect(()=>prepararConfirmacaoBanco(params(item,{...evento,valorGlosa:null}))).toThrow("NAO_INFORMADO");expect(()=>prepararConfirmacaoBanco(params(item,{...evento,valorPago:null}))).toThrow("NAO_INFORMADO");});
  it("exige revisão explícita",()=>expect(()=>prepararConfirmacaoBanco({...params(),revisado:false})).toThrow("REVISAO"));
  it("bloqueia unidade diferente",()=>expect(()=>prepararConfirmacaoBanco(params({...item,estabelecimentoId:2}))).toThrow("UNIDADE"));
  it("bloqueia convênio diferente",()=>expect(()=>prepararConfirmacaoBanco(params(item,{...evento,convenioId:8}))).toThrow("CONVENIO"));
  it("não vincula N médico direto",()=>expect(()=>prepararConfirmacaoBanco(params({...item,receber:"N"}))).toThrow("NAO_HOSPITALAR"));
  it("bloqueia arquivo incompleto",()=>expect(()=>prepararConfirmacaoBanco(params(item,{...evento,arquivoProcessado:false}))).toThrow("ARQUIVO"));
  it("exige prova de data real igual",()=>{expect(()=>prepararConfirmacaoBanco(params(item,{...evento,dataItem:null}))).toThrow("DATA_ITEM");expect(()=>prepararConfirmacaoBanco(params(item,{...evento,dataItem:"2026-08-11"}))).toThrow("DIVERGENTES");});
  it("exige prestador autorizado neste convênio",()=>expect(()=>prepararConfirmacaoBanco({...params(),prestadoresAutorizados:["9999"]})).toThrow("PRESTADOR"));
  it("não inventa lote ou protocolo",()=>expect(()=>prepararConfirmacaoBanco(params(item,{...evento,protocoloRetorno:null}))).toThrow("PROTOCOLO"));
  it("não infere código de glosa de texto",()=>expect(()=>prepararConfirmacaoBanco(params(item,{...evento,codigoGlosa:"Erro 123"}))).toThrow("CODIGO_GLOSA"));
  it("não substitui vínculo existente",()=>{expect(()=>prepararConfirmacaoBanco({...params(),itensJaVinculados:[1]})).toThrow("JA_EXISTENTE");expect(()=>prepararConfirmacaoBanco({...params(),eventosJaVinculados:[4]})).toThrow("JA_EXISTENTE");});
  it("não usa um evento para dois itens incluindo médico direto",()=>expect(()=>prepararConfirmacaoBanco({...params(),itensDoRecorte:[item,{...item,id:2,receber:"N"}]})).toThrow("COMPARTILHADO"));
  it("não soma múltiplos retornos artificialmente",()=>expect(()=>prepararConfirmacaoBanco({...params(),eventosDoRecorte:[evento,{...evento,id:5}]})).toThrow("MULTIPLOS"));
  it("exige universo carregado em servidor, sem aceitar item substituído",()=>expect(()=>prepararConfirmacaoBanco({...params(),itensDoRecorte:[{...item,valorFaturado:"999"}]})).toThrow("UNIVERSO"));
  it("bloqueia notação científica e escala acima de quatro",()=>{expect(()=>prepararConfirmacaoBanco(params({...item,valorFaturado:"1e3"}))).toThrow("INVALIDO");expect(()=>prepararConfirmacaoBanco(params({...item,valorFaturado:"10.12345"}))).toThrow("INVALIDO");});
  it("mantém diferença negativa explícita sem ajustar valores originais",()=>expect(prepararConfirmacaoBanco(params(item,{...evento,valorPago:"12"})).diferenca).toBe("-3.9999"));
  it("prévia XML agrupa por convênio, prestador e protocolo",()=>{const a=prepararConfirmacaoBanco(params());const b={...a,faturadoItemId:2,demonstrativoId:5,protocoloRetorno:"OUTRO"};const c={...a,faturadoItemId:3,demonstrativoId:6,codigoPrestador:"OUTRO"};expect(agruparLotesXmlBanco([a,b,c])).toHaveLength(3);});
  it("prévia XML não duplica item/evento",()=>{const a=prepararConfirmacaoBanco(params());expect(()=>agruparLotesXmlBanco([a,a])).toThrow("DUPLICADO");});
  it("não há SQL nem geração/download ou efeitos de storage no contrato",()=>{const src=readFileSync(new URL("./bancoConciliacaoContrato.ts",import.meta.url),"utf8");expect(src).not.toMatch(/INSERT INTO|UPDATE .* SET|DELETE FROM|storagePut|getDb\(|getRawPool\(/);});
});

describe("0135: preparação aditiva isolada",()=>{
  const sql=readFileSync(new URL("../drizzle/0135_fuzzy_wolf_cub.sql",import.meta.url),"utf8");
  it("somente cria cinco tabelas novas sem carregar ou alterar as fontes",()=>{expect(sql.match(/CREATE TABLE/g)).toHaveLength(5);expect(sql).not.toMatch(/ALTER TABLE|DROP |TRUNCATE |INSERT |UPDATE |DELETE /i);});
  it("separa faturado de pagamento sem colunas de recebido no fato",()=>{const bloco=sql.split("CREATE TABLE `banco_faturado_itens`")[1].split("--> statement-breakpoint")[0];expect(bloco).toContain("valorFaturado");expect(bloco).not.toMatch(/valorPago|valorGlosa|valorRecebido/);});
  it("enforce item e evento exclusivos por unidade no banco",()=>{expect(sql).toContain('UNIQUE(`estabelecimentoId`,`faturadoItemId`)');expect(sql).toContain('UNIQUE(`estabelecimentoId`,`demonstrativoId`)');});
});
