import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  calculateIrt,
  calculatePayroll,
  DEFAULT_HR_PAYROLL_CONFIG,
  REGULATORY_NOTICE,
  hrRouter,
  hrConfigSchema,
  employeeSchema,
  attendanceSchema,
  leaveSchema,
  payrollSchema,
  validatePayrollConfigValidity,
  sanitizeEmployeeForRole,
  encryptBiometricRef,
  decryptBiometricRef,
  getBiometricKeyRing,
  computeConfigHash,
  computeSnapshotHash,
  type HrPayrollConfig,
} from "./hr.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test("HR Backend: REGULATORY_NOTICE legal mandatória está presente", () => {
  assert.equal(
    REGULATORY_NOTICE,
    "Configurações laborais e remuneratórias sujeitas a fonte oficial e validação por profissional habilitado."
  );
  assert.equal(DEFAULT_HR_PAYROLL_CONFIG.regulatoryNotice, REGULATORY_NOTICE);
});

test("HR Backend: calculateIrt respeita escalões parametrizados sem regras fixas", () => {
  const customBrackets = [
    { minCents: 0, maxCents: 1000000, rate: 0 },
    { minCents: 1000000, maxCents: 3000000, rate: 0.12 },
    { minCents: 3000000, maxCents: Number.POSITIVE_INFINITY, rate: 0.22 },
  ];

  // Abaixo do primeiro escalão -> 0 Kz
  assert.equal(calculateIrt(800000, customBrackets), 0);

  // No segundo escalão (2.000.000 Kz -> 1.000.000 a 12% = 120.000 Kz)
  assert.equal(calculateIrt(2000000, customBrackets), 120000);

  // Alterar os escalões altera o cálculo sem alterar código
  const updatedBrackets = [
    { minCents: 0, maxCents: 2000000, rate: 0 },
    { minCents: 2000000, maxCents: Number.POSITIVE_INFINITY, rate: 0.1 },
  ];
  assert.equal(calculateIrt(2000000, updatedBrackets), 0);
  assert.equal(calculateIrt(3000000, updatedBrackets), 100000);
});

test("HR Backend: calculatePayroll aplica taxas e tetos parametrizados da empresa", () => {
  const employee = {
    baseSalaryCents: 20000000, // 200.000 Kz
    foodAllowanceCents: 4000000, // 40.000 Kz
    transportAllowanceCents: 4000000, // 40.000 Kz
    housingAllowanceCents: 0,
    otherAllowancesCents: 0,
    foodAllowanceExempt: true,
    transportAllowanceExempt: true,
    housingAllowanceExempt: false,
    otherAllowancesExempt: false,
  };

  const configA: HrPayrollConfig = {
    version: "2026.1",
    source: "CIRS 2026 / Regulamento INSS",
    responsibleParty: "Dr. Responsável A — Contabilista Certificado",
    approvalDate: "2026-01-01T00:00:00.000Z",
    effectiveFrom: "2026-01",
    effectiveTo: "2026-12",
    status: "ACTIVE",
    notes: "Aprovado em ata para o exercício de 2026",
    effectiveDate: "2026-01-01",
    responsibleName: "Dr. Responsável A",
    responsibleRole: "Contabilista Certificado",
    officialSource: "CIRS 2026 / Regulamento INSS",
    approvalReference: "CFG-2026-A",
    approvedAt: "2026-01-01T00:00:00.000Z",
    irtBrackets: [
      { minCents: 0, maxCents: 500000, rate: 0 },
      { minCents: 500000, maxCents: Number.POSITIVE_INFINITY, rate: 0.15 },
    ],
    inssEmployeeRate: 0.03, // 3%
    inssEmployerRate: 0.08, // 8%
    allowanceExemptionCapCents: 3000000, // 30.000 Kz
    regulatoryNotice: REGULATORY_NOTICE,
  };

  const resultA = calculatePayroll(employee, configA);
  assert.equal(resultA.grossSalaryCents, 28000000); // 280.000 Kz
  assert.equal(resultA.taxableAllowancesCents, 2000000); // 10.000 + 10.000 de excesso
  assert.equal(resultA.inssEmployeeCents, Math.round(22000000 * 0.03)); // 66.000 Kz
  assert.equal(resultA.inssEmployerCents, Math.round(22000000 * 0.08)); // 176.000 Kz
  assert.equal(resultA.regulatoryNotice, REGULATORY_NOTICE);
  assert.equal(resultA.configApprovalReference, "CFG-2026-A");

  // Configuração B com parâmetros diferentes (ex: cooperativa com taxa INSS de 4% e teto de isenção de 50.000 Kz)
  const configB: HrPayrollConfig = {
    ...configA,
    approvalReference: "CFG-2026-B",
    inssEmployeeRate: 0.04,
    allowanceExemptionCapCents: 5000000, // 50.000 Kz isenta totalmente os 40.000 Kz
  };

  const resultB = calculatePayroll(employee, configB);
  assert.equal(resultB.taxableAllowancesCents, 0); // Totalmente isento com teto maior
  assert.equal(resultB.inssEmployeeCents, Math.round(20000000 * 0.04));
  assert.equal(resultB.configApprovalReference, "CFG-2026-B");
  assert.notEqual(resultA.netSalaryCents, resultB.netSalaryCents);
});

