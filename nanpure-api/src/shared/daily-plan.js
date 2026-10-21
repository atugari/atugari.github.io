import { dailyLabels } from './daily-types.js';
export function japanDay(now = Date.now()) {
    return new Date(now + 9 * 3600000).toISOString().slice(0, 10);
}
// Keep the new edition's rankings separate; existing attempts are not deleted.
export function dailyRecordDay(day) { return `${day}:book-v2`; }
const rotation = [
    ['normal', 6], ['jigsaw', 9], ['killer', 16], ['neighbor', 8],
    ['normal', 12], ['jigsaw', 16], ['killer', 9], ['neighbor', 6],
    ['normal', 16], ['jigsaw', 9], ['killer', 16], ['neighbor', 8],
    ['normal', 9], ['jigsaw', 16], ['killer', 9], ['neighbor', 8],
    ['normal', 12], ['jigsaw', 9], ['killer', 16], ['neighbor', 9],
];
const names = {
    normal: '通常ナンプレ', jigsaw: 'ジグソー', killer: 'キラー', neighbor: 'おとなり',
};
function dayNumber(day) {
    const value = Date.parse(`${day}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(value))
        throw Error('日付が不正です');
    return Math.floor(value / 86400000);
}
export function dailySummary(day, level) {
    if (![1, 2, 3].includes(level))
        throw Error('難易度が不正です');
    const [kind, n] = rotation[(dayNumber(day) + [0, 5, 10][level - 1]) % rotation.length];
    const base = `各行・各列に1〜${n}を1回ずつ入れます。`;
    const extra = {
        normal: `太い枠にも1〜${n}を1回ずつ入れます。`,
        jigsaw: `でこぼこの太い枠にも1〜${n}を1回ずつ入れます。`,
        killer: `太い枠にも1〜${n}を1回ずつ入れます。点線のまとまりは同じ数字を使わず、左上の合計に合わせます。`,
        neighbor: '線でつながる2マスの数字を1違いにします。太い枠の条件はありません。線のない隣同士が1違いでもかまいません。',
    }[kind];
    return { day, level, n, kind, ruleName: names[kind],
        title: `${Number(day.slice(5, 7))}月${Number(day.slice(8))}日｜${names[kind]} ${n}×${n}｜${dailyLabels[level - 1]}`,
        rules: base + extra };
}
export function dailyMenu(day) { return [1, 2, 3].map(level => dailySummary(day, level)); }
