/**
 * VendaJá Angola — Utilitários Oficiais de Formatação e Parsing Monetário (Kwanza - AOA)
 *
 * Regras Estritas:
 * 1. Conversão estritamente determinística para cêntimos inteiros sem uso de parseFloat ou
 *    aritmética de ponto flutuante como fonte final de cálculo.
 * 2. Suporte aos formatos oficiais angolanos (vírgula decimal, pontos nos milhares, sufixos Kz/AOA).
 * 3. Rejeição explícita de valores negativos, texto arbitrário, NaN, Infinity, overflow e
 *    mais de 2 casas decimais (1 Kz = 100 cêntimos).
 * 4. Regra "Vazio Não É Zero": campo vazio ou higienizado para vazio é estado transitório e
 *    não produz automaticamente zero confirmado (isEmpty: true, isExplicitZero: false).
 *    Zero monetário apenas resulta de digitação explícita (ex: "0", "0,00", "0.00").
 *
 * Declaração Regulatória:
 * “Preparado tecnicamente para processo de homologação; não homologado até aprovação formal da AGT.”
 */

export interface MoneyParseResult {
  valid: boolean;
  cents: number;
  isEmpty: boolean;
  isExplicitZero: boolean;
  error?: string;
}

/**
 * Valida e converte uma entrada monetária para cêntimos inteiros de forma determinística
 * utilizando aritmética inteira / BigInt, sem imprecisões de ponto flutuante.
 */
export function parseMoneyDetails(raw: string | number | null | undefined): MoneyParseResult {
  if (raw === null || raw === undefined) {
    return { valid: true, cents: 0, isEmpty: true, isExplicitZero: false };
  }

  // Tratamento de entrada numérica direta
  if (typeof raw === "number") {
    if (!Number.isFinite(raw) || Number.isNaN(raw)) {
      return {
        valid: false,
        cents: 0,
        isEmpty: false,
        isExplicitZero: false,
        error: "Valor numérico inválido (NaN ou Infinito).",
      };
    }
    if (raw < 0) {
      return {
        valid: false,
        cents: 0,
        isEmpty: false,
        isExplicitZero: false,
        error: "Valores monetários negativos não são permitidos.",
      };
    }
    if (raw > Number.MAX_SAFE_INTEGER) {
      return {
        valid: false,
        cents: 0,
        isEmpty: false,
        isExplicitZero: false,
        error: "Valor excede o limite máximo permitido.",
      };
    }
    const cents = Math.round(raw);
    return { valid: true, cents, isEmpty: false, isExplicitZero: cents === 0 };
  }

  const str = String(raw).trim();
  if (str === "") {
    return { valid: true, cents: 0, isEmpty: true, isExplicitZero: false };
  }

  // Rejeição estrita de negativos
  if (str.includes("-")) {
    return {
      valid: false,
      cents: 0,
      isEmpty: false,
      isExplicitZero: false,
      error: "Valores monetários negativos não são permitidos.",
    };
  }

  // Rejeição de palavras-chave perigosas
  if (/\b(?:NaN|Infinity)\b/i.test(str)) {
    return {
      valid: false,
      cents: 0,
      isEmpty: false,
      isExplicitZero: false,
      error: "Entrada contém valores não numéricos inválidos.",
    };
  }

  // Higienização de sufixos de moeda (Kz, AOA) e espaços
  const clean = str
    .replace(/\b(?:Kz|AOA)\b/gi, "")
    .replace(/[\s\u00a0]/g, "");

  if (clean === "") {
    return { valid: true, cents: 0, isEmpty: true, isExplicitZero: false };
  }

  // Rejeitar se contiver quaisquer caracteres que não sejam dígitos, ponto ou vírgula
  if (/[^\d.,]/.test(clean)) {
    return {
      valid: false,
      cents: 0,
      isEmpty: false,
      isExplicitZero: false,
      error: "Entrada contém caracteres inválidos.",
    };
  }

  const hasComma = clean.includes(",");
  const hasDot = clean.includes(".");

  let integerStr = "";
  let decimalStr = "";

  if (hasComma && hasDot) {
    const lastComma = clean.lastIndexOf(",");
    const lastDot = clean.lastIndexOf(".");

    if (lastComma > lastDot) {
      // Padrão Angolano/Europeu: 1.250,50
      const intSection = clean.slice(0, lastComma);
      decimalStr = clean.slice(lastComma + 1);

      // Validar separadores de milhar (pontos)
      const parts = intSection.split(".");
      if (parts.length > 1) {
        if (parts[0]!.length === 0 || parts[0]!.length > 3) {
          return {
            valid: false,
            cents: 0,
            isEmpty: false,
            isExplicitZero: false,
            error: "Separador de milhares inválido.",
          };
        }
        for (let i = 1; i < parts.length; i++) {
          if (parts[i]!.length !== 3) {
            return {
              valid: false,
              cents: 0,
              isEmpty: false,
              isExplicitZero: false,
              error: "Separador de milhares inválido.",
            };
          }
        }
      }
      integerStr = parts.join("");
    } else {
      // Padrão Anglo-saxónico: 1,250.50
      const intSection = clean.slice(0, lastDot);
      decimalStr = clean.slice(lastDot + 1);

      // Validar separadores de milhar (vírgulas)
      const parts = intSection.split(",");
      if (parts.length > 1) {
        if (parts[0]!.length === 0 || parts[0]!.length > 3) {
          return {
            valid: false,
            cents: 0,
            isEmpty: false,
            isExplicitZero: false,
            error: "Separador de milhares inválido.",
          };
        }
        for (let i = 1; i < parts.length; i++) {
          if (parts[i]!.length !== 3) {
            return {
              valid: false,
              cents: 0,
              isEmpty: false,
              isExplicitZero: false,
              error: "Separador de milhares inválido.",
            };
          }
        }
      }
      integerStr = parts.join("");
    }
  } else if (hasComma) {
    // Apenas vírgula: pode ter apenas uma como separador decimal
    const parts = clean.split(",");
    if (parts.length > 2) {
      return {
        valid: false,
        cents: 0,
        isEmpty: false,
        isExplicitZero: false,
        error: "Múltiplos separadores decimais detectados.",
      };
    }
    integerStr = parts[0] ?? "";
    decimalStr = parts[1] ?? "";
  } else if (hasDot) {
    const parts = clean.split(".");
    if (parts.length === 2) {
      if (parts[1]!.length === 3 && parts[0]!.length >= 1 && parts[0]!.length <= 3) {
        // Interpretado como milhares inteiros: 1.500 -> 1500 Kz
        integerStr = parts.join("");
        decimalStr = "";
      } else {
        // Interpretado como separador decimal
        integerStr = parts[0] ?? "";
        decimalStr = parts[1] ?? "";
      }
    } else {
      // Múltiplos pontos: validar como milhares (ex: 1.000.000)
      if (parts[0]!.length === 0 || parts[0]!.length > 3) {
        return {
          valid: false,
          cents: 0,
          isEmpty: false,
          isExplicitZero: false,
          error: "Separador de milhares com formato inválido.",
        };
      }
      for (let i = 1; i < parts.length; i++) {
        if (parts[i]!.length !== 3) {
          return {
            valid: false,
            cents: 0,
            isEmpty: false,
            isExplicitZero: false,
            error: "Separador de milhares com formato inválido.",
          };
        }
      }
      integerStr = parts.join("");
      decimalStr = "";
    }
  } else {
    // Apenas dígitos
    integerStr = clean;
    decimalStr = "";
  }

  // Regra Estrita de Casas Decimais:
  // A moeda Kwanza admite no máximo 2 casas decimais (cêntimos: 0 a 99).
  // Mais de duas casas decimais é explicitamente rejeitado.
  if (decimalStr.length > 2) {
    return {
      valid: false,
      cents: 0,
      isEmpty: false,
      isExplicitZero: false,
      error: "O valor não pode ter mais de 2 casas decimais (máximo 2 casas para cêntimos de Kwanza).",
    };
  }

  // Eliminar zeros à esquerda na parte inteira mas preservar zero unitário
  integerStr = integerStr.replace(/^0+(?=\d)/, "");
  if (integerStr === "") {
    integerStr = "0";
  }

  // Conversão segura via BigInt
  try {
    const intBig = BigInt(integerStr);
    let fractionBig = 0n;

    if (decimalStr.length === 1) {
      fractionBig = BigInt(decimalStr) * 10n;
    } else if (decimalStr.length === 2) {
      fractionBig = BigInt(decimalStr);
    }

    const totalCentsBig = intBig * 100n + fractionBig;

    if (totalCentsBig > BigInt(Number.MAX_SAFE_INTEGER)) {
      return {
        valid: false,
        cents: 0,
        isEmpty: false,
        isExplicitZero: false,
        error: "Valor monetário ultrapassa o limite seguro de cálculo.",
      };
    }

    const totalCents = Number(totalCentsBig);
    return {
      valid: true,
      cents: totalCents,
      isEmpty: false,
      isExplicitZero: totalCents === 0,
    };
  } catch {
    return {
      valid: false,
      cents: 0,
      isEmpty: false,
      isExplicitZero: false,
      error: "Erro na conversão aritmética do valor monetário.",
    };
  }
}