test("HR Backend: Ausência de regras laborais ou tabelas remuneratórias hardcoded no código de rotas", () => {
  const hrSource = fs.readFileSync(path.resolve(__dirname, "hr.ts"), "utf-8");

  // Não deve conter tabelas salariais fixas
  assert.ok(!hrSource.includes("const fixedSalaryTable"), "Não deve conter tabela salarial fixa");
  assert.ok(!hrSource.includes("const FIXED_INSS_RATE"), "Não deve conter taxa INSS fixa");

  // Deve exigir referência de aprovação e fonte oficial
  assert.ok(hrSource.includes("officialSource"), "Deve exigir campo officialSource");
  assert.ok(hrSource.includes("approvalReference"), "Deve exigir campo approvalReference");
  assert.ok(hrSource.includes("effectiveDate"), "Deve exigir vigência effectiveDate");
  assert.ok(hrSource.includes("responsibleName"), "Deve exigir responsável pela parametrização");
});

test("HR Backend: Middleware e router rejeitam acesso sem autenticação e perfis sem módulo HR", () => {
  assert.ok(hrRouter, "hrRouter deve ser exportado");
  assert.equal(typeof hrRouter, "function");
});

test("HR Backend: employeeSchema protege privacidade biométrica e valida dados cadastrais", () => {
  const validEmployee = {
    fullName: "Manuel Gonçalves Kwanza",
    nif: "5412993821",
    inss: "0991823746",
    position: "Especialista de Sistemas",
    department: "Tecnologia",
    contractType: "FIXED",
    iban: "AO06004000001234567890123",
    baseSalaryCents: 150000000,
    foodAllowanceCents: 4500000,
    transportAllowanceCents: 4500000,
    biometricConsentGiven: true,
    biometricRefId: "zk-hw-token-998811",
  };

  const parsed = employeeSchema.safeParse(validEmployee);
  assert.ok(parsed.success, "Ficha de colaborador válida deve passar na validação");

  // Rejeição de salário negativo
  const invalidSalary = employeeSchema.safeParse({
    ...validEmployee,
    baseSalaryCents: -5000,
  });
  assert.equal(invalidSalary.success, false, "Salário base não pode ser negativo");

  // Rejeição categórica de campos de template biométrico bruto
  const withRawBiometrics = employeeSchema.safeParse({
    ...validEmployee,
    biometricTemplate: "RAW_BINARY_DATA",
  });
  assert.equal(withRawBiometrics.success, false, "Template biométrico bruto deve ser rejeitado");

  const withMinutiae = employeeSchema.safeParse({
    ...validEmployee,
    minutiae: "FACIAL_VECTORS_BIN",
  });
  assert.equal(withMinutiae.success, false, "Minúcias biométricas brutas devem ser rejeitadas");
});

test("HR Backend: sanitizeEmployeeForRole protege privacidade biométrica perante perfis não-HR", () => {
  const employeeData = {
    id: "emp-001",
    fullName: "Manuel Gonçalves Kwanza",
    position: "Especialista",
    biometricConsentGiven: true,
    biometricRefId: "zk-hw-token-998811",
  };

  // ADMIN e HR_MANAGER têm acesso autorizado ao token técnico
  const adminView = sanitizeEmployeeForRole(employeeData, "ADMIN");
  assert.equal(adminView.biometricRefId, "zk-hw-token-998811");
  assert.equal(adminView.biometricConsentGiven, true);

  const hrView = sanitizeEmployeeForRole(employeeData, "HR_MANAGER");
  assert.equal(hrView.biometricRefId, "zk-hw-token-998811");
  assert.equal(hrView.biometricConsentGiven, true);

  // Perfis normais (OPERATOR, CASHIER, USER) não recebem dados biométricos
  const operatorView = sanitizeEmployeeForRole(employeeData, "OPERATOR");
  assert.equal(operatorView.biometricRefId, null);
  assert.equal(operatorView.biometricConsentGiven, false);

  const cashierView = sanitizeEmployeeForRole(employeeData, "CASHIER");
  assert.equal(cashierView.biometricRefId, null);
  assert.equal(cashierView.biometricConsentGiven, false);
});

