import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test("Desktop HR Panel: Código-fonte do painel exporta HRPanel e declara abas canónicas completas", () => {
  const panelsFile = path.join(__dirname, "panels.tsx");
  assert.ok(fs.existsSync(panelsFile), "O ficheiro panels.tsx deve existir em apps/desktop/src");

  const source = fs.readFileSync(panelsFile, "utf8");

  // 1. Exportação do componente HRPanel
  assert.ok(source.includes("export function HRPanel"), "panels.tsx deve exportar HRPanel");

  // 2. Abas de governação e operação em paridade com a Web
  const expectedTabs = ["dashboard", "employees", "attendance", "payrolls", "config"];
  for (const tab of expectedTabs) {
    assert.ok(
      source.includes(`"${tab}"`),
      `HRPanel deve suportar a aba "${tab}" para paridade total com o Web ERP`
    );
  }
});

test("Desktop HR Panel: Presença do aviso regulatório laboral obrigatório", () => {
  const panelsFile = path.join(__dirname, "panels.tsx");
  const source = fs.readFileSync(panelsFile, "utf8");

  const regulatoryNotice = "Configurações laborais e remuneratórias sujeitas a fonte oficial e validação por profissional habilitado.";
  assert.ok(
    source.includes(regulatoryNotice),
    "HRPanel deve exibir expressamente o aviso regulatório oficial"
  );
});

test("Desktop HR Panel: Ausência de dados fictícios ou listas pré-fabricadas no painel Desktop", () => {
  const panelsFile = path.join(__dirname, "panels.tsx");
  const source = fs.readFileSync(panelsFile, "utf8");

  // Não pode haver listas mock de colaboradores ou recibos hardcoded
  const forbiddenPatterns = [
    "mockEmployees",
    "dummyEmployees",
    "fakeEmployees",
    "demoPayrolls",
    "mockPayrolls",
    "fakePayrolls",
  ];

  for (const pattern of forbiddenPatterns) {
    assert.ok(
      !source.includes(pattern),
      `HRPanel não pode conter coleções de dados fictícios ou mocks: ${pattern}`
    );
  }

  // Confirma que os dados são carregados dinamicamente via endpoints oficiais da API
  assert.ok(source.includes("/api/v1/hr/dashboard"), "Deve consultar o endpoint real de dashboard");
  assert.ok(source.includes("/api/v1/hr/employees"), "Deve consultar o endpoint real de colaboradores");
  assert.ok(source.includes("/api/v1/hr/attendance"), "Deve consultar o endpoint real de assiduidade");
  assert.ok(source.includes("/api/v1/hr/leaves"), "Deve consultar o endpoint real de férias e licenças");
  assert.ok(source.includes("/api/v1/hr/payrolls/report"), "Deve consultar o relatório real de payroll");
  assert.ok(source.includes("/api/v1/hr/config"), "Deve consultar a parametrização real de RH");
});

test("Desktop HR Panel: Governação e imutabilidade de payroll (fecho formal, snapshot e retificações)", () => {
  const panelsFile = path.join(__dirname, "panels.tsx");
  const source = fs.readFileSync(panelsFile, "utf8");

  // Endpoints e ações de fecho e integridade
  assert.ok(source.includes("/api/v1/hr/payrolls/close-month"), "Deve suportar fecho formal em lote do mês");
  assert.ok(source.includes("/close"), "Deve suportar fecho individual de recibo salarial");
  assert.ok(source.includes("/snapshot"), "Deve suportar inspeção de snapshot imutável com hash SHA-256");
  assert.ok(source.includes("/rectify"), "Deve suportar registo de retificações auditadas sem rasura do original");
  assert.ok(source.includes("/rectifications"), "Deve consultar o histórico de retificações auditadas");
  assert.ok(source.includes("FECHADO (IMUTÁVEL)"), "Deve identificar visualmente recibos fechados como imutáveis");
});

test("Desktop HR Panel: Proteção biométrica e revogação formal de consentimento", () => {
  const panelsFile = path.join(__dirname, "panels.tsx");
  const source = fs.readFileSync(panelsFile, "utf8");

  // Não aceita templates brutos ou biometria bruta
  assert.ok(!source.includes("biometricTemplate:"), "Não deve enviar nem armazenar biometricTemplate bruto");
  assert.ok(!source.includes("rawBiometrics:"), "Não deve enviar rawBiometrics no formulário");

  // Suporte a token técnico e revogação auditada
  assert.ok(source.includes("biometricRefId"), "Deve manipular apenas token técnico de terminal (biometricRefId)");
  assert.ok(source.includes("biometricConsentGiven"), "Deve gerir explicitamente consentimento do titular");
  assert.ok(
    source.includes("/biometric-consent/revoke"),
    "Deve conter ação e chamada para revogação formal de consentimento biométrico"
  );
});

test("Desktop HR Panel: Estados de loading, error e empty states honestos", () => {
  const panelsFile = path.join(__dirname, "panels.tsx");
  const source = fs.readFileSync(panelsFile, "utf8");

  assert.ok(source.includes("loading"), "Deve controlar estado de carregamento");
  assert.ok(source.includes("errorState"), "Deve controlar e exibir estado honesto de erro");
  assert.ok(source.includes("A carregar dados de Recursos Humanos"), "Deve exibir feedback visual de loading");
  assert.ok(source.includes("Nenhum colaborador"), "Deve conter empty state claro quando a base não tem colaboradores");
  assert.ok(source.includes("Nenhuma folha salarial processada"), "Deve conter empty state claro para folhas salariais");
});

test("Desktop HR Panel: Controle estrito de acesso e RBAC", () => {
  const panelsFile = path.join(__dirname, "panels.tsx");
  const source = fs.readFileSync(panelsFile, "utf8");

  // Assegura que verificações da prop admin protegem operações sensíveis
  assert.ok(source.includes("if (!admin)"), "Deve bloquear operações de gestão quando admin for falso");
  assert.ok(
    source.includes("Apenas administradores podem fechar formalmente a folha salarial"),
    "Deve apresentar mensagem explicativa de RBAC no fecho de folha"
  );
  assert.ok(
    source.includes("Apenas administradores podem retificar recibos fechados"),
    "Deve apresentar mensagem explicativa de RBAC na retificação"
  );
  assert.ok(
    source.includes("Apenas administradores podem revogar consentimento biométrico"),
    "Deve proteger revogação de consentimento com verificação de perfil"
  );
});
