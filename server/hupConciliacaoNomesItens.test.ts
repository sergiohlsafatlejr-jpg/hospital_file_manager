import { it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { compararSnapshotHup, type HupSnapshotItem } from "./hupConciliacaoPilotoCompare";
const item:HupSnapshotItem={conta:"CONTA-TESTE",guiaPrestador:"GUIA-TESTE",guiaOperadora:"OPERADORA-TESTE",codigoTuss:"1234",dataItem:"2026-08-01",tipoItem:"MAT",setor:"SETOR-TESTE",modalidade:"S",quantidade:"1",valorFaturado:"2.50"};
it("exibe todos os nomes distintos de um grupo sem mudar a chave financeira",()=>{
 const a=compararSnapshotHup([{...item,descricaoItem:"Nome sintético A"},{...item,descricaoItem:"Nome sintético B"},{...item,descricaoItem:"Nome sintético A"}],[]);
 expect(a.items).toHaveLength(1);expect(a.items[0].descricoesItem).toEqual(["Nome sintético A","Nome sintético B"]);
 expect(a.items[0].quantidade).toBe("3");expect(a.items[0].valorFaturado).toBe("7.50");
});
it("não inventa descrição ausente",()=>expect(compararSnapshotHup([item],[]).items[0].descricoesItem).toEqual([]));
it("trim de texto não altera códigos, datas ou modalidade",()=>{const x=compararSnapshotHup([{...item,descricaoItem:"  Nome sintético  "}],[]).items[0];expect(x.descricoesItem).toEqual(["Nome sintético"]);expect(x.codigoTuss).toBe(item.codigoTuss);expect(x.setor).toBe(item.setor);});
it("mantém setores separados apesar do mesmo nome",()=>expect(compararSnapshotHup([{...item,descricaoItem:"Mesmo nome"},{...item,descricaoItem:"Mesmo nome",setor:"OUTRO"}],[]).items).toHaveLength(2));
it("serviço e detalhe usam o nome de origem sem dados clínicos em storage",()=>{
 const srv=readFileSync(new URL("./hupConciliacaoPilotoService.ts",import.meta.url),"utf8");
 const ui=readFileSync(new URL("../client/src/components/HupComparativoGuiaDetalhes.tsx",import.meta.url),"utf8");
 expect(srv).toContain("i.servicoNome descricaoItem");expect(ui).toContain('aria-label="Nome do item"');expect(ui).toContain("Nome não informado");expect(ui).toContain("item.descricoesItem.join");
});
