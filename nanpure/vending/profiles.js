export const legacyProfile = {profile: 'normal:9:18:0::::', kind: 'normal', n: 9, level: 18};

const ruleNames = {
  normal: 'ふつうのナンプレ', jigsaw: 'ジグソーナンプレ', killer: 'キラーナンプレ',
  cross: 'クロスてんびん', step: 'ステップナンプレ', neighbor: 'おとなりナンプレ',
  multi: 'マルチナンプレ', thermo: '温度計ナンプレ', arrow: '矢印ナンプレ',
  renban: '連番ナンプレ', sandwich: 'サンドイッチナンプレ', skyscraper: 'ビルディングナンプレ',
  antiknight: 'アンチナイトナンプレ', palindrome: '回文ナンプレ', whisper: 'ウィスパーナンプレ',
  diagonal: '対角線ナンプレ', hyper: 'ハイパーナンプレ', kropki: 'クロプキナンプレ',
  doubleArrow: 'ダブル矢印ナンプレ', slowThermo: 'スロー温度計ナンプレ',
  doubleSandwich: 'ダブルサンドイッチナンプレ', twinKiller: '双子キラー', clone: 'クローンナンプレ'
};
const shapes = {pair: '2面連結', relay: '3面リレー', samurai: '5面サムライ', ell: '3面L字', cross: '5面十字'};
const complexities = ['シンプル', '少し複雑', '複雑', 'とても複雑'];
const ruleName = kind => ruleNames[kind] || kind;
const sizeName = size => size + '×' + size;
const levelName = (level, row) => '難易度' + level + (row.profile === legacyProfile.profile ? '「至高」' : '');
const shapeKey = row => [row.complexity || 0, row.multiShape || row.linkedShape || ''].join(':');
const shapeName = row => shapes[row.multiShape || row.linkedShape] || complexities[row.complexity - 1] || '';

export const validProfileKey = value => typeof value === 'string' && /^[a-zA-Z0-9:_-]{1,100}$/.test(value);

export function profileFromKey(value) {
  if (!validProfileKey(value)) return legacyProfile;
  const [kind, n, level, complexity, multiShape, linkedShape] = value.split(':');
  if (!Object.hasOwn(ruleNames, kind) || !Number(n) || !Number(level)) return legacyProfile;
  return {profile: value, kind, n: Number(n), level: Number(level), complexity: Number(complexity), multiShape, linkedShape};
}

export function profileTitle(row) {
  return ruleName(row.kind);
}

export function profileDetail(row) {
  return [sizeName(row.n), levelName(row.level, row), shapeName(row)].filter(Boolean).join(' ・ ');
}

export function profilesFrom(result) {
  const rows = Array.isArray(result.profiles) ? result.profiles.filter(row =>
    row && validProfileKey(row.profile) && Object.hasOwn(ruleNames, row.kind) &&
    Number.isInteger(row.n) && row.n > 0 && Number.isInteger(row.level) && row.level > 0 &&
    Number.isInteger(row.available) && row.available >= 0
  ) : [];
  return rows.length ? rows : [{...result.shelf, ...legacyProfile}];
}

const fields = [
  {key: row => row.kind, label: row => ruleName(row.kind)},
  {key: row => row.n, label: row => sizeName(row.n)},
  {key: row => row.level, label: row => levelName(row.level, row)},
  {key: shapeKey, label: row => shapeName(row) || '標準'}
];

// Only choices compatible with the selections above them are rendered.
export function profilePicker(element, onChange) {
  const selects = [...element.querySelectorAll('select')];
  let rows = [];
  let selected;
  function render(preferences) {
    let matching = rows;
    for (const [index, field] of fields.entries()) {
      const select = selects[index];
      const choices = new Map(matching.map(row => [String(field.key(row)), field.label(row)]));
      select.replaceChildren(...Array.from(choices, ([value, label]) => new Option(label, value)));
      if (choices.has(preferences[index])) select.value = preferences[index];
      select.parentElement.hidden = choices.size < 2;
      matching = matching.filter(row => String(field.key(row)) === select.value);
    }
    selected = matching[0];
    element.hidden = rows.length < 2;
  }
  for (const select of selects) select.addEventListener('change', () => {
    render(selects.map(field => field.value));
    onChange();
  });
  return {
    get selected() { return selected; },
    update(nextRows) {
      const preferred = selected ?? nextRows.find(row => row.profile === legacyProfile.profile);
      rows = [...nextRows].sort((a, b) => a.kind.localeCompare(b.kind) || a.n - b.n || a.level - b.level ||
        shapeKey(a).localeCompare(shapeKey(b)));
      render(preferred ? fields.map(field => String(field.key(preferred))) : []);
    },
    setBusy(busy) { element.disabled = busy; }
  };
}
