import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
const ui = readFileSync(new URL("../client/src/components/HupConciliacaoPiloto.tsx", import.meta.url), "utf8");
const detalhes = readFileSync(new URL("../client/src/components/HupComparativoGuiaDetalhes.tsx", import.meta.url), "utf8");
const table = readFileSync(new URL("../client/src/components/ConciliacaoGuiasTabela.tsx", import.meta.url), "utf8");
const money = readFileSync(new URL("../client/src/lib/hupPilotoMoney.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("../client/src/pages/ConciliacaoCruzada.tsx", import.meta.url), "utf8");

describe("Banco HUP no visual da Conciliação Cruzada existente", () => {
  it("mantém uma página e um único cabeçalho com os filtros originais", () => {
    expect(page).toContain('return <ConciliacaoCruzadaAtual key=');
    expect(page).not.toContain('recorteBanco');
    expect(page).toContain('fonteDados === "banco" && bancoDisponivel');
    expect(page).toContain('estabelecimentoId === 1260036');
    expect(page).toContain('temAcessoModuloNoEstabelecimento("conciliacaoContasPagas", estabelecimentoId)');
    expect(ui).not.toContain('<h1');
    expect(ui).not.toContain('Filtros');
    expect(ui).not.toContain('DashboardLayout');
    for(const label of ['Competência','Convênio','Status Conciliação','Lote XML (Enviado)','Lote Retorno (Convênio)','Buscar','Prestador','Data Pagamento'])expect(page).toContain(label);
  });
  it("compartilha a tabela real nas duas fontes e preserva a sequência de colunas", () => {
    expect(ui).toContain('<ConciliacaoGuiasTabela');
    expect(page).toContain('<ConciliacaoGuiasTabela');
    const labels=['Guia','Paciente','Comp.','Lote','Protocolo','Itens','Faturado','Recebido','Glosado','Acréscimo','Status','Detalhes'];
    let previous=-1;for(const label of labels){const pos=table.search(new RegExp(`>\\s*${label}\\s*</th>`));expect(pos).toBeGreaterThan(previous);previous=pos;}
    expect(table).toContain('bg-green-500 hover:bg-green-600');
    expect(table).toContain('bg-red-500 hover:bg-red-600');
    expect(table).toContain('text-blue-600');
    expect(table).toContain('text-green-600');
    expect(table).toContain('text-red-600');
  });
  it("não apresenta os painéis e explicações do layout rejeitado na lista", () => {
    for(const forbidden of ['Contexto dos demonstrativos','Faturado comparável:','Comparativo das guias da competência','Fonte Banco</Badge><span','<Dialog'])expect(ui).not.toContain(forbidden);
    expect(ui).not.toContain('valorPagoDemonstrativo');
    expect(ui).not.toContain('valorGlosaDemonstrativo');
    expect(detalhes).not.toContain('<Dialog');
  });
  it("deixa Buscar Banco no cabeçalho sem executar as ações persistidas no modo leitura", () => {
    const header=page.slice(page.indexOf('{/* Cabeçalho */}'),page.indexOf('{/* Filtros */}'));
    expect(header.indexOf('Popular Dados')).toBeLessThan(header.indexOf('Buscar dados do banco'));
    expect(header.indexOf('Buscar dados do banco')).toBeLessThan(header.indexOf('Conciliar Automaticamente'));
    expect(header).toContain('disabled={fonteBanco || popularTudo.isPending}');
    expect(header).toContain('disabled={fonteBanco || popularTudo.isPending || conciliarAuto.isPending || conciliacaoEmAndamento}');
    expect(header).toContain('disabled={fonteBanco || resetarConc.isPending}');
    expect(header).toContain('if (!fonteBanco)');
    expect(page).toContain('enabled: !fonteBanco && estabelecimentoId > 0');
    expect(page).toContain('enabled: !fonteBanco && !!guiaSelecionada');
    expect(page).toContain('{!fonteBanco && <>');
    expect(page).toContain('setFonteDados("base")');
  });
  it("aplica os filtros da própria página à consulta Banco, sem ignorar opções sem suporte", () => {
    expect(page).toContain('busca={busca} mesPagamento={dataPagtoFiltro === "todos" ? undefined : dataPagtoFiltro}');
    expect(page).toContain('competenciaFiltro.replace("-", "/")');
    expect(page).toContain('opcoesBanco?.convenios.some');
    expect(page).toContain('Lote XML não se aplica ao faturado do Banco');
    expect(page).toContain('Filtro por lote do retorno ainda não disponível');
    expect(page).toContain('disabled={fonteBanco} value={filtroPrestador}');
    expect(page).toContain('Selecionar mês');
    expect(page).toContain('Mês do pagamento');
    expect(page).toContain('if (fonteDados === "banco" || fonteBanco || filtrosCarregadosPara !== estabelecimentoId) return');
    expect(page).toContain('setFiltrosCarregadosPara(-1); setFonteDados("base")');
  });
  it("consulta somente queries próprias e diferenças conservadoras", () => {
    expect(ui).toContain('trpc.hupConciliacaoPiloto.guias.useQuery');
    expect(detalhes).toContain('trpc.hupConciliacaoPiloto.itensGuia.useQuery');
    expect(detalhes).toContain('avaliarComparativoItem(item)');
    for(const source of [ui,detalhes])expect(source).not.toMatch(/useMutation|\.mutate\(|\.mutateAsync\(|trpc\.faturamentoUnificado/);
    expect(money).toContain('if (value == null) return "—"');
    expect(ui).not.toContain('statusLabel: "Conciliado"');
  });
  it("não chama de confirmado o valor Banco desconhecido do médico direto", () => {
    expect(table).toContain('modo === "banco"');
    expect(table).toContain('Valor candidato à revisão, não recebido confirmado');
    expect(table).toContain('Valor candidato à revisão, não glosado confirmado');
    expect(table).toContain('Recebido informado na base atual');
    expect(table).not.toContain('Recebido confirmado na base atual');
  });
  it("preserva os identificadores reais e a revisão de todos os itens paginados", () => {
    expect(detalhes).toContain('guiaPrestador');
    expect(detalhes).toContain('guiaOperadora');
    expect(detalhes).toContain('pageSize: 50');
    expect(detalhes).toContain('Próxima');
    expect(detalhes).not.toContain('primeiros 100');
    expect(detalhes).toContain('Comparativo por item da guia');
    expect(table).toContain('row.paciente || "—"');
    expect(table).toContain('row.lote || "—"');
    expect(table).toContain('row.protocolo || "—"');
  });
  it("restaura a fonte por usuário/unidade sem resetar Banco em todo mount", () => {
    expect(page).toContain('chaveContextoConciliacao(user?.id, estabelecimentoId)');
    expect(page).toContain('lerFonteConciliacao(contextoKey, bancoDisponivel)');
    expect(page).toContain('lerContextoBanco(contextoKey)');
    expect(page).toContain('salvarContextoBanco(contextoKey');
    expect(page).not.toContain('useEffect(() => { setFonteDados("base"); }');
    expect(page).toContain('if (bancoDisponivel) salvarFonteConciliacao(contextoKey, fonteDados)');
    expect(page).not.toContain('salvarFonteConciliacao(contextoKey, fonteBanco ? "banco" : "base")');
    expect(page).toContain('pagina={paginaBanco} onPaginaChange={setPaginaBanco}');
  });
  it("aguarda opções da unidade e não reinicia a página restaurada ao montar", () => {
    expect(page).toContain(': opcoesBanco ? <HupConciliacaoPiloto');
    expect(ui).toContain('useRef(filtrosKey)');
    expect(ui).toContain('if (filtrosAnteriores.current !== filtrosKey) setPage(1)');
    expect(ui).toContain('page > totalPaginas');
  });
  it("a coluna Faturado usa o subtotal hospitalar e nunca soma médico direto", () => {
    expect(ui).toContain('valorFaturado: guia.valorFaturadoHospital');
    expect(ui).not.toContain('valorFaturado: guia.valorFaturado,');
    expect(detalhes).toContain('item.modalidade === "S" ? item.valorFaturado : null');
    expect(detalhes).toContain('Médico direto: excluído do faturado hospitalar');
    expect(detalhes).toContain('formatPilotoMoney(guia.valorFaturadoHospital)');
  });
});
