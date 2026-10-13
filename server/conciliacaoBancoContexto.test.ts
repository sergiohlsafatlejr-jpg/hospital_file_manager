import { beforeEach, describe, expect, it } from "vitest";
import { chaveContextoConciliacao, lerFonteConciliacao, salvarFonteConciliacao, lerContextoBanco, salvarContextoBanco, limparBuscasDeOutrosUsuarios, paginaBancoValida, type ContextoBanco } from "../client/src/lib/conciliacaoBancoContexto";
const user = 900;
const key = chaveContextoConciliacao(user, 1260036)!;
const contexto: ContextoBanco = { competencia: "2026-08", convenio: "1", status: "ambiguo", dataPagto: "2026-09", pagina: 2, busca: "" };
const fakeStorage = () => {
  const rows = new Map<string, string>();
  return { rows, getItem: (key: string) => rows.get(key) ?? null, setItem: (key: string, value: string) => { rows.set(key, value); } };
};
beforeEach(() => { limparBuscasDeOutrosUsuarios(undefined); });
describe("Contexto de navegação Banco, sem resultados armazenados", () => {
  it("usa namespace de usuário e estabelecimento, sem chave anônima", () => {
    expect(chaveContextoConciliacao(user, 1260036)).not.toBe(chaveContextoConciliacao(user, 2550002));
    expect(chaveContextoConciliacao(user, 1260036)).not.toBe(chaveContextoConciliacao(user + 1, 1260036));
    for (const v of [undefined, null, 0, -1, NaN, "900", 1.5]) expect(chaveContextoConciliacao(v, 1260036)).toBeNull();
  });
  it("restaura a fonte sem conceder acesso ao Banco", () => {
    const storage = fakeStorage(); salvarFonteConciliacao(key, "banco", storage);
    expect(lerFonteConciliacao(key, true, storage)).toBe("banco");
    expect(lerFonteConciliacao(key, false, storage)).toBe("base");
    expect(lerFonteConciliacao(null, true, storage)).toBe("base");
    salvarFonteConciliacao(key, "base", storage); expect(lerFonteConciliacao(key, true, storage)).toBe("base");
  });
  it("restaura os filtros e a página sem guardar resposta da consulta", () => {
    const storage = fakeStorage(); salvarContextoBanco(key, contexto, storage);
    expect(lerContextoBanco(key, storage)).toEqual(contexto);
    expect(JSON.parse(storage.rows.get(`${key}_banco`)!)).toEqual({versao:1, competencia:"2026-08", convenio:"1", status:"ambiguo", dataPagto:"2026-09", pagina:2, buscaAtiva:false});
  });
  it("mantém texto livre só em memória para a volta pela navegação", () => {
    const storage = fakeStorage(); const value = {...contexto, busca:"BUSCA_PRIVADA_SINTETICA", pagina:4}; salvarContextoBanco(key, value, storage);
    expect(lerContextoBanco(key, storage)).toEqual(value);
    expect([...storage.rows.values()].join()).not.toContain(value.busca);
  });
  it("após recarregar sem a busca em memória reinicia a página, não repete página de um filtro privado", () => {
    const storage = fakeStorage(); salvarContextoBanco(key, {...contexto, busca:"TEXTO_SINTETICO", pagina:4}, storage);
    limparBuscasDeOutrosUsuarios(undefined);
    expect(lerContextoBanco(key, storage)).toEqual({...contexto, pagina:1, busca:""});
  });
  it("o usuário seguinte não recebe fonte, filtros ou busca do anterior", () => {
    const storage = fakeStorage(); salvarFonteConciliacao(key, "banco", storage); salvarContextoBanco(key, {...contexto,busca:"TEXTO_SINTETICO"},storage);
    const outro = chaveContextoConciliacao(user + 1,1260036)!; limparBuscasDeOutrosUsuarios(user+1);
    expect(lerFonteConciliacao(outro,true,storage)).toBe("base"); expect(lerContextoBanco(outro,storage)).toBeNull();
    expect(lerContextoBanco(key,storage)?.busca).toBe("");
  });
  it("troca de fonte não substitui o último recorte Banco", () => {
    const storage = fakeStorage(); salvarContextoBanco(key,contexto,storage); salvarFonteConciliacao(key,"base",storage);
    expect(lerContextoBanco(key,storage)).toEqual(contexto);
  });
  it("normaliza valores corrompidos e não aceita filtros arbitrários", () => {
    const storage = fakeStorage(); storage.setItem(`${key}_banco`,JSON.stringify({versao:1,competencia:"2026-13",convenio:"-2",status:"conciliado",dataPagto:"2026-33",pagina:Infinity,ids:["GUIA_FICTICIA"],valorPago:"100",paciente:"PESSOA_FICTICIA"}));
    expect(lerContextoBanco(key,storage)).toEqual({competencia:"todos",convenio:"todos",status:"todos",dataPagto:"todos",pagina:1,busca:""});
  });
  it("falha de storage ou JSON inválido não impede navegação", () => {
    const storage = {getItem:()=>{throw Error("bloqueado")},setItem:()=>{throw Error("bloqueado")}};
    expect(()=>salvarContextoBanco(key,contexto,storage)).not.toThrow(); expect(()=>salvarFonteConciliacao(key,"banco",storage)).not.toThrow();
    expect(lerContextoBanco(key,storage)).toBeNull(); expect(lerFonteConciliacao(key,true,storage)).toBe("base");
    const broken=fakeStorage(); broken.setItem(`${key}_banco`,"{"); expect(lerContextoBanco(key,broken)).toBeNull();
  });
  it("ignora versões desconhecidas e limita a paginação ao contrato da query", () => {
    const storage=fakeStorage();storage.setItem(`${key}_banco`,JSON.stringify({versao:2,...contexto}));expect(lerContextoBanco(key,storage)).toBeNull();
    for(const invalid of [0,-1,1.5,NaN,100001,"2",undefined])expect(paginaBancoValida(invalid)).toBe(1);
    expect(paginaBancoValida(100000)).toBe(100000);
  });
  it("conserva seleção de mês ainda não preenchido, sem inventar pagamento", () => {
    const storage=fakeStorage();salvarContextoBanco(key,{...contexto,dataPagto:"mes"},storage); expect(lerContextoBanco(key,storage)?.dataPagto).toBe("mes");
  });
  it("grava somente lista permitida de propriedades mesmo que alguém passe campos extras", () => {
    const storage=fakeStorage();salvarContextoBanco(key,{...contexto,items:["ITEM_FICTICIO"],paciente:"PESSOA_FICTICIA",valorFaturado:"999"} as ContextoBanco,storage);
    const raw=storage.rows.get(`${key}_banco`)!; expect(raw).not.toMatch(/ITEM_FICTICIO|PESSOA_FICTICIA|999|valorFaturado|items|paciente/);
  });
});
