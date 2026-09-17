import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "client/src/components/bi/LancamentosManuaisDialog.tsx"),
  "utf8",
);

describe("layout do cadastro manual de faturado e recebido", () => {
  it("usa quase toda a largura disponível em telas médias e grandes", () => {
    expect(source).toContain("w-[calc(100vw-1rem)]");
    expect(source).toContain("sm:max-w-[calc(100vw-2rem)]");
    expect(source).toContain("xl:max-w-[1500px]");
  });

  it("mantém formulário e histórico proporcionais", () => {
    expect(source).toContain("lg:grid-cols-[minmax(380px,440px)_minmax(0,1fr)]");
    expect(source).toContain("min-h-0 flex-1 overflow-auto");
  });

  it("mantém o cabeçalho da tabela visível durante a rolagem", () => {
    expect(source).toContain('TableHeader className="sticky top-0');
  });

  it("empilha os campos financeiros quando não houver largura suficiente", () => {
    expect(source).toContain("grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3");
  });
});
