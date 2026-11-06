export type FabricaBuscaTicket = Readonly<{
  generation: number;
  hospitalId: number;
  numeroConta: string;
}>;

/** Somente estado volátil: não grava paciente, conta ou payload no navegador. */
export class FabricaBuscaBancoState {
  private generation = 0;
  private active: FabricaBuscaTicket | null = null;

  begin(hospitalId: number, numeroConta: string): FabricaBuscaTicket {
    const account = numeroConta.trim();
    if (!Number.isSafeInteger(hospitalId) || hospitalId <= 0 || !account) {
      throw new Error("Hospital e número da conta são obrigatórios para a busca.");
    }
    const ticket = Object.freeze({ generation: ++this.generation, hospitalId, numeroConta: account });
    this.active = ticket;
    return ticket;
  }

  invalidate(): void {
    ++this.generation;
    this.active = null;
  }

  isCurrent(ticket: FabricaBuscaTicket): boolean {
    return this.active === ticket && this.generation === ticket.generation;
  }

  consume(ticket: FabricaBuscaTicket): boolean {
    if (!this.isCurrent(ticket)) return false;
    this.active = null;
    return true;
  }
}
