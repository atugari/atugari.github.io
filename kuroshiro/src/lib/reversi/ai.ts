import {
  applyMove,
  BLACK,
  counts,
  EMPTY,
  hasAnyMove,
  isGameOver,
  legalMoves,
  opponent,
  type Color,
} from "./engine";

export type Difficulty = "easy" | "normal" | "hard";

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: "やさしい",
  normal: "ふつう",
  hard: "強い",
};

const WEIGHTS = [
  120, -20, 20, 5, 5, 20, -20, 120, -20, -40, -5, -5, -5, -5, -40, -20, 20, -5, 15, 3, 3, 15, -5, 20, 5, -5, 3, 3, 3, 3, -5, 5, 5, -5, 3, 3, 3, 3, -5, 5, 20, -5, 15, 3, 3, 15, -5, 20, -20, -40, -5, -5, -5, -5, -40, -20, 120, -20, 20, 5, 5, 20, -20, 120,
];

const CORNERS = [0, 7, 56, 63];
const X_SQUARES = [9, 14, 49, 54];

function positionalWeight(board: ArrayLike<number>, i: number): number {
  let w = WEIGHTS[i] ?? 0;
  if (X_SQUARES.includes(i)) {
    const corner = CORNERS[X_SQUARES.indexOf(i)];
    if (corner !== undefined && board[corner] !== EMPTY) w = 8;
  }
  return w;
}

function evaluate(board: number[], player: Color): number {
  if (isGameOver(board)) {
    const { black, white } = counts(board);
    const my = player === BLACK ? black : white;
    const opp = player === BLACK ? white : black;
    if (my > opp) return 10_000 + (my - opp);
    if (my < opp) return -10_000 - (opp - my);
    return 0;
  }

  let pos = 0;
  let my = 0;
  let opp = 0;
  let empty = 0;
  for (let i = 0; i < 64; i++) {
    const v = board[i];
    if (v === EMPTY) {
      empty++;
      continue;
    }
    const w = positionalWeight(board, i);
    if (v === player) {
      pos += w;
      my++;
    } else {
      pos -= w;
      opp++;
    }
  }

  const mobility = moveCount(board, player) - moveCount(board, opponent(player));

  if (empty > 44) return pos * 2 + mobility * 14;
  if (empty > 12) return pos * 3 + mobility * 8 + (my - opp);
  return pos + (my - opp) * 12 + mobility * 3;
}

function moveCount(board: number[], player: Color): number {
  return legalMoves(board, player).length;
}

function negamax(board: number[], player: Color, depth: number, alpha: number, beta: number): number {
  if (depth === 0 || isGameOver(board)) return evaluate(board, player);

  const moves = legalMoves(board, player);
  if (moves.length === 0) {
    const opp = opponent(player);
    if (!hasAnyMove(board, opp)) return evaluate(board, player);
    return -negamax(board, opp, depth - 1, -beta, -alpha);
  }

  moves.sort((a, b) => (WEIGHTS[b.i] ?? 0) - (WEIGHTS[a.i] ?? 0));

  let best = -Infinity;
  for (const move of moves) {
    const next = applyMove(board, move.r, move.c, player);
    if (!next) continue;
    const score = -negamax(next.board, opponent(player), depth - 1, -beta, -alpha);
    if (score > best) best = score;
    if (score > alpha) alpha = score;
    if (alpha >= beta) break;
  }
  return best;
}

function searchBest(board: number[], player: Color, depth: number): { r: number; c: number } | null {
  const moves = legalMoves(board, player);
  if (moves.length === 0) return null;
  moves.sort((a, b) => (WEIGHTS[b.i] ?? 0) - (WEIGHTS[a.i] ?? 0));

  let bestMove = moves[0]!;
  let bestScore = -Infinity;
  let alpha = -Infinity;
  const beta = Infinity;

  for (const move of moves) {
    const next = applyMove(board, move.r, move.c, player);
    if (!next) continue;
    const score = -negamax(next.board, opponent(player), depth - 1, -beta, -alpha);
    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
    if (score > alpha) alpha = score;
  }
  return { r: bestMove.r, c: bestMove.c };
}

export function chooseMove(board: number[], player: Color, difficulty: Difficulty): { r: number; c: number } | null {
  const moves = legalMoves(board, player);
  if (moves.length === 0) return null;

  if (difficulty === "easy") {
    if (Math.random() < 0.4) {
      return moves[Math.floor(Math.random() * moves.length)]!;
    }
    return searchBest(board, player, 1);
  }

  if (difficulty === "normal") return searchBest(board, player, 3);

  const empty = counts(board).empty;
  const depth = empty <= 10 ? empty + 1 : 5;
  return searchBest(board, player, Math.min(depth, 6));
}

export async function chooseMoveAsync(
  board: number[],
  player: Color,
  difficulty: Difficulty,
): Promise<{ r: number; c: number } | null> {
  if (difficulty !== "hard") {
    return chooseMove(board, player, difficulty);
  }

  const moves = legalMoves(board, player);
  if (moves.length === 0) return null;

  const start = performance.now();
  const empty = counts(board).empty;
  let best = searchBest(board, player, 2);
  const cap = empty <= 12 ? 8 : 6;

  for (let depth = 3; depth <= cap; depth++) {
    if (performance.now() - start > 850) break;
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const found = searchBest(board, player, depth);
    if (found) best = found;
    if (empty <= depth) break;
  }
  return best;
}
