const LATIN = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const HIRAGANA = "あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん";
const KATAKANA = "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン";
const CODE_LENGTH = 6;

function chars(value: string): string[] {
  return Array.from(value);
}

export function sanitizeRoomCodeInput(raw: string): string {
  const normalized = raw.normalize("NFKC").toUpperCase();
  return chars(normalized)
    .filter((ch) => /[A-Z0-9ぁ-ゖァ-ヺー]/u.test(ch))
    .slice(0, CODE_LENGTH)
    .join("");
}

export function makeRoomCode(): string {
  const pools = [LATIN, HIRAGANA, KATAKANA] as const;
  const selector = crypto.getRandomValues(new Uint8Array(1))[0] % pools.length;
  const pool = chars(pools[selector]);
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  return Array.from(bytes, (b) => pool[b % pool.length]).join("");
}

export function parseRoomCode(raw: string): string | null {
  const code = sanitizeRoomCodeInput(raw);
  if (chars(code).length !== CODE_LENGTH) return null;
  if (!/^[A-Z0-9ぁ-ゖァ-ヺー]+$/u.test(code)) return null;
  return code;
}

export function roomIdFromCode(code: string): string {
  const bytes = new TextEncoder().encode(code.normalize("NFKC"));
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `priv-${hex}`;
}

export function makePeerId(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  let s = "p";
  for (const b of bytes) s += alphabet[b % 36];
  return s;
}
