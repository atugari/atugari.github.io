// Select regression checks from semantic changes, including immutable release copies.
const fs=require('node:fs'),{execFileSync}=require('node:child_process');
const versionPattern=/\d{4}\.\d{2}\.\d{2}\.\d+/g;
function normalize(bytes,relative=''){
  if(!bytes)return null;
  let text=bytes.toString('utf8');if(!Buffer.from(text).equals(bytes))return bytes;
  if(relative==='shell/main.js'){
    const anchor=/\bvar ka="[^"]+",wS=/,match=anchor.exec(text);
    if(match){
      const start=match.index+match[0].length;let depth=0,quoted=false,escape=false,end=-1;
      for(let i=start;i<text.length;i++){
        const c=text[i];if(quoted){if(escape)escape=false;else if(c==='\\')escape=true;else if(c==='"')quoted=false;continue;}
        if(c==='"')quoted=true;else if(c==='['||c==='{')depth++;else if(c===']'||c==='}'){if(--depth===0){end=i+1;break;}}
      }
      if(end<0)throw Error('Release feed is incomplete');JSON.parse(text.slice(start,end));
      text=text.slice(0,start)+'[]'+text.slice(end);
    }
  }
  return text.replace(versionPattern,'__VERSION__');
}
function metadata(value){
  if(Array.isArray(value))return value.map(metadata);
  if(!value||typeof value!=='object')return value;
  return Object.fromEntries(Object.keys(value).sort().filter(k=>!['version','announcementVersion','baseRelease','base','files','sources','sourceCommit'].includes(k)&&!k.endsWith('Sha256')).map(k=>[k,metadata(value[k])]));
}
function planChecks({paths,readAt,sameBlob=()=>false,base='base',head='head',forceFull=false}){
  const selected={notebook:false,wado:false,corpus:false,learning:false,full:false},semantic=[];
  const all=()=>{for(const key of Object.keys(selected))selected[key]=true;};
  if(forceFull){all();return {...selected,semantic:['manual full verification']};}
  let oldVersion,newVersion;
  try{oldVersion=JSON.parse(readAt(base,'nanpure/version.json')).version;newVersion=JSON.parse(readAt(head,'nanpure/version.json')).version;}catch{all();return {...selected,semantic:['release metadata unavailable']};}
  for(const filename of paths){
    let p=filename;
    const release=`nanpure/releases/${newVersion}/`,audio=`nanpure-audio/${newVersion}/`;
    if(p.startsWith(release)||p.startsWith(audio)){
      const isAudio=p.startsWith(audio),relative=p.slice((isAudio?audio:release).length),previous=(isAudio?`nanpure-audio/${oldVersion}/`:`nanpure/releases/${oldVersion}/`)+relative;
      try{
        if(sameBlob(base,previous,head,p))continue;
        const before=normalize(readAt(base,previous),isAudio?'':relative),after=normalize(readAt(head,p),isAudio?'':relative);
        if(before!==null&&after!==null&&(Buffer.isBuffer(before)&&Buffer.isBuffer(after)?before.equals(after):before===after))continue;
      }catch{/* Unknown or malformed generated content requires its normal regression checks. */}
      p=isAudio?'scripts/client-overrides/public/site-audio.js':relative==='shell/main.js'?'scripts/client-overrides/app/game.tsx':'scripts/client-overrides/public/'+relative;
    }else if(['nanpure/index.html','nanpure/collection/player.html'].includes(p)){
      if(normalize(readAt(base,p))===normalize(readAt(head,p)))continue;
    }else if(['nanpure/version.json','nanpure/release-manifest.json','nanpure-version.json'].includes(p)){
      try{if(JSON.stringify(metadata(JSON.parse(readAt(base,p))))===JSON.stringify(metadata(JSON.parse(readAt(head,p)))))continue;}catch{}
    }
    semantic.push(p);
  }
  const lightweight=new Set([
    '.github/workflows/deploy-site.yml','scripts/select-site-checks.cjs','scripts/check-site-check-selection.cjs','scripts/check-release-integrity.cjs',
    'scripts/check-generation-assist.cjs','scripts/check-generation-assist-browser.cjs','scripts/fixtures/generation-assist-retry.html',
    '.github/workflows/build-owner-app.yml','.github/workflows/test-pareasobi-analytics.yml','owner-app/README.md','owner-app/app/build.gradle','owner-app/app/src/main/AndroidManifest.xml','owner-app/app/src/main/java/jp/nanpure/owner/MainActivity.java',
    'index.html','dungeon.html','move-moove-mooove.html','speed.html','combination-blocks.html','narabe100.html','echo-dive.html','shopping-memo.html','timer-gauge.html','skins.html','maze/index.html',
    'scripts/client-overrides/public/notebook/generation-assist.js','scripts/prepare-generation-assist-retry-release.mjs',
    'privacy.html','scripts/inject-pareasobi-analytics.py',
    'scripts/check-pareasobi-analytics.cjs','scripts/client-overrides/public/pare-analytics.js',
    'scripts/release-notes.json','nanpure/releases.json','nanpure-api/src/generation.js','nanpure-api/test/generation.test.mjs'
  ]);
  for(const p of semantic){
    if(lightweight.has(p)||p.startsWith('nanpure-api/'))continue;
    if(/^scripts\/collection-100k\//.test(p)||/^nanpure\/collection\//.test(p)){
      selected.corpus=true;if(/\.(?:js|mjs|html|css)$/.test(p))selected.notebook=true;continue;
    }
    if(/(?:^|\/)(?:wado[^/]*|kanji[^/]*)(?:\/|\.)|^scripts\/check-nanpure-wado/.test(p)){selected.wado=true;continue;}
    if(/^nanpure\/learn\/|^scripts\/check-nanpure-learning/.test(p)){selected.learning=true;continue;}
    if(/^docs\/.*\.(?:md|txt)$/.test(p)||/(?:^|\/)(?:README|LICENSE|COPYING)(?:\.[^/]+)?$/i.test(p))continue;
    if(/^scripts\/i18n\/|(?:site-theme|ui-text|reading-tools|language-layout)/.test(p)){selected.notebook=true;selected.wado=true;selected.learning=true;continue;}
    if(p==='scripts/seo/build-seo.mjs'){selected.notebook=true;continue;}
    if(/^scripts\/client-overrides\/(?:app|public)\/|^scripts\/check-(?:nanpure|pareasobi|community|reading)|^nanpure\/(?:index\.html|gallery\/|exhibitions\/)|^puzzles\//.test(p)){selected.notebook=true;continue;}
    if(/^kuroshiro\//.test(p)||p==='plaza.html')continue; // Kuroshiro is built on every publication.
    all();
  }
  return {...selected,semantic:[...new Set(semantic)]};
}
function selectFromGit({base,head,forceFull=false}={}){
  const git=(...args)=>execFileSync('git',args,{maxBuffer:64*1024*1024});
  head=head||git('rev-parse','HEAD').toString().trim();
  if(!/^[a-f0-9]{40}$/i.test(head))throw Error('Invalid head commit');
  if(!base)base=git('rev-parse',head+'^').toString().trim();
  if(!/^[a-f0-9]{40}$/i.test(base)||/^0+$/.test(base))return {notebook:true,wado:true,corpus:true,learning:true,full:true,semantic:['no comparable base commit']};
  const trees=new Map(),buffers=new Map();
  for(const ref of [base,head]){
    const entries=new Map();for(const row of git('ls-tree','-r','-z',ref).toString().split('\0').filter(Boolean)){const tab=row.indexOf('\t');entries.set(row.slice(tab+1),row.slice(0,tab).split(' ')[2]);}trees.set(ref,entries);
  }
  const readAt=(ref,p)=>{const sha=trees.get(ref).get(p);if(!sha)return null;if(!buffers.has(sha))buffers.set(sha,git('cat-file','blob',sha));return buffers.get(sha);};
  const sameBlob=(a,p,b,q)=>!!trees.get(a).get(p)&&trees.get(a).get(p)===trees.get(b).get(q);
  const paths=git('diff','--no-renames','--name-only','-z',base,head).toString().split('\0').filter(Boolean);
  return planChecks({paths,readAt,sameBlob,base,head,forceFull});
}
module.exports={normalize,metadata,planChecks,selectFromGit};
if(require.main===module){
  let result;try{result=selectFromGit({base:process.env.BASE_SHA,head:process.env.HEAD_SHA,forceFull:process.env.FULL_CHECK==='true'});}catch(error){console.warn('Cannot safely narrow checks:',error.message);result={notebook:true,wado:true,corpus:true,learning:true,full:true,semantic:['change detection unavailable']};}
  if(process.env.GITHUB_OUTPUT)for(const key of ['notebook','wado','corpus','learning','full'])fs.appendFileSync(process.env.GITHUB_OUTPUT,key+'='+result[key]+'\n');
  if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,'## Selected publication checks\n\nGeneration assistance, API, release integrity and selector tests always run.\n\n'+['notebook','wado','corpus','learning','full'].map(k=>'- '+k+': '+result[k]).join('\n')+'\n');
  console.log(JSON.stringify(result,null,2));
}
