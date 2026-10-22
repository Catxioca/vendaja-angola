import test from "node:test";
import assert from "node:assert/strict";
import {
  LocalBiometricsEngine,
  type BiometricHealthStatus,
  type AccessPersonRecord,
} from "./local-biometrics-engine.js";

// Helper to reset global navigator mocks
function restoreGlobals() {
  // @ts-ignore
  delete globalThis.navigator;
  // @ts-ignore
  delete globalThis.window;
  // @ts-ignore
  delete globalThis.document;
}

test("Scenario 1: Sem câmara -> Retorna mensagem específica 'Nenhuma câmara encontrada.' sem 'Failed to fetch'", async () => {
  restoreGlobals();
  const engine = LocalBiometricsEngine.getInstance();
  engine.clearAllData();

  // Test detectCameras without navigator.mediaDevices
  const camResultNoNav = await engine.detectCameras();
  assert.equal(camResultNoNav.available, false);
  assert.equal(camResultNoNav.devices.length, 0);
  assert.equal(camResultNoNav.message, "Nenhuma câmara encontrada.");
  assert.ok(!camResultNoNav.message.includes("Failed to fetch"));

  // Mock navigator with 0 video devices (audioonly or empty)
  (globalThis as any).navigator = {
    mediaDevices: {
      enumerateDevices: async () => [
        { deviceId: "mic1", kind: "audioinput", label: "Microfone Integrado", groupId: "1" } as MediaDeviceInfo,
      ],
      getUserMedia: async () => {
        const err = new Error("Requested device not found");
        err.name = "NotFoundError";
        throw err;
      },
    },
  };

  const camResultNoVideo = await engine.detectCameras();
  assert.equal(camResultNoVideo.available, false);
  assert.equal(camResultNoVideo.devices.length, 0);
  assert.equal(camResultNoVideo.message, "Nenhuma câmara encontrada.");

  // Test startCameraStream error handling
  const fakeVideoEl = {} as HTMLVideoElement;
  await assert.rejects(
    async () => {
      await engine.startCameraStream(fakeVideoEl);
    },
    {
      message: "Nenhuma câmara encontrada.",
    }
  );

  restoreGlobals();
});

test("Scenario 2: Com câmara -> Detecta dispositivos de vídeo e estabelece stream de preview", async () => {
  restoreGlobals();
  const engine = LocalBiometricsEngine.getInstance();
  engine.clearAllData();

  let streamStopped = false;
  const mockTrack = {
    stop: () => {
      streamStopped = true;
    },
  };

  const mockStream = {
    getTracks: () => [mockTrack],
  } as unknown as MediaStream;

  // Mock navigator with a real camera
  (globalThis as any).navigator = {
    mediaDevices: {
      enumerateDevices: async () => [
        {
          deviceId: "cam-hd-01",
          kind: "videoinput",
          label: "Câmara Web Integrada Full HD 1080p",
          groupId: "grp-video",
        } as MediaDeviceInfo,
      ],
      getUserMedia: async () => mockStream,
    },
  };

  const camResult = await engine.detectCameras();
  assert.equal(camResult.available, true);
  assert.equal(camResult.devices.length, 1);
  assert.equal(camResult.devices[0]?.label, "Câmara Web Integrada Full HD 1080p");
  assert.ok(camResult.message.includes("Câmara Web Integrada Full HD 1080p"));

  // Start camera stream on video element
  let played = false;
  const fakeVideoEl = {
    srcObject: null as any,
    play: async () => {
      played = true;
    },
  } as HTMLVideoElement;

  const stream = await engine.startCameraStream(fakeVideoEl);
  assert.equal(stream, mockStream);
  assert.equal(fakeVideoEl.srcObject, mockStream);
  assert.equal(played, true);

  // Stop camera stream
  engine.stopCameraStream();
  assert.equal(streamStopped, true);

  restoreGlobals();
});

test("Scenario 3: Sem RFID -> Retorna mensagem específica e rejeita leituras vazias sem 'Failed to fetch'", () => {
  restoreGlobals();
  const engine = LocalBiometricsEngine.getInstance();
  engine.clearAllData();

  // Without window object
  const rfidStatus = engine.checkRfidStatus();
  assert.equal(rfidStatus.connected, false);
  assert.equal(rfidStatus.message, "Nenhum leitor RFID conectado.");

  // Process sweep without UID
  assert.throws(
    () => {
      engine.processRfidSweep("");
    },
    {
      message: "Nenhum leitor RFID conectado ou nenhum cartão aproximado.",
    }
  );

  assert.throws(
    () => {
      engine.processRfidSweep("   ");
    },
    {
      message: "Nenhum leitor RFID conectado ou nenhum cartão aproximado.",
    }
  );

  restoreGlobals();
});

