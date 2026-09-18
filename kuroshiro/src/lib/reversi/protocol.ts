export type NetMsg =
  | { t: "start"; blackId: string; whiteId: string }
  | { t: "ack-start" }
  | { t: "move"; seq: number; r: number; c: number }
  | { t: "resign" }
  | { t: "rematch" }
  | { t: "full" };

function isId(v: unknown): v is string {
  return typeof v === "string" && /^[a-zA-Z0-9_-]{1,64}$/.test(v);
}

function isInt(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v);
}

export function parseNetMsg(data: unknown): NetMsg | null {
  if (!data || typeof data !== "object") return null;
  const msg = data as { t?: unknown };
  switch (msg.t) {
    case "start": {
      const blackId = (msg as { blackId?: unknown }).blackId;
      const whiteId = (msg as { whiteId?: unknown }).whiteId;
      if (!isId(blackId) || !isId(whiteId) || blackId === whiteId) return null;
      return { t: "start", blackId, whiteId };
    }
    case "ack-start":
      return { t: "ack-start" };
    case "move": {
      const seq = (msg as { seq?: unknown }).seq;
      const r = (msg as { r?: unknown }).r;
      const c = (msg as { c?: unknown }).c;
      if (!isInt(seq) || seq < 1 || !isInt(r) || !isInt(c) || r < 0 || r > 7 || c < 0 || c > 7) return null;
      return { t: "move", seq, r, c };
    }
    case "resign":
      return { t: "resign" };
    case "rematch":
      return { t: "rematch" };
    case "full":
      return { t: "full" };
    default:
      return null;
  }
}
