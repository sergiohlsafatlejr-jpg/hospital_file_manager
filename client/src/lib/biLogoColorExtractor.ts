import type { BiClientConfig } from "@shared/biPersonalizadoConfig";

export type EstiloLayoutLogoBi = "executivo_escuro" | "executivo_claro";

export interface PaletaExtraidaLogo {
  /** Cor dominante da marca encontrada na logo (formato #rrggbb) */
  corPrimaria: string;
  /** Segunda cor de destaque encontrada na logo ou harmonia complementar gerada (#rrggbb) */
  corSecundaria: string;
  /** Lista de até 6 cores distintas detectadas na logo para seleção com 1 clique */
  coresDetectadas: string[];
  /** Indica se a cor secundária veio diretamente de outro tom da logo ou foi harmonizada */
  secundariaVindaDaLogo: boolean;
}

interface Rgb {
  r: number;
  g: number;
  b: number;
}

interface Hsl {
  h: number; // 0..360
  s: number; // 0..1
  l: number; // 0..1
}

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

export function rgbParaHex(r: number, g: number, b: number): string {
  const h = (v: number) => clampByte(v).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

export function hexParaRgb(hex: string): Rgb | null {
  const clean = hex.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(clean)) {
    return {
      r: parseInt(clean[0] + clean[0], 16),
      g: parseInt(clean[1] + clean[1], 16),
      b: parseInt(clean[2] + clean[2], 16),
    };
  }
  if (/^[0-9a-fA-F]{6}$/.test(clean)) {
    return {
      r: parseInt(clean.slice(0, 2), 16),
      g: parseInt(clean.slice(2, 4), 16),
      b: parseInt(clean.slice(4, 6), 16),
    };
  }
  return null;
}

export function rgbParaHsl(r: number, g: number, b: number): Hsl {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn:
        h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
        break;
      case gn:
        h = ((bn - rn) / d + 2) * 60;
        break;
      default:
        h = ((rn - gn) / d + 4) * 60;
        break;
    }
  }
  return { h, s, l };
}

export function hslParaHex(h: number, s: number, l: number): string {
  const hn = (((h % 360) + 360) % 360) / 360;
  const sn = Math.max(0, Math.min(1, s));
  const ln = Math.max(0, Math.min(1, l));

  if (sn === 0) {
    const v = clampByte(ln * 255);
    return rgbParaHex(v, v, v);
  }

  const hue2rgb = (p: number, q: number, t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };

  const q = ln < 0.5 ? ln * (1 + sn) : ln + sn - ln * sn;
  const p = 2 * ln - q;
  return rgbParaHex(
    hue2rgb(p, q, hn + 1 / 3) * 255,
    hue2rgb(p, q, hn) * 255,
    hue2rgb(p, q, hn - 1 / 3) * 255,
  );
}