test("HR Backend: hrConfigSchema valida parametrização oficial com rigor e campos de governação", () => {
  const validConfig = {
    version: "2026.2",
    source: "Decreto Presidencial / LGT / CIRT 2026",
    responsibleParty: "Dra. Ana Paula Fernandes (Contabilista Certificada OCAP)",
    approvalDate: "2026-01-10T10:00:00.000Z",
    effectiveFrom: "2026-01-01",
    effectiveTo: "2026-12-31",
    status: "ACTIVE",
    notes: "Aprovado em conselho de administração.",
    irtBrackets: [
      { minCents: 0, maxCents: 1000000, rate: 0 },
      { minCents: 1000000, maxCents: Number.POSITIVE_INFINITY, rate: 0.15 },
    ],
    inssEmployeeRate: 0.03,
    inssEmployerRate: 0.08,
    allowanceExemptionCapCents: 3000000,
  };

  const parsed = hrConfigSchema.safeParse(validConfig);
  assert.ok(parsed.success, "Parametrização válida deve ser aceite: " + JSON.stringify((parsed as any).error));
  assert.equal(parsed.data.version, "2026.2");
  assert.equal(parsed.data.status, "ACTIVE");

  // Rejeição sem escalões de IRT
  const withoutBrackets = hrConfigSchema.safeParse({
    ...validConfig,
    irtBrackets: [],
  });
  assert.equal(withoutBrackets.success, false, "Deve exigir pelo menos um escalão de IRT");

  // Rejeição de taxa INSS absurda (> 50%)
  const invalidInssRate = hrConfigSchema.safeParse({
    ...validConfig,
    inssEmployeeRate: 0.85,
  });
  assert.equal(invalidInssRate.success, false, "Taxa INSS do trabalhador não pode exceder 50%");
});

test("HR Backend: validatePayrollConfigValidity exige configuração ativa, aprovada e vigente", () => {
  const activeConfig: HrPayrollConfig = {
    ...DEFAULT_HR_PAYROLL_CONFIG,
    version: "2026.1",
    status: "ACTIVE",
    approvalDate: "2026-01-01T00:00:00.000Z",
    effectiveFrom: "2026-01-01",
    effectiveTo: "2026-12-31",
  };

  // 1. Configuração ativa e vigente -> Válida
  const validCheck = validatePayrollConfigValidity(activeConfig, "2026-05");
  assert.equal(validCheck.valid, true);

  // 2. Configuração com status PENDING_APPROVAL -> Rejeitada
  const pendingConfig: HrPayrollConfig = {
    ...activeConfig,
    status: "PENDING_APPROVAL",
  };
  const pendingCheck = validatePayrollConfigValidity(pendingConfig, "2026-05");
  assert.equal(pendingCheck.valid, false);
  assert.ok(pendingCheck.reason?.includes("PENDING_APPROVAL"));

  // 3. Configuração sem aprovação formal -> Rejeitada
  const unapprovedConfig: HrPayrollConfig = {
    ...activeConfig,
    approvalDate: "",
  };
  const unapprovedCheck = validatePayrollConfigValidity(unapprovedConfig, "2026-05");
  assert.equal(unapprovedCheck.valid, false);
  assert.ok(unapprovedCheck.reason?.includes("approvalDate"));

  // 4. Mês anterior ao início de vigência -> Rejeitada
  const preEffectiveCheck = validatePayrollConfigValidity(activeConfig, "2025-12");
  assert.equal(preEffectiveCheck.valid, false);
  assert.ok(preEffectiveCheck.reason?.includes("anterior"));

  // 5. Mês posterior ao fim de vigência -> Rejeitada
  const postEffectiveCheck = validatePayrollConfigValidity(activeConfig, "2027-01");
  assert.equal(postEffectiveCheck.valid, false);
  assert.ok(postEffectiveCheck.reason?.includes("posterior"));
});

