'use client';
import {useEffect,useState,useRef} from 'react';
import Support from './support';
import ThemeSettings,{ThemeEntry} from './theme-settings';
import {ChoiceArt,ChoiceArrow} from './theme-art';
import AudioSettings,{getAudio,useSiteAudio} from './audio-settings';
import RankingPanel from './ranking-panel';
import DailyCalendar from './daily-calendar';import {useContactReplies} from './contact-replies';import ContactHistory from './contact-history';import {useKeepAwake} from './awake-setting';import {trackDigit} from '../lib/progress';import LogicHint from './logic-hint';import {coachEngine,coachModel,type LogicalStep} from '../lib/logical-coach';
import {Mail,Trophy,CalendarDays,ChartNoAxesColumn,Sparkles,PenLine,Undo2,Eraser,BookOpen,Heart} from 'lucide-react';
import SiteMenu,{Faq} from './site-menu';
import SiteIntro from './site-intro';
import {currentVersion} from '../lib/releases';
import UpdateNews,{useUpdateNews} from './update-news';
import Tutorial,{RuleGuide} from './tutorial';import PersonalRecords from './personal-records';import BackupPanel from './backup-panel';import {cleanRecords,recordKey,notesFor} from '../lib/player-records';import {readPractice} from '../lib/practice-save';
import ContactForm from './contact-form';import {ReadingToggle} from './reading-settings';
import DailyBoard from './daily-board';
import DailyRuleChoice from './daily-rule-choice';
import {BoardScaleControls} from './daily-view-controls';
import NumberPressPreview from './number-press-preview';
import PlaySettings,{defaultSettings,readSettings,type PlayOptions} from './play-settings';
import {readSelectionDesign,saveSelectionDesign,watchSelectionDesign} from './selection-design';
import {formatTime,pruneNotes,conflicts} from '../lib/daily-play';
import type {DailyPuzzle,DailySummary} from '../lib/daily-types';
import {dailyTitle,dailyRules,ruleLabel,levelLabel} from '../lib/locale';
import {useLocale,LanguagePicker} from './locale-context';
type Session=DailyPuzzle&{id:string;started:number;serverNow:number;finished:boolean;solved?:boolean;elapsed:number|null;ranked:boolean;resumed?:boolean;solution?:number[]};
const time=formatTime;
export default function Game({initialChallenges}:{initialChallenges:DailySummary[]}){
 const {locale,t}=useLocale();const labels=[1,2,3].map(level=>levelLabel(locale,level));
 const frameRef=useRef<HTMLIFrameElement>(null);
 const restoreInProgress=useRef(false);
 const backupOperation=useRef(false);
 const [backupBusy,setBackupBusy]=useState(false);
 const dataFrameRef=useRef<HTMLIFrameElement>(null);
 const [dataFrameLoaded,setDataFrameLoaded]=useState(false);
 const [dataFrameStatus,setDataFrameStatus]=useState<'loading'|'slow'|'ready'|'failed'>('loading');
 const pendingTool=useRef<string|null>(null);
 const expectedDocument=useRef('/notebook/index.html');
 const [practiceStatus,PS]=useState<'loading'|'slow'|'ready'>('loading');
 function setBackupOperationBusy(active:boolean){backupOperation.current=active;setBackupBusy(active)}
 function dismissPanel(){if(backupOperation.current||restoreInProgress.current)return;P(null)}
 function syncNotebookPreferences(child:any){
  const theme=(window as any).NPSiteTheme?.get()||'notebook';if(child.NPSiteTheme?.get()!==theme)child.NPSiteTheme?.apply(theme);if(child.NPI18n&&child.NPI18n.get()!==locale)child.NPI18n.set(locale);const reading=!!(window as any).NPFurigana?.getEnabled();if(child.NPFurigana?.getEnabled()!==reading)child.NPFurigana?.setEnabled(reading,false);
 }
 function notebookHasData(child:any){
  try{return !!(child&&child.document.readyState!=='loading'&&child.NPWebsiteHome&&child.NPStorage?.flush&&child.NPRecovery?.capture&&child.NPRecovery?.validate&&child.NPVideo?.allAttempts)}catch{return false}
 }
 function notebookNeedsDataFrame(){
  const child=frameRef.current?.contentWindow as any;
  try{return !!(child&&!notebookHasData(child)&&child.location.href!=='about:blank'&&!child.location.pathname.endsWith('/notebook/index.html'))}catch{return false}
 }
 function notebookForData(){
  const active=frameRef.current?.contentWindow as any;
  const child=notebookHasData(active)?active:dataFrameRef.current?.contentWindow as any;
  if(!child||child===active)return child;
  // Keep the active tool open, but include its latest progress in a backup.
  const prepare=async()=>{
   const saved=active?.NPBeforeBackup?await active.NPBeforeBackup():await active?.appPause?.();
   if(saved===false)throw Error('保存できませんでした。');
   await active?.NPStorage?.flush?.();await child.NPBeforeBackup?.();
  };
  const canRestore=()=>!active?.NPRecoveryCanRestore||active.NPRecoveryCanRestore();
  return {localStorage:child.localStorage,NPStorage:child.NPStorage,NPVideo:child.NPVideo,NPBeforeBackup:prepare,NPRecoveryCanRestore:canRestore,NPRecovery:{...child.NPRecovery,restore:async(value:any)=>{
   child.NPRecovery.validate(value);
   if(!canRestore())throw Error('問題生成を停止してから復元してください。');
   await prepare();if(!canRestore())throw Error('問題生成を停止してから復元してください。');
   const frame=frameRef.current;let previousURL='',previousPath='';
   try{
    if(frame&&active&&frame.contentWindow===active&&active.location.href!=='about:blank'){
     previousURL=active.location.href;previousPath=active.location.pathname;
     // Each tool has its own restoration flag. Remove its old save handlers
     // before replacing shared data, so reload cannot write stale progress.
     await new Promise<void>((resolve,reject)=>{
      let timeout=0;
      const cleanup=()=>{frame.removeEventListener('load',loaded);window.clearTimeout(timeout)};
      const loaded=()=>{try{if(frame.contentWindow?.location.href!=='about:blank')return;cleanup();resolve()}catch(error){cleanup();reject(error)}};
      frame.addEventListener('load',loaded);
      timeout=window.setTimeout(()=>{cleanup();reject(Error('読み込みに時間がかかっています。'))},10000);
      try{active.location.replace('about:blank')}catch(error){cleanup();reject(error)}
     });
    }
    return await child.NPRecovery.restore(value);
   }catch(error){
    if(previousURL&&frameRef.current===frame){try{expectedDocument.current=previousPath;PS('loading');frame?.contentWindow?.location.replace(previousURL)}catch{}}
    throw error;
   }
  }}};
 }
 const syncDataFrame=()=>{
  const child=dataFrameRef.current?.contentWindow as any;if(!child)return false;
  try{syncNotebookPreferences(child);if(child.document.getElementById('storage-retry')){setDataFrameStatus('failed');return false}if(!notebookHasData(child))return false;setDataFrameStatus('ready');return true}catch{return false}
 };
 function retryNotebookData(){
  if(dataFrameLoaded||notebookNeedsDataFrame()){setDataFrameStatus('loading');if(dataFrameRef.current)dataFrameRef.current.contentWindow?.location.reload();else setDataFrameLoaded(true)}
  else{PS('loading');PL(true);frameRef.current?.contentWindow?.location.reload()}
 }
 const syncFrame=()=>{
  const child=frameRef.current?.contentWindow as any;if(!child)return false;
  try{
   syncNotebookPreferences(child);
   if(!child.location.pathname.endsWith(expectedDocument.current))return false;
   if(child.document.getElementById('storage-retry')){pendingTool.current=null;PS('ready');return true}
   if(expectedDocument.current.endsWith('/index.html')&&!child.NPWebsiteHome)return false;
   if(child.document.readyState==='loading')return false;
   const target=pendingTool.current;
   if(target&&child.NPWebsiteHome){pendingTool.current=null;if(target==='open-shirupure')expectedDocument.current='/notebook/shirupure.html';if(target==='rules')child.NPWebsiteHome();else child.NPWebsiteTool?.(target);if(target==='open-shirupure')return false}
   PS('ready');return true;
  }catch{return false}
 };
 const [tab,T]=useState<'home'|'challenge'|'daily'|'practice'>('home'),[level,L]=useState(1),[session,S]=useState<Session|null>(null),[grid,G]=useState<number[]>([]),[notes,N]=useState<Record<number,number[]>>({}),[selected,C]=useState(-1),[memo,M]=useState(false),[undoHistory,H]=useState<{grid:number[],notes:Record<number,number[]>}[]>([]),[name,B]=useState(''),[busy,Q]=useState(false),[message,E]=useState(''),[now,W]=useState(0),[elapsedBase,O]=useState(0),[done,D]=useState(false);
 const [challenges,CH]=useState(initialChallenges),[practiceLoaded,PL]=useState(false);
 useEffect(()=>{if(practiceLoaded)syncFrame()},[locale,practiceLoaded]);
 useEffect(()=>{if(!practiceLoaded||practiceStatus==='ready')return;syncFrame();const check=window.setInterval(syncFrame,150),slow=window.setTimeout(()=>PS(value=>value==='ready'?value:'slow'),10000);return()=>{clearInterval(check);clearTimeout(slow)}},[practiceLoaded,practiceStatus,locale]);
 const [panel,P]=useState<'menu'|'faq'|'help'|'ranking'|'finish'|'support'|'contact'|'settings'|'start'|'leave'|'practice-confirm'|'hint'|'stats'|'tutorial'|'personal'|'backup'|'updates'|'check-result'|'calendar'|'replies'|'lesson'|'audio'|'theme'|'rule-choice'|null>(null);const dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{
  if(panel!=='backup'&&panel!=='personal'){if(backupOperation.current||restoreInProgress.current)return;setDataFrameLoaded(false);setDataFrameStatus('loading');return}
  PL(true);if(notebookNeedsDataFrame())setDataFrameLoaded(true);
 },[panel,practiceLoaded,practiceStatus,backupBusy]);
 useEffect(()=>{if(dataFrameLoaded)syncDataFrame()},[locale,dataFrameLoaded]);
 useEffect(()=>{if(!dataFrameLoaded||dataFrameStatus==='ready'||dataFrameStatus==='failed')return;syncDataFrame();const check=window.setInterval(syncDataFrame,150),slow=window.setTimeout(()=>setDataFrameStatus(value=>value==='loading'?'slow':value),10000);return()=>{clearInterval(check);clearTimeout(slow)}},[dataFrameLoaded,dataFrameStatus,locale]);
 const [settings,SET]=useState<PlayOptions>(defaultSettings),[chosen,CHOSEN]=useState(0),[records,RECORDS]=useState<{level:number;started:number;finished:number|null;solved?:number|null;abandoned:number|null}[]>([]),[serverNow,SNOW]=useState(0),[misses,MISSES]=useState(0),[hintStage,HS]=useState(0),[hintCell,HC]=useState(-1),[stats,STATS]=useState<{wins:number;plays:number;perfect:number;streak:number;bestStreak:number;total:number;best:number;hints:number}>({wins:0,plays:0,perfect:0,streak:0,bestStreak:0,total:0,best:0,hints:0});
 const [resumeData,RESUME]=useState<any>(null),[seenRules,SEEN]=useState<string[]>([]),[tutorialDone,TD]=useState(true),[saveProblem,SP]=useState('');const runId=useRef('');const saveError=useRef('');const checkedGrid=useRef('');
 const news=useUpdateNews();const replyCount=useContactReplies();const [logicalHint,LH]=useState<LogicalStep|null>(null),[logicBusy,LB]=useState(false);const logicalCuts=useRef<{base:string;cuts:{i:number;d:number}[]}>({base:'',cuts:[]});const [freePlaying,FP]=useState(false);const hintContext=useRef<any>(null);hintContext.current={id:session?.id,grid:grid.join(','),panel};const awakeMessage=useKeepAwake(settings.keepAwake,(tab==='daily'&&!done)||tab==='practice'&&freePlaying);
 useEffect(()=>{const receive=(e:MessageEvent)=>{if(e.source!==frameRef.current?.contentWindow)return;if(e.data?.type==='np-site-open'&&['personal','backup','ranking','calendar','settings','audio','theme'].includes(e.data.panel)){P(e.data.panel);return}if(e.data?.type==='np-notebook-playing')FP(!!e.data.playing)};window.addEventListener('message',receive);return()=>window.removeEventListener('message',receive)},[]);
 useSiteAudio(tab==='daily'&&!done||tab==='practice'&&freePlaying);
 const [pendingDaily,PD]=useState<Session|null>(null);const openedDaily=useRef(new Set<string>());
 const practiceClock=useRef({elapsed:0,at:0,active:false});
 const timeAnchor=useRef(0),hold=useRef<ReturnType<typeof setTimeout>|null>(null),longPress=useRef(false),leaveAction=useRef<()=>void>(()=>{}),guard=useRef(false),allowBack=useRef(false),restorePop=useRef(false),statsReady=useRef(false),audio=useRef<AudioContext|null>(null),recorded=useRef(''),hintCount=useRef(0);
 guard.current=tab==='daily'&&!!session&&!done;
 const [dailyFit,setDailyFit]=useState(false),[dailyScale,setDailyScale]=useState<number|undefined>(),[dailyMinimum,setDailyMinimum]=useState(100);
 useEffect(()=>{setDailyFit(false);setDailyScale(undefined)},[session?.id,settings.cellSize]);
 const [dismissedPlayNotice,setDismissedPlayNotice]=useState('');
 useEffect(()=>{setDismissedPlayNotice('');if(!message)return;const id=setTimeout(()=>setDismissedPlayNotice(message),6000);return()=>clearTimeout(id)},[message]);
 const updateSettings=(v:PlayOptions)=>{const next=readSettings(v);SET(next);try{localStorage.setItem('np-daily-settings-v1',JSON.stringify(next))}catch{}if(next.selectionDesign!==settings.selectionDesign)saveSelectionDesign(next.selectionDesign)};
 useEffect(()=>{try{SET(readSettings(JSON.parse(localStorage.getItem('np-daily-settings-v1')||'null')));const st=JSON.parse(localStorage.getItem('np-daily-stats-v1')||'null');if(st&&Object.keys(stats).every(k=>Number.isFinite(st[k])))STATS(st)}catch{}try{RESUME(readPractice(JSON.parse(localStorage.getItem('np-practice-resume-v1')||'null')));const seen=JSON.parse(localStorage.getItem('np-seen-rules-v1')||'[]');if(Array.isArray(seen))SEEN(seen.filter(x=>typeof x==='string'));TD(localStorage.getItem('np-tutorial-v1')==='done')}catch{}statsReady.current=true},[]);
 useEffect(()=>{const apply=(selectionDesign:PlayOptions['selectionDesign'])=>SET(current=>current.selectionDesign===selectionDesign?current:{...current,selectionDesign});apply(readSelectionDesign());return watchSelectionDesign(apply)},[]);
 useEffect(()=>{if(statsReady.current)try{localStorage.setItem('np-daily-stats-v1',JSON.stringify(stats))}catch{}},[stats]);
 useEffect(()=>{const media=matchMedia('(prefers-color-scheme: dark)');const apply=()=>{document.documentElement.dataset.playPalette=settings.systemTheme?(media.matches?'dark':'light'):settings.palette};apply();media.addEventListener('change',apply);return()=>media.removeEventListener('change',apply)},[settings.palette,settings.systemTheme]);
 useEffect(()=>{const unload=(event:BeforeUnloadEvent)=>{if(guard.current){event.preventDefault();event.returnValue=''}};window.addEventListener('beforeunload',unload);return()=>window.removeEventListener('beforeunload',unload)},[]);
 function resetClock(base:number){timeAnchor.current=performance.now();practiceClock.current.elapsed=Math.max(0,base);practiceClock.current.at=timeAnchor.current;O(Math.max(0,base));W(timeAnchor.current)}
 function recordResult(win:boolean,elapsed:number){if(!session)return;const id=session.ranked?session.id:runId.current||session.id;if(recorded.current===id)return;recorded.current=id;if(win)getAudio()?.effect('complete');try{const rows=cleanRecords(JSON.parse(localStorage.getItem(recordKey)||'[]'));if(rows.some(r=>r.id===id))return;rows.push({id,at:Date.now(),day:session.day,kind:session.kind,n:session.n,level:session.level,elapsed,ranked:session.ranked,win,hints:hintCount.current,misses});localStorage.setItem(recordKey,JSON.stringify(rows))}catch{SP('記録を保存できませんでした。空き容量とブラウザの設定を確認してください。')}STATS(st=>{const streak=win?st.streak+1:0;return {wins:st.wins+(win?1:0),plays:st.plays+1,perfect:st.perfect+(win&&!misses&&!hintCount.current?1:0),streak,bestStreak:Math.max(st.bestStreak,streak),total:st.total+(win?elapsed:0),best:win?st.best?Math.min(st.best,elapsed):elapsed:st.best,hints:st.hints+hintCount.current}})}
 function feedback(event='input'){if(settings.vibration)navigator.vibrate?.(15);getAudio()?.effect(event)}
 const starting=useRef(false);
 const navigation=useRef({owner:'',screen:'home',route:'',depth:0,skipTab:false,suppressRoute:false,skipPop:false,trail:[''],root:false,childBack:false});
 useEffect(()=>{
  const h=navigation.current;h.owner=crypto.randomUUID();window.history.replaceState({npOwner:h.owner,npScreen:'home',npRoute:'',npDepth:0},'',location.href);
  const pop=(event:PopStateEvent)=>{const state=event.state;if(state?.npOwner!==h.owner)return;if(restorePop.current){restorePop.current=false;return}if(guard.current&&!allowBack.current&&state.npScreen!=='daily'){const delta=h.depth-state.npDepth;restorePop.current=true;window.history.go(delta);leaveAction.current=()=>{allowBack.current=true;window.history.go(-delta)};P('leave');return}allowBack.current=false;const previous=h.screen,alreadyMoved=h.skipPop;h.skipPop=false;h.depth=state.npDepth;h.screen=state.npScreen;h.route=state.npRoute||'';if(alreadyMoved)return;
   if(previous==='practice'&&h.screen==='practice'){
    const child=frameRef.current?.contentWindow as any;const expected=h.route.startsWith('/')?h.route.split(':')[0]:'/notebook/index.html';expectedDocument.current=expected;
    // Browser history may already have restored the child document. Do not run Back twice.
    h.suppressRoute=true;
    if(child?.NPRouteKey===h.route){h.suppressRoute=false;return;}
    if(child?.location?.pathname===expected&&!child?.NPRouteKey)return;
    if(child?.location?.pathname&&child.location.pathname!==expected){let hash='';try{const flow=JSON.parse(h.route)[0];if(flow==='prototype')hash='#prototype';else if(flow==='home')hash='#numbers'}catch{}child.location.replace(expected+hash);return;}
    if(typeof child?.appBack==='function')child.appBack();else child?.location.replace(expected);
   }else{h.skipTab=true;T(h.screen as 'home'|'challenge'|'daily'|'practice')}

  };
  const route=(event:MessageEvent)=>{
   if(event.source===frameRef.current?.contentWindow&&event.data?.type==='np-notebook-back-intent'){h.childBack=event.data.back===true;return;}
   if(event.source!==frameRef.current?.contentWindow||event.data?.type!=='np-notebook-route'||typeof event.data.key!=='string'||h.screen!=='practice')return;
   const key=event.data.key,childBack=h.childBack||event.data.intent==='back';h.childBack=false;h.root=event.data.root===true;
   const state=()=>({npOwner:h.owner,npScreen:h.screen,npRoute:key,npDepth:h.depth});
   if(h.suppressRoute){h.suppressRoute=false;h.route=key;h.trail[h.depth]=key;window.history.replaceState(state(),'',location.href);return}
   if(key===h.route)return;
   const first=!h.route;h.route=key;
   // The first child screen belongs to the entry into practice, not an extra Back step.
   if(first){h.trail[h.depth]=key;window.history.replaceState(state(),'',location.href);return}
   // Child Back/Choose puzzles already changed its screen; move history without doing Back twice.
   const ancestor=!childBack&&(event.data.freshDocument===true||event.data.intent==='forward')?-1:h.trail.slice(0,h.depth).lastIndexOf(key);
   if(ancestor>=0){h.skipPop=true;window.history.go(ancestor-h.depth);return}
   h.depth++;h.trail=h.trail.slice(0,h.depth);h.trail[h.depth]=key;window.history.pushState(state(),'',location.href);
  };
  window.addEventListener('popstate',pop);window.addEventListener('message',route);return()=>{window.removeEventListener('popstate',pop);window.removeEventListener('message',route)};
 },[]);
 useEffect(()=>{const h=navigation.current;if(h.skipTab){h.skipTab=false;h.screen=tab;return}if(h.screen===tab)return;h.screen=tab;h.route='';h.root=false;h.depth++;h.trail=h.trail.slice(0,h.depth);h.trail[h.depth]='';window.history.pushState({npOwner:h.owner,npScreen:tab,npRoute:h.route,npDepth:h.depth},'',location.href)},[tab]);

 useEffect(()=>{if(panel){if(!dialog.current?.open)dialog.current?.showModal();if(dialog.current)dialog.current.scrollTop=0}else dialog.current?.close()},[panel]);
 useEffect(()=>{P(null);window.scrollTo(0,0)},[tab]);
 useEffect(()=>{const view=new URLSearchParams(window.location.search).get('view');if(view==='daily')T('challenge');else if(['ranking','backup','calendar','personal'].includes(view||''))P(view as 'ranking'|'backup'|'calendar'|'personal')},[]);
 async function refreshChallenges(){try{const r=await fetch('/api/daily');const d:any=await r.json();if(r.ok&&Array.isArray(d.challenges))CH(d.challenges);if(Array.isArray(d.records))RECORDS(d.records);if(d.serverNow)SNOW(d.serverNow)}catch{}}
 useEffect(()=>{refreshChallenges();const id=setInterval(refreshChallenges,60000);window.addEventListener('focus',refreshChallenges);return()=>{clearInterval(id);window.removeEventListener('focus',refreshChallenges)}},[]);
 useEffect(()=>{if(tab==='challenge')refreshChallenges()},[tab]);
 useEffect(()=>{try{B(localStorage.getItem('np-display-name')||'')}catch{}},[]);
 useEffect(()=>{
  const c=practiceClock.current;c.active=false;if(tab!=='daily'||!session||done)return;
  let id:ReturnType<typeof setInterval>|undefined;
  const advance=(render=true)=>{const point=performance.now();if(c.active)c.elapsed+=Math.max(0,point-c.at);c.at=point;if(render)W(point)};
  const visible=()=>{advance();c.active=!session.ranked&&!document.hidden;if(id)clearInterval(id);id=document.hidden?undefined:setInterval(advance,500)};
  c.at=performance.now();visible();document.addEventListener('visibilitychange',visible);
  return()=>{advance(false);c.active=false;if(id)clearInterval(id);document.removeEventListener('visibilitychange',visible)};
 },[tab,session?.id,session?.ranked,done]);
 useEffect(()=>{if(!session)return;const persist=()=>{if(restoreInProgress.current)return;try{const elapsed=session.ranked?0:practiceClock.current.elapsed;const data={grid,notes,elapsed,misses,hints:hintCount.current,runId:runId.current};localStorage.setItem('np-daily-'+session.id,JSON.stringify(data));if(!session.ranked){if(done){localStorage.removeItem('np-practice-resume-v1');RESUME(null)}else{const saved={...data,session};localStorage.setItem('np-practice-resume-v1',JSON.stringify(saved));RESUME(saved)}}saveError.current='';SP('')}catch{saveError.current='途中経過を保存できませんでした。閉じる前に引き継ぎファイルを保存してください。';SP(saveError.current)}};persist();const id=setInterval(persist,2000);window.addEventListener('pagehide',persist);document.addEventListener('visibilitychange',persist);window.addEventListener('np-save-now',persist);return()=>{clearInterval(id);window.removeEventListener('pagehide',persist);document.removeEventListener('visibilitychange',persist);window.removeEventListener('np-save-now',persist)}},[grid,notes,session,done,misses]);
 async function start(chosenLevel=level,mode='auto',day?:string,resume=false){
  if(starting.current)return;starting.current=true;L(chosenLevel);Q(true);E('');
  try{
   const r=await fetch('/api/daily',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'start',level:chosenLevel,mode,day})});
   const d:Session&{error?:string}=await r.json();if(!r.ok)throw Error(d.error);
   let saved;try{saved=JSON.parse(localStorage.getItem('np-daily-'+d.id)||'null')}catch{}
   const valid=mode!=='practice'&&d.resumed&&Array.isArray(saved?.grid)&&saved.grid.length===d.n*d.n&&saved.grid.every((v:number,i:number)=>Number.isInteger(v)&&v>=0&&v<=d.n&&(!d.puzzle[i]||v===d.puzzle[i]));
   const key=d.day+':'+chosenLevel;const hasProgress=valid&&(saved.grid.some((v:number,i:number)=>v!==d.puzzle[i])||Object.values(notesFor(saved.notes,d.n)).some(v=>v.length)||saved.elapsed>0);
   if(mode==='auto'&&d.resumed&&!d.finished&&!d.solved&&!resume&&!openedDaily.current.has(key)&&(d.ranked||hasProgress)){PD(d);P('start');return;}
   openedDaily.current.add(key);PD(null);
   S(d);G(valid?saved.grid:d.puzzle.slice());N(valid?notesFor(saved.notes,d.n):{});H([]);C(-1);M(false);CHOSEN(0);MISSES(valid&&Number.isInteger(saved.misses)?saved.misses:0);recorded.current='';hintCount.current=valid&&Number.isInteger(saved.hints)?saved.hints:0;runId.current=valid&&typeof saved.runId==='string'?saved.runId:crypto.randomUUID();checkedGrid.current='';logicalCuts.current={base:'',cuts:[]};D(d.finished||!!d.solved);resetClock(d.ranked?(d.resumed?d.serverNow-d.started:0):valid&&Number.isFinite(saved.elapsed)?saved.elapsed:0);T('daily');P(null);if(d.resumed&&d.ranked&&!d.finished&&!d.solved)E('続きから再開しました。ランキングの計測には離れていた時間も含みます。');void refreshChallenges();
  }catch(e){E((e as Error).message)}finally{starting.current=false;Q(false)}
 }
 function chooseDaily(chosenLevel:number){L(chosenLevel);E('');if(session?.level===chosenLevel&&session.day===challenges[0]?.day){P(null);T('daily');return;}if(records.some(r=>r.level===chosenLevel)){void start(chosenLevel,'auto');return;}P('rule-choice');}
 function enter(v:number,cell=selected){if(cell<0||!session||session.puzzle[cell]||done||busy||v<0||v>session.n)return;
  if(!session.ranked&&settings.mistakeLimit&&misses>=settings.mistakeLimit)return;
  if(!memo&&v&&grid[cell]!==v)trackDigit(runId.current||session.id,cell,v);
  H(h=>[...h.slice(-199),{grid:[...grid],notes:structuredClone(notes)}]);E('');feedback(v===0?'erase':memo?'note':'input');
  if(memo&&v){G(a=>a.map((x,i)=>i===cell?0:x));N(a=>({...a,[cell]:(a[cell]||[]).includes(v)?a[cell].filter(x=>x!==v):[...(a[cell]||[]),v].sort((a,b)=>a-b)}))}
  else{G(a=>{const next=a.map((x,i)=>i===cell?v:x);if(settings.autoNext&&settings.numberFirst&&v&&next.filter(x=>x===v).length>=session.n)CHOSEN(Array.from({length:session.n},(_,i)=>(v+i)%session.n+1).find(d=>next.filter(x=>x===d).length<session.n)||0);return next});N(a=>settings.prune?pruneNotes(session,a,cell,v):Object.fromEntries(Object.entries(a).filter(([k])=>Number(k)!==cell)));if(!session.ranked&&session.solution&&v&&v!==session.solution[cell]){MISSES(m=>m+1);if(settings.mistakeLimit&&misses+1>=settings.mistakeLimit){E('ミス上限に達しました。練習をやり直せます。');recordResult(false,clock)}}}
 }
 function selectCell(i:number){C(i);if(settings.numberFirst&&chosen)enter(chosen,i)}
 function number(v:number){if(longPress.current){longPress.current=false;return}if(settings.numberFirst)CHOSEN(chosen===v?0:v);else if(selected<0)E('マスを選んでください。数字を長押しして先に選ぶこともできます。');else enter(v)}
 function pressNumber(v:number){longPress.current=false;if(!settings.holdMs)return;hold.current=setTimeout(()=>{longPress.current=true;CHOSEN(v);updateSettings({...settings,numberFirst:true})},settings.holdMs)}
 function releaseNumber(){if(hold.current){clearTimeout(hold.current);hold.current=null}}
 async function practice(){if(!session)return;Q(true);E('');try{const r=await fetch('/api/daily',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'abandon',id:session.id,level:session.level})});const d:any=await r.json();if(!r.ok)throw Error(d.error);S({...session,ranked:false,solution:d.solution});resetClock(0);P(null);void refreshChallenges()}catch(e){E((e as Error).message)}finally{Q(false)}}
 function restartPractice(){if(!session||session.ranked)return;G(session.puzzle.slice());N({});H([]);C(-1);D(false);MISSES(0);checkedGrid.current='';recorded.current='';hintCount.current=0;runId.current=crypto.randomUUID();resetClock(0);E('');P(null)}
 async function openHint(){if(!session||session.ranked||logicBusy)return;LH(null);LB(true);HS(0);P('hint');HC(-1);try{const index=grid.findIndex((v,i)=>v&&v!==session.solution?.[i]);if(index>=0){HC(index);return}const engine=await coachEngine(),base=grid.join(',');if(hintContext.current.id!==session.id||hintContext.current.grid!==base||hintContext.current.panel!=='hint')return;const cuts=logicalCuts.current.base===base?logicalCuts.current.cuts:[];const result=engine.detect(coachModel(session,grid,cuts),{selected,budgetMs:250});if(result){LH(result);HC(result.focus[0]);hintCount.current++}else HC(grid.findIndex(v=>!v))}catch(e){E((e as Error).message)}finally{LB(false)}}
 function applyLogicalHint(){if(!session||session.ranked||!logicalHint)return;H(h=>[...h.slice(-199),{grid:[...grid],notes:structuredClone(notes)}]);if(logicalHint.cuts.length){const base=grid.join(','),old=logicalCuts.current.base===base?logicalCuts.current.cuts:[];logicalCuts.current={base,cuts:[...old,...logicalHint.cuts]};N(previous=>{const next={...previous};for(const i of new Set(logicalHint.cuts.map(c=>c.i)))next[i]=logicalHint.candidates[i].filter(d=>!logicalHint.cuts.some(c=>c.i===i&&c.d===d));return next})}else{const cell=logicalHint.focus[0],value=logicalHint.digits[0];G(a=>a.map((v,i)=>i===cell?value:v));N(a=>pruneNotes(session,a,cell,value));C(cell)}P(null)}
 function playCalendar(day:string,chosenLevel:number){leaveAction.current=()=>{if(day===challenges[0]?.day){chooseDaily(chosenLevel)}else void start(chosenLevel,'practice',day)};if(guard.current)P('leave');else leaveAction.current()}


 useEffect(()=>{if(tab!=='daily'||panel||!session)return;const n=session.n;const handler=(e:KeyboardEvent)=>{
  if(['INPUT','TEXTAREA','SELECT'].includes((e.target as HTMLElement).tagName))return;
  const value=/^[1-9]$/.test(e.key)?Number(e.key):n>9&&/^[a-z]$/i.test(e.key)?e.key.toUpperCase().charCodeAt(0)-55:0;
  if(value>0&&value<=n){e.preventDefault();number(value)}else if(['Backspace','Delete','0'].includes(e.key)){e.preventDefault();enter(0)}else if(e.key.startsWith('Arrow')){e.preventDefault();const delta=({ArrowLeft:-1,ArrowRight:1,ArrowUp:-n,ArrowDown:n} as Record<string,number>)[e.key];if(delta!==undefined)C(i=>Math.max(0,Math.min(n*n-1,(i<0?0:i)+delta)))}
 };window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler)},[tab,selected,grid,notes,memo,session,done,panel,settings,chosen,busy]);
 async function submit(){if(!session)return;Q(true);E('');try{const r=await fetch('/api/daily',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'finish',id:session.id,level:session.level,grid,name})});const d:any=await r.json();if(!r.ok)throw Error(d.error);D(true);P(null);S({...session,finished:true,elapsed:d.elapsed});recordResult(true,d.elapsed);try{localStorage.setItem('np-display-name',name)}catch{}E('クリア！ランキングに記録しました。')}catch(e){E((e as Error).message)}finally{Q(false)}}
 function goBack(){if(guard.current&&!allowBack.current){leaveAction.current=()=>{allowBack.current=true;goBack()};P('leave');return}allowBack.current=false;const h=navigation.current;if(tab==='practice'){const child=frameRef.current?.contentWindow as any;const route=child?.NanpureAppTest?.getRoute?.();if(route?.flow==='hub'||h.root){if(window.history.state?.npOwner===h.owner&&h.depth>0)window.history.go(-h.depth);else T('home');return}if(child?.document?.querySelector('dialog[open]')&&child?.appBack){child.appBack();return}if(window.history.state?.npOwner===h.owner&&h.depth>0){window.history.back();return}if(child?.appBack){child.appBack();return}}if(window.history.state?.npOwner===h.owner&&h.depth>0){allowBack.current=true;window.history.back();return}if(tab==='daily'){T('challenge');return}if(tab!=='practice'){T('home');return}const frame=document.querySelector<HTMLIFrameElement>('iframe.notebook');const child=frame?.contentWindow as any;const route=child?.NanpureAppTest?.getRoute?.();if(route?.flow==='home'||route?.flow==='hub'){T('home');return}if(typeof child?.appBack==='function')child.appBack();else T('home')}
 const clock=session?(done?session.elapsed||0:session.ranked?elapsedBase+Math.max(0,now-timeAnchor.current):practiceClock.current.elapsed):0;
 async function checkCompletion(){
  if(!session||done||grid.length!==session.n*session.n||grid.includes(0))return;
  if(!session.ranked){
   if(grid.every((v,i)=>v===session.solution?.[i])){D(true);S({...session,elapsed:clock});recordResult(true,clock);E('');}
   else{getAudio()?.effect('error');E('すべて埋まりましたが、まだ正しくないマスがあります。見直してみましょう。');P('check-result')}
   return;
  }
  Q(true);E('答えを確認しています…');
  try{const r=await fetch('/api/daily',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'check',id:session.id,level:session.level,grid})});const d:any=await r.json();if(!r.ok)throw Error(d.error);if(d.correct){D(true);S({...session,solved:true,finished:!!d.finished,elapsed:d.elapsed});recordResult(true,d.elapsed);E('');void refreshChallenges()}else{getAudio()?.effect('error');E('すべて埋まりましたが、まだ正しくないマスがあります。見直してみましょう。');P('check-result')}}catch(e){E((e as Error).message)}finally{Q(false)}
 }
 useEffect(()=>{if(tab!=='daily'||!session||done||grid.length!==session.n*session.n)return;if(grid.every(Boolean)){const key=session.id+':'+grid.join(',');if(checkedGrid.current!==key){checkedGrid.current=key;void checkCompletion()}return}checkedGrid.current='';if(!session.ranked&&session.solution&&settings.autoComplete&&grid.filter(v=>!v).length===1&&grid.every((v,i)=>!v||v===session.solution![i])){hintCount.current++;G(session.solution.slice())}},[grid,session?.id,done,tab,settings.autoComplete]);


 async function openPractice(action='rules'){
  pendingTool.current=action;expectedDocument.current='/notebook/index.html';PS('loading');PL(true);T('practice');P(null);const child=frameRef.current?.contentWindow as any;
  if(child?.NPWebsiteHome){syncFrame();return}
  // A loading notebook already owns the pending action. Restart only when returning from another tool.
  if(child&&child.location.pathname!=='blank'&&child.location.href!=='about:blank'&&!child.location.pathname.endsWith('/notebook/index.html')){try{await child.appPause?.()}catch{}child.location.replace('/notebook/index.html')}
 }
 function navigatePracticeTool(action:string){leaveAction.current=()=>{void openPractice(action)};if(guard.current)P('leave');else leaveAction.current()}

 const selectedSummary=challenges.find(p=>p.level===level);
 function markRule(kind:string){const next=Array.from(new Set([...seenRules,kind]));SEEN(next);try{localStorage.setItem('np-seen-rules-v1',JSON.stringify(next))}catch{}}
 function resumePractice(){const saved=readPractice(resumeData);if(!saved)return;S(saved.session);G(saved.grid);N(saved.notes);MISSES(saved.misses);hintCount.current=saved.hints;runId.current=saved.runId||crypto.randomUUID();H([]);C(-1);M(false);D(false);recorded.current='';resetClock(saved.elapsed);T('daily');E('通常プレイの続きから再開しました。休んでいた時間は含みません。')}
 function imported(){guard.current=false;location.reload()}

 const nativePlaying=tab==='daily'&&!!session&&!done;
 const routinePlayMessage=message==='続きから再開しました。ランキングの計測には離れていた時間も含みます。'||message==='通常プレイの続きから再開しました。休んでいた時間は含みません。';
 const playNotice=saveProblem||(!routinePlayMessage&&message!==dismissedPlayNotice?message:'');
 const playing=nativePlaying||tab==='practice'&&freePlaying;
 const notebookDataReady=notebookHasData(frameRef.current?.contentWindow)||dataFrameLoaded&&dataFrameStatus==='ready'&&notebookHasData(dataFrameRef.current?.contentWindow);
 const notebookDataStatus=dataFrameLoaded||notebookNeedsDataFrame()?dataFrameStatus:practiceStatus==='ready'?'failed':practiceStatus;
 const notebookDataLoading=<section className="notebook-loading" role="status"><p>{t(notebookDataStatus==='failed'?'保存データを読み込めませんでした。':notebookDataStatus==='slow'?'読み込みに時間がかかっています。':'問題帳を読み込んでいます…')}</p>{(notebookDataStatus==='slow'||notebookDataStatus==='failed')&&<button className="secondary-action" onClick={retryNotebookData}>{t('再読み込み')}</button>}</section>;
 return <div data-playing={playing?'true':undefined} data-native-playing={nativePlaying?'true':undefined} data-np-aid={settings.tapAssist} data-np-tolerance={settings.dragTolerance} className={`site-shell mode-${tab} ${settings.nonColor?'noncolor':''} hand-${settings.hand} keypad-${settings.keypadLayout} ${settings.keypadSize>100?'big-keys':''}`} style={{'--key-scale':settings.keypadSize/100} as React.CSSProperties}>
  <NumberPressPreview enabled={nativePlaying&&!panel&&!busy} tolerance={settings.tapAssist?settings.dragTolerance:12} onCancel={releaseNumber}/>
  <header className="header">
   {tab==='home'?<span className="brand">{t('ナンプレ帳')}</span>:<button className="back-button" onClick={goBack} aria-label={t('前の画面に戻る')}>‹ {t('戻る')}</button>}
   {tab!=='home'&&<span className="screen-name">{tab==='practice'?t('自由に遊ぶ'):t('日替わり問題帳')}</span>}
   <div className="header-actions">{!playing&&<><a className="header-support" href="https://ofuse.me/o?uid=228296" target="_blank" rel="noopener noreferrer">OFUSE ↗</a><LanguagePicker/></>}{nativePlaying&&<button className="play-settings-button" onClick={()=>P('settings')} aria-label={t('プレイ中の設定')} title={t('設定')}>⚙</button>}<button className="menu-button" onClick={()=>P('menu')} aria-label={t(news.latest!==currentVersion?'新しい版があります':'メニュー')}>☰{(news.unread||news.latest!==currentVersion||playing&&replyCount>0)&&<span className="news-dot" aria-hidden="true">●</span>}</button></div>
  </header>
  {!playing&&<nav className="quick-help" aria-label={t('サポート')}>{tab==='practice'&&<button className="choose-rules" onClick={()=>void openPractice()}>{t('問題を選ぶ')}</button>}{tab!=='home'&&<button onClick={()=>P('audio')} aria-label={t('BGM・効果音')}>♫ {t('音')}</button>}{replyCount>0&&<button className="reply-badge" onClick={()=>P('replies')}>{t('返答あり')} · {replyCount}</button>}<button onClick={()=>P('contact')}><Mail size={22} aria-hidden="true" strokeWidth={2}/><span>{t('お問い合わせ')}</span></button></nav>}
  {tab==='home'?<main className="start-screen designed-home"><div className="home-topline"><span className="home-eyebrow">PUZZLE &amp; NOTEBOOK</span><ThemeEntry compact onOpen={()=>P('theme')}/></div><div className="start-title"><span className="notebook-mark" aria-hidden="true">数</span><div><h1>{t('ナンプレ帳')}</h1><p>{t('ひと息ついて、数字と遊ぶ。')}</p></div></div><div className="start-choices"><button className="choice-card main-choice" onClick={()=>void openPractice()}><ChoiceArt/><span className="choice-copy"><strong>{t('自由に遊ぶ')}</strong><small>{t('好きなルールで、自分のペースで。')}</small></span><ChoiceArrow/></button><button className="choice-card daily-choice" onClick={()=>T('challenge')}><ChoiceArt daily/><span className="choice-copy"><strong>{t('日替わり問題帳')}</strong><small>{t('毎日3問。今日のひらめきに出会う。')}</small></span><ChoiceArrow/></button></div><button className="shiru-entry" onClick={()=>void openPractice('open-shirupure')}><BookOpen size={23} aria-hidden="true"/><span><strong>{t('シルプレ')}</strong><small>{t('660問を、ひとつずつ。')}</small></span><span className="course-badge">660</span><ChoiceArrow/></button>{resumeData&&<button className="secondary-action home-resume" onClick={resumePractice}>{t('通常プレイの続きから')}</button>}<div className="home-bottom-links">{settings.showRanking&&<button onClick={()=>P('ranking')}><Trophy size={18} aria-hidden="true"/>{t('ランキング')}</button>}<button onClick={()=>{news.markRead();P('updates')}}><Sparkles size={18} aria-hidden="true"/>{t('更新のお知らせ')}{(news.unread||news.latest!==currentVersion)&&<span className="home-new-dot" aria-label={t('新着')}/>}</button></div><a className="home-support-button" href="https://ofuse.me/o?uid=228296" target="_blank" rel="noopener noreferrer"><Heart size={17} aria-hidden="true"/>{t('OFUSEで制作を応援')}<span aria-hidden="true">↗</span></a><button className="text-button tutorial-entry" onClick={()=>P('tutorial')}>{t(tutorialDone?'遊び方を確認する':'はじめての方へ · 操作を試す')}</button><button className="home-version" type="button" onClick={()=>{news.markRead();P('updates')}}><span>{t('サイトのバージョン')}</span> <span translate="no" data-i18n-skip="true">{currentVersion}</span></button><SiteIntro/></main>
  :tab==='challenge'?<main className="start-screen difficulty-screen"><div className="start-title"><h1>{t('日替わり問題帳')}</h1><p>{challenges[0]?.day.replaceAll('-','/')} · {t('日本時間0時に更新')}</p><p>{t('ルールを確認してからでも、すぐにでも遊べます。ランキングへの登録はクリア後に選べます。')}</p>{settings.showRanking&&<button className="daily-ranking-link" onClick={()=>P('ranking')}><Trophy size={20} aria-hidden="true"/><span>{t('今日のランキング')}</span><span aria-hidden="true">›</span></button>}<p className="muted">{t('初回は0:00から。ランキングの計測は、画面を離れても続きます。')}</p><div className="context-shortcuts"><button onClick={()=>P('personal')}><ChartNoAxesColumn size={18} aria-hidden="true"/>{t('自分の記録')}</button><button onClick={()=>P('calendar')}><CalendarDays size={18} aria-hidden="true"/>{t('カレンダー')}</button></div></div><div className="start-choices">{challenges.map(p=><button className="choice-card difficulty-choice" key={p.level} disabled={busy} onClick={()=>chooseDaily(p.level)}><span><strong>{labels[p.level-1]}</strong><small>{ruleLabel(locale,p.kind)} · {p.n}×{p.n}</small></span><span className="choice-arrow" aria-hidden="true">›</span></button>)}</div><p role="status" className="message">{busy?t('読み込み中…'):t(message)}</p></main>
  :tab==='daily'&&session?<main className="game-layout"><section className="play-card"><div className="play-heading"><span className="difficulty-label">{dailyTitle(locale,session)}</span>{!nativePlaying&&<button className="play-settings-button" onClick={()=>P('settings')} aria-label={t('プレイ中の設定')}>⚙ {t('設定')}</button>}<span className="clock-label" hidden={!settings.timer}><small>{t('プレイ時間')}</small><time className="timer" aria-label={t('経過時間')}>{time(clock)}</time></span></div>
   {done?<div className={`completed-screen ${settings.animations?'celebrate':''}`}><h1>{t('完成！')}</h1><p className="correct-answer">✓ {t('すべて正解です！')}</p><p className="completion-time">{time(session.elapsed||0)}</p><p>{t(session.finished?'ランキングに記録しました':session.ranked?'クリアタイムを確定しました。名前の入力中はタイムが増えません。':'通常プレイのクリアです。ランキングには送信しません。')}</p>{session.ranked&&!session.finished&&<button className="primary" onClick={()=>P('finish')}>{t('ランキングに記録する')}</button>}<button className="secondary-action" onClick={()=>T('challenge')}>{t('別の難易度で遊ぶ')}</button><div className="context-shortcuts"><button onClick={()=>P('personal')}>{t('自分の記録を見る')}</button>{settings.showRanking&&<button onClick={()=>{L(session.level);P('ranking')}}>{t('ランキングを見る')}</button>}<button onClick={()=>P('calendar')}>{t('カレンダー')}</button></div></div>
   :<><div className="daily-workspace" style={{'--pad-side-columns':session.n>9?4:3,'--pad-bottom-columns':Math.min(session.n,settings.keypadSize>100?5:9),'--pad-narrow-columns':Math.min(session.n,settings.keypadSize>100?5:9)} as React.CSSProperties}>
    <DailyBoard key={session.id} session={session} grid={grid} notes={notes} selected={selected} onSelect={selectCell} zoom={false} fit={dailyFit} viewScale={dailyScale} onScaleChange={(scale,fit)=>{setDailyScale(scale);setDailyFit(fit)}} onMinimumScaleChange={setDailyMinimum} settings={settings} chosen={chosen}/>
    <div className="daily-controls"><div className="tools">
     <button disabled={!undoHistory.length} onClick={()=>{feedback('undo');const h=undoHistory[undoHistory.length-1];G(h.grid);N(h.notes);H(undoHistory.slice(0,-1))}}><Undo2 size={18} aria-hidden="true"/>{t('戻す')}</button>
     <button onClick={()=>enter(0)}><Eraser size={18} aria-hidden="true"/>{t('消す')}</button>
     <button aria-pressed={memo} className={memo?'chosen':''} onClick={()=>M(!memo)}><PenLine size={18} aria-hidden="true"/>{t('メモ')}{memo?' ✓':''}</button>
     {!session.ranked&&<button onClick={openHint}><Sparkles size={18} aria-hidden="true"/>{t('ヒント')}</button>}
    </div><div className={`keypad ${session.n>9?'large-keypad':''}`}>
     {Array.from({length:session.n},(_,i)=><button key={i} data-native-number={i+1} translate="no" data-i18n-skip="true" onPointerDown={()=>pressNumber(i+1)} onPointerUp={releaseNumber} onPointerCancel={releaseNumber} onPointerLeave={releaseNumber} onClick={()=>number(i+1)} aria-pressed={settings.numberFirst&&chosen===i+1} disabled={busy} className={!settings.numberFirst&&(selected<0||!!session.puzzle[selected])?'needs-cell':''}>{i+1}</button>)}
    </div>{!grid.includes(0)&&<button className="primary submit-compact" disabled={busy} onClick={()=>void checkCompletion()}>{t(busy?'確認中…':'答えを確認する')}</button>}</div>
   </div></>}
   {done&&<><p role="status" className="message">{t(message||saveProblem)}</p>{saveProblem&&<button className="secondary-action" onClick={()=>P('backup')}>{t('保存・引き継ぎ')}</button>}</>}</section></main>:null}
  {nativePlaying&&!panel&&playNotice&&<div className="native-play-notice" role={saveProblem?'alert':'status'}><p>{t(playNotice)}</p>{saveProblem?<button type="button" onClick={()=>P('backup')}>{t('保存・引き継ぎ')}</button>:<button type="button" className="notice-close" onClick={()=>setDismissedPlayNotice(message)} aria-label={t('閉じる')}>×</button>}</div>}
  {practiceLoaded&&<main className="practice" hidden={tab!=='practice'} aria-busy={practiceStatus!=='ready'}>{practiceStatus!=='ready'&&<div className="practice-loading" role="status"><p>{t(practiceStatus==='slow'?'読み込みに時間がかかっています。':'問題帳を読み込んでいます…')}</p>{practiceStatus==='slow'&&<button className="secondary-action" onClick={()=>{PS('loading');frameRef.current?.contentWindow?.location.reload()}}>{t('再読み込み')}</button>}</div>}<iframe ref={frameRef} onLoad={()=>syncFrame()} title={t('ナンプレ帳 問題生成とプレイ')} src="/notebook/index.html" className="notebook" style={{visibility:practiceStatus==='ready'?'visible':'hidden'}}/></main>}
  {dataFrameLoaded&&<iframe ref={dataFrameRef} onLoad={()=>syncDataFrame()} title={t('保存・引き継ぎ')} src="/notebook/index.html" hidden aria-hidden="true" tabIndex={-1}/>}
  <dialog ref={dialog} className={'game-dialog'+(panel==='settings'?' play-settings-dialog':panel==='ranking'?' ranking-dialog':'')} onCancel={event=>{event.preventDefault();dismissPanel()}} onClick={event=>{if(event.target===event.currentTarget)dismissPanel()}}>{panel!=='settings'&&<button className="dialog-close" onClick={dismissPanel} disabled={backupBusy||restoreInProgress.current} aria-label={t('閉じる')}>{t('閉じる')} ×</button>}
   {panel==='rule-choice'&&selectedSummary?<DailyRuleChoice key={selectedSummary.day+':'+selectedSummary.level} puzzle={selectedSummary} busy={busy} message={message} onStart={()=>void start(level,'auto')}/>:panel==='start'&&pendingDaily?<section className="daily-resume"><h2>{t('途中の問題があります')}</h2><p>{dailyTitle(locale,pendingDaily)}</p><p>{t(pendingDaily.ranked?'このブラウザで前に始めた問題です。続きから再開できます。ランキングの時計は離れていた間も進んでいます。':'このブラウザに途中経過が保存されています。続きから再開できます。')}</p>{pendingDaily.ranked&&<p className="resume-time">{t('開始からの経過時間')} <b>{time(Math.max(0,pendingDaily.serverNow-pendingDaily.started))}</b></p>}<div className="dialog-actions"><button className="primary" disabled={busy} onClick={()=>void start(level,'auto',undefined,true)}>{t('続きから遊ぶ')}</button><button className="secondary-action" disabled={busy} onClick={()=>void start(level,'practice')}>{t('最初からやり直す')}</button></div><p className="muted">{t('やり直すと途中経過を消して0:00から始まります。この問題のランキングには登録できません。')}</p><p role="status">{t(message)}</p></section>
   :panel==='check-result'?<section role="status"><h2>{t('まだ完成ではありません')}</h2><p>{t('すべて埋まりましたが、まだ正しくないマスがあります。見直してみましょう。')}</p><button className="primary" onClick={()=>P(null)}>{t('盤面を見直す')}</button></section>
   :panel==='leave'?<section><h2>{t('問題から戻りますか？')}</h2><p>{t(session?.ranked?'途中経過は保存されます。時計は止まらず、再開しても開始時刻は変わりません。':'練習の途中経過を保存して戻ります。')}</p><div className="dialog-actions"><button className="primary" onClick={()=>P(null)}>{t('プレイを続ける')}</button><button className="secondary-action" onClick={()=>{P(null);leaveAction.current()}}>{t('保存して戻る')}</button></div></section>
   :panel==='practice-confirm'?<section><h2>{t(session?.ranked?'練習に切り替えますか？':'練習をやり直しますか？')}</h2><p>{t(session?.ranked?'この日の同じ問題はランキング対象外になります。時計は0から練習用に切り替わります。':'入力とメモを消し、練習の時計を0に戻します。')}</p><div className="dialog-actions"><button className="primary" disabled={busy} onClick={()=>session?.ranked?practice():restartPractice()}>{t(session?.ranked?'練習に切り替える':'練習をやり直す')}</button><button className="secondary-action" onClick={()=>P(null)}>{t('キャンセル')}</button></div><p role="status">{t(message)}</p></section>
   :panel==='theme'?<ThemeSettings/>:panel==='audio'?<AudioSettings/>:panel==='settings'?<><PlaySettings value={settings} onChange={updateSettings} onReset={()=>{setDailyScale(undefined);setDailyFit(false)}} ranked={!!session?.ranked} onPractice={()=>P('practice-confirm')} onStats={()=>P('stats')} onGuide={()=>navigatePracticeTool('open-guide')} onAudio={()=>P('audio')} onClose={dismissPanel}
    boardControls={tab==='daily'&&session?<BoardScaleControls value={dailyScale??settings.cellSize} minimum={dailyMinimum} maximum={300} fit={dailyFit} onFit={()=>setDailyFit(true)} onChange={scale=>{setDailyFit(scale<=dailyMinimum+.01&&scale<100);setDailyScale(scale)}}/>:undefined}
    gameInfo={nativePlaying&&session?<><details className="daily-rule"><summary>{t('ルール')}</summary><RuleGuide kind={session.kind} n={session.n}/></details>{(message||saveProblem||awakeMessage)&&<div className="play-settings-status">{message&&<p>{t(message)}</p>}{saveProblem&&<><p role="alert">{t(saveProblem)}</p><button className="secondary-action" onClick={()=>P('backup')}>{t('保存・引き継ぎ')}</button></>}{awakeMessage&&<p>{t(awakeMessage)}</p>}</div>}{!session.ranked&&<div className="practice-actions"><span>{t('入力済み')} · {grid.filter(Boolean).length}/{grid.length} {settings.mistakeLimit?`${misses}/${settings.mistakeLimit}`:''}</span><button onClick={()=>P('practice-confirm')}>{t('やり直す')}</button></div>}</>:undefined}/></>
   :panel==='stats'?<section><h2>{t('日替わりの記録')}</h2><button className="secondary-action" onClick={()=>P('personal')}>{t('自分のペースの記録')}</button><dl className="stats-grid">{[[t('クリア'),stats.wins],[t('勝率'),stats.plays?Math.round(stats.wins/stats.plays*100)+'%':'—'],[t('平均時間'),stats.wins?time(stats.total/stats.wins):'—'],[t('ベストタイム'),stats.best?time(stats.best):'—'],[t('連勝'),stats.streak],[t('ベスト連勝'),stats.bestStreak],[t('ノーミス・ヒントなし'),stats.perfect],[t('ヒント'),stats.hints]].map(([label,v])=><div key={label}><dt>{label}</dt><dd>{v}</dd></div>)}</dl><p>{t('この端末でのクリアとミス上限で終了した練習を集計します。')}</p><button className="secondary-action" onClick={()=>{const text=`${t('ナンプレ帳')} · ${t('クリア')} ${stats.wins} · ${t('ベストタイム')} ${time(stats.best)}`;if(navigator.share)void navigator.share({text}).catch(()=>{});else void navigator.clipboard?.writeText(text)}}>{t('記録を共有')}</button></section>
   :(panel==='hint'||panel==='lesson')&&session&&!session.ranked&&logicalHint?<LogicHint step={logicalHint} session={session} grid={grid} stage={hintStage} onNext={()=>HS(v=>v+1)} onApply={applyLogicalHint} lesson={panel==='lesson'} onLearn={()=>P('lesson')} onBack={()=>P('hint')}/>:panel==='hint'&&logicBusy?<p role="status">{t('解き方を調べています…')}</p>:panel==='hint'&&session&&!session.ranked&&hintCell>=0?<section><h2>{t('段階ヒント')}</h2><p>{t('説明できる解法が見つからない場合は、マスの答えを確認できます。')}</p><p>{t('{r}行{c}列に注目してください。',{r:Math.floor(hintCell/session.n)+1,c:hintCell%session.n+1})}</p>{hintStage>=1&&<p>{t('行・列・枠と追加ルールを確認します。すでにある数字と矛盾する候補を消して考えましょう。')}</p>}{hintStage>=2&&<p>{t('このマスの答え')}：<b>{session.solution?.[hintCell]}</b></p>}<button className="primary" onClick={()=>{if(!hintStage)hintCount.current++;if(hintStage<2)HS(hintStage+1);else{C(hintCell);G(a=>a.map((v,i)=>i===hintCell?session.solution![i]:v));P(null)}}}>{t(hintStage<2?'次のヒント':'この数字を入れる')}</button><button className="text-button" onClick={()=>navigatePracticeTool('open-guide')}>{t('解き方図鑑を開く')}</button></section>
   :panel==='menu'?<SiteMenu daily={tab==='daily'} showRanking={settings.showRanking} unread={news.unread} newVersion={news.latest!==currentVersion} onOpen={next=>{if(next==='updates')news.markRead();P(next)}}/>:panel==='faq'?<Faq onContact={()=>P('contact')}/>
   :panel==='ranking'?<RankingPanel level={level} onLevel={L} challenges={challenges}/>
   :panel==='updates'?<UpdateNews latest={news.latest} onReload={async()=>{window.dispatchEvent(new Event('np-save-now'));const child=frameRef.current?.contentWindow as any;if(child?.NPBeforeBackup)await child.NPBeforeBackup();await child?.NPStorage?.flush?.();if(saveError.current)throw Error(saveError.current);guard.current=false;location.reload()}}/>:panel==='tutorial'?<Tutorial onDone={()=>{TD(true);P(null)}} onSettings={()=>{TD(true);P('settings')}}/>:panel==='personal'?(notebookDataReady?<PersonalRecords notebook={notebookForData} onCalendar={()=>P('calendar')}/>:notebookDataLoading):panel==='calendar'?<DailyCalendar onPlay={playCalendar} onRecords={()=>P('personal')}/>:panel==='replies'?<ContactHistory/>:panel==='backup'?(notebookDataReady?<BackupPanel notebook={notebookForData} onImported={imported} onRestoreState={active=>{restoreInProgress.current=active}} onBusyChange={setBackupOperationBusy}/>:notebookDataLoading):panel==='contact'?<ContactForm onCapture={async()=>{const {captureSite}=await import('../lib/capture-site');return captureSite(document.querySelector<HTMLElement>('.site-shell')!)}} context={{screen:tab,puzzle:session?`${session.day} / ${session.kind} / ${session.n} / ${session.level}`:'—'}}/>:panel==='support'?<Support/>:panel==='help'?<div className="dialog-help"><h2>{session?dailyTitle(locale,session):t('日替わり問題帳')}</h2><p>{session?dailyRules(locale,session):''}</p><p>{t('マスを選んで数字を押します。「メモ」で候補を残せます。「盤面」の＋・−で倍率を変え、「全体表示」で画面に収めます。')}</p><p>{t('ランキング挑戦はページを離れても計測が続きます。練習に切り替えるとランキング対象外です。日本時間の午前0時に切り替わります。')}</p></div>
   :panel==='finish'?<div className="finish"><h2>{t('完成！')}</h2><p>{t('すべて正解です！')}{' '}{time(session?.elapsed||0)}</p><p>{t('表示名を入力してランキングに記録できます。送信せずに閉じても完成は保存されています。')}</p><label htmlFor="nickname">{t('表示名')} <small>{t('ランキングに公開されます')}</small></label><input id="nickname" maxLength={32} value={name} onChange={e=>B(e.target.value)} placeholder={t('ニックネーム')} autoComplete="off"/><button className="primary" disabled={busy||grid.includes(0)} onClick={submit}>{busy?t('確認中…'):t('送信する')}</button><p role="status" className="message">{t(message)}</p></div>:null}
  </dialog>
 </div>;
}
