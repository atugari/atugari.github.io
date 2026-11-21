(() => {
  const wado = [
    ['電□・汽□・□輪・□内', '車', '電車・汽車・車輪・車内'],
    ['火□・登□・□道・□頂', '山', '火山・登山・山道・山頂'],
    ['春□・大□・□音・□具', '雨', '春雨・大雨・雨音・雨具'],
    ['朝□・昨□・□本・□記', '日', '朝日・昨日・日本・日記'],
    ['春□・強□・□車・□船', '風', '春風・強風・風車・風船'],
    ['青□・夜□・□気・□港', '空', '青空・夜空・空気・空港'],
    ['雨□・温□・□色・□泳', '水', '雨水・温水・水色・水泳']
  ];
  const crossword = [
    ['さくら', '春に花見を楽しむ木', 'つくえ', 'いすと一緒に使う家具'],
    ['うさぎ', '長い耳を持つ動物', 'はさみ', '紙などを切る文房具'],
    ['くるま', '道路を走る乗り物', 'だるま', '七転び八起きで知られる縁起物'],
    ['すいか', '夏に食べる、皮にしま模様がある果物', 'さいふ', 'お金を入れて持ち歩く物'],
    ['きつね', '「コンコン」と鳴くとされる動物', 'ひつじ', '毛からウールが作られる動物'],
    ['めがね', '見え方を補うために目の前にかける物', 'てがみ', '便せんに書いて相手に届ける物'],
    ['とけい', '時刻を確認する道具', 'こけし', '丸い頭と細い胴を持つ木の人形']
  ];
  const shiru = [[["", "○", "", "", "□", "△", "○", "", "□", "", "", "△"], [5, 6, 8, 9, 10]], [["○", "", "□", "", "○", "△", "□", "", "", "△", "", ""], [1, 5, 7, 9, 10, 11, 13]], [["△", "△", "", "", "□", "□", "○", "", "", "○", "", ""], [0, 7, 10, 12, 13]], [["", "", "○", "", "○", "△", "△", "", "□", "", "□", ""], [2, 9, 15]], [["△", "△", "", "", "□", "□", "", "", "", "", "○", "○"], [0, 5, 7, 9, 10, 11, 16]], [["", "", "", "", "△", "△", "○", "□", "", "", "○", "□"], [0, 7, 10, 12, 13]], [["", "△", "□", "□", "", "", "○", "○", "△", "", "", ""], [4, 8, 10, 11, 12]]];

  const pieces = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: 'numeric', day: 'numeric'
  }).formatToParts(new Date());
  const date = Object.fromEntries(pieces.map(({ type, value }) => [type, Number(value)]));
  const index = (Math.floor(Date.UTC(date.year, date.month - 1, date.day) / 86400000) % 7 + 7) % 7;
  document.querySelector('#date').textContent = date.month + '月' + date.day + '日（日本時間）・ミニ問題は7問を日替わりで出題';

  function mountCheck(root, content, check) {
    root.innerHTML = content;
    const result = root.querySelector('output');
    root.querySelector('form').addEventListener('submit', event => {
      event.preventDefault();
      result.textContent = check(root) ? '正解！' : 'もう一度考えてみよう。';
    });
    root.querySelector('form').addEventListener('input', () => { result.textContent = ''; });
  }

  const [clue, kanji, words] = wado[index];
  mountCheck(document.querySelector('#wado-play'),
    '<p>' + clue + '</p><form><label>中央の漢字 <input name="answer" required maxlength="2" size="4"></label>' +
    '<button>答え合わせ</button><output aria-live="polite"></output></form><details><summary>答えを見る</summary><p>' +
    kanji + '（' + words + '）</p></details>',
    root => root.querySelector('input').value.trim() === kanji);

  const [across, acrossClue, down, downClue] = crossword[index];
  const normalKana = value => value.normalize('NFKC').trim().replace(/[ァ-ヶ]/g, c => String.fromCodePoint(c.codePointAt(0) - 96));
  mountCheck(document.querySelector('#crossword-play'),
    '<div class="cross" aria-hidden="true"><span class="outside"></span><span>□</span><span class="outside"></span>' +
    '<span>□</span><span>□</span><span>□</span><span class="outside"></span><span>□</span><span class="outside"></span></div>' +
    '<form><label>ヨコ　' + acrossClue + '<br><input name="across" required size="9"></label>' +
    '<label>タテ　' + downClue + '<br><input name="down" required size="9"></label>' +
    '<button>答え合わせ</button><output aria-live="polite"></output></form><details><summary>答えを見る</summary><p>ヨコは「' +
    across + '」、タテは「' + down + '」。</p></details>',
    root => normalKana(root.querySelector('[name=across]').value) === across &&
      normalKana(root.querySelector('[name=down]').value) === down);

  const [symbols, solution] = shiru[index];
  const rooms = document.createElement('div');
  rooms.className = 'rooms';
  rooms.setAttribute('role', 'group');
  rooms.setAttribute('aria-label', 'シルプレの盤面');
  const edgeButtons = [];
  for (let square = 0; square < 12; square++) {
    const row = Math.floor(square / 4);
    const col = square % 4;
    const cell = document.createElement('span');
    cell.className = 'cell';
    cell.style.gridArea = (row * 2 + 1) + '/' + (col * 2 + 1);
    cell.textContent = symbols[square];
    cell.setAttribute('aria-label', (row + 1) + '行' + (col + 1) + '列 ' + (symbols[square] || '空欄'));
    rooms.append(cell);
    [[col < 3, row * 2 + 1, col * 2 + 2, '右'], [row < 2, row * 2 + 2, col * 2 + 1, '下']].forEach(([exists, gridRow, gridCol, side]) => {
      if (!exists) return;
      const edge = document.createElement('button');
      edge.type = 'button';
      edge.className = 'edge';
      edge.style.gridArea = gridRow + '/' + gridCol;
      edge.setAttribute('aria-label', (row + 1) + '行' + (col + 1) + '列の' + side + 'の仕切り');
      edge.setAttribute('aria-pressed', 'false');
      edgeButtons.push(edge);
      rooms.append(edge);
    });
  }
  const shirupure = document.querySelector('#shirupure-play');
  mountCheck(shirupure, '<form><button>答え合わせ</button><output aria-live="polite"></output></form><button type="button" data-solution>仕切りの答えを見る</button>',
    () => edgeButtons.every((edge, i) => (edge.getAttribute('aria-pressed') === 'true') === solution.includes(i)));
  shirupure.prepend(rooms);
  const status = shirupure.querySelector('output');
  for (const edge of edgeButtons) {
    edge.addEventListener('click', () => {
      edge.setAttribute('aria-pressed', String(edge.getAttribute('aria-pressed') !== 'true'));
      status.textContent = '';
    });
  }
  shirupure.querySelector('[data-solution]').addEventListener('click', () => {
    edgeButtons.forEach((edge, i) => edge.setAttribute('aria-pressed', String(solution.includes(i))));
    status.textContent = '答えの仕切りを表示しました。';
  });
})();
