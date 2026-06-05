import { pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";

const ITERATIONS = 120000;
const KEY_LENGTH = 32;
const DIGEST = "sha256";

export function validatePasswordStrength(password: string) {
  if (password.length < 6) return "密码至少 6 位";
  if (!/[A-Z]/.test(password)) return "密码必须包含大写字母";
  if (!/[a-z]/.test(password)) return "密码必须包含小写字母";
  if (!/[0-9]/.test(password)) return "密码必须包含数字";
  if (!/[^A-Za-z0-9]/.test(password)) return "密码必须包含特殊字符";
  return null;
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, DIGEST).toString("hex");
  return `pbkdf2_sha256$${ITERATIONS}$${salt}$${hash}`;
}

export function verifyPassword(password: string, passwordHash: string) {
  const [algorithm, iterationsRaw, salt, expectedHash] = passwordHash.split("$");
  if (algorithm !== "pbkdf2_sha256" || !iterationsRaw || !salt || !expectedHash) return false;
  const iterations = Number(iterationsRaw);
  if (!Number.isFinite(iterations) || iterations <= 0) return false;
  const actual = Buffer.from(
    pbkdf2Sync(password, salt, iterations, KEY_LENGTH, DIGEST).toString("hex"),
    "hex",
  );
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
