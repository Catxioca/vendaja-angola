import assert from "node:assert/strict";
import test from "node:test";
import {
  formatCentsToDecimal,
  formatCentsToDisplay,
  isExplicitZeroMoney,
  parseConfirmedMoneyCents,
  parseMoneyDetails,
  parseMoneyToCents,
} from "./money-input.js";

test("parseMoneyToCents: conversão de cada formato suportado", () => {
  assert.equal(parseMoneyToCents(0), 0);
  assert.equal(parseMoneyToCents("0"), 0);
  assert.equal(parseMoneyToCents("0,00"), 0);
  assert.equal(parseMoneyToCents("0.00"), 0);
  assert.equal(parseMoneyToCents("1500"), 150000);
  assert.equal(parseMoneyToCents("1500,5"), 150050);
  assert.equal(parseMoneyToCents("1500,50"), 150050);
  assert.equal(parseMoneyToCents("1.250,50 Kz"), 125050);
  assert.equal(parseMoneyToCents("1.250,50"), 125050);
  assert.equal(parseMoneyToCents("1,250.50"), 125050);
  assert.equal(parseMoneyToCents("  1500 AOA  "), 150000);
  assert.equal(parseMoneyToCents("  Kz 25000  "), 2500000);
  assert.equal(parseMoneyToCents("10.000.000,00 Kz"), 1000000000);
});

test("parseMoneyDetails: rejeição explícita de valores negativos", () => {
  const r1 = parseMoneyDetails("-1500");
  assert.equal(r1.valid, false);
  assert.equal(r1.cents, 0);
  assert.match(r1.error ?? "", /negativo/i);

  const r2 = parseMoneyDetails("-0,50");
  assert.equal(r2.valid, false);

  assert.equal(parseMoneyToCents("-1500"), 0);
});

test("parseMoneyDetails: rejeição de caracteres e texto arbitrário", () => {
  const r1 = parseMoneyDetails("abc");
  assert.equal(r1.valid, false);
  assert.equal(r1.cents, 0);

  const r2 = parseMoneyDetails("1200abc");
  assert.equal(r2.valid, false);

  assert.equal(parseMoneyToCents("invalid"), 0);
});

test("parseMoneyDetails: rejeição de NaN, Infinity e overflow", () => {
  const r1 = parseMoneyDetails(NaN);
  assert.equal(r1.valid, false);

  const r2 = parseMoneyDetails(Infinity);
  assert.equal(r2.valid, false);

  const r3 = parseMoneyDetails("Infinity");
  assert.equal(r3.valid, false);

  const r4 = parseMoneyDetails("9999999999999999999999999999");
  assert.equal(r4.valid, false);
  assert.match(r4.error ?? "", /limite/i);
});

test("parseMoneyDetails: cêntimos com uma e duas casas decimais", () => {
  assert.equal(parseMoneyToCents("125,1"), 12510);
  assert.equal(parseMoneyToCents("125,05"), 12505);
  assert.equal(parseMoneyToCents("0,5"), 50);
  assert.equal(parseMoneyToCents("0,05"), 5);
  assert.equal(parseMoneyToCents("0,01"), 1);
});

test("parseMoneyDetails: regra estrita para mais de duas casas decimais (rejeição de sub-cêntimos)", () => {
  const r1 = parseMoneyDetails("1500,555");
  assert.equal(r1.valid, false);
  assert.equal(r1.cents, 0);
  assert.match(r1.error ?? "", /2 casas decimais/i);

  const r2 = parseMoneyDetails("0,123");
  assert.equal(r2.valid, false);
  assert.equal(r2.cents, 0);

  assert.equal(parseMoneyToCents("1500,555"), 0);
});

test("parseMoneyDetails: rejeição de separadores ambíguos ou mal formatados", () => {
  // Separador de milhar inválido (não tem 3 dígitos)
  const r1 = parseMoneyDetails("1.25,50");
  assert.equal(r1.valid, false);

  // Múltiplos separadores decimais
  const r2 = parseMoneyDetails("1,250,50");
  assert.equal(r2.valid, false);
});

test("parseMoneyDetails: regra Vazio Não É Zero — estado transitório vs zero confirmado", () => {
  // Texto vazio é estado transitório válido, mas NÃO é zero confirmado (isEmpty: true, isExplicitZero: false)
  const r1 = parseMoneyDetails("");
  assert.equal(r1.valid, true);
  assert.equal(r1.cents, 0);
  assert.equal(r1.isEmpty, true);
  assert.equal(r1.isExplicitZero, false);

  const r2 = parseMoneyDetails("    ");
  assert.equal(r2.valid, true);
  assert.equal(r2.cents, 0);
  assert.equal(r2.isEmpty, true);
  assert.equal(r2.isExplicitZero, false);

  const r3 = parseMoneyDetails(null);
  assert.equal(r3.valid, true);
  assert.equal(r3.cents, 0);
  assert.equal(r3.isEmpty, true);
  assert.equal(r3.isExplicitZero, false);

  const r4 = parseMoneyDetails(undefined);
  assert.equal(r4.valid, true);
  assert.equal(r4.cents, 0);
  assert.equal(r4.isEmpty, true);
  assert.equal(r4.isExplicitZero, false);

  const r5 = parseMoneyDetails("  Kz  ");
  assert.equal(r5.valid, true);
  assert.equal(r5.cents, 0);
  assert.equal(r5.isEmpty, true);
  assert.equal(r5.isExplicitZero, false);
});

