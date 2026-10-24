import { dailySummary, japanDay, smallDailyFrom } from './daily-plan.js';

export const scoring = Object.freeze({
  basePoints: [1000, 2000, 3000],
  maxBonusRatio: 0.5,
  referenceMsPerCell: 5000,
  formula: 'base + floor(base * 0.5 * referenceMs / (referenceMs + elapsedMs))',
});

// The bonus is at most half the difficulty's base points. Board size scales
// its reference time, so a 16x16 board is not judged against a 6x6 clock.
export function dailyScore(level, n, elapsed) {
  if (![1, 2, 3].includes(level) || !Number.isInteger(n) || n < 1 || !Number.isSafeInteger(elapsed) || elapsed < 5000) return 0;
  const base = scoring.basePoints[level - 1], reference = n * n * scoring.referenceMsPerCell;
  return base + Math.floor(base * scoring.maxBonusRatio * reference / (reference + elapsed));
}

export function scorePeriod(period, now = Date.now()) {
  const today = japanDay(now);
  if (period === 'all') return { from: null, to: today };
  if (period === 'today') return { from: today, to: today };
  if (period === 'month') return { from: today.slice(0, 7) + '-01', to: today };
  if (period === 'week') {
    const date = new Date(today + 'T00:00:00Z');
    date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
    return { from: date.toISOString().slice(0, 10), to: today };
  }
  throw new RangeError('Unknown ranking period');
}

// Assignments are normally present and authoritative. Preserve readable scores
// for an imported current-edition attempt whose assignment is temporarily
// absent, using the same 20-day schedule as dailySummary (never an answer).
const cycleSize = 20;
const legacyFallbackSizeSql = `CASE a.level ${[1, 2, 3].map(level =>
  `WHEN ${level} THEN CASE (CAST(julianday(substr(a.day,1,10)) - 2440587.5 AS INTEGER) % ${cycleSize}) ${Array.from({ length: cycleSize }, (_, day) => {
    const date = new Date(day * 86400000).toISOString().slice(0, 10);
    return `WHEN ${day} THEN ${dailySummary(date, level).n}`;
  }).join(' ')} ELSE 9 END`
).join(' ')} ELSE 9 END`;

export const fallbackSizeSql = `CASE WHEN substr(a.day,1,10)>='${smallDailyFrom}' THEN MIN(9,(${legacyFallbackSizeSql})) ELSE (${legacyFallbackSizeSql}) END`;

export const scoreSql = `(level * 1000 + CAST((level * 500.0 * n * n * ${scoring.referenceMsPerCell}) / (n * n * ${scoring.referenceMsPerCell} + elapsed) AS INTEGER))`;
