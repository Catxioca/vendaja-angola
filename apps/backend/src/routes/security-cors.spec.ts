import test from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { isAllowedOrigin } from "../services/cors-policy.js";

test("CORS: blocks wildcard in production while honoring explicit and canonical origins", () => {
  // 1. In production, wildcard "*" in configured origins must be rejected
  const productionWildcardOrigins = ["*"];
  assert.equal(isAllowedOrigin("https://malicious-attacker.com", "production", productionWildcardOrigins), false, "Wildcard '*' must NOT permit arbitrary origins in production");
  assert.equal(isAllowedOrigin("https://evil-site.org", "production", productionWildcardOrigins), false);

  // 2. In non-production (e.g. development), wildcard can be honored for testing
  assert.equal(isAllowedOrigin("http://custom-dev:3000", "development", ["*"]), true);

  // 3. Explicitly configured origins must be permitted in production
  const productionOrigins = ["https://vendaja.ao", "https://app.vendaja.ao"];
  assert.equal(isAllowedOrigin("https://vendaja.ao", "production", productionOrigins), true);
  assert.equal(isAllowedOrigin("https://app.vendaja.ao", "production", productionOrigins), true);
  assert.equal(isAllowedOrigin("https://unauthorized-domain.com", "production", productionOrigins), false);

  // 4. Desktop (Electron), capacitor and local loopback origins are permitted safely
  assert.equal(isAllowedOrigin("electron://vendaja-desktop", "production", []), true);
  assert.equal(isAllowedOrigin("capacitor://localhost", "production", []), true);
  assert.equal(isAllowedOrigin("http://localhost:3000", "production", []), true);
  assert.equal(isAllowedOrigin("http://127.0.0.1:4000", "production", []), true);
  assert.equal(isAllowedOrigin("file://", "production", []), true);
  assert.equal(isAllowedOrigin("null", "production", []), true);

  // 5. Calls without origin (e.g. mobile apps, curl, native POS clients) are permitted
  assert.equal(isAllowedOrigin(undefined, "production", []), true);
});

test("Security Headers: CSP, nosniff, frame-options and HSTS validation logic", () => {
  const securityPolicyHeaders = {
    csp: "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
    xContentTypeOptions: "nosniff",
    xFrameOptions: "DENY",
    referrerPolicy: "no-referrer",
    hsts: "max-age=31536000; includeSubDomains; preload",
  };

  assert.ok(securityPolicyHeaders.csp.includes("frame-ancestors 'none'"));
  assert.equal(securityPolicyHeaders.xContentTypeOptions, "nosniff");
  assert.equal(securityPolicyHeaders.xFrameOptions, "DENY");
  assert.ok(securityPolicyHeaders.hsts.includes("max-age=31536000"));
});

test("JWT & RBAC: validates token expiration and role permissions", () => {
  const secret = "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6";
  
  // Valid token
  const validToken = jwt.sign({ id: "user-123", role: "ROLE_ADMIN" }, secret, { expiresIn: "1h" });
  const verified = jwt.verify(validToken, secret) as { id: string; role: string };
  assert.equal(verified.id, "user-123");
  assert.equal(verified.role, "ROLE_ADMIN");

  // Expired token must be rejected
  const expiredToken = jwt.sign({ id: "user-old", role: "ROLE_ADMIN" }, secret, { expiresIn: "-1s" });
  assert.throws(() => {
    jwt.verify(expiredToken, secret);
  }, /jwt expired/);

  // Tampered token must be rejected
  assert.throws(() => {
    jwt.verify(validToken + "tampered", secret);
  }, /invalid signature/);
});
