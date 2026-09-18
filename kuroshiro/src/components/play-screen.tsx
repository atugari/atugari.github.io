import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, Flag, Lightbulb, Undo2, Volume2, VolumeX, Copy, Check, ClipboardPaste, RotateCcw, Share2 } from "lucide-react";
import { Board } from "@/components/board";
import { Button } from "@/components/ui/button";
import { useManualP2P } from "@/lib/multiplayer/use-manual-p2p";
import { buildShareLink, clearRelayedAnswer, extractSignalCode, subscribeAnswerRelay } from "@/lib/multiplayer/share-link";
import { chooseMove, chooseMoveAsync, DIFFICULTY_LABEL, type Difficulty } from "@/lib/reversi/ai";
import { playFlips, playSound, setMuted, unlockAudio } from "@/lib/reversi/audio";
import {
  applyMove,
  BLACK,
  colorLabel,
  counts,
  initialBoard,
  legalMoves,
  outcome,
  resolveAfterMove,
  WHITE,
  type Color,
} from "@/lib/reversi/engine";
import { parseNetMsg } from "@/lib/reversi/protocol";
import { cn } from "@/lib/utils";

export type PlayConfig =
  | { mode: "ai"; difficulty: Difficulty; myColor: Color; playerName: string }
  | { mode: "online"; playerName: string; isHost: boolean; linkMode?: boolean; shareSessionId?: string; initialSignal?: string };

function animMs(): number {
  if (typeof window === "undefined") return 480;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 480;
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

function resultCopy(winner: Color | 0 | null, myColor: Color | null): string {
  if (winner === 0) return "引き分け";
  if (myColor === null) return winner === BLACK ? "黒の勝ち" : "白の勝ち";
  if (winner === myColor) return "勝ち";
  return "負け";
}

function ScorePill({
  color,
  name,
  score,
  active,
}: {
  color: Color;
  name: string;
  score: number;
  active: boolean;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-1 items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors duration-150",
        active ? "border-stone/35 bg-ink-2" : "border-line bg-ink-2/60",
      )}
    >
      <span
        className={cn("size-5 shrink-0 rounded-full", color === BLACK ? "brand-disc black" : "brand-disc white")}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs text-mute">{name}</p>
        <p key={score} className="score-pop font-medium tabular-nums leading-tight text-paper">
          {score}
        </p>
      </div>
    </div>
  );
}

function Overlay({ children }: { children: ReactNode }) {
  return (
    <div className="absolute inset-0 z-10 grid place-items-center rounded-[inherit] bg-paper/22 p-4 backdrop-blur-[3px]">
      <div className="overlay-card w-full max-w-sm rounded-xl border border-line bg-ink-2 p-5 text-center shadow-board">
        {children}
      </div>
    </div>
  );
}