function distanciaRgb(a: Rgb, b: Rgb): number {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function diferencaMatizGraus(h1: number, h2: number): number {
  const diff = Math.abs(h1 - h2) % 360;
  return diff > 180 ? 360 - diff : diff;
}

/**
 * Detecta eventual cor sólida de fundo retangular da imagem (muito comum em logos JPG/PNG com fundo branco ou preto).
 */
function detectarCorFundoBorda(
  data: ArrayLike<number>,
  width: number,
  height: number,
): Rgb | null {
  if (width < 4 || height < 4) return null;
  const amostras: Rgb[] = [];

  const coletarPixel = (x: number, y: number) => {
    const idx = (y * width + x) * 4;
    const a = data[idx + 3] ?? 255;
    if (a < 210) return;
    amostras.push({ r: data[idx], g: data[idx + 1], b: data[idx + 2] });
  };

  const passoX = Math.max(1, Math.floor(width / 16));
  const passoY = Math.max(1, Math.floor(height / 16));
  for (let x = 0; x < width; x += passoX) {
    coletarPixel(x, 0);
    coletarPixel(x, height - 1);
  }
  for (let y = 0; y < height; y += passoY) {
    coletarPixel(0, y);
    coletarPixel(width - 1, y);
  }

  // Precisa que a maioria da borda seja opaca para caracterizar fundo retangular
  const totalPontosBorda = Math.ceil(width / passoX) * 2 + Math.ceil(height / passoY) * 2;
  if (amostras.length < totalPontosBorda * 0.55) return null;

  const ancora = amostras[0];
  const similares = amostras.filter((c) => distanciaRgb(c, ancora) <= 24);
  if (similares.length < amostras.length * 0.65) return null;

  const media = similares.reduce(
    (acc, c) => ({ r: acc.r + c.r, g: acc.g + c.g, b: acc.b + c.b }),
    { r: 0, g: 0, b: 0 },
  );
  const bg = {
    r: media.r / similares.length,
    g: media.g / similares.length,
    b: media.b / similares.length,
  };

  const hsl = rgbParaHsl(bg.r, bg.g, bg.b);
  // Só descarta automaticamente fundos neutros muito claros (branco/gelo) ou pretos puros
  if (hsl.l >= 0.88 || hsl.l <= 0.05 || (hsl.s <= 0.08 && hsl.l >= 0.8)) {
    return bg;
  }
  return null;
}

interface ClusterCor {
  somaR: number;
  somaG: number;
  somaB: number;
  contagem: number;
  pesoMarca: number;
}

/**
 * Analisa os pixels RGBA de uma logo e extrai as cores institucionais dominantes do cliente.
 * Função pura (testável em Node/Vitest sem DOM).
 */
export function extrairPaletaDePixelsRgba(
  data: ArrayLike<number>,
  width: number,
  height: number,
): PaletaExtraidaLogo {
  const corFundoBorda = detectarCorFundoBorda(data, width, height);
  const bucketsCromaticos = new Map<string, ClusterCor>();
  const bucketsNeutrosEscuros = new Map<string, ClusterCor>();

  const totalPixels = width * height;
  const passo = totalPixels > 16_000 ? 2 : 1;

  for (let i = 0; i < totalPixels; i += passo) {
    const idx = i * 4;
    const a = data[idx + 3] ?? 255;
    if (a < 105) continue; // Ignora transparência

    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];

    if (corFundoBorda && distanciaRgb({ r, g, b }, corFundoBorda) <= 28) {
      continue;
    }

    const hsl = rgbParaHsl(r, g, b);
    // Descarta branco/quase-branco residual de anti-aliasing
    if (hsl.l > 0.93) continue;
    // Descarta preto absoluto residual muito pequeno se houver outras cores
    if (hsl.l < 0.05) continue;

    if (hsl.s >= 0.13 && hsl.l >= 0.08 && hsl.l <= 0.88) {
      // Agrupa por faixa de matiz de 15 graus + 3 faixas de luminosidade
      const hueBin = Math.floor(hsl.h / 15);
      const lightBin = hsl.l < 0.32 ? 0 : hsl.l < 0.64 ? 1 : 2;
      const key = `${hueBin}:${lightBin}`;
      const peso = (a / 255) * (0.55 + hsl.s * 0.95);
      const atual = bucketsCromaticos.get(key);
      if (atual) {
        atual.somaR += r;
        atual.somaG += g;
        atual.somaB += b;
        atual.contagem += 1;
        atual.pesoMarca += peso;
      } else {
        bucketsCromaticos.set(key, {
          somaR: r,
          somaG: g,
          somaB: b,
          contagem: 1,
          pesoMarca: peso,
        });
      }
    } else if (hsl.l <= 0.45) {
      // Tipografia/ícone neutro escuro (grafite, chumbo, marinho quase neutro)
      const lightBin = Math.floor(hsl.l * 6);
      const key = `n:${lightBin}`;
      const atual = bucketsNeutrosEscuros.get(key);
      if (atual) {
        atual.somaR += r;
        atual.somaG += g;
        atual.somaB += b;
        atual.contagem += 1;
        atual.pesoMarca += 0.45;
      } else {
        bucketsNeutrosEscuros.set(key, {
          somaR: r,
          somaG: g,
          somaB: b,
          contagem: 1,
          pesoMarca: 0.45,
        });
      }
    }
  }

  const converterEMesclar = (mapa: Map<string, ClusterCor>) => {
    const brutos = Array.from(mapa.values())
      .map((c) => ({
        r: c.somaR / c.contagem,
        g: c.somaG / c.contagem,
        b: c.somaB / c.contagem,
        contagem: c.contagem,
        peso: c.pesoMarca,
      }))
      .sort((a, b) => b.peso - a.peso);

    const mesclados: typeof brutos = [];
    for (const item of brutos) {
      const proximo = mesclados.find((m) => distanciaRgb(m, item) < 38);
      if (proximo) {
        const somaCont = proximo.contagem + item.contagem;
        proximo.r = (proximo.r * proximo.contagem + item.r * item.contagem) / somaCont;
        proximo.g = (proximo.g * proximo.contagem + item.g * item.contagem) / somaCont;
        proximo.b = (proximo.b * proximo.contagem + item.b * item.contagem) / somaCont;
        proximo.contagem = somaCont;
        proximo.peso += item.peso;
      } else {
        mesclados.push({ ...item });
      }
    }
    return mesclados.sort((a, b) => b.peso - a.peso);
  };

  const cromaticos = converterEMesclar(bucketsCromaticos);
  const neutros = converterEMesclar(bucketsNeutrosEscuros);

  const candidatos = [...cromaticos, ...neutros];
  if (candidatos.length === 0) {
    return {
      corPrimaria: "#083d4f",
      corSecundaria: "#e87a1e",
      coresDetectadas: ["#083d4f", "#e87a1e"],
      secundariaVindaDaLogo: false,
    };
  }

  const totalPesoCromatico = cromaticos.reduce((acc, c) => acc + c.contagem, 0);
  const primariaObj = cromaticos.length > 0 ? cromaticos[0] : candidatos[0];
  const corPrimaria = rgbParaHex(primariaObj.r, primariaObj.g, primariaObj.b);
  const hslPrimaria = rgbParaHsl(primariaObj.r, primariaObj.g, primariaObj.b);

  // Busca segunda cor da logo com matiz ou contraste visual distinto (mínimo 2.5% dos pixels cromáticos)
  let secundariaObj = cromaticos.slice(1).find((c) => {
    if (totalPesoCromatico > 0 && c.contagem < totalPesoCromatico * 0.025) return false;
    const hslCand = rgbParaHsl(c.r, c.g, c.b);
    return (
      diferencaMatizGraus(hslPrimaria.h, hslCand.h) >= 24 ||
      distanciaRgb(primariaObj, c) >= 62
    );
  });

  if (!secundariaObj && neutros.length > 0 && cromaticos.length > 0) {
    const neutroForte = neutros[0];
    if (distanciaRgb(primariaObj, neutroForte) >= 65) {
      secundariaObj = neutroForte;
    }
  }

  let corSecundaria: string;
  let secundariaVindaDaLogo = false;

  if (secundariaObj) {
    corSecundaria = rgbParaHex(secundariaObj.r, secundariaObj.g, secundariaObj.b);
    secundariaVindaDaLogo = true;
  } else {
    // Sintetiza um acento executivo harmônico quando a logo possui apenas 1 cor
    const matizComplementarSuave =
      hslPrimaria.h >= 150 && hslPrimaria.h <= 255
        ? 32 // Azuis/verdes ganham destaque âmbar/dourado executivo (estilo Power BI)
        : (hslPrimaria.h + 155) % 360;
    corSecundaria = hslParaHex(
      matizComplementarSuave,
      Math.max(0.68, Math.min(0.86, hslPrimaria.s + 0.15)),
      0.56,
    );
  }

  const coresDetectadas: string[] = [];
  for (const c of candidatos) {
    const hex = rgbParaHex(c.r, c.g, c.b);
    if (!coresDetectadas.includes(hex)) {
      coresDetectadas.push(hex);
    }
    if (coresDetectadas.length >= 6) break;
  }
  if (!coresDetectadas.includes(corSecundaria) && coresDetectadas.length < 6) {
    coresDetectadas.push(corSecundaria);
  }

  return {
    corPrimaria,
    corSecundaria,
    coresDetectadas,
    secundariaVindaDaLogo,
  };
}

