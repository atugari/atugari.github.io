import { useEffect, useState, type ReactNode } from "react";
import { Bot, ChevronRight, KeyRound, Radio, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PlayScreen, type PlayConfig } from "@/components/play-screen";
import { DIFFICULTY_LABEL, type Difficulty } from "@/lib/reversi/ai";
import { playSound, setMuted, unlockAudio } from "@/lib/reversi/audio";
import { BLACK, WHITE, type Color } from "@/lib/reversi/engine";
import { cn } from "@/lib/utils";

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
  const [name, setName] = useState("");
  const [soundOn, setSoundOn] = useState(true);
  const [screen, setScreen] = useState<Screen>({ id: "home" });

  useEffect(() => {
    setName(storageGet(NAME_KEY) ?? "");
    setSoundOn(storageGet(SOUND_KEY) !== "0");
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
        onHost={() => {
          playSound("ui");
          setScreen({ id: "play", config: { mode: "online", playerName, isHost: true } });
        }}
        onJoin={() => {
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
          desc="長い接続コードを共有して、端末どうしで直接対戦"
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

function RoomSetup({
  playerName,
  onBack,
  onHost,
  onJoin,
}: {
  playerName: string;
  onBack: () => void;
  onHost: () => void;
  onJoin: () => void;
}) {
  const webrtcAvailable = typeof window !== "undefined" && "RTCPeerConnection" in window;
  return (
    <Shell>
      <Button variant="ghost" size="sm" className="self-start px-0" onClick={onBack}>
        戻る
      </Button>
      <div className="rise-in mt-6">
        <div className="inline-flex items-center gap-2 rounded-full border border-line bg-ink-2 px-3 py-1.5 text-xs text-stone shadow-sm">
          <KeyRound className="size-3.5" />
          サーバー不要の直接通信
        </div>
        <h1 className="font-display mt-4 text-3xl font-medium">オンライン対戦</h1>
        <p className="mt-2 text-sm text-mute">{playerName}として対局します</p>
      </div>

      <div className="mt-8 rounded-2xl border border-line bg-ink-2 p-4 shadow-sm">
        <p className="text-sm font-medium text-paper">接続方法</p>
        <p className="mt-2 text-sm leading-7 text-mute">
          作る側が長い「招待コード」を相手へ送り、参加側が長い「返答コード」を送り返します。
          接続後はブラウザ同士で直接通信するので、GitHub Pagesに対戦サーバーは必要ありません。
        </p>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={onHost}
          disabled={!webrtcAvailable}
          className="mode-card rounded-2xl disabled:cursor-not-allowed disabled:opacity-45 border border-line bg-ink-2 p-5 text-left shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0"
        >
          <span className="grid size-11 place-items-center rounded-xl bg-ink-3 text-stone">
            <Radio className="size-5" />
          </span>
          <span className="mt-4 block font-medium text-paper">対戦を作る</span>
          <span className="mt-1 block text-xs leading-5 text-mute">招待コードを作って相手に送ります</span>
        </button>
        <button
          type="button"
          onClick={onJoin}
          disabled={!webrtcAvailable}
          className="mode-card rounded-2xl disabled:cursor-not-allowed disabled:opacity-45 border border-line bg-ink-2 p-5 text-left shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0"
        >
          <span className="grid size-11 place-items-center rounded-xl bg-ink-3 text-stone">
            <KeyRound className="size-5" />
          </span>
          <span className="mt-4 block font-medium text-paper">対戦に参加</span>
          <span className="mt-1 block text-xs leading-5 text-mute">相手から届いた招待コードを貼ります</span>
        </button>
      </div>

      {!webrtcAvailable ? (
        <p role="alert" className="mt-5 rounded-xl border border-danger/20 bg-danger/5 px-3 py-2.5 text-sm leading-6 text-danger">
          このブラウザではWebRTCを利用できません。Safari / Chrome / Firefox / Edgeの最新版で開いてください。
        </p>
      ) : null}

      <p className="mt-6 text-xs leading-5 text-faint">
        ※ 普通の家庭回線・モバイル回線では直接つながることが多いですが、会社・学校など通信制限の強い回線では接続できない場合があります。
      </p>
    </Shell>
  );
}
