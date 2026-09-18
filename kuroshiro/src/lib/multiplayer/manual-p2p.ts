import { makePeerId } from "@/lib/reversi/room";

export interface ManualPeerInfo {
  id: string;
  name: string;
  connectionState: RTCPeerConnectionState;
  channelState: RTCDataChannelState | "none";
  candidateType: string | null;
  rttMs: number | null;
}

type SignalKind = "offer" | "answer";

interface ManualSignal {
  v: 1;
  kind: SignalKind;
  peerId: string;
  name: string;
  description: RTCSessionDescriptionInit;
}

export interface ManualP2POptions {
  isHost: boolean;
  name: string;
  onPeerChanged?: (peer: ManualPeerInfo | null) => void;
  onMessage?: (from: string, data: unknown, channel: "state" | "reliable") => void;
}

const CODE_PREFIX = "KSR1.";
const GATHER_TIMEOUT_MS = 12_000;

export function manualIceServers(): RTCIceServer[] {
  const raw = (import.meta.env.VITE_STUN_URLS as string | undefined)?.trim();
  if (raw?.toLowerCase() === "none") return [];
  const configured = raw
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return [
    {
      urls: configured?.length
        ? configured
        : ["stun:stun.cloudflare.com:3478", "stun:stun.l.google.com:19302"],
    },
  ];
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function encodeManualSignal(signal: ManualSignal): string {
  const json = JSON.stringify(signal);
  return CODE_PREFIX + bytesToBase64Url(new TextEncoder().encode(json));
}

export function decodeManualSignal(raw: string, expectedKind: SignalKind): ManualSignal {
  const code = raw.trim().replace(/\s+/g, "");
  if (!code.startsWith(CODE_PREFIX)) throw new Error("このゲームの接続コードではありません");
  let parsed: unknown;
  try {
    const json = new TextDecoder().decode(base64UrlToBytes(code.slice(CODE_PREFIX.length)));
    parsed = JSON.parse(json);
  } catch {
    throw new Error("接続コードを読み取れませんでした");
  }
  if (!parsed || typeof parsed !== "object") throw new Error("接続コードが壊れています");
  const value = parsed as Partial<ManualSignal>;
  if (value.v !== 1 || value.kind !== expectedKind) {
    throw new Error(expectedKind === "offer" ? "招待コードを貼り付けてください" : "返答コードを貼り付けてください");
  }
  if (typeof value.peerId !== "string" || typeof value.name !== "string" || !value.description) {
    throw new Error("接続コードに必要な情報がありません");
  }
  if (value.description.type !== expectedKind || typeof value.description.sdp !== "string") {
    throw new Error("接続コードの形式が正しくありません");
  }
  return value as ManualSignal;
}

function waitForIceGathering(pc: RTCPeerConnection): Promise<void> {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      pc.removeEventListener("icegatheringstatechange", onChange);
      window.clearTimeout(timer);
      resolve();
    };
    const onChange = () => {
      if (pc.iceGatheringState === "complete") finish();
    };
    const timer = window.setTimeout(finish, GATHER_TIMEOUT_MS);
    pc.addEventListener("icegatheringstatechange", onChange);
  });
}

export class ManualP2P {
  readonly selfId = makePeerId();
  private readonly opts: ManualP2POptions;
  private pc: RTCPeerConnection | null = null;
  private reliable: RTCDataChannel | null = null;
  private state: RTCDataChannel | null = null;
  private remote: { id: string; name: string } | null = null;
  private closed = false;
  private generation = 0;

  constructor(opts: ManualP2POptions) {
    this.opts = opts;
  }

  async createOfferCode(): Promise<string> {
    if (!this.opts.isHost) throw new Error("参加側では招待コードを作れません");
    const pc = this.ensurePeerConnection(true);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await waitForIceGathering(pc);
    if (!pc.localDescription) throw new Error("招待コードを作れませんでした");
    return encodeManualSignal({
      v: 1,
      kind: "offer",
      peerId: this.selfId,
      name: this.opts.name,
      description: { type: pc.localDescription.type, sdp: pc.localDescription.sdp },
    });
  }

