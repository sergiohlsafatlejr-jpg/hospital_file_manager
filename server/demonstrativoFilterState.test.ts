import { describe, expect, it } from "vitest";
import {
  resolveCompetenciaDisponivel,
  resolveFiltroOpcionalDisponivel,
} from "../client/src/lib/demonstrativoFilterState";

describe("filtros do demonstrativo", () => {
  const competenciasVivacom = [{ value: "5-2026" }];

  it("troca uma competência global incompatível pela competência disponível do VIVACOM", () => {
    expect(resolveCompetenciaDisponivel("8-2026", true, competenciasVivacom)).toBe("5-2026");
  });

  it("preserva a competência atual quando ela continua válida", () => {
    expect(resolveCompetenciaDisponivel("5-2026", true, competenciasVivacom)).toBe("5-2026");
  });

  it("inicializa com a competência mais recente retornada pelo convênio", () => {
    expect(resolveCompetenciaDisponivel("", false, competenciasVivacom)).toBe("5-2026");
  });

  it("preserva a escolha explícita de todos os períodos", () => {
    expect(resolveCompetenciaDisponivel("all", true, competenciasVivacom)).toBe("all");
  });

  it("remove uma data de pagamento que não pertence ao novo convênio", () => {
    expect(
      resolveFiltroOpcionalDisponivel("2026-08-30", [{ value: "2026-07-15" }]),
    ).toBe("all");
  });
});
