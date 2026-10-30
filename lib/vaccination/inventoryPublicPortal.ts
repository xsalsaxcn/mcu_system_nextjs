import crypto from "crypto";

const INVENTORY_PUBLIC_SCOPE = "vaccination-inventory-operational-v2";

function clean(value: any) {
  return String(value ?? "").trim();
}

function secret() {
  const value = clean(process.env.APP_SECRET);
  if (!value) throw new Error("APP_SECRET belum tersedia untuk membuat Portal Inventory public.");
  return value;
}

function signature() {
  return crypto
    .createHmac("sha256", secret())
    .update(INVENTORY_PUBLIC_SCOPE)
    .digest("base64url");
}

export function getVaccinationInventoryPublicToken() {
  return `v2.${signature()}`;
}

export function verifyVaccinationInventoryPublicToken(value: any) {
  const token = clean(value);
  const expected = getVaccinationInventoryPublicToken();
  const left = Buffer.from(token);
  const right = Buffer.from(expected);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
