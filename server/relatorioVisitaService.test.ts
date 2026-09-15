import { describe, expect, it } from "vitest";
import {
  calcularCoberturaProfissionalVisita,
  criarChaveProfissionalVisita,
  formatarCrmVisita,
  lerChaveProfissionalVisita,
  normalizarProfissionalVisita,
} from "../shared/relatorioVisita";

describe("relatório de visitas - médico e CRM", () => {
  it("normaliza os dados do XML sem inventar profissional ausente", () => {
    expect(normalizarProfissionalVisita({ medico: " Dra. Ana ", crm: " 12345-GO " })).toEqual({
      medico: "Dra. Ana",
      crm: "12345-GO",
      informado: true,
    });
    expect(normalizarProfissionalVisita({ medico: "", crm: null })).toEqual({
      medico: null,
      crm: null,
      informado: false,
    });
  });

  it("formata o CRM sem duplicar o prefixo", () => {
    expect(formatarCrmVisita("12345-GO")).toBe("CRM 12345-GO");
    expect(formatarCrmVisita("CRM 12345-GO")).toBe("CRM 12345-GO");
    expect(formatarCrmVisita(null)).toBe("Não informado");
  });

  it("mantém nome e CRM na chave segura do filtro", () => {
    const chave = criarChaveProfissionalVisita("Dr. João", "9999-GO");
    expect(lerChaveProfissionalVisita(chave)).toEqual({ medico: "Dr. João", crm: "9999-GO" });
    expect(lerChaveProfissionalVisita("inválida")).toEqual({ medico: undefined, crm: undefined });
  });

  it("calcula a cobertura de profissionais informados", () => {
    expect(calcularCoberturaProfissionalVisita([
      { medico: "Dra. Ana", crm: "1" },
      { medico: null, crm: null },
      { medico: "Dr. João", crm: null },
    ])).toEqual({ total: 3, comMedico: 2, semMedico: 1, percentual: 66.67 });
  });
});
