/* Website-specific generation screens. The original generator and queue stay in app.js. */
(() => {
  'use strict';
  const esc = value => NP.esc(String(value));
  const button = (text, attrs, primary = false) => `<button type="button" class="${primary ? 'primary' : 'secondary'}" ${attrs}>${text}</button>`;
  const options = (values, selected) => values.map(([value, text]) => `<option value="${esc(value)}" ${String(selected) === String(value) ? 'selected' : ''}>${esc(text)}</option>`).join('');
  const check = (field, value, name, checked) => `<label class="web-check"><input type="checkbox" data-web-field="${field}" value="${esc(value)}" ${checked ? 'checked' : ''}><span>${esc(name)}</span></label>`;
  function render({settings:k, library, step, advancedOpen = false}) {
    const titles = ['どう作る？', 'どの種類を作る？', '大きさは？', '何問ずつ作る？', 'この内容で作る？'];
    let content = '', valid = true;
    if (step === 0) {
      content = `<div class="choices">${button('<strong>新しく追加する</strong><small>保存済みの問題とは別に作ります</small>', 'data-web-mode="add"', true)}${button('<strong>足りない分を補充する</strong><small>未プレイ・未印刷の問題を数えて補充</small>', 'data-web-mode="stock"')}</div>`;
    } else if (step === 1) {
      content = '<label class="web-label" for="web-kind-search">種類を探す</label><input id="web-kind-search" type="search" placeholder="名前で絞り込み" autocomplete="off"><div class="web-mini-actions">' + button('すべて選ぶ', 'data-web-select="all"') + button('選択を解除', 'data-web-select="none"') + '</div><div class="web-checklist">' + Object.keys(NP.KIND).map(kind => check('kind', kind, NP.KIND[kind].name, k.kinds.includes(kind))).join('') + `</div><p class="hint" id="web-selected-count">${k.kinds.length}種類を選択中</p>`;
      valid = !!k.kinds.length;
    } else if (step === 2) {
      const sizes = [...new Set(k.kinds.flatMap(kind => NP.sizesForKind(kind)))].sort((a,b) => a-b);
      content = '<label class="web-label" for="web-sizes">作る大きさ</label><select id="web-sizes" data-web-field="sizes">' + options([['standard','9×9中心'],['all','対応する全サイズ'],['custom','自分で選ぶ']], k.sizes) + '</select>';
      if (k.sizes === 'custom') content += '<div class="web-size-list">' + sizes.map(n => check('size', n, `${n} × ${n}`, k.customSizes.includes(n))).join('') + '</div>';
      content += '<p class="hint">選んだ種類に対応するサイズだけ作ります。</p>';
      valid = k.sizes !== 'custom' || sizes.some(n => k.customSizes.includes(n));
    } else if (step === 3) {
      content = '<label class="web-label" for="web-each">' + (k.stockMode === 'stock' ? '各条件でそろえる数' : '各難易度に追加する数') + `</label><div class="web-number"><input id="web-each" type="number" inputmode="numeric" min="1" max="100" step="1" value="${k.each}" data-web-field="each"><span>問ずつ</span></div><p class="hint">選んだ種類の全難易度を作ります。1〜100問で指定できます。</p>`;
      if (k.stockMode === 'stock') content += '<label class="web-label" for="web-basis">何を数える？</label><select id="web-basis" data-web-field="basis">' + options([['unplayed','未プレイの問題'],['unprinted','未印刷の問題']],k.stockBasis) + '</select>';
      valid = Number.isInteger(k.each) && k.each >= 1 && k.each <= 100;
    } else {
      let plan, error = '';
      try { plan = NPBatch.plan(k, library); } catch(e) { error = e.message; }
      const row = (title,value,index) => `<div class="web-summary"><span>${title}</span><strong>${esc(value)}</strong>${button('変更', `data-web-step="${index}"`)}</div>`;
      content = row('作り方',k.stockMode === 'stock' ? '不足分を補充' : '新しく追加',0) + row('種類',k.kinds.map(kind=>NP.KIND[kind].short).join('・'),1) + row('大きさ',k.sizes==='standard'?'9×9中心':k.sizes==='all'?'全サイズ':k.customSizes.join('・'),2) + row('問題数',`${k.each}問ずつ・全難易度`,3);
      if (k.kinds.some(kind => ['multi','neighbor','cross','jigsaw','killer'].includes(kind))) {
        content += `<details class="web-advanced" ${advancedOpen?'open':''}><summary>連結・枠の形を設定する</summary>`;
        if (k.kinds.some(kind=>['multi','neighbor','cross'].includes(kind))) content += '<label class="web-label" for="web-shapes">連結・マルチの形</label><select id="web-shapes" data-web-field="shapes">' + options([['false','基本形のみ'],['true','全形状を含める']],String(k.allShapes)) + '</select>';
        if (k.kinds.some(kind=>NP.hasShape(kind))) content += '<label class="web-label" for="web-complexities">ジグソー・キラーの枠</label><select id="web-complexities" data-web-field="complexities">' + options([['false','少し複雑のみ'],['true','4種類すべて']],String(k.allComplexities)) + '</select>';
        content += '</details>';
      }
      content += error ? `<p role="alert" class="notice error">${esc(error)}</p>` : `<p class="web-total">追加する問題 <strong>${plan.jobs.length.toLocaleString()}</strong> 問</p>`;
      content += '<p class="hint">生成中はこの画面を開いたままにしてください。停止しても完成した問題は残り、続きから再開できます。</p>';
      content += button(plan?.jobs.length ? `${plan.jobs.length.toLocaleString()}問を作る` : '追加する問題はありません', `data-action="bulk-generate" ${!plan?.jobs.length?'disabled':''}`,true);
      content += '<details class="web-notes"><summary>生成の進み方</summary><p>指定の難易度を変えずに探します。時間がかかる条件は後回しにして、ほかの条件から作る場合があります。探索中の1問は、停止・再開すると探し直します。</p></details>';
    }
    return `<section class="web-generator"><p class="web-progress">まとめて作る · ${step+1} / 5</p><h1 tabindex="-1">${titles[step]}</h1>${content}${step>0&&step<4?button('次へ',`data-web-next ${!valid?'disabled':''}`,true):''}</section>`;
  }
  window.NPWebGeneration = {render};
})();
