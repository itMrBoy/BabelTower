import { pbkdf2, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const ITERATIONS = 120000;
const KEY_LENGTH = 32;
const DIGEST = "sha256";

// 异步 pbkdf2 走 libuv 线程池，避免高迭代哈希阻塞 Node 单线程事件循环。
const pbkdf2Async = promisify(pbkdf2);

export function validatePasswordStrength(password: string) {
  if (password.length < 6) return "密码至少 6 位";
  if (!/[A-Z]/.test(password)) return "密码必须包含大写字母";
  if (!/[a-z]/.test(password)) return "密码必须包含小写字母";
  if (!/[0-9]/.test(password)) return "密码必须包含数字";
  if (!/[^A-Za-z0-9]/.test(password)) return "密码必须包含特殊字符";
  return null;
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = await pbkdf2Async(password, salt, ITERATIONS, KEY_LENGTH, DIGEST);
  return `pbkdf2_sha256$${ITERATIONS}$${salt}$${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, passwordHash: string) {
  const [algorithm, iterationsRaw, salt, expectedHash] = passwordHash.split("$");
  if (algorithm !== "pbkdf2_sha256" || !iterationsRaw || !salt || !expectedHash) return false;
  const iterations = Number(iterationsRaw);
  if (!Number.isFinite(iterations) || iterations <= 0) return false;
  const derived = await pbkdf2Async(password, salt, iterations, KEY_LENGTH, DIGEST);
  const actual = Buffer.from(derived.toString("hex"), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
