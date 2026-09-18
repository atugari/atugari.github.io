export type ShareSignalKind = "invite" | "answer";

export interface ParsedShareSignal {
  kind: ShareSignalKind;
  sessionId: string;
  code: string;
}

interface StoredAnswer {
  code: string;
  at: number;
}

const STORAGE_PREFIX = "kuroshiro:p2p-answer:";
const CHANNEL_PREFIX = "kuroshiro:p2p-link:";
const MAX_RELAY_AGE_MS = 10 * 60 * 1000;

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
    return bytes;
  }
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  return bytes;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function makeShareSessionId(): string {
  return bytesToBase64Url(randomBytes(12));
}

function baseGameUrl(): string {
  const url = new URL(window.location.href);
  url.hash = "";
  // The game does not need query parameters for routing. Removing them keeps
  // invitation links stable if the page was opened from a tracking/share URL.
  url.search = "";
  return url.toString();
}

export function buildShareLink(kind: ShareSignalKind, code: string, sessionId: string): string {
  const key = kind === "invite" ? "invite" : "answer";
  return `${baseGameUrl()}#${key}=${encodeURIComponent(code)}&s=${encodeURIComponent(sessionId)}`;
}

export function parseShareSignal(input: string): ParsedShareSignal | null {
  const raw = input.trim();
  if (!raw) return null;

  let hash = "";
  try {
    if (/^https?:\/\//i.test(raw)) hash = new URL(raw).hash;
    else if (raw.startsWith("#")) hash = raw;
    else return null;
  } catch {
    return null;
  }

  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const sessionId = (params.get("s") ?? "").trim();
  const invite = params.get("invite");
  const answer = params.get("answer");
  if (!sessionId) return null;
  if (invite) return { kind: "invite", sessionId, code: invite };
  if (answer) return { kind: "answer", sessionId, code: answer };
  return null;
}

export function extractSignalCode(input: string, expected: ShareSignalKind): string {
  const raw = input.trim();
  const parsed = parseShareSignal(raw);
  if (parsed) {
    if (parsed.kind !== expected) {
      throw new Error(expected === "invite" ? "招待リンクを貼り付けてください" : "返答リンクを貼り付けてください");
    }
    return parsed.code;
  }
  // Manual KSR1 codes stay supported as a fallback.
  return raw;
}

function storageKey(sessionId: string): string {
  return `${STORAGE_PREFIX}${sessionId}`;
}

function channelName(sessionId: string): string {
  return `${CHANNEL_PREFIX}${sessionId}`;
}

function readStoredAnswer(sessionId: string): string | null {
  try {
    const raw = window.localStorage.getItem(storageKey(sessionId));
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<StoredAnswer>;
    if (typeof value.code !== "string" || typeof value.at !== "number") return null;
    if (Date.now() - value.at > MAX_RELAY_AGE_MS) {
      window.localStorage.removeItem(storageKey(sessionId));
      return null;
    }
    return value.code;
  } catch {
    return null;
  }
}

export function clearRelayedAnswer(sessionId: string): void {
  try {
    window.localStorage.removeItem(storageKey(sessionId));
  } catch {
    // Private/in-app browsers may block persistent storage.
  }
}

export function publishAnswerRelay(sessionId: string, code: string): void {
  const payload: StoredAnswer = { code, at: Date.now() };
  try {
    window.localStorage.setItem(storageKey(sessionId), JSON.stringify(payload));
  } catch {
    // BroadcastChannel below can still work even when storage is unavailable.
  }
  if (typeof BroadcastChannel !== "undefined") {
    try {
      const channel = new BroadcastChannel(channelName(sessionId));
      channel.postMessage({ type: "answer", code });
      window.setTimeout(() => channel.close(), 300);
    } catch {
      // Fallback to storage/paste flow.
    }
  }
}

export function subscribeAnswerRelay(sessionId: string, onAnswer: (code: string) => void): () => void {
  let disposed = false;
  let lastCode = "";

  const deliver = (code: unknown) => {
    if (disposed || typeof code !== "string" || !code || code === lastCode) return;
    lastCode = code;
    onAnswer(code);
  };

  const checkStorage = () => deliver(readStoredAnswer(sessionId));
  const onStorage = (event: StorageEvent) => {
    if (event.key !== storageKey(sessionId) || !event.newValue) return;
    try {
      const value = JSON.parse(event.newValue) as Partial<StoredAnswer>;
      deliver(value.code);
    } catch {
      // Ignore malformed relay data.
    }
  };

  window.addEventListener("storage", onStorage);
  checkStorage();
  const poll = window.setInterval(checkStorage, 1000);

  let channel: BroadcastChannel | null = null;
  if (typeof BroadcastChannel !== "undefined") {
    try {
      channel = new BroadcastChannel(channelName(sessionId));
      channel.addEventListener("message", (event) => {
        const value = event.data as { type?: unknown; code?: unknown } | null;
        if (value?.type === "answer") deliver(value.code);
      });
    } catch {
      channel = null;
    }
  }

  return () => {
    disposed = true;
    window.clearInterval(poll);
    window.removeEventListener("storage", onStorage);
    channel?.close();
  };
}
