import { useEffect, useRef, useState, type ReactNode } from "react";
import { Bot, ChevronRight, KeyRound, Link2, Radio, Share2, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PlayScreen, type PlayConfig } from "@/components/play-screen";
import { DIFFICULTY_LABEL, type Difficulty } from "@/lib/reversi/ai";
import { playSound, setMuted, unlockAudio } from "@/lib/reversi/audio";
import { BLACK, WHITE, type Color } from "@/lib/reversi/engine";
import { cn } from "@/lib/utils";
import { buildShareLink, makeShareSessionId, parseShareSignal, publishAnswerRelay } from "@/lib/multiplayer/share-link";

const NAME_KEY = "kuroshiro-name";
const SOUND_KEY = "kuroshiro-sound";

function storageGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Some in-app/private browsing modes block storage. The game still works
    // for the current session, so persistence is intentionally best-effort.
  }
}

type Screen =
  | { id: "home" }
  | { id: "ai-setup" }
  | { id: "room-setup" }
  | { id: "answer-relay"; sessionId: string; answerCode: string }
  | { id: "play"; config: PlayConfig };

function BrandMark() {
  return (
    <div className="mx-auto grid size-16 grid-cols-2 gap-1 rounded-lg bg-felt p-1.5" aria-hidden>
      <span className="brand-disc white" />
      <span className="brand-disc black" />
      <span className="brand-disc black" />
      <span className="brand-disc white" />
    </div>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell mx-auto flex min-h-dvh w-full max-w-xl flex-col px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-6 sm:pt-10">{children}</div>
  );
}

export function GameApp() {
  const [name, setName] = useState(() => storageGet(NAME_KEY) ?? "");
  const [soundOn, setSoundOn] = useState(() => storageGet(SOUND_KEY) !== "0");
  const [screen, setScreen] = useState<Screen>({ id: "home" });
  const shareLinkHandled = useRef(false);

  useEffect(() => {
    if (shareLinkHandled.current) return;
    const incoming = parseShareSignal(window.location.href);
    if (!incoming) return;
    shareLinkHandled.current = true;
    const currentName = ((storageGet(NAME_KEY) ?? "").trim() || "ゲスト").slice(0, 12);
    // Remove the signaling payload from the address bar after reading it. The
    // live RTCPeerConnection remains in memory; this only keeps accidental
    // re-sharing/history screenshots cleaner.
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    if (incoming.kind === "invite") {
      setScreen({
        id: "play",
        config: {
          mode: "online",
          playerName: currentName,
          isHost: false,
          linkMode: true,
          shareSessionId: incoming.sessionId,
          initialSignal: incoming.code,
        },
      });
      return;
    }
    setScreen({ id: "answer-relay", sessionId: incoming.sessionId, answerCode: incoming.code });
  }, []);

  useEffect(() => {
    setMuted(!soundOn);
  }, [soundOn]);

  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    const onVis = () => {
      if (document.visibilityState === "visible") unlockAudio();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  const playerName = (name.trim() || "ゲスト").slice(0, 12);

  const goHome = () => {
    playSound("ui");
    setScreen({ id: "home" });
  };

  if (screen.id === "answer-relay") {
    return <AnswerRelay sessionId={screen.sessionId} answerCode={screen.answerCode} onBack={goHome} />;
  }
  if (screen.id === "play") {
    return <PlayScreen config={screen.config} onExit={goHome} soundOn={soundOn} />;
  }
  if (screen.id === "ai-setup") {
    return (
      <AiSetup
        playerName={playerName}
        onBack={goHome}
        onStart={(difficulty, myColor) => {
          playSound("ui");
          setScreen({ id: "play", config: { mode: "ai", difficulty, myColor, playerName } });
        }}
      />
    );
  }
  if (screen.id === "room-setup") {
    return (
      <RoomSetup
        playerName={playerName}
        onBack={goHome}
        onLinkHost={() => {
          playSound("ui");
          setScreen({
            id: "play",
            config: {
              mode: "online",
              playerName,
              isHost: true,
              linkMode: true,
              shareSessionId: makeShareSessionId(),
            },
          });
        }}
        onManualHost={() => {
          playSound("ui");
          setScreen({ id: "play", config: { mode: "online", playerName, isHost: true } });
        }}
        onManualJoin={() => {
          playSound("ui");
          setScreen({ id: "play", config: { mode: "online", playerName, isHost: false } });
        }}
      />
    );
  }

  return (
    <Shell>
      <div className="flex items-center justify-between">
        <p className="text-xs tracking-[0.28em] text-faint">KUROSHIRO</p>
        <Button
          variant="ghost"
          size="sm"
          className="px-2"
          aria-label={soundOn ? "音声をオフ" : "音声をオン"}
          onClick={() => {
            const next = !soundOn;
            setSoundOn(next);
            storageSet(SOUND_KEY, next ? "1" : "0");
            setMuted(!next);
            if (next) {
              unlockAudio();
              playSound("ui");
            }
          }}
        >
          {soundOn ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
        </Button>
      </div>

      <div className="rise-in mt-10 text-center">
        <BrandMark />
        <h1 className="font-display mt-6 text-5xl font-medium tracking-tight">黒白</h1>
        <p className="mt-2 text-sm text-mute">リバーシ</p>
      </div>

      <label className="mt-10 block text-xs text-faint">なまえ</label>
      <Input
        className="mt-2"
        value={name}
        maxLength={12}
        placeholder="ゲスト"
        onChange={(e) => {
          setName(e.target.value);
          storageSet(NAME_KEY, e.target.value);
        }}
      />

      <div className="mt-6 flex flex-col gap-3">
        <ModeButton
          icon={<Bot className="size-5" />}
          title="対 AI"
          desc="ひとりで、三段階の強さ"
          onClick={() => {
            playSound("ui");
            setScreen({ id: "ai-setup" });
          }}
        />
        <ModeButton
          icon={<Radio className="size-5" />}
          title="オンライン対戦"
          desc="募集リンクを送って、端末どうしで直接対戦"
          onClick={() => {
            playSound("ui");
            setScreen({ id: "room-setup" });
          }}
        />
      </div>

      <Rules />
    </Shell>
  );
}

function ModeButton({
  icon,
  title,
  desc,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mode-card flex min-h-18 items-center gap-4 rounded-2xl border border-line bg-ink-2 px-4 py-3.5 text-left shadow-sm transition duration-200 hover:-translate-y-0.5 hover:bg-ink-3 hover:shadow-md active:translate-y-0"
    >
      <span className="mode-icon grid size-11 shrink-0 place-items-center rounded-xl bg-ink-3 text-stone">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium text-paper">{title}</span>
        <span className="block text-xs text-mute">{desc}</span>
      </span>
      <ChevronRight className="size-4 text-faint" />
    </button>
  );
}

function Rules() {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-8">
      <button
        type="button"
        className="text-xs text-faint underline-offset-4 hover:text-mute hover:underline"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? "ルールを閉じる" : "ルール"}
      </button>
      {open ? (
        <ul className="mt-3 space-y-2 text-sm text-mute">
          <li>黒が先手。石を置いて相手を挟むと、挟んだ石が自分の色に返る。</li>
          <li>縦・横・斜めの八方向に挟める。置ける場所がなければパス。</li>
          <li>双方置けなくなると終局。枚数が多いほうが勝ち。</li>
        </ul>
      ) : null}
    </div>
  );
}

