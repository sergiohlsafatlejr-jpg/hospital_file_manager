export type XmlImportacaoStatusLocal =
  | "pending"
  | "uploading"
  | "success"
  | "error";

export function estadoRetentativaXml(
  statuses: readonly XmlImportacaoStatusLocal[]
): {
  pendentes: number;
  comErro: number;
  reenviaveis: number;
  rotuloAcao: string;
} {
  const pendentes = statuses.filter(status => status === "pending").length;
  const comErro = statuses.filter(status => status === "error").length;
  const reenviaveis = pendentes + comErro;

  return {
    pendentes,
    comErro,
    reenviaveis,
    rotuloAcao:
      comErro > 0 && pendentes === 0
        ? `Tentar novamente (${comErro} XML${comErro === 1 ? "" : "s"})`
        : `Enviar ${reenviaveis} Arquivo${reenviaveis === 1 ? "" : "s"}`,
  };
}