test("parseMoneyDetails: zero explícito converte para zero confirmado", () => {
  // Zero explicitamente digitado NÃO é vazio (isEmpty: false, isExplicitZero: true)
  const r1 = parseMoneyDetails("0");
  assert.equal(r1.valid, true);
  assert.equal(r1.cents, 0);
  assert.equal(r1.isEmpty, false);
  assert.equal(r1.isExplicitZero, true);

  const r2 = parseMoneyDetails("0,00");
  assert.equal(r2.valid, true);
  assert.equal(r2.cents, 0);
  assert.equal(r2.isEmpty, false);
  assert.equal(r2.isExplicitZero, true);

  const r3 = parseMoneyDetails("0.00");
  assert.equal(r3.valid, true);
  assert.equal(r3.cents, 0);
  assert.equal(r3.isEmpty, false);
  assert.equal(r3.isExplicitZero, true);

  const r4 = parseMoneyDetails("0 Kz");
  assert.equal(r4.valid, true);
  assert.equal(r4.cents, 0);
  assert.equal(r4.isEmpty, false);
  assert.equal(r4.isExplicitZero, true);

  const r5 = parseMoneyDetails(0);
  assert.equal(r5.valid, true);
  assert.equal(r5.cents, 0);
  assert.equal(r5.isEmpty, false);
  assert.equal(r5.isExplicitZero, true);
});

test("parseConfirmedMoneyCents e isExplicitZeroMoney: proteção contra sobrescrita por zero", () => {
  const previousConfirmedPrice = 150000; // 1.500,00 Kz

  // Vazio transitório: preserva fallback, não grava 0 silencioso
  assert.equal(parseConfirmedMoneyCents("", previousConfirmedPrice), 150000);
  assert.equal(parseConfirmedMoneyCents("   ", previousConfirmedPrice), 150000);
  assert.equal(parseConfirmedMoneyCents(null, previousConfirmedPrice), 150000);

  // Zero explícito: grava 0 cêntimos legitimamente
  assert.equal(parseConfirmedMoneyCents("0", previousConfirmedPrice), 0);
  assert.equal(parseConfirmedMoneyCents("0,00", previousConfirmedPrice), 0);

  // Novo valor confirmado: atualiza
  assert.equal(parseConfirmedMoneyCents("2500", previousConfirmedPrice), 250000);

  // isExplicitZeroMoney
  assert.equal(isExplicitZeroMoney("0"), true);
  assert.equal(isExplicitZeroMoney("0,00"), true);
  assert.equal(isExplicitZeroMoney(""), false);
  assert.equal(isExplicitZeroMoney("   "), false);
  assert.equal(isExplicitZeroMoney(null), false);
  assert.equal(isExplicitZeroMoney("1500"), false);
});

test("parseMoneyDetails: estados transitórios durante digitação com foco", () => {
  // Vírgula no final enquanto digita
  const r1 = parseMoneyDetails("1500,");
  assert.equal(r1.valid, true);
  assert.equal(r1.cents, 150000);

  // Primeiro dígito decimal
  const r2 = parseMoneyDetails("1500,5");
  assert.equal(r2.valid, true);
  assert.equal(r2.cents, 150050);

  // Ponto de milhar com vírgula final
  const r3 = parseMoneyDetails("1.250,");
  assert.equal(r3.valid, true);
  assert.equal(r3.cents, 125000);
});

test("formatCentsToDecimal: formatação para edição sem separador de milhares", () => {
  assert.equal(formatCentsToDecimal(0), "0,00");
  assert.equal(formatCentsToDecimal(null), "0,00");
  assert.equal(formatCentsToDecimal(undefined), "0,00");
  assert.equal(formatCentsToDecimal(150000), "1500,00");
  assert.equal(formatCentsToDecimal(150050), "1500,50");
  assert.equal(formatCentsToDecimal(5), "0,05");
  assert.equal(formatCentsToDecimal(50), "0,50");
});

test("formatCentsToDisplay: formatação oficial angolana com pontos e vírgula", () => {
  assert.equal(formatCentsToDisplay(0), "0,00");
  assert.equal(formatCentsToDisplay(150000), "1.500,00");
  assert.equal(formatCentsToDisplay(1250050), "12.500,50");
  assert.equal(formatCentsToDisplay(100000000), "1.000.000,00");
});

test("Integridade aritmética: sem deriva de ponto flutuante (floating point drift)", () => {
  assert.equal(parseMoneyToCents("0,10"), 10);
  assert.equal(parseMoneyToCents("0,20"), 20);
  assert.equal(parseMoneyToCents("0,30"), 30);
  assert.equal(parseMoneyToCents("0,07"), 7);
  assert.equal(parseMoneyToCents("19,99"), 1999);
  assert.equal(parseMoneyToCents("1234567,89"), 123456789);
});
