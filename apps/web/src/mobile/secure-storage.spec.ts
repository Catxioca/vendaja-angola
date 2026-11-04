import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { SecureStorageAdapter } from "./secure-storage";

// Simula localStorage em ambiente Node.js de teste
class MockLocalStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
}

describe("Mobile SecureStorageAdapter", () => {
  beforeEach(() => {
    (globalThis as unknown as { localStorage: MockLocalStorage }).localStorage = new MockLocalStorage();
  });

  it("deve criptografar e descriptografar dados com AES-GCM preservando integridade", async () => {
    const storage = new SecureStorageAdapter(true);
    const plaintext = JSON.stringify({ token: "jwt-secret-token-123", role: "ROLE_ADMIN" });
    const encrypted = await storage.encrypt(plaintext);

    assert.notEqual(encrypted, plaintext, "O dado gravado não pode ser texto limpo");
    assert.ok(encrypted.length > 20, "O ciphertext em base64 deve ter comprimento válido");

    const decrypted = await storage.decrypt(encrypted);
    assert.equal(decrypted, plaintext, "O dado decifrado deve ser exatamente igual ao original");
  });

  it("deve persistir sessão no cofre e recuperá-la decifrada", async () => {
    const storage = new SecureStorageAdapter(true);
    const tokens = { accessToken: "access-token-live-abc", refreshToken: "refresh-token-live-xyz" };
    const user = {
      id: "usr-01",
      email: "operador@vendaja.ao",
      username: "operador1",
      displayName: "Operador Principal",
      role: "ROLE_CASHIER",
    };

    await storage.storeSession(tokens, user);
    const session = await storage.getSession();

    assert.ok(session, "A sessão deve ser recuperada com sucesso");
    assert.equal(session?.tokens.accessToken, tokens.accessToken);
    assert.equal(session?.user.username, user.username);
  });

  it("deve identificar primeiro login e bloquear tentativa de login offline sem sessão prévia", () => {
    const storage = new SecureStorageAdapter(true);
    assert.equal(storage.isFirstLogin(), true, "Novo dispositivo deve ser marcado como primeiro login");
  });

  it("deve guardar e verificar PIN numérico seguro com salt de dispositivo", async () => {
    const storage = new SecureStorageAdapter(true);
    await storage.storePin("1234");

    assert.equal(storage.hasPin(), true);
    assert.equal(await storage.verifyPin("1234"), true, "PIN correto deve ser aceite");
    assert.equal(await storage.verifyPin("9999"), false, "PIN incorreto deve ser rejeitado");
    assert.equal(await storage.verifyPin(""), false, "PIN vazio deve ser rejeitado");
  });

  it("deve rejeitar PIN com caracteres inválidos ou comprimento fora do padrão (4 a 6 dígitos)", async () => {
    const storage = new SecureStorageAdapter(true);
    await assert.rejects(async () => {
      await storage.storePin("12");
    }, /PIN deve conter exatamente entre 4 e 6 dígitos/);

    await assert.rejects(async () => {
      await storage.storePin("1234567");
    }, /PIN deve conter exatamente entre 4 e 6 dígitos/);

    await assert.rejects(async () => {
      await storage.storePin("abcd");
    }, /PIN deve conter exatamente entre 4 e 6 dígitos/);
  });

  it("deve limpar a sessão com segurança e não manter resíduos no cofre", async () => {
    const storage = new SecureStorageAdapter(true);
    await storage.storeSession(
      { accessToken: "tk1", refreshToken: "tk2" },
      { id: "u1", email: "a@a.com", username: "u", displayName: "d", role: "ADMIN" }
    );
    storage.clearSession();
    assert.equal(await storage.getSession(), null);
  });
});
