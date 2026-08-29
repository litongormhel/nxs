import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "crypto";
import { promisify } from "util";

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;

export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scrypt(pin, salt, KEY_LENGTH)) as Buffer;
  return `${salt.toString("hex")}:${derived.toString("hex")}`;
}

export async function verifyPin(pin: string, storedHash: string): Promise<boolean> {
  const [saltHex, keyHex] = storedHash.split(":");
  if (!saltHex || !keyHex) return false;

  const salt = Buffer.from(saltHex, "hex");
  const storedKey = Buffer.from(keyHex, "hex");
  const derived = (await scrypt(pin, salt, KEY_LENGTH)) as Buffer;

  if (derived.length !== storedKey.length) return false;
  return timingSafeEqual(derived, storedKey);
}
