import { randomInt } from "crypto";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

function randomCode(length: number): string {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

export function generateMemberCode(): string {
  return `M-${randomCode(6)}`;
}

export function generateClientUsername(): string {
  return `client_${randomCode(10).toLowerCase()}`;
}
