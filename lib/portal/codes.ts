import { randomInt } from "crypto";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

function randomCode(length: number): string {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

export function formatMemberCode(seq: number): string {
  return `nxs-${String(Math.max(1, Math.floor(seq))).padStart(5, "0")}`;
}

export function generateMemberCode(seq?: number): string {
  if (typeof seq === "number") {
    return formatMemberCode(seq);
  }
  return "nxs-00001";
}

export function generateClientUsername(): string {
  return `client_${randomCode(10).toLowerCase()}`;
}