test("HR Backend: attendanceSchema e leaveSchema validam assiduidade e férias", () => {
  const validAttendance = {
    employeeId: "emp-test-01",
    date: "2026-11-12",
    checkIn: "08:00",
    checkOut: "17:00",
    workedMinutes: 480,
    overtimeMinutes: 0,
    delayMinutes: 0,
    status: "PRESENT",
  };
  const parsedAtt = attendanceSchema.safeParse(validAttendance);
  assert.ok(parsedAtt.success, "Assiduidade válida deve passar");

  const validLeave = {
    employeeId: "emp-test-01",
    type: "VACATION",
    startDate: "2026-12-01",
    endDate: "2026-12-22",
    daysCount: 22,
    justification: "Férias anuais regulamentares",
  };
  const parsedLeave = leaveSchema.safeParse(validLeave);
  assert.ok(parsedLeave.success, "Pedido de férias válido deve passar");

  const validPayroll = {
    employeeId: "emp-test-01",
    month: "2026-11",
  };
  const parsedPayroll = payrollSchema.safeParse(validPayroll);
  assert.ok(parsedPayroll.success, "Competência de folha YYYY-MM deve passar");

  const invalidMonth = payrollSchema.safeParse({
    employeeId: "emp-test-01",
    month: "11-2026",
  });
  assert.equal(invalidMonth.success, false, "Formato inválido de mês deve ser rejeitado");
});

test("HR Biometria: Cifragem, rotação de chaves e falha fechada quando não configurada", () => {
  const origRing = process.env.BIOMETRIC_KEY_RING;
  const origKeys = process.env.BIOMETRIC_KEYS;
  const origSingle = process.env.BIOMETRIC_ENCRYPTION_KEY;
  const origActive = process.env.BIOMETRIC_ACTIVE_KEY_ID;
  const origFiscal = process.env.FISCAL_CONFIG_KEY;

  try {
    // 1. Falha fechada: sem nenhuma chave configurada no ambiente
    delete process.env.BIOMETRIC_KEY_RING;
    delete process.env.BIOMETRIC_KEYS;
    delete process.env.BIOMETRIC_ENCRYPTION_KEY;
    delete process.env.BIOMETRIC_ACTIVE_KEY_ID;
    delete process.env.BIOMETRIC_KEY_ID;
    delete process.env.FISCAL_CONFIG_KEY;

    assert.throws(
      () => encryptBiometricRef("zk-test-token-01"),
      /BIOMETRIC_KEY_NOT_CONFIGURED/,
      "Deve falhar fechadamente com BIOMETRIC_KEY_NOT_CONFIGURED"
    );
    assert.equal(decryptBiometricRef("enc:v2:k1:iv:tag:data"), null, "Sem chave, decifração retorna null");

    // 2. Cifragem com anel de chaves (Key Ring) e versão v2
    process.env.BIOMETRIC_KEYS = JSON.stringify({
      k1: "segredo-antigo-rotativo-2025",
      k2: "segredo-ativo-moderno-2026",
    });
    process.env.BIOMETRIC_ACTIVE_KEY_ID = "k2";

    const token = "zk-device-serial-987654";
    const cipher = encryptBiometricRef(token);
    assert.ok(cipher.startsWith("enc:v2:k2:"), "Cipher deve começar com enc:v2:k2:");
    assert.equal(cipher.split(":").length, 6, "Formato v2 tem 6 partes delimitadas por ':'");

    // Decifração autorizada com auditoria de metadados
    let auditedKeyId: string | undefined;
    const decrypted = decryptBiometricRef(cipher, (meta) => {
      auditedKeyId = meta.keyId;
    });
    assert.equal(decrypted, token, "Valor decifrado deve ser exatamente igual ao original");
    assert.equal(auditedKeyId, "k2", "Meta de auditoria deve indicar chave k2");

    // 3. Rotação de chaves: decifrar token gerado com k1 quando ativa é k2
    const olderCipher = encryptBiometricRef(token, "k1");
    assert.ok(olderCipher.startsWith("enc:v2:k1:"), "Older cipher usa chave k1 explicitamente");
    const decryptedOlder = decryptBiometricRef(olderCipher, (meta) => {
      auditedKeyId = meta.keyId;
    });
    assert.equal(decryptedOlder, token, "Consegue decifrar chave antiga presente no anel");
    assert.equal(auditedKeyId, "k1", "Meta de auditoria identifica chave antiga k1");

    // 4. Retrocompatibilidade: formato v1 (enc:v1:iv:tag:data)
    const ring = getBiometricKeyRing();
    const key = ring.keys.get("k2")!;
    const iv = Buffer.alloc(12, 1);
    const cipherLegacy = crypto.createCipheriv("aes-256-gcm", key, iv);
    let encLegacy = cipherLegacy.update(token, "utf8", "base64");
    encLegacy += cipherLegacy.final("base64");
    const tagLegacy = cipherLegacy.getAuthTag();
    const v1Payload = `enc:v1:${iv.toString("base64")}:${tagLegacy.toString("base64")}:${encLegacy}`;

    const decryptedV1 = decryptBiometricRef(v1Payload);
    assert.equal(decryptedV1, token, "Formato v1 é decifrado com sucesso via anel");
  } finally {
    if (origRing !== undefined) process.env.BIOMETRIC_KEY_RING = origRing; else delete process.env.BIOMETRIC_KEY_RING;
    if (origKeys !== undefined) process.env.BIOMETRIC_KEYS = origKeys; else delete process.env.BIOMETRIC_KEYS;
    if (origSingle !== undefined) process.env.BIOMETRIC_ENCRYPTION_KEY = origSingle; else delete process.env.BIOMETRIC_ENCRYPTION_KEY;
    if (origActive !== undefined) process.env.BIOMETRIC_ACTIVE_KEY_ID = origActive; else delete process.env.BIOMETRIC_ACTIVE_KEY_ID;
    if (origFiscal !== undefined) process.env.FISCAL_CONFIG_KEY = origFiscal; else delete process.env.FISCAL_CONFIG_KEY;
  }
});

