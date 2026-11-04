import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MobilePermissionManager } from "./permissions";

describe("MobilePermissionManager", () => {
  it("deve classificar rigorosamente o catálogo oficial de periféricos sem alegar falso suporte de hardware", () => {
    const manager = new MobilePermissionManager();
    const peripherals = manager.getPeripheralsCatalog();

    const hid = peripherals.find((p) => p.type === "hid");
    assert.ok(hid, "HID deve constar no catálogo");
    assert.equal(
      hid?.status,
      "compativel_teclado_pendente_validacao",
      "HID deve ser classificado como compatível por padrão de teclado e pendente de validação física"
    );

    const camera = peripherals.find((p) => p.type === "camera");
    assert.ok(camera);
    assert.equal(camera.status, "parcial", "Câmara deve ser classificada honestamente como parcial/pendente de validação física");

    const bluetooth = peripherals.find((p) => p.type === "bluetooth");
    assert.ok(bluetooth);
    assert.equal(bluetooth?.status, "pendente", "Bluetooth deve ser pendente até validação em hardware real");

    const tpa = peripherals.find((p) => p.type === "tpa");
    assert.ok(tpa);
    assert.equal(tpa?.status, "mockavel", "TPA deve ser classificado como mockável/simulado sem SDK proprietário EMIS");

    const scale = peripherals.find((p) => p.type === "scale");
    assert.ok(scale);
    assert.equal(scale?.status, "pendente");

    const biometrics = peripherals.find((p) => p.type === "biometrics");
    assert.ok(biometrics);
    assert.equal(biometrics?.status, "mockavel");
  });

  it("deve tratar graciosamente a ausência ou negação de câmara informando motivo ao operador", async () => {
    const manager = new MobilePermissionManager();
    const res = await manager.requestCamera();
    assert.equal(res.granted, false);
    assert.ok(res.reason, "Deve fornecer uma explicação amigável ao utilizador");
  });

  it("deve tratar graciosamente a ausência ou negação de Bluetooth sem bloquear a aplicação", async () => {
    const manager = new MobilePermissionManager();
    const res = await manager.requestBluetooth();
    assert.equal(res.granted, false);
    assert.ok(res.reason?.includes("Bluetooth nativo indisponível"), "Deve explicar a limitação técnica");
  });
});
