// Export the verified Sites client to GitHub Pages without publishing server source.
// Usage: node scripts/export-nanpure.mjs /path/to/nanpure-online
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {patchNotebook} from './i18n/patch-notebook.mjs';
import {buildTranslationAssets} from './i18n/build-assets.mjs';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=path.resolve(process.argv[2]||'');
const require=createRequire(path.join(source,'package.json'));
const esbuild=createRequire(require.resolve('vite'))('esbuild');
const release=fs.readFileSync(path.join(source,'lib/releases.ts'),'utf8');
const version='2026.10.22.31';
const overrides=path.join(repo,'scripts/client-overrides');
if(!version||!/^\d{4}\.\d{2}\.\d{2}\.\d+$/.test(version))throw Error('Missing verified release version');
const base=`/nanpure/releases/${version}/`;
const output=path.join(repo,base);
const online='https://puzzle-api.puzzle-hub-4826.workers.dev';
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
 for(const name of ['app','lib']){fs.cpSync(path.join(source,name),path.join(scratch,name),{recursive:true});if(fs.existsSync(path.join(overrides,name)))fs.cpSync(path.join(overrides,name),path.join(scratch,name),{recursive:true});}
 fs.symlinkSync(path.join(source,'node_modules'),path.join(scratch,'node_modules'),'dir');
 for(const [file,target] of [['locale.ts','lib/locale.ts'],['locale-context.tsx','app/locale-context.tsx']])fs.copyFileSync(path.join(repo,'scripts/i18n',file),path.join(scratch,target));
 // Keep the verified client and switch its API transport to the Cloudflare Worker.
 for(const name of ['api-client.ts','cloud-save.tsx','pages-manager.tsx'])write('app/'+name,fs.readFileSync(path.join(repo,'nanpure-api/client',name),'utf8'));
 patch('app/game.tsx',"['ranking','backup','calendar','personal'].includes(view||'')","['ranking','backup','calendar','personal','updates','contact','replies','tutorial'].includes(view||'')");
 patch('app/update-news.tsx',"fetch('/api/version'","fetch('/nanpure/version.json'");
 patch('app/update-news.tsx','href="/updates"','href="/nanpure/?view=updates"');
 patch('app/site-menu.tsx','href="/privacy"','href="/nanpure/?view=privacy"');
 for(const name of ['app/contact-form.tsx','app/privacy/page.tsx','app/manage/manager.tsx']){
  const f=path.join(scratch,name);let text=fs.readFileSync(f,'utf8');
  text=text.replaceAll('className="prewrap">{a.detail}', 'className="prewrap" translate="no">{a.detail}').replace("toLocaleDateString('ja-JP'", "toLocaleDateString(document.documentElement.lang").replace('{a.name} ·', '<span translate="no">{a.name}</span> ·');
  text=text.replaceAll('/contact#','/nanpure/?view=replies#').replaceAll('href="/contact"','href="/nanpure/?view=contact"').replaceAll('href="/"','href="/nanpure/"');
  text=text.replace('クラウド保存を選んだ場合、アカウントの識別子と、問題・途中経過・設定・個人記録を保存します。同じアカウントでログインした本人だけが読み込めます。クラウドの内容は明示的に保存・読み込みをしたときに更新されます。','クラウド保存は引き継ぎコードで保護します。コードを知っている人は、問題・途中経過・設定・個人記録を読み書きできます。コードは公開しないでください。保存先はCloudflareです。保存・読み込みを押したときだけ更新し、ChatGPTへのログインは必要ありません。');
  fs.writeFileSync(f,text);
 }
 const releasePath=path.join(scratch,'lib/releases.ts');let news=fs.readFileSync(releasePath,'utf8');
 const sourceVersion=news.match(/currentVersion\s*=\s*['"]([^'"]+)['"]/)?.[1];
 if(!sourceVersion)throw Error('Missing source release version');
 news=news.replace('{version:currentVersion,',`{version:'${sourceVersion}',`);
 news=news.replace(/currentVersion\s*=\s*['"][^'"]+['"]/,`currentVersion='${version}'`);
 news=news.replace(/(export const releases[^=]*=\s*\[)/,`$1\n{version:'${version}',date:'2026-10-22',kind:'fix',title:'盤面の2本指操作と表示領域を改善しました',items:['スマートフォンでは、盤面を2本指で拡大・縮小できます。','数字ボタンの下の案内をなくし、盤面を広く表示するようにしました。','盤面を動かしたあとの誤入力を防ぐようにしました。']},\n{version:'2026.10.22.30',date:'2026-10-22',kind:'fix',title:'数字表示と操作性・読み込みを改善しました',items:['言語を切り替えても、盤面・数字ボタン・印刷の数字が変わらないようにしました。','ヒントの重なりをなくし、設定と拡大表示を整理しました。','問題帳は必要なときに読み込み、大きな盤面の入力を軽くしました。','プレイ画面を整理し、数字ボタンを正方形に近い形にしました。','数字の下の残り個数をなくし、長押し中はキーの上に数字を表示します。','16×16以上の日替わり盤面を、数字が読みやすい大きさにしました。']},\n{version:'2026.10.22.29',date:'2026-10-22',kind:'fix',title:'作成画面とルール説明の翻訳を修正しました',items:['領域の複雑さ・問題数・旧基準の表示を修正しました。','ルール説明を文章全体で翻訳し、強調表示と数値を保つようにしました。','メモ欄の読み上げラベルと、言語切り替え後のヒント表示を修正しました。']},\n{version:'2026.10.22.28',date:'2026-10-22',kind:'feature',title:'表示や説明を8言語で見直しました',items:['ボタン・設定・ルール・ヒント・印刷・エラーの翻訳を追加しました。','日本語以外を選んだときに、画面の一部だけ日本語に戻る問題を修正しました。','言語を切り替えても、問題や入力内容はそのままです。']},\n{version:'2026.10.21.27',date:'2026-10-21',kind:'feature',title:'GitHub版でオンライン機能が使えるようになりました',items:['日替わり問題・ランキング・カレンダー・お問い合わせをこの画面で利用できます。','クラウド保存は引き継ぎコードで端末をつなげます。ChatGPTへのログインは不要です。','このブラウザに保存した問題・設定・個人記録はそのまま使えます。']},`);fs.writeFileSync(releasePath,news);
 for(const f of walk(path.join(scratch,'app')).filter(f=>/\.tsx?$/.test(f)&&!f.endsWith('/api-client.ts'))){let text=fs.readFileSync(f,'utf8');if(/\bfetch\((['"])\/api\//.test(text)){text=text.replace(/\bfetch\((['"])\/api\//g,'apiFetch($1/api/');let rel=path.relative(path.dirname(f),path.join(scratch,'app/api-client')).replaceAll('\\','/');if(!rel.startsWith('.'))rel='./'+rel;text=`import {apiFetch} from '${rel}';\n`+text;fs.writeFileSync(f,text)}}
 for(const file of walk(scratch).filter(f=>/\.(tsx?|css)$/.test(f)))fs.writeFileSync(file,rewrite(fs.readFileSync(file,'utf8')).replace(/https:\/\/nanpure-chou-online\.[a-z0-9-]+\.chatgpt\.site/g,'https://atugari.github.io/nanpure').replace("host+'/learn?lang='","host+'/?view=tutorial&lang='"));
 // Only public assets enter the repository, never API routes, DB, credentials or answer banks.
 for(const name of ['notebook','audio','themes','site-theme.js','site-audio.js','tap-aid.js','furigana.js','ui-text.css','ui-text.js','favicon.svg']){
  fs.cpSync(path.join(source,'public',name),path.join(output,name),{recursive:true});
 }
 if(fs.existsSync(path.join(overrides,'public')))fs.cpSync(path.join(overrides,'public'),output,{recursive:true});
 fs.copyFileSync(path.join(repo,'scripts/i18n/runtime.js'),path.join(output,'notebook/i18n.js'));
 buildTranslationAssets(path.join(output,'notebook'),version);
 patchNotebook(path.join(output,'notebook'));
 for(const file of walk(output).filter(f=>/\.(html|js|css)$/.test(f)))fs.writeFileSync(file,rewrite(fs.readFileSync(file,'utf8')).replace(/https:\/\/nanpure-chou-online\.[a-z0-9-]+\.chatgpt\.site/g,'https://atugari.github.io/nanpure').replace("host+'/learn?lang='","host+'/?view=tutorial&lang='"));
 const cssDir=path.join(source,'dist/client/_next/static/css');
 const styles=fs.readdirSync(cssDir).filter(f=>f.endsWith('.css'));
 if(styles.length!==1)throw Error('Expected one verified framework stylesheet');
 fs.writeFileSync(path.join(output,'shell.css'),rewrite(fs.readFileSync(path.join(cssDir,styles[0]),'utf8'))+'\n.sync-code{margin:16px 0;padding:12px;border:1px solid #b8b0a0;border-radius:12px}.sync-code summary{cursor:pointer;font-weight:700}.sync-code textarea,.sync-code input,.legal input{width:100%;box-sizing:border-box;overflow-wrap:anywhere}.owner-logout{margin:16px}.pages-tab-note{display:block;margin-top:6px;font-size:max(var(--ui-min-font,0px),14px)}.pages-online .primary{display:block;text-align:center}.pages-online p{line-height:1.8}.practice{position:relative}.practice-loading{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:24px;text-align:center;background:var(--paper,#f8f5ee);color:var(--ink,#263b30);font-size:max(var(--ui-min-font,0px),16px)}.practice-loading p{line-height:1.7}.practice-loading button{min-height:44px;padding:10px 20px}');
 write('main.tsx',`import React from 'react';import{createRoot}from'react-dom/client';import Game from './app/game';import Privacy from './app/privacy/page';import PagesManager from './app/pages-manager';import{LocaleProvider}from './app/locale-context';import{ReadingRuntime}from './app/reading-settings';import InputAidRuntime from './app/input-aid-runtime';Promise.resolve((window as any).NPI18n?.ready).then(()=>{createRoot(document.getElementById('root')!).render(<LocaleProvider initialLocale="ja"><ReadingRuntime/><InputAidRuntime/>{new URLSearchParams(location.search).get('view')==='privacy'?<Privacy/>:new URLSearchParams(location.search).get('view')==='manage'?<PagesManager/>:<Game initialChallenges={[]}/>}</LocaleProvider>);});`);
 fs.rmSync(path.join(output,'shell'),{recursive:true,force:true});
 await esbuild.build({entryPoints:[path.join(scratch,'main.tsx')],outdir:path.join(output,'shell'),bundle:true,format:'esm',splitting:true,jsx:'automatic',target:['es2022'],minify:true,sourcemap:false,metafile:true,define:{'process.env.NODE_ENV':'"production"'},logLevel:'warning'});
 fs.appendFileSync(path.join(output,'shell.css'),'\n'+fs.readFileSync(path.join(overrides,'public/native-board.css'),'utf8'));
 const protection=spawnSync(process.execPath,[path.join(source,'scripts/protect-client.mjs'),output],{cwd:source,stdio:'inherit'});
 if(protection.status!==0)throw Error('Distribution protection failed');
 const html=`<!doctype html><html lang="ja" data-site-theme="notebook"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="referrer" content="no-referrer"><meta name="theme-color" content="#f4efe3"><title>ナンプレ帳 — 無料でいろいろなルールを何問でも</title><meta name="description" content="いろいろなルールのナンプレを何問でも無料で。クロスワード、シルプレ660問、印刷にも対応。"><link rel="icon" href="${base}favicon.svg"><script src="${base}site-theme.js"></script><script src="${base}notebook/i18n-data.js"></script><script src="${base}notebook/i18n.js"></script><script src="${base}ui-text.js"></script><link rel="stylesheet" href="${base}shell.css"></head><body><div id="root"></div><noscript>ナンプレ帳を遊ぶにはJavaScriptを有効にしてください。</noscript><script type="module" src="${base}shell/main.js"></script></body></html>`;
 fs.writeFileSync(path.join(repo,'nanpure/index.html'),html);
 fs.writeFileSync(path.join(repo,'nanpure.html'),'<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ナンプレ帳</title><meta http-equiv="refresh" content="0;url=/nanpure/"><script>location.replace("/nanpure/"+location.search+location.hash)</script><a href="/nanpure/">ナンプレ帳を開く</a></html>');
 const overrideHash=crypto.createHash('sha256').update(walk(overrides).sort().map(file=>path.relative(overrides,file)+'\0'+fs.readFileSync(file)).join('\0')).digest('hex');
 const revision=spawnSync('git',['rev-parse','HEAD'],{cwd:source,encoding:'utf8'}).stdout.trim();
 fs.writeFileSync(path.join(repo,'nanpure/version.json'),JSON.stringify({version,sourceCommit:revision,clientOverridesSha256:overrideHash}));
 fs.writeFileSync(path.join(repo,'nanpure-version.json'),JSON.stringify({version}));
 const audioPackage=spawnSync('python3',[path.join(repo,'scripts/pack-nanpure-audio.py'),version],{stdio:'inherit'});
 if(audioPackage.status!==0)throw Error('Audio packaging failed');
 const files=[path.join(repo,'nanpure/index.html'),path.join(repo,'nanpure.html'),path.join(repo,'nanpure/version.json'),...walk(output)];
 const manifest={version,sourceCommit:revision,clientOverridesSha256:overrideHash,base,online,files:Object.fromEntries(files.map(file=>[path.relative(repo,file),crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')]))};
 fs.writeFileSync(path.join(repo,'nanpure/release-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 console.log('Exported',version,files.length,'files from',revision);
}finally{fs.rmSync(scratch,{recursive:true,force:true})}