/**
 * Converte a entrada para cêntimos inteiros. Devolve 0 se for inválida ou vazia.
 */
export function parseMoneyToCents(raw: string | number | null | undefined): number {
  const result = parseMoneyDetails(raw);
  return result.valid ? result.cents : 0;
}

/**
 * Converte a entrada para cêntimos confirmados.
 * Se a entrada for vazia (estado transitório) ou inválida, não produz zero silencioso:
 * devolve o valor de fallback fornecido (ou undefined), garantindo que texto vazio
 * não seja gravado como preço zero na persistência de dados.
 */
export function parseConfirmedMoneyCents(
  raw: string | number | null | undefined,
  fallbackCents?: number
): number | undefined {
  const result = parseMoneyDetails(raw);
  if (!result.valid || result.isEmpty) {
    return fallbackCents;
  }
  return result.cents;
}

/**
 * Verifica se a entrada é um zero explícito ("0", "0,00", "0.00", etc.) e não um vazio transitório.
 */
export function isExplicitZeroMoney(raw: string | number | null | undefined): boolean {
  const result = parseMoneyDetails(raw);
  return result.valid && result.isExplicitZero;
}

/**
 * Formata um valor em cêntimos inteiros para exibição decimal amigável (ex: "1250,00" ou "0,00").
 */
export function formatCentsToDecimal(cents: number | null | undefined): string {
  if (cents === null || cents === undefined || !Number.isFinite(cents) || cents <= 0) {
    return "0,00";
  }
  const big = BigInt(Math.round(cents));
  const intPart = big / 100n;
  const remPart = big % 100n;
  return `${intPart.toString()},${remPart.toString().padStart(2, "0")}`;
}

/**
 * Formata cêntimos com separadores de milhares e decimais em padrão oficial angolano (ex: "1.250,00").
 */
export function formatCentsToDisplay(cents: number | null | undefined): string {
  if (cents === null || cents === undefined || !Number.isFinite(cents) || cents <= 0) {
    return "0,00";
  }
  const big = BigInt(Math.round(cents));
  const intPart = big / 100n;
  const remPart = big % 100n;
  const formattedInt = intPart.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${formattedInt},${remPart.toString().padStart(2, "0")}`;
}
