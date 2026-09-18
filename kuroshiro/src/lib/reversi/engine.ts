export const SIZE = 8;
export const EMPTY = 0;
export const BLACK = 1;
export const WHITE = -1;

export type Color = typeof BLACK | typeof WHITE;
export type Cell = typeof EMPTY | Color;

export interface ReversiMove {
  r: number;
  c: number;
  i: number;
  flipped: number[];
}

const DR = [-1, -1, -1, 0, 0, 1, 1, 1];
const DC = [-1, 0, 1, -1, 1, -1, 0, 1];

export function opponent(color: Color): Color {
  return color === BLACK ? WHITE : BLACK;
}

export function idx(r: number, c: number): number {
  return r * SIZE + c;
}

export function inBounds(r: number, c: number): boolean {
  return r >= 0 && r < SIZE && c >= 0 && c < SIZE;
}

export function initialBoard(): number[] {
  const board = Array<number>(SIZE * SIZE).fill(EMPTY);
  board[idx(3, 3)] = WHITE;
  board[idx(3, 4)] = BLACK;
  board[idx(4, 3)] = BLACK;
  board[idx(4, 4)] = WHITE;
  return board;
}

export function colorLabel(color: Color): string {
  return color === BLACK ? "黒" : "白";
}

function flipsInDir(board: ArrayLike<number>, r: number, c: number, player: Color, dr: number, dc: number): number[] {
  const other = opponent(player);
  const acc: number[] = [];
  let nr = r + dr;
  let nc = c + dc;
  while (inBounds(nr, nc) && board[idx(nr, nc)] === other) {
    acc.push(idx(nr, nc));
    nr += dr;
    nc += dc;
  }
  if (acc.length === 0) return [];
  if (!inBounds(nr, nc) || board[idx(nr, nc)] !== player) return [];
  return acc;
}

export function collectFlips(board: ArrayLike<number>, r: number, c: number, player: Color): number[] {
  if (!inBounds(r, c) || board[idx(r, c)] !== EMPTY) return [];
  const flipped: number[] = [];
  for (let d = 0; d < 8; d++) {
    const part = flipsInDir(board, r, c, player, DR[d], DC[d]);
    if (part.length) flipped.push(...part);
  }
  return flipped;
}

export function legalMoves(board: ArrayLike<number>, player: Color): ReversiMove[] {
  const moves: ReversiMove[] = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const i = idx(r, c);
      if (board[i] !== EMPTY) continue;
      const flipped = collectFlips(board, r, c, player);
      if (flipped.length > 0) moves.push({ r, c, i, flipped });
    }
  }
  return moves;
}

export function hasAnyMove(board: ArrayLike<number>, player: Color): boolean {
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (board[idx(r, c)] !== EMPTY) continue;
      if (collectFlips(board, r, c, player).length > 0) return true;
    }
  }
  return false;
}

export function applyMove(
  board: number[],
  r: number,
  c: number,
  player: Color,
): { board: number[]; flipped: number[]; i: number } | null {
  const flipped = collectFlips(board, r, c, player);
  if (flipped.length === 0) return null;
  const next = board.slice();
  const i = idx(r, c);
  next[i] = player;
  for (const f of flipped) next[f] = player;
  return { board: next, flipped, i };
}

export function counts(board: ArrayLike<number>): { black: number; white: number; empty: number } {
  let black = 0;
  let white = 0;
  let empty = 0;
  for (let i = 0; i < board.length; i++) {
    if (board[i] === BLACK) black++;
    else if (board[i] === WHITE) white++;
    else empty++;
  }
  return { black, white, empty };
}

export function isGameOver(board: ArrayLike<number>): boolean {
  return !hasAnyMove(board, BLACK) && !hasAnyMove(board, WHITE);
}

/** Positive = black wins, negative = white, 0 = draw. Null if not over. */
export function outcome(board: ArrayLike<number>): Color | 0 | null {
  if (!isGameOver(board)) return null;
  const { black, white } = counts(board);
  if (black > white) return BLACK;
  if (white > black) return WHITE;
  return 0;
}

export function resolveAfterMove(
  board: number[],
  mover: Color,
): { turn: Color; over: boolean; passed: Color | null } {
  const next = opponent(mover);
  if (hasAnyMove(board, next)) return { turn: next, over: false, passed: null };
  if (hasAnyMove(board, mover)) return { turn: mover, over: false, passed: next };
  return { turn: next, over: true, passed: null };
}

export function assertEngine(): void {
  const board = initialBoard();
  const opening = legalMoves(board, BLACK);
  if (opening.length !== 4) {
    throw new Error(`expected 4 opening moves, got ${opening.length}`);
  }
  const keys = opening
    .map((m) => `${m.r},${m.c}`)
    .sort()
    .join("|");
  if (keys !== "2,3|3,2|4,5|5,4") {
    throw new Error(`unexpected opening moves: ${keys}`);
  }
  const played = applyMove(board, 2, 3, BLACK);
  if (!played) throw new Error("d3 should be legal for black");
  if (played.board[idx(3, 3)] !== BLACK) throw new Error("d4 should flip to black");
  if (played.flipped.length !== 1 || played.flipped[0] !== idx(3, 3)) {
    throw new Error("d3 should flip exactly d4");
  }
  const after = legalMoves(played.board, WHITE);
  if (after.length === 0) throw new Error("white should have replies");
}