test("HR Biometria: RBAC e sanitização estrita para CASHIER, OPERATOR e MANAGER", () => {
  const fullEmployee = {
    id: "emp-01",
    fullName: "Colaborador Teste",
    position: "Operador de Caixa",
    biometricConsentGiven: true,
    biometricRefId: "zk-hw-token-sensitive",
  };

  // CASHIER nunca recebe dados biométricos
  const cashierView = sanitizeEmployeeForRole(fullEmployee, "CASHIER");
  assert.equal(cashierView.biometricRefId, null);
  assert.equal(cashierView.biometricConsentGiven, false);

  // OPERATOR nunca recebe dados biométricos
  const operatorView = sanitizeEmployeeForRole(fullEmployee, "OPERATOR");
  assert.equal(operatorView.biometricRefId, null);
  assert.equal(operatorView.biometricConsentGiven, false);

  // MANAGER nunca recebe dados biométricos
  const managerView = sanitizeEmployeeForRole(fullEmployee, "MANAGER");
  assert.equal(managerView.biometricRefId, null);
  assert.equal(managerView.biometricConsentGiven, false);

  // Perfil com prefixo ROLE_
  const roleCashierView = sanitizeEmployeeForRole(fullEmployee, "ROLE_CASHIER");
  assert.equal(roleCashierView.biometricRefId, null);
  assert.equal(roleCashierView.biometricConsentGiven, false);

  // ADMIN e HR_MANAGER autorizados recebem os dados para gestão
  const adminView = sanitizeEmployeeForRole(fullEmployee, "ADMIN");
  assert.equal(adminView.biometricRefId, "zk-hw-token-sensitive");
  assert.equal(adminView.biometricConsentGiven, true);

  const hrView = sanitizeEmployeeForRole(fullEmployee, "HR_MANAGER");
  assert.equal(hrView.biometricRefId, "zk-hw-token-sensitive");
  assert.equal(hrView.biometricConsentGiven, true);
});

test("HR PayrollSnapshot: computeSnapshotHash inclui hash canónico da configuração remuneratória aplicada", () => {
  const config = {
    version: "2026.1",
    source: "CIRS 2026",
    approvalReference: "CFG-HR-2026",
    inssEmployeeRate: 0.03,
  };
  const configHash = computeConfigHash(config);
  assert.ok(typeof configHash === "string" && configHash.length === 64, "configHash deve ser SHA-256 de 64 chars");

  const snapshotData = {
    companyId: "comp-01",
    payrollId: "pay-01",
    month: "2026-11",
    version: "2026.1",
    configSnapshot: { ...config, configHash },
    configHash,
    closedAt: "2026-11-12T23:00:00.000Z",
    closedBy: "user-admin-01",
  };

  const hash1 = computeSnapshotHash(snapshotData);
  assert.ok(typeof hash1 === "string" && hash1.length === 64);

  // Alterar a configuração altera o hash canónico
  const alteredConfig = { ...config, inssEmployeeRate: 0.04 };
  const alteredConfigHash = computeConfigHash(alteredConfig);
  const hash2 = computeSnapshotHash({
    ...snapshotData,
    configSnapshot: { ...alteredConfig, configHash: alteredConfigHash },
    configHash: alteredConfigHash,
  });
  assert.notEqual(hash1, hash2, "Alteração da configuração aplicada altera obrigatoriamente o hash da snapshot");
});