test("Scenario 4: Com RFID -> Leitura real de cartão UID, validação e garantia de unicidade de cartão", () => {
  restoreGlobals();
  const engine = LocalBiometricsEngine.getInstance();
  engine.clearAllData();

  // 1. Cadastrar Pessoa A
  const personA = engine.registerPerson({
    companyId: "EMP-001",
    internalCode: "COLAB-001",
    fullName: "Manuel Sebastião",
    category: "EMPLOYEE",
    status: "ACTIVE",
    department: "Contabilidade",
  });
  assert.equal(personA.internalCode, "COLAB-001");
  assert.equal(personA.fullName, "Manuel Sebastião");

  // 2. Associar cartão RFID UID "04A1B2C3D4"
  const enrolledA = engine.enrollRfidCard(personA.id, "04A1B2C3D4");
  assert.equal(enrolledA.rfidCardUid, "04A1B2C3D4");

  // 3. Cadastrar Pessoa B
  const personB = engine.registerPerson({
    companyId: "EMP-001",
    internalCode: "COLAB-002",
    fullName: "Ana Maria Ferreira",
    category: "EMPLOYEE",
    status: "ACTIVE",
    department: "Tesouraria",
  });

  // 4. Tentar associar o MESMO cartão RFID à Pessoa B -> Deve ser rejeitado com erro de unicidade
  assert.throws(
    () => {
      engine.enrollRfidCard(personB.id, "04A1B2C3D4");
    },
    {
      message: "O cartão RFID 04A1B2C3D4 já está associado a Manuel Sebastião (COLAB-001).",
    }
  );

  // 5. Simular varredura de acesso com cartão de Pessoa A -> ACESSO CONCEDIDO
  const sweepResultGranted = engine.processRfidSweep("04A1B2C3D4", "ENTRY", "Torniquete Principal");
  assert.equal(sweepResultGranted.granted, true);
  assert.equal(sweepResultGranted.person?.id, personA.id);
  assert.equal(sweepResultGranted.person?.fullName, "Manuel Sebastião");
  assert.equal(sweepResultGranted.log.authMethod, "RFID_CARD");
  assert.equal(sweepResultGranted.log.granted, true);
  assert.equal(sweepResultGranted.log.direction, "ENTRY");

  // 6. Simular varredura com cartão desconhecido -> ACESSO NEGADO
  const sweepResultUnknown = engine.processRfidSweep("UNKNOWN-CARD-999", "ENTRY", "Torniquete Principal");
  assert.equal(sweepResultUnknown.granted, false);
  assert.equal(sweepResultUnknown.denialReason, "CARTAO_NAO_CADASTRADO");
  assert.equal(sweepResultUnknown.log.granted, false);

  // 7. Simular pessoa com status BLOQUEADO -> ACESSO NEGADO
  personA.status = "BLOCKED";
  // Update in storage directly through enroll or re-saving
  engine.clearAllData();
  const blockedPerson = engine.registerPerson({
    companyId: "EMP-001",
    internalCode: "COLAB-003",
    fullName: "Carlos Bloqueado",
    category: "EMPLOYEE",
    status: "BLOCKED",
  });
  engine.enrollRfidCard(blockedPerson.id, "BLOCKED-UID-777");
  const sweepBlocked = engine.processRfidSweep("BLOCKED-UID-777", "ENTRY");
  assert.equal(sweepBlocked.granted, false);
  assert.equal(sweepBlocked.denialReason, "PESSOA_BLOCKED");

  restoreGlobals();
});

test("Scenario 5: Instalação nova -> Zero dados biométricos fictícios e contadores a zero", () => {
  restoreGlobals();
  const engine = LocalBiometricsEngine.getInstance();
  engine.clearAllData();

  // Test that fresh install is 100% clean
  const persons = engine.getPersons();
  assert.equal(persons.length, 0, "Clean install must have 0 persons");

  const devices = engine.getConfiguredDevices();
  assert.equal(devices.length, 0, "Clean install must have 0 configured devices");

  const logs = engine.getAccessLogs();
  assert.equal(logs.length, 0, "Clean install must have 0 access logs");

  // Test dashboard metrics on clean install
  const metrics = engine.getDashboardMetrics();
  assert.equal(metrics.presentCount, 0);
  assert.equal(metrics.absentCount, 0);
  assert.equal(metrics.todayEntries, 0);
  assert.equal(metrics.todayExits, 0);
  assert.equal(metrics.deniedAttempts, 0);
  assert.equal(metrics.activeVisitors, 0);
  assert.equal(metrics.internalStaffPresent, 0);
  assert.equal(metrics.gymMembersPresent, 0);
  assert.equal(metrics.devicesOnline, 0);
  assert.equal(metrics.devicesTotal, 0);
  assert.equal(metrics.recentLogs.length, 0);

  // Verify absolutely no mock names exist
  const mockNames = ["Armindo Sebastião", "Carla Mendes", "192.168.1.201", "192.168.1.202"];
  const allJson = JSON.stringify({ persons, devices, logs, metrics });
  for (const name of mockNames) {
    assert.ok(!allJson.includes(name), `Found prohibited mock name or IP in clean install: ${name}`);
  }

  restoreGlobals();
});