  async acceptOfferCode(raw: string): Promise<string> {
    if (this.opts.isHost) throw new Error("作成側では招待コードを読み込めません");
    const signal = decodeManualSignal(raw, "offer");
    this.remote = { id: signal.peerId, name: signal.name || "あいて" };
    const pc = this.ensurePeerConnection(false);
    await pc.setRemoteDescription(signal.description);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await waitForIceGathering(pc);
    this.emitPeer();
    if (!pc.localDescription) throw new Error("返答コードを作れませんでした");
    return encodeManualSignal({
      v: 1,
      kind: "answer",
      peerId: this.selfId,
      name: this.opts.name,
      description: { type: pc.localDescription.type, sdp: pc.localDescription.sdp },
    });
  }

  async acceptAnswerCode(raw: string): Promise<void> {
    if (!this.opts.isHost) throw new Error("参加側では返答コードを読み込めません");
    const signal = decodeManualSignal(raw, "answer");
    this.remote = { id: signal.peerId, name: signal.name || "あいて" };
    const pc = this.ensurePeerConnection(true);
    await pc.setRemoteDescription(signal.description);
    this.emitPeer();
  }

  send(data: unknown, channel: "state" | "reliable" = "reliable"): boolean {
    const dc = channel === "state" ? this.state : this.reliable;
    if (!dc || dc.readyState !== "open") return false;
    try {
      dc.send(JSON.stringify(data));
      return true;
    } catch {
      return false;
    }
  }

  close(): void {
    this.closed = true;
    this.reliable?.close();
    this.state?.close();
    this.pc?.close();
    this.reliable = null;
    this.state = null;
    this.pc = null;
    this.opts.onPeerChanged?.(null);
  }

  private ensurePeerConnection(createChannels: boolean): RTCPeerConnection {
    if (typeof RTCPeerConnection === "undefined") {
      throw new Error("このブラウザではWebRTCを利用できません。Safari / Chrome / Firefox / Edgeの最新版で開いてください");
    }
    if (this.pc && this.pc.signalingState !== "closed") return this.pc;
    this.generation += 1;
    const generation = this.generation;
    const pc = new RTCPeerConnection({ iceServers: manualIceServers() });
    this.pc = pc;

    pc.addEventListener("connectionstatechange", () => {
      if (this.closed || generation !== this.generation) return;
      this.emitPeer();
    });
    pc.addEventListener("iceconnectionstatechange", () => {
      if (this.closed || generation !== this.generation) return;
      this.emitPeer();
    });
    pc.addEventListener("datachannel", (event) => {
      if (this.closed || generation !== this.generation) return;
      this.attachChannel(event.channel);
    });

    if (createChannels) {
      this.attachChannel(pc.createDataChannel("reliable", { ordered: true }));
    }
    return pc;
  }

  private attachChannel(channel: RTCDataChannel): void {
    if (channel.label === "state") this.state = channel;
    else this.reliable = channel;
    channel.addEventListener("open", () => this.emitPeer());
    channel.addEventListener("close", () => this.emitPeer());
    channel.addEventListener("error", () => this.emitPeer());
    channel.addEventListener("message", (event) => {
      if (!this.remote) return;
      let data: unknown = event.data;
      if (typeof event.data === "string") {
        try {
          data = JSON.parse(event.data);
        } catch {
          return;
        }
      }
      this.opts.onMessage?.(this.remote.id, data, channel.label === "state" ? "state" : "reliable");
    });
  }

  private effectiveState(): RTCPeerConnectionState {
    const pc = this.pc;
    if (!pc) return "new";
    // A peer connection can report `connected` a fraction earlier than the
    // DataChannel opens (notably on Safari). Treat that gap as connecting so
    // the game never sends its first packet into a channel that is not ready.
    if (pc.connectionState === "connected" && this.reliable?.readyState !== "open") return "connecting";
    if (pc.connectionState && pc.connectionState !== "new") return pc.connectionState;
    switch (pc.iceConnectionState) {
      case "checking":
        return "connecting";
      case "connected":
      case "completed":
        return this.reliable?.readyState === "open" ? "connected" : "connecting";
      case "disconnected":
        return "disconnected";
      case "failed":
        return "failed";
      case "closed":
        return "closed";
      default:
        return pc.connectionState || "new";
    }
  }

  private emitPeer(): void {
    if (!this.remote) {
      this.opts.onPeerChanged?.(null);
      return;
    }
    this.opts.onPeerChanged?.({
      id: this.remote.id,
      name: this.remote.name,
      connectionState: this.effectiveState(),
      channelState: this.reliable?.readyState ?? "none",
      candidateType: null,
      rttMs: null,
    });
  }
}