/**
 * Converte as cores extraídas da logo em um conjunto completo e calibrado de campos
 * de tema do Painel BI Executivo (garantindo contraste WCAG tanto no modo escuro quanto no claro).
 */
export function gerarCamposTemaPorCoresDaLogo(
  corPrimariaHex: string,
  corSecundariaHex: string,
  estilo: EstiloLayoutLogoBi = "executivo_escuro",
): Pick<
  BiClientConfig,
  | "temaPreset"
  | "corFundoCustom"
  | "corPainelCustom"
  | "corDestaqueCustom"
  | "corCardKpiCustom"
  | "corBarraGraficoCustom"
> {
  const rgbPrim = hexParaRgb(corPrimariaHex) || { r: 8, g: 61, b: 79 };
  const rgbSec = hexParaRgb(corSecundariaHex) || { r: 232, g: 122, b: 30 };

  const hslPrim = rgbParaHsl(rgbPrim.r, rgbPrim.g, rgbPrim.b);
  const hslSec = rgbParaHsl(rgbSec.r, rgbSec.g, rgbSec.b);

  if (estilo === "executivo_claro") {
    // Fundo claro institucional levemente tonalizado com a cor da marca
    const corFundoClaro = hslParaHex(
      hslPrim.h,
      Math.min(0.32, Math.max(0.12, hslPrim.s * 0.45)),
      0.94,
    );
    const corDestaqueClaro = hslParaHex(
      hslSec.s < 0.12 ? hslPrim.h : hslSec.h,
      Math.max(0.55, Math.min(0.88, hslSec.s < 0.12 ? hslPrim.s : hslSec.s)),
      Math.min(0.42, Math.max(0.28, hslSec.l)),
    );
    const corBarraClara = hslParaHex(
      hslPrim.h,
      Math.max(0.48, Math.min(0.85, hslPrim.s)),
      Math.min(0.46, Math.max(0.3, hslPrim.l)),
    );

    return {
      temaPreset: "custom",
      corFundoCustom: corFundoClaro,
      corPainelCustom: "#ffffff",
      corDestaqueCustom: corDestaqueClaro,
      corCardKpiCustom: "#ffffff",
      corBarraGraficoCustom: corBarraClara,
    };
  }

  // Modo Executivo Escuro (Power BI Dark Canvas):
  // Ancora a cor primária da marca em tom profundo executivo (L entre 15% e 21%) para leitura impecável
  const satFundo = hslPrim.s < 0.08 ? 0.18 : Math.max(0.36, Math.min(0.76, hslPrim.s * 1.05));
  const lumFundo = Math.max(0.15, Math.min(0.21, hslPrim.l * 0.55));
  const corFundoEscuro = hslParaHex(hslPrim.h, satFundo, lumFundo);
  const corPainelEscuro = hslParaHex(hslPrim.h, satFundo * 0.95, Math.min(0.25, lumFundo + 0.035));

  // Calibra a cor de destaque (títulos dos painéis e selo 01) para brilhar sobre fundo escuro
  const usarMatizSec = hslSec.s >= 0.14;
  const matizDestaque = usarMatizSec ? hslSec.h : (hslPrim.h + 38) % 360;
  const satDestaque = usarMatizSec
    ? Math.max(0.62, Math.min(0.92, hslSec.s * 1.08))
    : 0.78;
  const lumDestaque = Math.max(0.54, Math.min(0.66, hslSec.l < 0.45 ? 0.58 : hslSec.l));
  const corDestaqueEscuro = hslParaHex(matizDestaque, satDestaque, lumDestaque);

  // Cartão KPI claro com levíssimo toque da matiz do hospital
  const corCardKpi = hslParaHex(hslPrim.h, Math.min(0.22, satFundo * 0.3), 0.955);

  // Barra do gráfico mensal equilibrada
  const corBarraEscuro = hslParaHex(
    matizDestaque,
    Math.max(0.52, satDestaque * 0.88),
    0.5,
  );

  return {
    temaPreset: "custom",
    corFundoCustom: corFundoEscuro,
    corPainelCustom: corPainelEscuro,
    corDestaqueCustom: corDestaqueEscuro,
    corCardKpiCustom: corCardKpi,
    corBarraGraficoCustom: corBarraEscuro,
  };
}

/**
 * Carrega um DataURL de logo no navegador e extrai automaticamente sua paleta institucional.
 */
export async function extrairCoresDeLogoDataUrl(dataUrl: string): Promise<PaletaExtraidaLogo> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const maxSample = 120;
        const w0 = img.naturalWidth || img.width || 120;
        const h0 = img.naturalHeight || img.height || 60;
        const scale = Math.min(maxSample / w0, maxSample / h0, 1);
        const w = Math.max(1, Math.round(w0 * scale));
        const h = Math.max(1, Math.round(h0 * scale));

        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas 2D indisponível para leitura das cores da logo."));
          return;
        }
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        const imageData = ctx.getImageData(0, 0, w, h);
        resolve(extrairPaletaDePixelsRgba(imageData.data, w, h));
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => reject(new Error("Não foi possível analisar as cores da imagem."));
    img.src = dataUrl;
  });
}