function AiSetup({
  playerName,
  onBack,
  onStart,
}: {
  playerName: string;
  onBack: () => void;
  onStart: (d: Difficulty, color: Color) => void;
}) {
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const [colorPref, setColorPref] = useState<"black" | "white" | "random">("random");

  return (
    <Shell>
      <Button variant="ghost" size="sm" className="self-start px-0" onClick={onBack}>
        戻る
      </Button>
      <h1 className="font-display mt-6 text-3xl font-medium">対 AI</h1>
      <p className="mt-2 text-sm text-mute">{playerName}として対局します</p>

      <p className="mt-8 text-xs text-faint">難易度</p>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {(["easy", "normal", "hard"] as const).map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDifficulty(d)}
            className={cn(
              "h-12 rounded-lg border text-sm transition-colors duration-150",
              difficulty === d ? "border-stone/40 bg-stone text-ink" : "border-line bg-ink-2 text-paper",
            )}
          >
            {DIFFICULTY_LABEL[d]}
          </button>
        ))}
      </div>

      <p className="mt-6 text-xs text-faint">手番</p>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {(
          [
            ["black", "先手 黒"],
            ["white", "後手 白"],
            ["random", "おまかせ"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setColorPref(key)}
            className={cn(
              "h-12 rounded-lg border text-sm transition-colors duration-150",
              colorPref === key ? "border-stone/40 bg-stone text-ink" : "border-line bg-ink-2 text-paper",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <Button
        className="mt-10"
        size="lg"
        onClick={() => {
          const color =
            colorPref === "black" ? BLACK : colorPref === "white" ? WHITE : Math.random() < 0.5 ? BLACK : WHITE;
          onStart(difficulty, color);
        }}
      >
        対局開始
      </Button>
    </Shell>
  );
}

async function copyCompat(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Fall back to execCommand below.
  }
  try {
    const area = document.createElement("textarea");
    area.value = value;
    area.readOnly = true;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

function AnswerRelay({
  sessionId,
  answerCode,
  onBack,
}: {
  sessionId: string;
  answerCode: string;
  onBack: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const answerLink = buildShareLink("answer", answerCode, sessionId);

  useEffect(() => {
    // If the original host tab is still open in this browser, this delivers
    // the answer automatically through BroadcastChannel/localStorage.
    publishAnswerRelay(sessionId, answerCode);
    const timer = window.setInterval(() => publishAnswerRelay(sessionId, answerCode), 1200);
    return () => window.clearInterval(timer);
  }, [sessionId, answerCode]);

  return (
    <Shell>
      <div className="rise-in mt-10 rounded-3xl border border-line bg-ink-2 p-6 text-center shadow-board sm:p-8">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-ink-3 text-stone">
          <Share2 className="size-6" />
        </span>
        <p className="mt-5 text-xs tracking-[0.18em] text-faint">RETURN LINK</p>
        <h1 className="font-display mt-2 text-3xl font-medium">返答を送りました</h1>
        <p className="mt-3 text-sm leading-7 text-mute">
          元の対戦画面がこのブラウザの別タブで開いたままなら、自動で返答を渡します。元の「黒白」の対戦画面へ戻ってください。
        </p>
        <div className="mt-5 rounded-xl bg-ink-3 px-4 py-3 text-left text-xs leading-6 text-mute">
          自動でつながらない場合は、この返答リンクをコピーして、元の対戦画面の「返答リンクを貼り付け」に貼ってください。
        </div>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button
            onClick={async () => {
              const ok = await copyCompat(answerLink);
              setCopied(ok);
              if (ok) playSound("ui");
            }}
          >
            {copied ? "コピーしました" : "返答リンクをコピー"}
          </Button>
          <Button variant="secondary" onClick={onBack}>ゲームを開く</Button>
        </div>
      </div>
    </Shell>
  );
}

function RoomSetup({
  playerName,
  onBack,
  onLinkHost,
  onManualHost,
  onManualJoin,
}: {
  playerName: string;
  onBack: () => void;
  onLinkHost: () => void;
  onManualHost: () => void;
  onManualJoin: () => void;
}) {
  const [manualOpen, setManualOpen] = useState(false);
  const webrtcAvailable = typeof window !== "undefined" && "RTCPeerConnection" in window;
  return (
    <Shell>
      <Button variant="ghost" size="sm" className="self-start px-0" onClick={onBack}>
        戻る
      </Button>
      <div className="rise-in mt-6">
        <div className="inline-flex items-center gap-2 rounded-full border border-line bg-ink-2 px-3 py-1.5 text-xs text-stone shadow-sm">
          <Link2 className="size-3.5" />
          GitHub Pagesだけで対戦
        </div>
        <h1 className="font-display mt-4 text-3xl font-medium">オンライン対戦</h1>
        <p className="mt-2 text-sm text-mute">{playerName}として対局します</p>
      </div>

      <button
        type="button"
        onClick={onLinkHost}
        disabled={!webrtcAvailable}
        className="mode-card mt-8 rounded-3xl border border-stone/25 bg-ink-2 p-5 text-left shadow-board transition duration-200 hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-45 sm:p-6"
      >
        <span className="grid size-12 place-items-center rounded-2xl bg-stone text-ink">
          <Share2 className="size-5" />
        </span>
        <span className="mt-4 block text-lg font-medium text-paper">対戦を募集する</span>
        <span className="mt-1 block text-sm leading-6 text-mute">
          招待リンクを作ります。相手はリンクを開くだけで参加できます。
        </span>
        <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-stone">
          いちばん簡単 <ChevronRight className="size-3.5" />
        </span>
      </button>

      <div className="mt-4 rounded-2xl border border-line bg-ink-2 p-4 text-sm leading-7 text-mute">
        <p className="font-medium text-paper">参加する人は操作不要</p>
        <p className="mt-1">届いた招待リンクを開くと、自動で参加画面になります。返答リンクを作成したら相手へ送り返します。</p>
      </div>

      <button
        type="button"
        className="mt-6 self-start text-xs text-faint underline-offset-4 hover:text-mute hover:underline"
        onClick={() => setManualOpen((value) => !value)}
      >
        {manualOpen ? "手動接続を閉じる" : "うまくいかない時の手動接続"}
      </button>

      {manualOpen ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={onManualHost}
            disabled={!webrtcAvailable}
            className="mode-card rounded-2xl border border-line bg-ink-2 p-4 text-left shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <span className="grid size-10 place-items-center rounded-xl bg-ink-3 text-stone"><Radio className="size-4" /></span>
            <span className="mt-3 block font-medium text-paper">コードを作る</span>
            <span className="mt-1 block text-xs leading-5 text-mute">従来の長いコード方式</span>
          </button>
          <button
            type="button"
            onClick={onManualJoin}
            disabled={!webrtcAvailable}
            className="mode-card rounded-2xl border border-line bg-ink-2 p-4 text-left shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <span className="grid size-10 place-items-center rounded-xl bg-ink-3 text-stone"><KeyRound className="size-4" /></span>
            <span className="mt-3 block font-medium text-paper">コードで参加</span>
            <span className="mt-1 block text-xs leading-5 text-mute">相手の招待コードを貼る</span>
          </button>
        </div>
      ) : null}

      {!webrtcAvailable ? (
        <p role="alert" className="mt-5 rounded-xl border border-danger/20 bg-danger/5 px-3 py-2.5 text-sm leading-6 text-danger">
          このブラウザではWebRTCを利用できません。Safari / Chrome / Firefox / Edgeの最新版で開いてください。
        </p>
      ) : null}

      <p className="mt-6 text-xs leading-5 text-faint">
        ※ 対戦サーバーは使いません。接続後は端末同士の直接通信です。会社・学校など通信制限の強い回線では接続できない場合があります。
      </p>
    </Shell>
  );
}
