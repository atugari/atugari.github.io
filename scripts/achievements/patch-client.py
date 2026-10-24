from pathlib import Path
root=Path(__file__).resolve().parents[2];base=root/'scripts/client-overrides'
def edit(rel,a,b,n=1):
 p=base/rel;s=p.read_text();assert s.count(a)==n,(rel,a[:80],s.count(a));p.write_text(s.replace(a,b))
edit('app/game.tsx',"const news=useUpdateNews();", "useEffect(()=>{(window as any).NPAchievementShellAttached=true;(window as any).NPAchievementHooks?.shell({tab,blocked:!!panel||busy||backupBusy,rankedActive:!!session?.ranked&&!done,session,grid,run:runId.current,hints:hintCount.current,settings});});\n const news=useUpdateNews();")
# Ref declarations occur later in render. Effect closure runs after all declarations.
edit('app/game.tsx',"if(!memo&&v&&grid[cell]!==v)trackDigit", "(window as any).NPAchievementHooks?.dailyInput(session,cell,v,grid[cell],memo,settings);\n  if(!memo&&v&&grid[cell]!==v)trackDigit")
edit('app/game.tsx',"function recordResult(win:boolean,elapsed:number){if(!session)return;", "function recordResult(win:boolean,elapsed:number){if(!session)return;(window as any).NPAchievementHooks?.dailyClear(session,win,elapsed,hintCount.current,misses,settings,grid);")
edit('lib/backup.ts',"export const backupKeys=[", "export const backupKeys=['np-achievements-v1','np-achievement-identity-v1',")
# Notebook generation and print events run only after storage and validation.
edit('public/notebook/app.js','if(B.ids.push(o.p.uid),', 'window.NPAchievementHooks?.generated(o.p);if(B.ids.push(o.p.uid),')
edit('public/notebook/app.js','function ht(){if(i)', 'function ht(){window.NPAchievementHooks?.job(B,x.filter(p=>B?.ids?.includes(p.uid)));if(i)')
edit('public/notebook/app.js','function Se(e){if(!j)return;', 'function Se(e){if(!j)return;B.titleRested=true;')
edit('public/notebook/app.js','async function gt(t,o=!1){', 'async function gt(t,o=!1){if(t&&B)B.titleResumed=true;')
edit('public/notebook/app.js','B={bulk:!0,jobs:e,', 'B={titleRefill:k.stockMode!=="add",bulk:!0,jobs:e,')
edit('public/notebook/app.js','function Gt(e={}){return NPPrint.plan(Wt(),Object.assign({},L,e))}', 'function Gt(e={}){const p=Wt(),settings=Object.assign({},L,e),plan=NPPrint.plan(p,settings);if(S.flow==="print"&&S.step===6)window.NPAchievementHooks?.print(p,plan,settings,{preset:window.NPTitlePrintPreset||null});return plan}')
# Validate-filled helper is used only by tests/manual fill; live completion uses NPVideo.settle hook.
edit('public/notebook/app.js','function At(e){V=e;const t=Ce();','function At(e){V=e;const t=Ce();')
# Shiru course: use current puzzle geometry rather than course number for duplicate protection.
edit('public/notebook/shirupure.html',"const p=P[i],phase=", "const p=P[i];window.NPAchievementHooks?.shiruStart(p,state(p));const phase=")
edit('public/notebook/shirupure.html',"const p=P[index];if(!data.cleared.includes(p.id))", "const p=P[index];window.NPAchievementHooks?.shiruClear(p,state(p));if(!data.cleared.includes(p.id))")
edit('public/notebook/shirupure.html',"if(act==='undo'&&s.undo.length){", "if(act==='undo'&&s.undo.length){window.NPAchievements?.capture('undo',{puzzle:p,game:'shirupure'});")
# Crossword record on the exact completion path, not a timer.
edit('public/notebook/crossword-ui.js',"function g(){\n        if(!o)return h();", "function g(){\n        if(!o)return h();window.NPAchievementHooks?.crossword?.(o);")
edit('public/notebook/crossword-ui.js','"reveal-ok" === w ? (o.input', '"reveal-ok" === w ? (o.titleRevealed=true,o.input')
# Tenbin counts attempted checks, not changing the selected symbol.
edit('public/notebook/tenbin-ui.js','n.choice===e.winner(n)?(n.done=!0', 'n.titleChoices=(n.titleChoices||0)+1;n.choice===e.winner(n)?(window.NPAchievements?.capture("clear",{puzzle:n,game:"tenbin",valid:true,revealed:!!n.revealed,level:n.level+1,choices:n.titleChoices}),n.done=!0')
# Wado remains a viewer; no solved record is emitted.
edit('public/notebook/wado-play.js','function open(p){stop();current=p;', 'function open(p){stop();current=p;w.NPAchievementHooks?.wadoView(p);')
edit('public/notebook/wado-play.js',"$('play-hints').hidden=!state.hint;", "$('play-hints').hidden=!state.hint;if(state.hint&&h)w.NPAchievementHooks?.wadoHint(current,h,grade);")
edit('public/notebook/wado-play.js','stop();open(p);}).catch', 'stop();w.NPAchievements?.capture("generated",{puzzle:p,game:"wado",valid:true});open(p);}).catch')
edit('public/notebook/wado-ui.js','if(added&&current){saved++;','if(added&&current){w.NPAchievements?.capture("generated",{puzzle:message.puzzle,game:"wado",valid:true});saved++;')
# Prototype Shiru: richer event adapter is called at render/validation boundaries.
edit('public/notebook/prototype.js','getRoute:()=>({page:g,id:l?.id||""}),','getCurrent:()=>l,getCurrentState:()=>l?D(l):null,getDisplay:()=>l?I[l.variant||"classic"]:null,getRoute:()=>({page:g,id:l?.id||""}),')
print('Patched verified action boundaries')
