// Export the verified Sites client to GitHub Pages without publishing server source.
// Usage: node scripts/export-nanpure.mjs /path/to/nanpure-online
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=path.resolve(process.argv[2]||'');
const require=createRequire(path.join(source,'package.json'));
const esbuild=createRequire(require.resolve('vite'))('esbuild');
const release=fs.readFileSync(path.join(source,'lib/releases.ts'),'utf8');
const version=release.match(/currentVersion\s*=\s*['"]([^'"]+)/)?.[1];
if(!version||!/^\d{4}\.\d{2}\.\d{2}\.\d+$/.test(version))throw Error('Missing verified release version');
const base=`/nanpure/releases/${version}/`;
const output=path.join(repo,base);
const online='https://nanpure-chou-online.pokemondaisukiyuu7.chatgpt.site';
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'nanpure-pages-'));
const rewrite=s=>s.replace(/\/(notebook|audio|themes)\//g,`${base}$1/`).replace(/\/(site-theme|site-audio|tap-aid|furigana|ui-text)\.(js|css)/g,`${base}$1.$2`).replaceAll('\\/notebook\\/',base.replaceAll('/','\\/')+'notebook\\/');
const patch=(file,from,to)=>{
 const target=path.join(scratch,file),text=fs.readFileSync(target,'utf8');
 if(!text.includes(from))throw Error(`Export patch no longer matches: ${file}: ${from.slice(0,70)}`);
 fs.writeFileSync(target,text.replace(from,to));
};
const write=(file,text)=>fs.writeFileSync(path.join(scratch,file),text);
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)])}
try {
 fs.mkdirSync(output,{recursive:true});
 for(const name of ['app','lib'])fs.cpSync(path.join(source,name),path.join(scratch,name),{recursive:true});
 fs.symlinkSync(path.join(source,'node_modules'),path.join(scratch,'node_modules'),'dir');
 // Server-backed pages open at their existing origin. Local games, preferences,
 // personal records and file backups remain on GitHub Pages.
 write('app/pages-online.tsx',`import {useLocale} from './locale-context';
export function onlineUrl(view:string,locale:string='ja') { const root=${JSON.stringify(online)}; return (view==='contact'||view==='replies'?root+'/contact?':root+'/?view='+encodeURIComponent(view)+'&')+'lang='+encodeURIComponent(locale); }
export default function OnlineFeature({view}:{view:string}) { const {t,locale}=useLocale(); const labels:Record<string,string>={ranking:'日替わりランキング',calendar:'日替わりカレンダー',contact:'お問い合わせ',replies:'お問い合わせ',backup:'クラウド保存・同期'}; return <section className="pages-online"><h2>{t(labels[view]||'日替わり問題帳')}</h2><p>{t('オンライン版で開きます。')} {t('別のタブで開きます')}</p>{view==='backup'&&<p>{t('このページの問題は、先に引き継ぎファイルを保存し、オンライン版で読み込んでください。')}</p>}<a className="primary" href={onlineUrl(view,locale)} target="_blank" rel="noopener noreferrer">{t(labels[view]||'日替わり問題帳')} ↗</a><p className="muted">{t('この画面に戻ると、今の問題を続けられます。')}</p></section>}
`);
 write('app/cloud-save.tsx',`import OnlineFeature from './pages-online';export default function CloudSave(_props:any){return <OnlineFeature view="backup"/>}`);
 write('app/contact-replies.tsx',`export const replySeenKey='np-contact-replies-seen-v1';export function useContactReplies(){return 0}export function markRepliesRead(_items:any[]){}\n`);
 patch('app/game.tsx',"import Support from './support';","import Support from './support';\nimport OnlineFeature,{onlineUrl} from './pages-online';");
 patch('app/game.tsx',"async function refreshChallenges(){try{","async function refreshChallenges(){return;try{");
 patch('app/game.tsx',"if(panel==='ranking')rankings()","if(false)rankings()");
 patch('app/game.tsx',"if(view==='daily')T('challenge');","if(view==='daily'){window.location.replace(onlineUrl('daily',new URLSearchParams(location.search).get('lang')||'ja'));return;}");
 patch('app/game.tsx',"['ranking','backup','calendar','personal'].includes(view||'')","['ranking','backup','calendar','personal','updates','contact'].includes(view||'')");
 patch('app/game.tsx','<button className="choice-card daily-choice" onClick={()=>T(\'challenge\')}>','<a className="choice-card daily-choice" href={onlineUrl(\'daily\',locale)} target="_blank" rel="noopener noreferrer">');
 patch('app/game.tsx',"{t('毎日3問。今日のひらめきに出会う。')}</small></span><ChoiceArrow/></button>","{t('毎日3問。今日のひらめきに出会う。')}<span className=\"pages-tab-note\">{t('別のタブで開きます')} ↗</span></small></span><ChoiceArrow/></a>");
 patch('app/game.tsx',"{panel==='rule-choice'&&selectedSummary?","{panel&&['ranking','calendar','contact','replies'].includes(panel)?<OnlineFeature view={panel}/>:panel==='rule-choice'&&selectedSummary?");
 // Avoid reviving server sessions accidentally carried in an imported backup.
 patch('app/game.tsx',"RESUME(readPractice(JSON.parse(localStorage.getItem('np-practice-resume-v1')||'null')))","RESUME(null)");
 patch('app/update-news.tsx',"fetch('/api/version'","fetch('/nanpure/version.json'");
 patch('app/update-news.tsx','href="/updates"','href="/nanpure/?view=updates"');
 patch('app/site-menu.tsx','href="/privacy"',`href="${online}/privacy" target="_blank" rel="noopener noreferrer"`);
 // Include a GitHub-specific release note.
 const releasePath=path.join(scratch,'lib/releases.ts');
 let news=fs.readFileSync(releasePath,'utf8');
 news=news.replace(/(export const releases[^=]*=\s*\[)/,`$1\n{version:'${version}-pages',date:'2026-10-21',kind:'feature',title:'GitHub版を最新版に更新',items:['ナンプレ・クロスワード・シルプレ660問と、戻る操作・完成判定の修正を反映しました。','デザイン切り替え、文字・数字ボタンの大きさ、BGM・効果音の設定を追加しました。','日替わり・ランキング・お問い合わせはオンライン版で開きます。保存済みの問題はこのブラウザで引き続き使えます。']},`);
 fs.writeFileSync(releasePath,news);
 // Preserve the same language coverage for the new platform guidance.
 const dictionary=JSON.parse(fs.readFileSync(path.join(scratch,'lib/ui-translations.json'),'utf8'));
 const extras={
 '別のタブで開きます':{en:'Opens in a new tab','zh-Hans':'在新标签页中打开','zh-Hant':'在新分頁中開啟',ko:'새 탭에서 열립니다',es:'Se abre en otra pestaña',fr:'S’ouvre dans un nouvel onglet',de:'Öffnet in einem neuen Tab',pt:'Abre em outra aba'},
 'オンライン版で開きます。':{en:'Open this feature in the online edition.','zh-Hans':'在在线版中打开。','zh-Hant':'在網路版中開啟。',ko:'온라인 버전에서 엽니다.',es:'Abre esta función en la versión en línea.',fr:'Ouvrez cette fonction dans la version en ligne.',de:'Diese Funktion öffnet die Online-Version.',pt:'Abra esta função na versão online.'},
 'この画面に戻ると、今の問題を続けられます。':{en:'Return to this tab to continue your puzzle.','zh-Hans':'返回此标签页即可继续解题。','zh-Hant':'返回此分頁即可繼續解題。',ko:'이 탭으로 돌아와 퍼즐을 계속할 수 있습니다.',es:'Vuelve a esta pestaña para continuar.',fr:'Revenez à cet onglet pour continuer.',de:'Kehre zu diesem Tab zurück, um weiterzuspielen.',pt:'Volte a esta aba para continuar.'},
 'このページの問題は、先に引き継ぎファイルを保存し、オンライン版で読み込んでください。':{en:'Save a transfer file here first, then import it in the online edition.','zh-Hans':'请先保存迁移文件，再在在线版中导入。','zh-Hant':'請先儲存移轉檔案，再在網路版中匯入。',ko:'먼저 이전 파일을 저장한 후 온라인 버전에서 불러오세요.',es:'Guarda un archivo de transferencia aquí e impórtalo en la versión en línea.',fr:'Enregistrez un fichier de transfert ici, puis importez-le dans la version en ligne.',de:'Speichere hier eine Übertragungsdatei und importiere sie in der Online-Version.',pt:'Salve um arquivo de transferência aqui e importe-o na versão online.'}
 };
 Object.assign(dictionary,extras);fs.writeFileSync(path.join(scratch,'lib/ui-translations.json'),JSON.stringify(dictionary));
 for(const file of walk(scratch).filter(f=>/\.(tsx?|css)$/.test(f)))fs.writeFileSync(file,rewrite(fs.readFileSync(file,'utf8')));
 // Only public assets enter the repository, never API routes, DB, credentials or answer banks.
 for(const name of ['notebook','audio','themes','site-theme.js','site-audio.js','tap-aid.js','furigana.js','ui-text.css','ui-text.js','favicon.svg']){
  fs.cpSync(path.join(source,'public',name),path.join(output,name),{recursive:true});
 }
 for(const file of walk(output).filter(f=>/\.(html|js|css)$/.test(f)))fs.writeFileSync(file,rewrite(fs.readFileSync(file,'utf8')));
 const cssDir=path.join(source,'dist/client/_next/static/css');
 const styles=fs.readdirSync(cssDir).filter(f=>f.endsWith('.css'));
 if(styles.length!==1)throw Error('Expected one verified framework stylesheet');
 fs.writeFileSync(path.join(output,'shell.css'),rewrite(fs.readFileSync(path.join(cssDir,styles[0]),'utf8'))+'\n.pages-tab-note{display:block;margin-top:6px;font-size:max(var(--ui-min-font,0px),14px)}.pages-online .primary{display:block;text-align:center}.pages-online p{line-height:1.8}');
 write('main.tsx',`import React from 'react';import{createRoot}from'react-dom/client';import Game from './app/game';import{LocaleProvider}from './app/locale-context';import{ReadingRuntime}from './app/reading-settings';import InputAidRuntime from './app/input-aid-runtime';createRoot(document.getElementById('root')!).render(<LocaleProvider initialLocale="ja"><ReadingRuntime/><InputAidRuntime/><Game initialChallenges={[]}/></LocaleProvider>);`);
 fs.rmSync(path.join(output,'shell'),{recursive:true,force:true});
 await esbuild.build({entryPoints:[path.join(scratch,'main.tsx')],outdir:path.join(output,'shell'),bundle:true,format:'esm',splitting:true,jsx:'automatic',target:['es2022'],minify:true,sourcemap:false,metafile:true,define:{'process.env.NODE_ENV':'"production"'},logLevel:'warning'});
 const protection=spawnSync(process.execPath,[path.join(source,'scripts/protect-client.mjs'),output],{cwd:source,stdio:'inherit'});
 if(protection.status!==0)throw Error('Distribution protection failed');
 const html=`<!doctype html><html lang="ja" data-site-theme="notebook"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#f4efe3"><title>ナンプレ帳 — 無料でいろいろなルールを何問でも</title><meta name="description" content="いろいろなルールのナンプレを何問でも無料で。クロスワード、シルプレ660問、印刷にも対応。"><link rel="icon" href="${base}favicon.svg"><script src="${base}site-theme.js"></script><script src="${base}ui-text.js"></script><link rel="stylesheet" href="${base}shell.css"></head><body><div id="root"></div><noscript>ナンプレ帳を遊ぶにはJavaScriptを有効にしてください。</noscript><script type="module" src="${base}shell/main.js"></script></body></html>`;
 fs.writeFileSync(path.join(repo,'nanpure/index.html'),html);
 fs.writeFileSync(path.join(repo,'nanpure.html'),'<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ナンプレ帳</title><meta http-equiv="refresh" content="0;url=/nanpure/"><script>location.replace("/nanpure/"+location.search+location.hash)</script><a href="/nanpure/">ナンプレ帳を開く</a></html>');
 const revision=spawnSync('git',['rev-parse','HEAD'],{cwd:source,encoding:'utf8'}).stdout.trim();
 fs.writeFileSync(path.join(repo,'nanpure/version.json'),JSON.stringify({version,sourceCommit:revision}));
 fs.writeFileSync(path.join(repo,'nanpure-version.json'),JSON.stringify({version}));
 const audioPackage=spawnSync('python3',[path.join(repo,'scripts/pack-nanpure-audio.py'),version],{stdio:'inherit'});
 if(audioPackage.status!==0)throw Error('Audio packaging failed');
 const files=[path.join(repo,'nanpure/index.html'),path.join(repo,'nanpure.html'),path.join(repo,'nanpure/version.json'),...walk(output)];
 const manifest={version,sourceCommit:revision,base,online,files:Object.fromEntries(files.map(file=>[path.relative(repo,file),crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')]))};
 fs.writeFileSync(path.join(repo,'nanpure/release-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 console.log('Exported',version,files.length,'files from',revision);
}finally{fs.rmSync(scratch,{recursive:true,force:true})}
