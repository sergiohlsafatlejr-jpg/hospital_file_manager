import { describe, expect, it } from "vitest";
import {
  biClientConfigSchema,
  resolveBiThemePalette,
} from "../../../shared/biPersonalizadoConfig";
import {
  extrairPaletaDePixelsRgba,
  gerarCamposTemaPorCoresDaLogo,
  hexParaRgb,
} from "./biLogoColorExtractor";

function criarImagemSinteticaRgba(
  width: number,
  height: number,
  pintor: (x: number, y: number) => [number, number, number, number],
): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = pintor(x, y);
      const idx = (y * width + x) * 4;
      buf[idx] = r;
      buf[idx + 1] = g;
      buf[idx + 2] = b;
      buf[idx + 3] = a;
    }
  }
  return buf;
}

describe("Extração inteligente de cores da logo para Layout BI do Cliente", () => {
  it("ignora fundo branco de JPG e extrai a cor primária e secundária reais da marca", () => {
    // Simula logo 60x60 com fundo branco (#ffffff), bloco petróleo (#0c4759) e ícone laranja (#e87a1e)
    const img = criarImagemSinteticaRgba(60, 60, (x, y) => {
      if (x >= 10 && x < 42 && y >= 15 && y < 45) {
        return [12, 71, 89, 255]; // #0c4759 (petróleo)
      }
      if (x >= 43 && x < 53 && y >= 20 && y < 38) {
        return [232, 122, 30, 255]; // #e87a1e (laranja destaque)
      }
      return [255, 255, 255, 255]; // Fundo branco nas bordas
    });

    const paleta = extrairPaletaDePixelsRgba(img, 60, 60);
    expect(paleta.corPrimaria).toBe("#0c4759");
    expect(paleta.corSecundaria).toBe("#e87a1e");
    expect(paleta.secundariaVindaDaLogo).toBe(true);
    expect(paleta.coresDetectadas).toContain("#0c4759");
    expect(paleta.coresDetectadas).toContain("#e87a1e");
    expect(paleta.coresDetectadas).not.toContain("#ffffff");
  });

  it("gera harmonia complementar executiva quando a logo em PNG transparente possui apenas 1 cor", () => {
    // Logo verde-hospitalar única (#008f5a) em fundo transparente
    const img = criarImagemSinteticaRgba(40, 40, (x, y) => {
      if (x >= 8 && x <= 32 && y >= 10 && y <= 30) {
        return [0, 143, 90, 255];
      }
      return [0, 0, 0, 0];
    });

    const paleta = extrairPaletaDePixelsRgba(img, 40, 40);
    expect(paleta.corPrimaria).toBe("#008f5a");
    expect(paleta.secundariaVindaDaLogo).toBe(false);
    expect(hexParaRgb(paleta.corSecundaria)).not.toBeNull();

    // Verifica geração do layout Power BI escuro e claro
    const temaEscuro = gerarCamposTemaPorCoresDaLogo(
      paleta.corPrimaria,
      paleta.corSecundaria,
      "executivo_escuro",
    );
    const paletteEscura = resolveBiThemePalette(biClientConfigSchema.parse(temaEscuro));
    expect(paletteEscura.isLightCanvas).toBe(false);
    expect(paletteEscura.headerBg).toContain(temaEscuro.corFundoCustom!);

    const temaClaro = gerarCamposTemaPorCoresDaLogo(
      paleta.corPrimaria,
      paleta.corSecundaria,
      "executivo_claro",
    );
    const paletteClara = resolveBiThemePalette(biClientConfigSchema.parse(temaClaro));
    expect(paletteClara.isLightCanvas).toBe(true);
    expect(paletteClara.panelBg).toBe("#ffffff");
  });
});