function TopBar({
  title,
  muted,
  onMute,
  onBack,
}: {
  title: string;
  muted: boolean;
  onMute: () => void;
  onBack: () => void;
}) {
  return (
    <header className="flex items-center justify-between gap-2 px-2 py-3 sm:px-4">
      <Button variant="ghost" size="sm" onClick={onBack} className="gap-1 px-2">
        <ChevronLeft className="size-4" />
        戻る
      </Button>
      <p className="text-xs tracking-[0.18em] text-faint uppercase">{title}</p>
      <Button
        variant="ghost"
        size="sm"
        onClick={onMute}
        aria-label={muted ? "音声をオン" : "音声をオフ"}
        className="px-2"
      >
        {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
      </Button>
    </header>
  );
}

function Table({
  board,
  turn,
  myColor,
  lastMove,
  flipped,
  hinted,
  disabled,
  onPlay,
  animReady,
  blackName,
  whiteName,
  status,
  passNotice,
  thinking,
  header,
  footer,
  overlay,
}: {
  board: number[];
  turn: Color;
  myColor: Color | null;
  lastMove: { r: number; c: number } | null;
  flipped: number[];
  hinted: number | null;
  disabled: boolean;
  onPlay: (r: number, c: number) => void;
  animReady: boolean;
  blackName: string;
  whiteName: string;
  status: string;
  passNotice: string | null;
  thinking: boolean;
  header: ReactNode;
  footer: ReactNode;
  overlay?: ReactNode;
}) {
  const score = counts(board);
  const legal = useMemo(() => {
    if (disabled || myColor === null || turn !== myColor) return [];
    return legalMoves(board, turn);
  }, [board, disabled, myColor, turn]);

  return (
    <div className="flex min-h-dvh flex-col overflow-x-hidden">
      {header}
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col px-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-5">
        <div className="flex gap-2 pt-1">
          <ScorePill color={BLACK} name={blackName} score={score.black} active={!overlay && turn === BLACK} />
          <ScorePill color={WHITE} name={whiteName} score={score.white} active={!overlay && turn === WHITE} />
        </div>
        <p className="mt-3 min-h-6 text-center text-sm text-mute">
          {thinking ? <span className="shimmer font-medium">考えています</span> : status}
        </p>
        {passNotice ? (
          <p className="mb-1 text-center text-xs text-stone rise-in">{passNotice}</p>
        ) : (
          <div className="mb-1 h-4" />
        )}
        <div className="relative mx-auto w-full max-w-[34rem]">
          <Board
            board={board}
            legal={legal}
            lastMove={lastMove}
            flipped={flipped}
            hinted={hinted}
            disabled={disabled}
            turn={turn}
            animReady={animReady}
            onPlay={onPlay}
          />
          {overlay}
        </div>
        <div className="mt-4">{footer}</div>
      </div>
    </div>
  );
}

interface Session {
  board: number[];
  turn: Color;
  myColor: Color | null;
  phase: "idle" | "animating";
  over: boolean;
  winner: Color | 0 | null;
  lastMove: { r: number; c: number } | null;
  flipped: number[];
  hinted: number | null;
  passNotice: string | null;
  animReady: boolean;
  boardRef: { current: number[] };
  turnRef: { current: Color };
  myColorRef: { current: Color | null };
  setMyColor: (c: Color | null) => void;
  setHinted: (i: number | null) => void;
  reset: (color: Color | null) => void;
  restore: (board: number[], turn: Color) => void;
  commitMove: (r: number, c: number, color: Color) => boolean;
  resign: (winnerColor: Color) => void;
}

function useGameSession(myColorInitial: Color | null): Session {
  const [board, setBoard] = useState(initialBoard);
  const [turn, setTurn] = useState<Color>(BLACK);
  const [myColor, setMyColorState] = useState<Color | null>(myColorInitial);
  const [phase, setPhase] = useState<"idle" | "animating">("idle");
  const [over, setOver] = useState(false);
  const [winner, setWinner] = useState<Color | 0 | null>(null);
  const [lastMove, setLastMove] = useState<{ r: number; c: number } | null>(null);
  const [flipped, setFlipped] = useState<number[]>([]);
  const [hinted, setHinted] = useState<number | null>(null);
  const [passNotice, setPassNotice] = useState<string | null>(null);
  const [animReady, setAnimReady] = useState(false);
  const boardRef = useRef(board);
  const turnRef = useRef(turn);
  const myColorRef = useRef(myColor);
  const pendingRef = useRef<{ turn: Color; over: boolean; passed: Color | null } | null>(null);

  useEffect(() => {
    const id = requestAnimationFrame(() => setAnimReady(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const setMyColor = useCallback((c: Color | null) => {
    myColorRef.current = c;
    setMyColorState(c);
  }, []);

  const reset = useCallback((color: Color | null) => {
    const next = initialBoard();
    boardRef.current = next;
    turnRef.current = BLACK;
    myColorRef.current = color;
    pendingRef.current = null;
    setBoard(next);
    setTurn(BLACK);
    setMyColorState(color);
    setPhase("idle");
    setOver(false);
    setWinner(null);
    setLastMove(null);
    setFlipped([]);
    setHinted(null);
    setPassNotice(null);
  }, []);

  const restore = useCallback((nextBoard: number[], nextTurn: Color) => {
    boardRef.current = nextBoard;
    turnRef.current = nextTurn;
    pendingRef.current = null;
    setBoard(nextBoard);
    setTurn(nextTurn);
    setPhase("idle");
    setOver(false);
    setWinner(null);
    setLastMove(null);
    setFlipped([]);
    setHinted(null);
    setPassNotice(null);
  }, []);

  const resign = useCallback((winnerColor: Color) => {
    setOver(true);
    setWinner(winnerColor);
    setPhase("idle");
    setFlipped([]);
    if (winnerColor === myColorRef.current) playSound("win");
    else playSound("lose");
  }, []);

  const finishAnim = useCallback(() => {
    const res = pendingRef.current;
    setFlipped([]);
    if (!res) {
      setPhase("idle");
      return;
    }
    if (res.over) {
      const out = outcome(boardRef.current);
      setOver(true);
      setWinner(out);
      setPhase("idle");
      if (out === myColorRef.current) playSound("win");
      else if (out === 0) playSound("draw");
      else playSound("lose");
      return;
    }
    if (res.passed !== null) {
      setPassNotice(`${colorLabel(res.passed)}は置ける場所がなくパス`);
      playSound("pass");
      window.setTimeout(() => setPassNotice(null), 2000);
    }
    turnRef.current = res.turn;
    setTurn(res.turn);
    setPhase("idle");
  }, []);

  useEffect(() => {
    if (phase !== "animating") return;
    const t = window.setTimeout(finishAnim, animMs());
    return () => window.clearTimeout(t);
  }, [phase, finishAnim]);

  const commitMove = useCallback((r: number, c: number, color: Color): boolean => {
    const result = applyMove(boardRef.current, r, c, color);
    if (!result) {
      playSound("illegal");
      return false;
    }
    boardRef.current = result.board;
    setBoard(result.board);
    setLastMove({ r, c });
    setFlipped(result.flipped);
    setHinted(null);
    setPhase("animating");
    playSound("place");
    playFlips(result.flipped.length);
    pendingRef.current = resolveAfterMove(result.board, color);
    return true;
  }, []);

  return {
    board,
    turn,
    myColor,
    phase,
    over,
    winner,
    lastMove,
    flipped,
    hinted,
    passNotice,
    animReady,
    boardRef,
    turnRef,
    myColorRef,
    setMyColor,
    setHinted,
    reset,
    restore,
    commitMove,
    resign,
  };
}

export function PlayScreen({ config, onExit, soundOn }: { config: PlayConfig; onExit: () => void; soundOn: boolean }) {
  const [muted, setMutedState] = useState(!soundOn);
  const toggleMute = () => {
    unlockAudio();
    const next = !muted;
    setMutedState(next);
    setMuted(next);
  };

  if (config.mode === "ai") {
    return <AiPlay config={config} onExit={onExit} muted={muted} onMute={toggleMute} />;
  }
  return <OnlinePlay config={config} onExit={onExit} muted={muted} onMute={toggleMute} />;
}

function AiPlay({
  config,
  onExit,
  muted,
  onMute,
}: {
  config: Extract<PlayConfig, { mode: "ai" }>;
  onExit: () => void;
  muted: boolean;
  onMute: () => void;
}) {
  const game = useGameSession(config.myColor);
  const [thinking, setThinking] = useState(false);
  const history = useRef<{ board: number[]; turn: Color }[]>([]);
  const [historyLen, setHistoryLen] = useState(0);
  const commitMove = game.commitMove;
  const boardRef = game.boardRef;
  const turnRef = game.turnRef;

  useEffect(() => {
    if (game.phase !== "idle" || game.over) return;
    if (game.turn === game.myColor) return;
    let cancelled = false;
    setThinking(true);
    const player = game.turn;
    void (async () => {
      const move = await chooseMoveAsync(boardRef.current, player, config.difficulty);
      if (cancelled) return;
      await sleep(config.difficulty === "easy" ? 220 : 320);
      if (cancelled) return;
      setThinking(false);
      if (move) commitMove(move.r, move.c, turnRef.current);
    })();
    return () => {
      cancelled = true;
    };
  }, [game.phase, game.turn, game.over, game.myColor, config.difficulty, commitMove, boardRef, turnRef]);

  const onPlay = (r: number, c: number) => {
    if (game.phase !== "idle" || game.over || thinking) return;
    if (game.turn !== game.myColor || game.myColor === null) return;
    history.current.push({ board: game.boardRef.current.slice(), turn: game.turn });
    setHistoryLen(history.current.length);
    game.commitMove(r, c, game.myColor);
  };

  const undoTurn = () => {
    const snap = history.current.pop();
    if (!snap || thinking) return;
    playSound("ui");
    setHistoryLen(history.current.length);
    game.restore(snap.board, snap.turn);
  };

  const hint = () => {
    if (game.turn !== game.myColor || game.over) return;
    const move = chooseMove(game.boardRef.current, game.turn, "normal");
    if (!move) return;
    playSound("ui");
    game.setHinted(move.r * 8 + move.c);
  };

  const rematch = () => {
    playSound("ui");
    history.current = [];
    setHistoryLen(0);
    game.reset(config.myColor);
  };

  const busy = game.phase !== "idle" || thinking || game.over;
  const score = counts(game.board);
  const iAmBlack = game.myColor === BLACK;

  return (
    <Table
      board={game.board}
      turn={game.turn}
      myColor={game.myColor}
      lastMove={game.lastMove}
      flipped={game.flipped}
      hinted={game.hinted}
      disabled={busy}
      onPlay={onPlay}
      animReady={game.animReady}
      blackName={iAmBlack ? config.playerName : "AI"}
      whiteName={iAmBlack ? "AI" : config.playerName}
      status={
        game.over ? "対局終了" : thinking ? "考えています" : game.turn === game.myColor ? "あなたの番" : "あいての番"
      }
      passNotice={game.passNotice}
      thinking={thinking}
      header={
        <TopBar title={`対 AI · ${DIFFICULTY_LABEL[config.difficulty]}`} muted={muted} onMute={onMute} onBack={onExit} />
      }
      footer={
        <div className="grid grid-cols-3 gap-2">
          <Button variant="secondary" size="sm" onClick={hint} disabled={busy || game.turn !== game.myColor}>
            <Lightbulb className="size-4" />
            ヒント
          </Button>
          <Button variant="secondary" size="sm" onClick={undoTurn} disabled={thinking || historyLen === 0 || game.over}>
            <Undo2 className="size-4" />
            待った
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => {
              if (game.over || game.myColor === null) return;
              game.resign(game.myColor === BLACK ? WHITE : BLACK);
            }}
            disabled={game.over || thinking}
          >
            <Flag className="size-4" />
            投了
          </Button>
        </div>
      }
      overlay={
        game.over ? (
          <Overlay>
            <p className="text-xs tracking-[0.2em] text-faint">対局終了</p>
            <h2 className="font-display mt-2 text-3xl font-medium tracking-tight">
              {resultCopy(game.winner, game.myColor)}
            </h2>
            <p className="mt-2 tabular-nums text-mute">
              黒 {score.black} — 白 {score.white}
            </p>
            <div className="mt-5 flex flex-col gap-2">
              <Button onClick={rematch}>もう一度</Button>
              <Button variant="secondary" onClick={onExit}>
                メニューへ
              </Button>
            </div>
          </Overlay>
        ) : null
      }
    />
  );
}

async function copyTextCompat(value: string): Promise<boolean> {
  if (!value) return false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Safari/private mode can deny Clipboard API; fall back to selection copy.
  }
  try {
    const area = document.createElement("textarea");
    area.value = value;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    area.setSelectionRange(0, area.value.length);
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

async function readTextCompat(): Promise<string | null> {
  try {
    if (navigator.clipboard?.readText) {
      const value = await navigator.clipboard.readText();
      return value || null;
    }
  } catch {
    // Clipboard read can be denied on Safari/private mode. Manual paste remains available.
  }
  return null;
}

async function shareTextCompat(value: string): Promise<"shared" | "copied" | "cancelled" | "failed"> {
  if (!value) return "failed";
  if (navigator.share) {
    try {
      await navigator.share({ text: value });
      return "shared";
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError") return "cancelled";
      // Some desktop implementations expose share() but reject text sharing.
      // Fall back to the same copy routine used by the dedicated copy button.
    }
  }
  return (await copyTextCompat(value)) ? "copied" : "failed";
}

function ConnectionCode({
  label,
  value,
  copied,
  onCopy,
  onShare,
}: {
  label: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
  onShare: () => void;
}) {
  return (
    <div className="mt-4 text-left">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-medium text-faint">{label}</p>
          {value ? <p className="mt-0.5 text-[10px] tabular-nums text-faint">{value.length.toLocaleString()}文字</p> : null}
        </div>
        <div className="flex gap-1.5">
          <Button variant="secondary" size="sm" disabled={!value} onClick={onShare}>
            <Share2 className="size-4" />
            共有
          </Button>
          <Button variant="secondary" size="sm" disabled={!value} onClick={onCopy}>
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copied ? "コピー済み" : "コピー"}
          </Button>
        </div>
      </div>
      <textarea
        readOnly
        value={value}
        rows={5}
        aria-label={label}
        onFocus={(event) => event.currentTarget.select()}
        className="signal-code mt-2 w-full resize-y rounded-xl border border-line bg-ink px-3 py-3 font-mono text-[11px] leading-5 text-paper outline-none transition focus:border-stone/45 focus:ring-2 focus:ring-stone/10"
        placeholder="接続情報を準備しています…"
      />
    </div>
  );
}

function SignalInput({
  label,
  value,
  onChange,
  placeholder,
  onPasteRequest,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  onPasteRequest?: () => void;
}) {
  return (
    <label className="mt-4 block text-left">
      <span className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-faint">{label}</span>
        {onPasteRequest ? (
          <button
            type="button"
            onClick={onPasteRequest}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-stone transition hover:bg-ink-3"
          >
            <ClipboardPaste className="size-3.5" />
            貼り付け
          </button>
        ) : null}
      </span>
      <textarea
        value={value}
        rows={5}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="done"
        onChange={(event) => onChange(event.target.value)}
        className="signal-code mt-2 w-full resize-y rounded-xl border border-line bg-ink px-3 py-3 font-mono text-[11px] leading-5 text-paper outline-none transition focus:border-stone/45 focus:ring-2 focus:ring-stone/10"
        placeholder={placeholder}
      />
    </label>
  );
}

function ConnectionProgress({
  step,
  linkMode,
}: {
  step: 1 | 2 | 3;
  linkMode: boolean;
}) {
  const labels = linkMode
    ? ["招待リンク", "返答リンク", "直接接続"]
    : ["招待コード", "返答コード", "直接接続"];
  return (
    <div className="mt-5 grid grid-cols-3 gap-2" aria-label="接続の進行状況">
      {labels.map((label, index) => {
        const n = (index + 1) as 1 | 2 | 3;
        const done = n < step;
        const active = n === step;
        return (
          <div
            key={label}
            className={cn(
              "rounded-xl border px-2 py-2.5 text-center transition",
              done ? "border-stone/25 bg-ink-3 text-stone" : active ? "border-stone/35 bg-ink-2 text-paper shadow-sm" : "border-line bg-ink-2/55 text-faint",
            )}
          >
            <span className="mx-auto mb-1 grid size-5 place-items-center rounded-full border border-current text-[10px] font-bold">
              {done ? "✓" : n}
            </span>
            <span className="block text-[10px] sm:text-xs">{label}</span>
          </div>
        );
      })}
    </div>
  );
}

function OnlinePlay({
  config,
  onExit,
  muted,
  onMute,
}: {
  config: Extract<PlayConfig, { mode: "online" }>;
  onExit: () => void;
  muted: boolean;
  onMute: () => void;
}) {
  const p2p = useManualP2P({ isHost: config.isHost, name: config.playerName });
  const game = useGameSession(null);
  const [signalInput, setSignalInput] = useState("");
  const [copied, setCopied] = useState<"offer" | "answer" | null>(null);
  const [signalError, setSignalError] = useState<string | null>(null);
  const [disconnected, setDisconnected] = useState(false);
  const [connFailed, setConnFailed] = useState(false);
  const [oppName, setOppName] = useState("あいて");
  const [wantRematch, setWantRematch] = useState(false);
  const [oppRematch, setOppRematch] = useState(false);
  const [started, setStarted] = useState(false);
  const startedRef = useRef(false);
  const seqRef = useRef(0);
  const opponentIdRef = useRef<string | null>(null);
  const startPayloadRef = useRef<{ blackId: string; whiteId: string } | null>(null);
  const startAckedRef = useRef(false);
  const overRef = useRef(false);
  const initialSignalHandledRef = useRef(false);
  const relayedAnswerApplyingRef = useRef(false);
  const commitMove = game.commitMove;
  const reset = game.reset;
  const resign = game.resign;
  const turnRef = game.turnRef;
  const send = p2p.send;
  const selfId = p2p.selfId;
  const onMessage = p2p.onMessage;

  overRef.current = game.over;

  const connectedPeer = p2p.peers.find((peer) => peer.connectionState === "connected");
  const anyPeer = p2p.peers[0];
  const linkMode = Boolean(config.linkMode && config.shareSessionId);
  const inviteLink = linkMode && config.isHost && p2p.offerCode && config.shareSessionId
    ? buildShareLink("invite", p2p.offerCode, config.shareSessionId)
    : "";
  const answerLink = linkMode && !config.isHost && p2p.answerCode && config.shareSessionId
    ? buildShareLink("answer", p2p.answerCode, config.shareSessionId)
    : "";

  useEffect(() => {
    if (config.isHost || !config.initialSignal || initialSignalHandledRef.current) return;
    initialSignalHandledRef.current = true;
    setSignalError(null);
    void p2p.acceptOffer(config.initialSignal).catch((reason: unknown) => {
      setSignalError(reason instanceof Error ? reason.message : "招待リンクを読み込めませんでした");
    });
  }, [config.isHost, config.initialSignal, p2p.acceptOffer]);

  useEffect(() => {
    if (!config.isHost || !linkMode || !config.shareSessionId) return;
    return subscribeAnswerRelay(config.shareSessionId, (code) => {
      if (relayedAnswerApplyingRef.current || startedRef.current) return;
      relayedAnswerApplyingRef.current = true;
      setSignalError(null);
      void p2p.acceptAnswer(code)
        .then(() => {
          clearRelayedAnswer(config.shareSessionId!);
          playSound("ui");
        })
        .catch((reason: unknown) => {
          relayedAnswerApplyingRef.current = false;
          setSignalError(reason instanceof Error ? reason.message : "返答リンクを読み込めませんでした");
        });
    });
  }, [config.isHost, config.shareSessionId, linkMode, p2p.acceptAnswer]);

  useEffect(() => {
    return onMessage((_from, data, channel) => {
      if (channel !== "reliable") return;
      const msg = parseNetMsg(data);
      if (!msg) return;
      if (msg.t === "full") return;
      if (msg.t === "ack-start") {
        startAckedRef.current = true;
        return;
      }
      if (msg.t === "start") {
        const mine = msg.blackId === selfId ? BLACK : WHITE;
        if (msg.blackId !== selfId && msg.whiteId !== selfId) return;
        send({ t: "ack-start" }, _from);
        if (startedRef.current && !overRef.current && seqRef.current > 0) return;
        startedRef.current = true;
        seqRef.current = 0;
        startAckedRef.current = true;
        opponentIdRef.current = mine === BLACK ? msg.whiteId : msg.blackId;
        setWantRematch(false);
        setOppRematch(false);
        setDisconnected(false);
        setConnFailed(false);
        setStarted(true);
        reset(mine);
        return;
      }
      if (msg.t === "move") {
        if (msg.seq !== seqRef.current + 1) return;
        seqRef.current = msg.seq;
        commitMove(msg.r, msg.c, turnRef.current);
        return;
      }
      if (msg.t === "resign") {
        const mine = game.myColorRef.current;
        if (mine) resign(mine);
        return;
      }
      if (msg.t === "rematch") setOppRematch(true);
    });
  }, [onMessage, commitMove, reset, resign, selfId, turnRef, game.myColorRef, send]);

  useEffect(() => {
    if (!config.isHost || startedRef.current || !connectedPeer || !selfId) return;
    startedRef.current = true;
    opponentIdRef.current = connectedPeer.id;
    setOppName(connectedPeer.name || "あいて");
    const iAmBlack = Math.random() < 0.5;
    const payload = {
      t: "start" as const,
      blackId: iAmBlack ? selfId : connectedPeer.id,
      whiteId: iAmBlack ? connectedPeer.id : selfId,
    };
    startPayloadRef.current = payload;
    startAckedRef.current = false;
    send(payload, connectedPeer.id);
    seqRef.current = 0;
    setStarted(true);
    reset(iAmBlack ? BLACK : WHITE);
  }, [config.isHost, connectedPeer, send, selfId, reset]);

  useEffect(() => {
    if (!config.isHost || !started || startAckedRef.current) return;
    const payload = startPayloadRef.current;
    const opp = opponentIdRef.current;
    if (!payload || !opp) return;
    const timer = window.setInterval(() => {
      if (startAckedRef.current) {
        window.clearInterval(timer);
        return;
      }
      send({ t: "start", ...payload }, opp);
    }, 700);
    return () => window.clearInterval(timer);
  }, [config.isHost, started, send]);

  useEffect(() => {
    if (connectedPeer?.name) setOppName(connectedPeer.name);
  }, [connectedPeer?.name]);

  useEffect(() => {
    if (!startedRef.current || !opponentIdRef.current) return;
    const stillConnected = p2p.peers.some(
      (peer) => peer.id === opponentIdRef.current && peer.connectionState === "connected",
    );
    if (!stillConnected) {
      const timer = window.setTimeout(() => {
        const stillNow = p2p.peers.some(
          (peer) => peer.id === opponentIdRef.current && peer.connectionState === "connected",
        );
        if (!stillNow) setDisconnected(true);
      }, 2500);
      return () => window.clearTimeout(timer);
    }
    setDisconnected(false);
  }, [p2p.peers]);

  useEffect(() => {
    if (!anyPeer || startedRef.current) return;
    if (anyPeer.connectionState === "failed") {
      setConnFailed(true);
      return;
    }
    // The guest may spend a while sending the long answer code to the host.
    // Do not start our own short timeout on that side; the browser ICE state
    // remains the authority until the host has actually consumed the answer.
    if (!config.isHost || anyPeer.connectionState !== "connecting") return;
    const timer = window.setTimeout(() => {
      if (!startedRef.current) setConnFailed(true);
    }, 30_000);
    return () => window.clearTimeout(timer);
  }, [anyPeer, config.isHost]);

  useEffect(() => {
    if (!game.over || !wantRematch || !oppRematch) return;
    if (!config.isHost || !opponentIdRef.current) return;
    const opp = opponentIdRef.current;
    const iAmBlack = game.myColor === WHITE;
    const blackId = iAmBlack ? selfId : opp;
    const whiteId = iAmBlack ? opp : selfId;
    startedRef.current = true;
    seqRef.current = 0;
    startAckedRef.current = false;
    startPayloadRef.current = { blackId, whiteId };
    setWantRematch(false);
    setOppRematch(false);
    send({ t: "start", blackId, whiteId }, opp);
    reset(iAmBlack ? BLACK : WHITE);
  }, [game.over, wantRematch, oppRematch, config.isHost, game.myColor, send, selfId, reset]);

  const onPlay = (r: number, c: number) => {
    if (game.phase !== "idle" || game.over || game.myColor === null) return;
    if (game.turn !== game.myColor || !startedRef.current) return;
    const ok = game.commitMove(r, c, game.myColor);
    if (!ok) return;
    seqRef.current += 1;
    send({ t: "move", seq: seqRef.current, r, c }, opponentIdRef.current ?? undefined);
  };

  const copyCode = async (kind: "offer" | "answer", value: string) => {
    const ok = await copyTextCompat(value);
    if (!ok) {
      setSignalError("自動コピーできませんでした。リンク／コード欄を長押し・全選択してコピーしてください。");
      return;
    }
    setCopied(kind);
    setSignalError(null);
    playSound("ui");
    window.setTimeout(() => setCopied(null), 1600);
  };

  const shareCode = async (kind: "offer" | "answer", value: string) => {
    const result = await shareTextCompat(value);
    if (result === "cancelled") return;
    if (result === "failed") {
      setSignalError("共有できませんでした。コピーしてメッセージアプリへ貼り付けてください。");
      return;
    }
    if (result === "copied") {
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 1600);
    }
    setSignalError(null);
    playSound("ui");
  };

  const applySignal = async () => {
    const raw = signalInput.trim();
    if (!raw) {
      setSignalError(
        config.isHost
          ? linkMode ? "相手から届いた返答リンクを貼り付けてください" : "相手から届いた返答コードを貼り付けてください"
          : linkMode ? "招待リンクを貼り付けてください" : "招待コードを貼り付けてください",
      );
      return;
    }
    try {
      setSignalError(null);
      const value = extractSignalCode(raw, config.isHost ? "answer" : "invite");
      if (config.isHost) {
        relayedAnswerApplyingRef.current = true;
        await p2p.acceptAnswer(value);
        if (config.shareSessionId) clearRelayedAnswer(config.shareSessionId);
      } else {
        await p2p.acceptOffer(value);
      }
      setSignalInput("");
      playSound("ui");
    } catch (reason) {
      if (config.isHost) relayedAnswerApplyingRef.current = false;
      setSignalError(reason instanceof Error ? reason.message : "接続情報を読み込めませんでした");
    }
  };

  const pasteSignal = async () => {
    const value = await readTextCompat();
    if (value) {
      setSignalInput(value);
      setSignalError(null);
      playSound("ui");
      return;
    }
    setSignalError("自動貼り付けを使えませんでした。コード欄を長押しして「貼り付け」を選んでください。");
  };

  const retryConnection = () => {
    if (config.shareSessionId) clearRelayedAnswer(config.shareSessionId);
    startedRef.current = false;
    seqRef.current = 0;
    opponentIdRef.current = null;
    startPayloadRef.current = null;
    startAckedRef.current = false;
    initialSignalHandledRef.current = false;
    relayedAnswerApplyingRef.current = false;
    setSignalInput("");
    setSignalError(null);
    setCopied(null);
    setDisconnected(false);
    setConnFailed(false);
    setWantRematch(false);
    setOppRematch(false);
    setStarted(false);
    setOppName("あいて");
    reset(null);
    p2p.restart();
    playSound("ui");
  };

  const connectionStep: 1 | 2 | 3 = config.isHost
    ? anyPeer?.connectionState === "connecting" || anyPeer?.connectionState === "connected"
      ? 3
      : p2p.offerCode
        ? 2
        : 1
    : anyPeer?.connectionState === "connecting" || anyPeer?.connectionState === "connected"
      ? 3
      : p2p.answerCode
        ? 2
        : 1;

  const iAmBlack = game.myColor === BLACK;
  const waiting = !started;
  const score = counts(game.board);
  const connectionError = signalError ?? p2p.error;

  if (waiting) {
    return (
      <div className="flex min-h-dvh flex-col overflow-x-hidden">
        <TopBar title="オンライン対戦" muted={muted} onMute={onMute} onBack={onExit} />
        <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 pb-[max(2rem,env(safe-area-inset-bottom))] sm:px-6">
          {connFailed ? (
            <div className="mx-auto mt-8 w-full max-w-lg rounded-3xl border border-line bg-ink-2 p-6 text-center shadow-board sm:p-8">
              <h2 className="font-display text-2xl">直接接続できませんでした</h2>
              <p className="mt-3 text-sm leading-7 text-mute">
                この回線では端末同士のWebRTC通信が遮断されている可能性があります。別のWi-Fi／モバイル回線で試してください。
              </p>
              <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
                <Button onClick={retryConnection}>
                  <RotateCcw className="size-4" />
                  新しくやり直す
                </Button>
                <Button variant="secondary" onClick={onExit}>メニューへ</Button>
              </div>
            </div>
          ) : (
            <div className="rise-in mx-auto mt-3 w-full max-w-xl rounded-3xl border border-line bg-ink-2 p-5 shadow-board sm:mt-8 sm:p-8">
              <div className="text-left">
                <p className="text-xs tracking-[0.18em] text-faint">P2P DIRECT MATCH</p>
                <h1 className="font-display mt-2 text-3xl">
                  {linkMode ? (config.isHost ? "対戦相手を募集しています" : "招待リンクから参加します") : (config.isHost ? "対戦を作っています" : "対戦に参加します")}
                </h1>
                <p className="mt-2 text-sm leading-6 text-mute">
                  {linkMode ? "リンクは長くて正常です。対戦データではなく接続情報が入っています。" : "コードは長くて正常です。コピーして相手と送り合ってください。"}
                </p>
              </div>

              <ConnectionProgress step={connectionStep} linkMode={linkMode} />

              {linkMode ? (
                config.isHost ? (
                  <>
                    <div className="mt-5 rounded-xl bg-ink-3 px-4 py-3 text-sm leading-7 text-mute">
                      <b className="text-paper">1.</b> 招待リンクを相手へ送る<br />
                      <b className="text-paper">2.</b> 相手が返答リンクを送り返したら、この画面を開いたまま受け取る
                    </div>
                    {p2p.preparing && !inviteLink ? (
                      <p className="shimmer mt-7 text-center text-sm font-medium">招待リンクを作っています</p>
                    ) : (
                      <ConnectionCode
                        label="① 相手へ送る招待リンク"
                        value={inviteLink}
                        copied={copied === "offer"}
                        onCopy={() => void copyCode("offer", inviteLink)}
                        onShare={() => void shareCode("offer", inviteLink)}
                      />
                    )}
                    <div className="mt-5 rounded-xl border border-line bg-ink px-4 py-3 text-sm leading-6 text-mute">
                      <p className="font-medium text-paper">返答リンクを待っています</p>
                      <p className="mt-1 text-xs leading-6">
                        相手から届いた返答リンクを同じブラウザの別タブで開けば、自動でこの画面へ返答を渡せます。
                        自動でつながらない場合だけ、下へ貼り付けてください。
                      </p>
                    </div>
                    <SignalInput
                      label="② 返答リンクを貼り付け（予備）"
                      value={signalInput}
                      onChange={setSignalInput}
                      placeholder="https://…/kuroshiro/#answer=… をここへ貼り付け"
                      onPasteRequest={() => void pasteSignal()}
                    />
                    <Button className="mt-3 w-full" disabled={p2p.preparing || !signalInput.trim()} onClick={() => void applySignal()}>
                      {p2p.preparing ? "読み込み中…" : "返答リンクを読み込んで接続"}
                    </Button>
                  </>
                ) : !p2p.answerCode ? (
                  <>
                    <div className="mt-5 rounded-xl bg-ink-3 px-4 py-3 text-sm leading-7 text-mute">
                      招待リンクを読み込み、返答リンクを作っています。通常はそのまま待つだけで大丈夫です。
                    </div>
                    {p2p.preparing || (config.initialSignal && !connectionError) ? (
                      <p className="shimmer mt-7 text-center text-sm font-medium">接続情報を作っています</p>
                    ) : (
                      <>
                        <SignalInput
                          label="招待リンク"
                          value={signalInput}
                          onChange={setSignalInput}
                          placeholder="https://…/kuroshiro/#invite=… をここへ貼り付け"
                          onPasteRequest={() => void pasteSignal()}
                        />
                        <Button className="mt-3 w-full" disabled={!signalInput.trim()} onClick={() => void applySignal()}>
                          招待リンクを読み込む
                        </Button>
                      </>
                    )}
                  </>
                ) : (
                  <>
                    <div className="mt-5 rounded-xl bg-ink-3 px-4 py-3 text-sm leading-7 text-mute">
                      返答リンクができました。下の「共有」から、招待リンクを送ってくれた相手へ返してください。
                    </div>
                    <ConnectionCode
                      label="② 相手へ送り返す返答リンク"
                      value={answerLink}
                      copied={copied === "answer"}
                      onCopy={() => void copyCode("answer", answerLink)}
                      onShare={() => void shareCode("answer", answerLink)}
                    />
                    <p className="shimmer mt-5 text-center text-sm font-medium">相手が返答を受け取るのを待っています</p>
                  </>
                )
              ) : config.isHost ? (
                <>
                  <div className="mt-5 rounded-xl bg-ink-3 px-4 py-3 text-sm leading-7 text-mute">
                    <b className="text-paper">1.</b> 下の招待コードを相手へ送る<br />
                    <b className="text-paper">2.</b> 相手から返ってきた返答コードを貼る
                  </div>
                  {p2p.preparing && !p2p.offerCode ? (
                    <p className="shimmer mt-7 text-center text-sm font-medium">接続情報を集めています</p>
                  ) : (
                    <ConnectionCode
                      label="① 相手へ送る招待コード"
                      value={p2p.offerCode}
                      copied={copied === "offer"}
                      onCopy={() => void copyCode("offer", p2p.offerCode)}
                      onShare={() => void shareCode("offer", p2p.offerCode)}
                    />
                  )}
                  <SignalInput
                    label="② 相手から届いた返答コード"
                    value={signalInput}
                    onChange={setSignalInput}
                    placeholder="KSR1. から始まる返答コードをここへ貼り付け"
                    onPasteRequest={() => void pasteSignal()}
                  />
                  <Button className="mt-3 w-full" disabled={p2p.preparing || !signalInput.trim()} onClick={() => void applySignal()}>
                    {p2p.preparing ? "読み込み中…" : "返答コードを読み込んで接続"}
                  </Button>
                </>
              ) : !p2p.answerCode ? (
                <>
                  <div className="mt-5 rounded-xl bg-ink-3 px-4 py-3 text-sm leading-7 text-mute">
                    <b className="text-paper">1.</b> 相手から届いた招待コードを貼る<br />
                    <b className="text-paper">2.</b> 作られた返答コードを相手へ送り返す
                  </div>
                  <SignalInput
                    label="① 相手から届いた招待コード"
                    value={signalInput}
                    onChange={setSignalInput}
                    placeholder="KSR1. から始まる招待コードをここへ貼り付け"
                    onPasteRequest={() => void pasteSignal()}
                  />
                  <Button className="mt-3 w-full" disabled={p2p.preparing || !signalInput.trim()} onClick={() => void applySignal()}>
                    {p2p.preparing ? "返答コードを作成中…" : "招待コードを読み込む"}
                  </Button>
                </>
              ) : (
                <>
                  <div className="mt-5 rounded-xl bg-ink-3 px-4 py-3 text-sm leading-7 text-mute">
                    返答コードができました。これを対戦を作った相手へ送り、相手が読み込むと自動で対局が始まります。
                  </div>
                  <ConnectionCode
                    label="② 相手へ送り返す返答コード"
                    value={p2p.answerCode}
                    copied={copied === "answer"}
                    onCopy={() => void copyCode("answer", p2p.answerCode)}
                    onShare={() => void shareCode("answer", p2p.answerCode)}
                  />
                  <p className="shimmer mt-5 text-center text-sm font-medium">相手の読み込みを待っています</p>
                </>
              )}

              {connectionError ? <p role="alert" className="mt-4 text-sm leading-6 text-danger">{connectionError}</p> : null}
              {anyPeer?.connectionState === "connecting" ? (
                <p className="shimmer mt-5 text-center text-sm font-medium">端末どうしを直接接続しています</p>
              ) : null}
              {anyPeer?.connectionState === "connected" ? (
                <p className="mt-5 text-center text-sm font-medium text-good">通信チャンネル接続完了。対局を開始します</p>
              ) : null}
              <p className="mt-5 border-t border-line pt-4 text-xs leading-6 text-faint">
                対戦内容を保存する外部ゲームサーバーは使いません。接続成立後の対局通信はブラウザ同士で直接行われます。
                {linkMode ? "招待・返答リンク" : "接続コード"}には通信経路情報が含まれるため、対戦相手以外には公開しないでください。
              </p>
            </div>
          )}
        </main>
      </div>
    );
  }

  let overlay: ReactNode = null;
  if (connFailed) {
    overlay = (
      <Overlay>
        <h2 className="font-display text-2xl">直接接続できませんでした</h2>
        <p className="mt-2 text-sm leading-6 text-mute">
          この回線では端末同士のWebRTC通信が遮断されている可能性があります。別のWi-Fi／モバイル回線で試してください。
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <Button onClick={retryConnection}>
            <RotateCcw className="size-4" />
            新しくやり直す
          </Button>
          <Button variant="secondary" onClick={onExit}>メニューへ</Button>
        </div>
      </Overlay>
    );
  } else if (disconnected && started) {
    overlay = (
      <Overlay>
        <h2 className="font-display text-2xl">切断しました</h2>
        <p className="mt-2 text-sm leading-6 text-mute">相手との直接通信が切れました。新しい接続情報を作って対局を最初からやり直せます。</p>
        <div className="mt-5 flex flex-col gap-2">
          <Button onClick={retryConnection}>
            <RotateCcw className="size-4" />
            接続をやり直す
          </Button>
          <Button variant="secondary" onClick={onExit}>メニューへ</Button>
        </div>
      </Overlay>
    );
  } else if (game.over) {
    overlay = (
      <Overlay>
        <p className="text-xs tracking-[0.2em] text-faint">対局終了</p>
        <h2 className="font-display mt-2 text-3xl font-medium tracking-tight">{resultCopy(game.winner, game.myColor)}</h2>
        <p className="mt-2 tabular-nums text-mute">黒 {score.black} — 白 {score.white}</p>
        {wantRematch && !oppRematch ? <p className="mt-3 text-sm text-mute">再戦を待っています</p> : null}
        {oppRematch && !wantRematch ? <p className="mt-3 text-sm text-mute">相手が再戦を希望しています</p> : null}
        <div className="mt-5 flex flex-col gap-2">
          <Button
            onClick={() => {
              playSound("ui");
              setWantRematch(true);
              send({ t: "rematch" }, opponentIdRef.current ?? undefined);
            }}
            disabled={wantRematch}
          >
            もう一度
          </Button>
          <Button variant="secondary" onClick={onExit}>メニューへ</Button>
        </div>
      </Overlay>
    );
  }

  return (
    <Table
      board={game.board}
      turn={game.turn}
      myColor={game.myColor}
      lastMove={game.lastMove}
      flipped={game.flipped}
      hinted={null}
      disabled={game.phase !== "idle" || game.over || game.myColor === null || waiting}
      onPlay={onPlay}
      animReady={game.animReady}
      blackName={game.myColor === null ? "黒" : iAmBlack ? config.playerName : oppName}
      whiteName={game.myColor === null ? "白" : iAmBlack ? oppName : config.playerName}
      status={game.over ? "対局終了" : waiting ? "接続待ち" : game.turn === game.myColor ? "あなたの番" : "あいての番"}
      passNotice={game.passNotice}
      thinking={false}
      header={<TopBar title="オンライン対戦" muted={muted} onMute={onMute} onBack={onExit} />}
      footer={
        <div className="flex justify-center">
          <Button
            variant="danger"
            size="sm"
            disabled={game.over || waiting || game.myColor === null}
            onClick={() => {
              send({ t: "resign" }, opponentIdRef.current ?? undefined);
              if (game.myColor) resign(game.myColor === BLACK ? WHITE : BLACK);
            }}
          >
            <Flag className="size-4" />
            投了
          </Button>
        </div>
      }
      overlay={overlay}
    />
  );
}

