#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

console.log("[reset-dev-data] A verificar caminhos de cache e IndexedDB locais...");

const appData = process.env.APPDATA || (
  process.platform === "darwin"
    ? path.join(os.homedir(), "Library", "Application Support")
    : path.join(os.homedir(), ".config")
);

const targets = [
  path.join(appData, "VendaJá Angola", "IndexedDB"),
  path.join(appData, "vendaja-desktop", "IndexedDB"),
  path.join(appData, "Electron", "IndexedDB"),
  path.join(appData, "ao.commerce.desktop", "IndexedDB"),
];

let cleaned = 0;

for (const target of targets) {
  if (fs.existsSync(target)) {
    try {
      fs.rmSync(target, { recursive: true, force: true });
      console.log(`[reset-dev-data] ✓ Removida cache IndexedDB: ${target}`);
      cleaned++;
    } catch (err) {
      console.warn(`[reset-dev-data] ⚠ Não foi possível remover ${target}: ${err.message}`);
    }
  } else {
    console.log(`[reset-dev-data] - Não encontrado (já limpo): ${target}`);
  }
}

console.log(`[reset-dev-data] Concluído! Total de diretórios limpos: ${cleaned}`);
console.log("[reset-dev-data] Dica para DevTools (navegador ou Electron F12):");
console.log('                 indexedDB.deleteDatabase("angola-pos");');
