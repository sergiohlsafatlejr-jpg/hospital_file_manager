import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ACTIVE_BI_PERMISSION_KEYS,
  MODULE_PERMISSION_KEYS,
  getModulePermissionsForGroup,
  normalizeBiParent,
  sanitizeCustomModulePermissions,
} from "../shared/permissions";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Gestão de Permissões V2", () => {
  it("mantém catálogo completo e sem chaves duplicadas", () => {
    expect(MODULE_PERMISSION_KEYS).toHaveLength(new Set(MODULE_PERMISSION_KEYS).size);
    expect(MODULE_PERMISSION_KEYS).toContain("acessoRelatoriosGlosasBi");
    expect(MODULE_PERMISSION_KEYS).toContain("acessoFaturamentoExterno");
    expect(MODULE_PERMISSION_KEYS).toContain("acessoNfseConsolidado");
    expect(ACTIVE_BI_PERMISSION_KEYS).toContain("acessoRelatoriosGlosasBi");
    const migration = read("drizzle/0113_clumsy_leo.sql");
    expect(migration.indexOf("duplicateRank > 1")).toBeLessThan(migration.indexOf("ADD CONSTRAINT"));
  });

  it("aplica perfis padrão de forma determinística", () => {
    const visualizador = getModulePermissionsForGroup("visualizador");
    expect(visualizador.acessoDashboard).toBe("sim");
    expect(visualizador.acessoRelatoriosBi).toBe("nao");

    const gestor = getModulePermissionsForGroup("gestor");
    expect(gestor.acessoPermissoes).toBe("sim");
    expect(gestor.acessoRelatoriosGlosasBi).toBe("sim");

    const tasy = getModulePermissionsForGroup("usuario_tasy");
    expect(tasy.acessoImportacaoTasy).toBe("sim");
    expect(tasy.acessoFinanceiro).toBe("nao");
  });

  it("sincroniza o pai de Relatórios BI com os relatórios ativos", () => {
    expect(normalizeBiParent({ acessoRelatoriosBi: "nao", acessoRelatoriosGlosasBi: "sim" }).acessoRelatoriosBi).toBe("sim");
    expect(normalizeBiParent({ acessoRelatoriosBi: "sim", acessoRelatoriosGlosasBi: "nao" }).acessoRelatoriosBi).toBe("nao");
  });

  it("ignora chaves desconhecidas de grupos personalizados", () => {
    const result = sanitizeCustomModulePermissions({ acessoDashboard: "sim", permissaoInventada: "sim", acessoArquivos: "talvez" });
    expect(result.acessoDashboard).toBe("sim");
    expect(result.acessoArquivos).toBe("nao");
    expect(result).not.toHaveProperty("permissaoInventada");
  });

  it("exibe matriz pesquisável, ampla e com ações separadas", () => {
    const page = read("client/src/pages/GerenciarPermissoes.tsx");
    const matrix = read("client/src/components/permissions/PermissionMatrix.tsx");
    const actions = read("client/src/components/permissions/OperationalPermissions.tsx");
    expect(page).toContain('!max-w-6xl w-[96vw]');
    expect(page).toContain("PermissionMatrix");
    expect(page).toContain("OperationalPermissions");
    expect(page.match(/h-\[92vh\].*flex-col overflow-hidden/g)).toHaveLength(2);
    expect(page.match(/overflow-y-scroll overscroll-contain/g)).toHaveLength(2);
    expect(page.match(/\[scrollbar-gutter:stable\]/g)).toHaveLength(2);
    expect(page.match(/\[&::-webkit-scrollbar-thumb\]:bg-slate-400/g)).toHaveLength(2);
    expect(matrix).toContain("Buscar módulo ou relatório");
    expect(matrix).toContain("Relatórios BI");
    expect(matrix).toContain("BI de Glosas");
    expect(actions).toContain("Gerenciar usuários");
  });

  it("não concede acesso global a gestores nem falha aberto sem vínculo", () => {
    const context = read("client/src/contexts/EstabelecimentoContext.tsx");
    const router = read("server/routers.ts");
    const trpc = read("server/_core/trpc.ts");
    expect(context).not.toContain('user?.role === "admin" || isGestor');
    expect(router).toContain("estabelecimentosGerenciaveis: protectedProcedure.query");
    expect(router).toContain("return db.getEstabelecimentosGerenciaveis(ctx.user.id)");
    expect(trpc).toContain("Sem acesso ao estabelecimento informado");
  });

  it("persiste grupo personalizado e audita alterações", () => {
    const router = read("server/routers.ts");
    const db = read("server/db.ts");
    expect(router).toContain("Grupo personalizado inválido para este estabelecimento");
    expect(router).toContain("Grupo personalizado inválido, inativo ou indisponível para um dos estabelecimentos");
    expect(router).toContain('tipoAcao: anterior ? "alterar_permissao" : "criar_permissao"');
    expect(router).toContain('tipoAcao: "remover_permissao"');
    expect(db).toContain("grupoId: data.grupoId");
    expect(db).toContain("getModulePermissionsForGroup(grupoServico)");
    expect(db).toContain('eq(gruposServico.ativo, "sim")');
    expect(db).toContain("isNull(gruposServico.estabelecimentoId)");
    expect(db).toContain("eq(gruposServico.estabelecimentoId, data.estabelecimentoId)");
    expect(db).toContain("Grupo personalizado inexistente, inativo ou indisponível para este estabelecimento");
  });
});
