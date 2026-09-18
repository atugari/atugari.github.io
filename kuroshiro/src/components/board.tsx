import { useMemo, useState } from "react";
import { BLACK, EMPTY, idx, type Color, type ReversiMove } from "@/lib/reversi/engine";
import { cn } from "@/lib/utils";

function chebyshev(a: number, b: number): number {
  const ar = Math.floor(a / 8);
  const ac = a % 8;
  const br = Math.floor(b / 8);
  const bc = b % 8;
  return Math.max(Math.abs(ar - br), Math.abs(ac - bc));
}

interface BoardProps {
  board: number[];
  legal: ReversiMove[];
  lastMove: { r: number; c: number } | null;
  flipped: number[];
  hinted: number | null;
  disabled: boolean;
  turn: Color;
  animReady: boolean;
  onPlay: (r: number, c: number) => void;
}

export function Board({
  board,
  legal,
  lastMove,
  flipped,
  hinted,
  disabled,
  turn,
  animReady,
  onPlay,
}: BoardProps) {
  const legalMap = useMemo(() => new Map(legal.map((m) => [m.i, m])), [legal]);
  const flippedSet = useMemo(() => new Set(flipped), [flipped]);
  const lastIndex = lastMove ? idx(lastMove.r, lastMove.c) : null;
  const [preview, setPreview] = useState<Set<number> | null>(null);
  const hoverOk = typeof window !== "undefined" && window.matchMedia("(hover: hover)").matches;

  return (
    <div className="board-frame w-full">
      <div className="board-felt" role="grid" aria-label="リバーシ盤">
        {board.map((cell, i) => {
          const r = Math.floor(i / 8);
          const c = i % 8;
          const move = legalMap.get(i);
          const isLegal = Boolean(move) && !disabled;
          const delay =
            animReady && lastIndex !== null && flippedSet.has(i) ? chebyshev(i, lastIndex) * 45 : 0;
          const showPreview = preview?.has(i) && cell !== EMPTY;

          return (
            <button
              key={i}
              type="button"
              role="gridcell"
              disabled={disabled || !move}
              aria-label={`${r + 1}段 ${c + 1}列${cell === EMPTY ? "" : cell === BLACK ? " 黒" : " 白"}`}
              className={cn(
                "board-cell",
                isLegal && "is-legal",
                lastIndex === i && "is-last",
                hinted === i && "is-hint",
              )}
              onClick={() => onPlay(r, c)}
              onPointerEnter={() => {
                if (!hoverOk || !move) return;
                setPreview(new Set(move.flipped));
              }}
              onPointerLeave={() => setPreview(null)}
            >
              {cell !== EMPTY ? (
                <div
                  className={cn(
                    "disc-scene",
                    animReady && lastIndex === i && "is-placed",
                    showPreview && "is-preview",
                  )}
                >
                  <div
                    className={cn("disc-inner", cell !== BLACK && "is-white", !animReady && "duration-0")}
                    style={{ transitionDelay: `${delay}ms` }}
                  >
                    <span className="disc-face disc-black" />
                    <span className="disc-face disc-white" />
                  </div>
                </div>
              ) : isLegal ? (
                <span className={cn("legal-dot", turn === BLACK && "is-black")} />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
