import crypto from "crypto";

const BAZAR_PUBLIC_SCOPE = "vaccination-bazar-self-service-v1";

function clean(value: any) {
  return String(value ?? "").trim();
}

function secret() {
  const value = clean(process.env.APP_SECRET);
  if (!value) throw new Error("APP_SECRET belum tersedia untuk membuat Portal Bazar.");
  return value;
}

function signature(sessionId: number) {
  return crypto
    .createHmac("sha256", secret())
    .update(`${BAZAR_PUBLIC_SCOPE}:${sessionId}`)
    .digest("base64url");
}

export function getVaccinationBazarPublicToken(sessionIdInput: any) {
  const sessionId = Number(sessionIdInput || 0);
  if (!Number.isFinite(sessionId) || sessionId <= 0) throw new Error("Session tidak valid.");
  return `v1.${sessionId}.${signature(sessionId)}`;
}

export function verifyVaccinationBazarPublicToken(value: any) {
  const token = clean(value);
  const match = token.match(/^v1\.(\d+)\.([A-Za-z0-9_-]+)$/);
  if (!match) return { valid: false, sessionId: 0 };
  const sessionId = Number(match[1] || 0);
  if (!sessionId) return { valid: false, sessionId: 0 };
  const expected = getVaccinationBazarPublicToken(sessionId);
  const left = Buffer.from(token);
  const right = Buffer.from(expected);
  const valid = left.length === right.length && crypto.timingSafeEqual(left, right);
  return { valid, sessionId: valid ? sessionId : 0 };
}
