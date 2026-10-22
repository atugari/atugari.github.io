// Keep Japanese source messages intact until the shared DOM translator sees them.
// The patches run on copied assets, so they are reproducible on every export.
import fs from 'node:fs';
import path from 'node:path';

export function patchNotebook(directory) {
  function replace(file, from, to) {
    const target=path.join(directory,file),source=fs.readFileSync(target,'utf8');
    if(source.split(from).length!==2)throw new Error(`Localization patch must match once: ${file}: ${from.slice(0,80)}`);
    fs.writeFileSync(target,source.replace(from,to));
  }
  // The notebook home inlines a copy of KIND, while print.html uses common.js.
  // A type label must not reuse the difficulty key "ふつう" (Medium).
  replace('index.html','normal:{name:"ふつうのナンプレ",short:"ふつう"','normal:{name:"ふつうのナンプレ",short:"通常ナンプレ"');
  replace('visual-hints.js','const n=t=>e.NPI18n?e.NPI18n.t(t):t','const n=t=>t');
  replace('access-tools.js','const t=s=>window.NPI18n?.t(s)||s;','const t=s=>s;');
  replace('play-options.js','function t(s){return window.NPI18n?.t(s)||s}','function t(s){return s}');
  replace('app.js','u(window.NPI18n?NPI18n.t("ミス"):"ミス")','u("ミス")');
  replace('app.js','Ue(e+" <small>問</small>","pick-count"','Ue(e+" 問","pick-count"');

  // Keep the variable print counts inside preserved inline slots.
  replace("app.js","d+='<p class=\"selection-count\" role=\"status\">条件に合う問題 <b>'+t.length+\"問</b> ／ この中で選択済み \"+l+\"問\"+(L.ids.length>l?\"<br>条件の外でも \"+(L.ids.length-l)+\"問 選択中\":\"\")+\"</p>\"","d+='<p class=\"selection-count\" role=\"status\">条件に合う問題 <b>'+t.length+\"問</b> ／ この中で選択済み <span>\"+l+\"問</span>\"+(L.ids.length>l?\"<br>条件の外でも <span>\"+(L.ids.length-l)+\"問</span> 選択中\":\"\")+\"</p>\"");

  // Translate only a new task's default name. Player-edited and saved names
  // remain input values and retain their explicit data-i18n-skip protection.
  replace('portable.js','value="分担生成"',`value="'+o(window.NPI18n?.t("分担生成")||"分担生成")+'"`);
  replace('portable.js','P("name").value.trim()||"分担生成"','P("name").value.trim()||(window.NPI18n?.t("分担生成")||"分担生成")');

  // Read completion state independently of the displayed language.
  replace("context-entry.js","document.querySelector('.proto-status')?.textContent.includes('完成しました')","w.NPPrototype?.exportData?.()?.states?.[w.NPPrototype?.getRoute?.()?.id]?.done===true");

  // Native sharing/clipboard text never enters the DOM. Localize it when the
  // player invokes Share; this does not initiate a share or copy by itself.
  replace('video-features.js','!async function(e){try{navigator.share?','!async function(e){e=window.NPI18n?.t(e)||e;try{navigator.share?');
  replace('video-features.js','title:"ナンプレ帳の統計"','title:window.NPI18n?.t("ナンプレ帳の統計")||"ナンプレ帳の統計"');
}
