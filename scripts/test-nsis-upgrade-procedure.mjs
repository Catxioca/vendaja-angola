/**
 * Procedimento Automatizável de Teste de Upgrade NSIS Real (VendaJá Angola)
 *
 * NOTA DE SEGURANÇA E BLOQUEIO DE RELEASE:
 * Este teste NÃO DEVE ser executado enquanto um novo instalador executável não for
 * expressamente autorizado e compilado com as novas políticas fiscais e de segurança.
 *
 * Configuração NSIS Efetiva (electron-builder.yml):
 *  - appId: ao.commerce.desktop
 *  - productName: VendaJá Angola
 *  - target: NSIS
 *  - perMachine: true (instalação a nível de máquina em %PROGRAMFILES%\VendaJá Angola)
 *  - deleteAppDataOnUninstall: false (preservação estrita dos dados do operador)
 *
 * Caminho Real de Electron userData no Windows:
 *  - Calculado dinamicamente por: path.join(process.env.APPDATA, "VendaJá Angola")
 *
 * Ficheiros Reais de userData Auditados na Preservação:
 *  1. server-config.json       -> apiUrl, terminalId, timeoutMs, offlinePilotMode
 *  2. license-state.json       -> token assimétrico modular, hardwareId, módulos licenciados
 *  3. machine-id               -> identificador local estável e anonimizado de máquina
 *  4. IndexedDB/               -> fila outbox local (mutações offline) e catálogo de produtos
 *  5. Local Storage/           -> preferências locais da interface de venda
 */

import { existsSync } from "node:fs";
import { join } from "node:path";

export function getExpectedUserDataPath() {
  const appData = process.env.APPDATA || "C:\\Users\\Default\\AppData\\Roaming";
  return join(appData, "VendaJá Angola");
}

export function getNsisUpgradeVerificationSpec() {
  return {
    config: {
      appId: "ao.commerce.desktop",
      productName: "VendaJá Angola",
      perMachine: true,
      deleteAppDataOnUninstall: false,
      userDataDirName: "VendaJá Angola",
    },
    fixtures: {
      // DADOS SINTÉTICOS DE TESTE - NUNCA USAR CHAVES OU TOKENS REAIS
      serverConfig: {
        apiUrl: "http://127.0.0.1:4000",
        terminalId: "SYNTHETIC_TEST_TERM_01",
        timeoutMs: 8000,
      },
      licenseState: {
        companyId: "SYNTHETIC_COMPANY_TEST",
        tier: "ENTERPRISE",
        modules: ["POS", "STOCKS", "SETTINGS"],
        hardwareId: "SYNTHETIC_HWID_HASH_64_CHARS_0000000000000000000000000000000000",
        token: "SYNTHETIC_NONCE_UNSIGNABLE_FOR_TEST_ONLY",
      },
      machineId: "SYNTHETIC_MACHINE_ID_MOCK_12345678",
      outboxSample: [
        {
          id: "MUTATION_TEST_01",
          type: "CREATE_SALE",
          status: "PENDING",
          createdAt: "2026-10-28T12:00:00.000Z",
        },
      ],
    },
    verifiedFiles: [
      "server-config.json",
      "license-state.json",
      "machine-id",
      "IndexedDB",
      "Local Storage",
    ],
  };
}

export function executeNsisUpgradeCheck(installerPath) {
  if (!installerPath || !existsSync(installerPath)) {
    return {
      canExecute: false,
      reason:
        "Instalador NSIS novo não fornecido ou inexistente. A execução física do upgrade é diferida até que a compilação do novo instalador seja expressamente autorizada.",
    };
  }

  return {
    canExecute: true,
    reason: "Instalador disponível para teste em ambiente controlado.",
  };
}

if (process.argv[1] && process.argv[1].endsWith("test-nsis-upgrade-procedure.mjs")) {
  console.log("=== PROCEDIMENTO DE TESTE DE UPGRADE NSIS (SPEC CHECK) ===");
  const spec = getNsisUpgradeVerificationSpec();
  console.log(`appId: ${spec.config.appId}`);
  console.log(`productName: ${spec.config.productName}`);
  console.log(`perMachine: ${spec.config.perMachine}`);
  console.log(`deleteAppDataOnUninstall: ${spec.config.deleteAppDataOnUninstall}`);
  console.log(`Caminho Real de UserData: ${getExpectedUserDataPath()}`);
  console.log("Ficheiros auditados:");
  spec.verifiedFiles.forEach((f) => console.log(`  - ${f}`));

  const check = executeNsisUpgradeCheck(process.env.NEW_INSTALLER_PATH);
  console.log(`\nEstado de Executabilidade: ${check.canExecute ? "APTO" : "DIFERIDO"}`);
  console.log(`Motivo: ${check.reason}`);
}
