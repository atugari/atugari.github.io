// Source-function checks for the real shell's lazy notebook load lifecycle.
// This uses no browser and does not replace full page/navigation validation.
// node scripts/check-nanpure-shell-lifecycle.cjs /path/to/app/game.tsx
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const sourcePath=process.argv[2];
if(!sourcePath)throw Error('Pass the source app/game.tsx path.');
const source=fs.readFileSync(sourcePath,'utf8');
function section(start,end,text=source){const a=text.indexOf(start),b=text.indexOf(end,a+start.length);assert(a>=0&&b>a,`Missing source section ${start}`);return text.slice(a,b)}
// Only these extracted functions contain TypeScript's `as any` assertions.
// Their control flow is evaluated verbatim from the source under test.
const dataSource=section('function syncNotebookPreferences(','const syncFrame=()=>{').replaceAll(' as any','').replaceAll('child:any','child').replaceAll('value:any','value').replaceAll('new Promise<void>','new Promise');
const dismissSource=section('function setBackupOperationBusy(','function syncNotebookPreferences(').replaceAll('active:boolean','active');
const dialogHandlers=source.match(/<dialog ref=\{dialog\}[^]*?onCancel=\{(event=>\{[^]*?\})\} onClick=\{(event=>\{[^]*?\})\}>/);
assert(dialogHandlers,'Missing shell dialog cancellation handlers');
const readySource=section('const syncFrame=()=>{','const [tab,T]').replaceAll(' as any','');
const openSource=section('async function openPractice(','function navigatePracticeTool').replaceAll(' as any','');
const pollSource=section("useEffect(()=>{if(!practiceLoaded||practiceStatus==='ready')return;",'const [panel,P]');
const panelSource=section("useEffect(()=>{\n  if(panel!=='backup'&&panel!=='personal')",'useEffect(()=>{if(dataFrameLoaded)syncDataFrame()}');
const dataPollSource=section("useEffect(()=>{if(!dataFrameLoaded||dataFrameStatus==='ready'",'const [settings,SET]');
const backupSource=fs.readFileSync(path.join(path.dirname(sourcePath),'backup-panel.tsx'),'utf8');
const operationSource=section('function beginOperation(){','async function capture()',backupSource);
const captureSource=section('async function capture(){','async function out()',backupSource);
const exportSource=section('async function out(){','async function read(',backupSource).replaceAll(' as Error','');
const restoreSource=section('async function restore(){','\n return <section',backupSource).replaceAll('before:any','before').replaceAll(' as Error','');
const persistSource=section('const persist=()=>{',';persist();');
function environment({path='/notebook/index.html',state='complete',app=true,frame=true,error=false}={}){
  const actions=[],statuses=[],loads=[],tabs=[],panels=[],navigation=[],themes=[],languages=[],readings=[],timers=new Map(),effects=[],frameListeners=new Map();
  let pauseCalls=0,timerId=0;
  const child={location:{pathname:path,href:path==='blank'?'about:blank':'https://example.test'+path,replace:value=>navigation.push(value)},
    document:{readyState:state,getElementById:id=>error&&id==='storage-retry'?{}:null},
    NPSiteTheme:{get:()=>themes.at(-1)||'notebook',apply:value=>themes.push(value)},
    NPI18n:{get:()=>languages.at(-1)||'ja',set:value=>languages.push(value)},
    NPFurigana:{getEnabled:()=>readings.at(-1)?.[0]||false,setEnabled:(...values)=>readings.push(values)},
    appPause:async()=>{pauseCalls++}
  };
  if(app){child.NPWebsiteHome=()=>actions.push('rules');child.NPWebsiteTool=action=>actions.push(action);child.NPStorage={flush:async()=>{}};child.NPRecovery={capture:async()=>({}),validate(){}};child.NPVideo={allAttempts:()=>[]}}
  const frameElement={contentWindow:child,addEventListener:(type,fn)=>{if(!frameListeners.has(type))frameListeners.set(type,new Set());frameListeners.get(type).add(fn)},removeEventListener:(type,fn)=>frameListeners.get(type)?.delete(fn)};
  const ctx={console,frameRef:{current:frame?frameElement:null},pendingTool:{current:null},expectedDocument:{current:'/notebook/index.html'},
    practiceLoaded:false,practiceStatus:'loading',locale:'en',panel:null,dataFrameRef:{current:null},dataFrameLoaded:false,dataFrameStatus:'loading',backupOperation:{current:false},restoreInProgress:{current:false},backupBusy:false,
    PS(value){ctx.practiceStatus=typeof value==='function'?value(ctx.practiceStatus):value;statuses.push(ctx.practiceStatus)},
    PL:value=>{ctx.practiceLoaded=value;loads.push(value)},T:value=>tabs.push(value),P:value=>panels.push(value),
    setDataFrameLoaded:value=>{ctx.dataFrameLoaded=value},setDataFrameStatus:value=>{ctx.dataFrameStatus=typeof value==='function'?value(ctx.dataFrameStatus):value},
    setBackupBusy:value=>{ctx.backupBusy=value},
    useEffect:(fn,deps)=>effects.push({fn,deps}),
    window:{NPSiteTheme:{get:()=> 'blue'},NPFurigana:{getEnabled:()=>true},
      setInterval:(fn,delay)=>{const id=++timerId;timers.set(id,{type:'interval',fn,delay});return id},
      setTimeout:(fn,delay)=>{const id=++timerId;timers.set(id,{type:'timeout',fn,delay});return id}},
    clearInterval:id=>timers.delete(id),clearTimeout:id=>timers.delete(id)
  };
  ctx.window.clearTimeout=ctx.clearTimeout;ctx.window.clearInterval=ctx.clearInterval;
  vm.createContext(ctx);vm.runInContext(dismissSource+dataSource+readySource+openSource+'\nthis.syncFrameForTest=syncFrame;this.syncDataFrameForTest=syncDataFrame;this.cancelDialogForTest='+dialogHandlers[1]+';this.backdropForTest='+dialogHandlers[2]+';',ctx);
  return {ctx,child,actions,statuses,loads,tabs,panels,navigation,themes,languages,readings,timers,
    get pauseCalls(){return pauseCalls},frameLoad(){for(const fn of frameListeners.get('load')||[])fn()},
    pollingEffect(){vm.runInContext(pollSource,ctx);return effects.at(-1).fn()},
    panelEffect(){vm.runInContext(panelSource,ctx);return effects.at(-1).fn()},
    dataPollingEffect(){vm.runInContext(dataPollSource,ctx);return effects.at(-1).fn()}
  };
}
function nativeRestoreEnvironment(){
  const events=[],messages=[],busyStates=[],storage=new Map([['np-practice-resume-v1','old-resume'],['native-extra','old-extra']]);
  let finish,rejectRestore,validationError=null,writeError=false;
  const child={NPRecovery:{validate(){events.push('validate');if(validationError)throw validationError},restore(){events.push('notebook-restore');return new Promise((resolve,reject)=>{finish=resolve;rejectRestore=reject})}}};
  const ctx={console,Date,operations:{current:0},onBusyChange:value=>busyStates.push(value),restoreInProgress:{current:false},backupKeys:['np-practice-resume-v1','native-extra'],pending:{data:{'np-practice-resume-v1':'imported-resume','native-extra':'imported-extra'},notebook:{}},
    capture:async()=>{events.push('capture');return {data:Object.fromEntries(storage),notebook:{}}},saveDownload:()=>events.push('backup-download'),notebook:()=>child,
    onRestoreState:value=>{events.push('restore-state:'+value);ctx.restoreInProgress.current=value},onImported:()=>{events.push('reload:'+ctx.restoreInProgress.current);ctx.persistForTest()},
    B(){},M:value=>messages.push(value),P(){},
    localStorage:{setItem(key,value){events.push('write:'+key+':'+value);if(writeError&&key==='native-extra'&&value==='imported-extra')throw Error('write failed');storage.set(key,value)},removeItem(key){events.push('remove:'+key);storage.delete(key)}},
    session:{id:'ordinary',ranked:false},practiceClock:{current:{elapsed:3000}},grid:[1,0,0,0],notes:{},misses:0,hintCount:{current:0},runId:{current:'run'},done:false,RESUME(){},saveError:{current:''},SP(){}
  };
  vm.createContext(ctx);vm.runInContext(operationSource+restoreSource+'\n'+persistSource+';this.persistForTest=persist;',ctx);
  return {ctx,events,messages,busyStates,storage,finish:()=>finish(),fail:()=>rejectRestore(Error('restore failed')),set validationError(error){validationError=error},set writeError(value){writeError=value}};
}
function captureEnvironment(parent){
  const events=[],busyStates=[];let finish,rejectCapture;
  const child={NPBeforeBackup:async()=>events.push('prepare'),NPStorage:{flush:async()=>events.push('flush')},NPRecovery:{capture:()=>new Promise((resolve,reject)=>{finish=resolve;rejectCapture=reject})}};
  const ctx={console,Date,Event,operations:{current:0},backupKeys:['native'],window:{dispatchEvent:event=>events.push(event.type)},notebook:()=>child,
    localStorage:{getItem:()=> 'current'},B(){},M(){},onBusyChange:value=>{busyStates.push(value);parent?.ctx.setBackupOperationBusy(value)},
    saveDownload:()=>{events.push('download:'+ctx.operations.current);assert.equal(busyStates.at(-1),true)}
  };
  vm.createContext(ctx);vm.runInContext(operationSource+captureSource+exportSource,ctx);
  return {ctx,events,busyStates,finish:()=>finish({puzzles:[]}),fail:()=>rejectCapture(Error('capture failed'))};
}
let passed=0;
async function check(name,fn){await fn();passed++;console.log('PASS '+name)}
(async()=>{
  await check('first entry requests the iframe and retains the requested action',async()=>{
    const e=environment({frame:false});await e.ctx.openPractice('open-notebook');
    assert.deepEqual(e.loads,[true]);assert.deepEqual(e.tabs,['practice']);assert.deepEqual(e.panels,[null]);
    assert.equal(e.ctx.pendingTool.current,'open-notebook');assert.equal(e.ctx.practiceStatus,'loading');assert.deepEqual(e.navigation,[]);
  });
  await check('about:blank is allowed to finish the iframe initial navigation',async()=>{
    const e=environment({path:'blank',app:false,state:'loading'});await e.ctx.openPractice();
    assert.deepEqual(e.navigation,[]);assert.equal(e.ctx.syncFrameForTest(),false);assert.equal(e.ctx.practiceStatus,'loading');
  });
  await check('repeated entry does not restart a loading index document',async()=>{
    const e=environment({app:false,state:'loading'});await e.ctx.openPractice('open-guide');await e.ctx.openPractice('open-notebook');
    assert.deepEqual(e.navigation,[]);assert.equal(e.ctx.pendingTool.current,'open-notebook');assert.equal(e.ctx.syncFrameForTest(),false);
    e.child.document.readyState='complete';e.child.NPWebsiteHome=()=>e.actions.push('rules');e.child.NPWebsiteTool=action=>e.actions.push(action);
    assert.equal(e.ctx.syncFrameForTest(),true);assert.deepEqual(e.actions,['open-notebook']);assert.equal(e.ctx.practiceStatus,'ready');
  });
  await check('an already loaded notebook runs each pending tool only once',async()=>{
    const e=environment();await e.ctx.openPractice('open-guide');assert.equal(e.ctx.practiceStatus,'ready');
    e.ctx.syncFrameForTest();e.ctx.syncFrameForTest();assert.deepEqual(e.actions,['open-guide']);assert.equal(e.ctx.pendingTool.current,null);
    assert.deepEqual(e.themes,['blue']);assert.deepEqual(e.languages,['en']);assert.deepEqual(e.readings,[[true,false]]);
  });
  await check('document readiness is required even when notebook globals exist',()=>{
    const e=environment({state:'loading'});e.ctx.pendingTool.current='rules';assert.equal(e.ctx.syncFrameForTest(),false);
    assert.deepEqual(e.actions,[]);assert.equal(e.ctx.practiceStatus,'loading');e.child.document.readyState='interactive';
    assert.equal(e.ctx.syncFrameForTest(),true);assert.deepEqual(e.actions,['rules']);
  });
  await check('Shirupure remains loading until its actual document has arrived',async()=>{
    const e=environment();await e.ctx.openPractice('open-shirupure');
    assert.deepEqual(e.actions,['open-shirupure']);assert.equal(e.ctx.expectedDocument.current,'/notebook/shirupure.html');assert.equal(e.ctx.practiceStatus,'loading');
    assert.equal(e.ctx.syncFrameForTest(),false);assert.deepEqual(e.actions,['open-shirupure']);
    e.child.location.pathname='/notebook/shirupure.html';e.child.document.readyState='loading';delete e.child.NPWebsiteHome;delete e.child.NPWebsiteTool;
    assert.equal(e.ctx.syncFrameForTest(),false);e.child.document.readyState='complete';assert.equal(e.ctx.syncFrameForTest(),true);assert.equal(e.ctx.practiceStatus,'ready');
  });
  await check('returning from another document pauses it before loading index',async()=>{
    const e=environment({path:'/notebook/shirupure.html',app:false});await e.ctx.openPractice('open-guide');
    assert.equal(e.pauseCalls,1);assert.deepEqual(e.navigation,['/notebook/index.html']);assert.equal(e.ctx.practiceStatus,'loading');assert.equal(e.ctx.pendingTool.current,'open-guide');
  });
  await check('pause failure does not strand the user in the old document',async()=>{
    const e=environment({path:'/notebook/shirupure.html',app:false});e.child.appPause=async()=>{throw Error('unavailable')};
    await e.ctx.openPractice();assert.deepEqual(e.navigation,['/notebook/index.html']);
  });
  await check('a storage error exposes the recovery screen instead of a permanent spinner',()=>{
    const e=environment({app:false,error:true});e.ctx.pendingTool.current='open-guide';
    assert.equal(e.ctx.syncFrameForTest(),true);assert.equal(e.ctx.practiceStatus,'ready');assert.equal(e.ctx.pendingTool.current,null);assert.deepEqual(e.actions,[]);
  });
  await check('theme and locale still synchronize while a different document is expected',()=>{
    const e=environment({path:'/notebook/shirupure.html',app:false});e.ctx.locale='de';
    assert.equal(e.ctx.syncFrameForTest(),false);assert.deepEqual(e.themes,['blue']);assert.deepEqual(e.languages,['de']);assert.equal(e.ctx.practiceStatus,'loading');
  });
  await check('deployed base paths match the expected notebook document',()=>{
    const e=environment({path:'/nanpure/releases/test/notebook/index.html'});e.ctx.pendingTool.current='rules';
    assert.equal(e.ctx.syncFrameForTest(),true);assert.deepEqual(e.actions,['rules']);
  });
  await check('polling is absent before demand and removed when readiness changes',()=>{
    const e=environment({app:false,state:'loading'});assert.equal(e.pollingEffect(),undefined);assert.equal(e.timers.size,0);
    e.ctx.practiceLoaded=true;const cleanup=e.pollingEffect();assert.equal(typeof cleanup,'function');assert.equal(e.timers.size,2);
    const timeout=[...e.timers.values()].find(timer=>timer.type==='timeout');timeout.fn();assert.equal(e.ctx.practiceStatus,'slow');
    e.ctx.PS('ready');timeout.fn();assert.equal(e.ctx.practiceStatus,'ready');cleanup();assert.equal(e.timers.size,0);
    assert.equal(e.pollingEffect(),undefined);assert.equal(e.timers.size,0);
  });
  await check('a fresh-home data panel starts only the primary lazy iframe',()=>{
    const e=environment({frame:false});e.ctx.panel='backup';e.panelEffect();
    assert.equal(e.ctx.practiceLoaded,true);assert.equal(e.ctx.dataFrameLoaded,false);assert.equal(e.ctx.notebookHasData(null),false);
  });
  await check('a loading index never triggers a duplicate data iframe',()=>{
    const e=environment({app:false,state:'loading'});e.ctx.panel='personal';e.panelEffect();
    assert.equal(e.ctx.dataFrameLoaded,false);assert.equal(e.ctx.notebookHasData(e.child),false);
  });
  await check('data panels keep an active separate tool open and request the auxiliary notebook',()=>{
    const e=environment({path:'/notebook/shirupure.html',app:false});e.ctx.panel='backup';e.panelEffect();
    assert.equal(e.ctx.dataFrameLoaded,true);assert.equal(e.ctx.frameRef.current.contentWindow,e.child);assert.deepEqual(e.navigation,[]);assert.equal(e.pauseCalls,0);
    e.ctx.panel='personal';e.panelEffect();assert.equal(e.ctx.dataFrameLoaded,true);assert.deepEqual(e.navigation,[]);
  });
  await check('partial recovery APIs do not expose incomplete backup or record panels',()=>{
    const e=environment({path:'/notebook/crossword.html',app:false});e.child.NPRecovery={capture(){},validate(){}};
    assert.equal(e.ctx.notebookHasData(e.child),false);assert.equal(e.ctx.notebookNeedsDataFrame(),true);
    const ready=environment().child;e.ctx.dataFrameRef.current={contentWindow:ready};assert.equal(e.ctx.syncDataFrameForTest(),true);assert.equal(e.ctx.dataFrameStatus,'ready');
    assert.equal(e.ctx.notebookForData().NPRecovery.capture,ready.NPRecovery.capture);assert.equal(e.ctx.notebookForData().NPVideo,ready.NPVideo);
  });
  await check('backup preparation saves the active tool before capturing auxiliary notebook data',async()=>{
    const e=environment({path:'/notebook/shirupure.html',app:false}),ready=environment().child,order=[];
    e.child.appPause=async()=>{order.push('active-save');return true};e.child.NPStorage={flush:async()=>order.push('active-flush')};ready.NPBeforeBackup=async()=>order.push('notebook-prepare');
    e.ctx.dataFrameRef.current={contentWindow:ready};await e.ctx.notebookForData().NPBeforeBackup();
    assert.deepEqual(order,['active-save','active-flush','notebook-prepare']);assert.deepEqual(e.navigation,[]);
  });
  await check('an explicit tool backup hook takes priority over its pause hook',async()=>{
    const e=environment({path:'/notebook/tenbin.html',app:false}),ready=environment().child,order=[];
    e.child.NPBeforeBackup=async()=>{order.push('active-prepare')};ready.NPBeforeBackup=async()=>order.push('notebook-prepare');e.ctx.dataFrameRef.current={contentWindow:ready};
    await e.ctx.notebookForData().NPBeforeBackup();assert.deepEqual(order,['active-prepare','notebook-prepare']);assert.equal(e.pauseCalls,0);
  });
  await check('a failed active-tool save prevents a misleading successful backup',async()=>{
    const e=environment({path:'/notebook/shirupure.html',app:false}),ready=environment().child;let prepared=false;
    e.child.appPause=async()=>false;ready.NPBeforeBackup=async()=>{prepared=true};e.ctx.dataFrameRef.current={contentWindow:ready};
    await assert.rejects(e.ctx.notebookForData().NPBeforeBackup(),/保存できませんでした/);assert.equal(prepared,false);assert.deepEqual(e.navigation,[]);
  });
  await check('auxiliary storage failure shows a retry state and retries only that document',()=>{
    const e=environment({path:'/notebook/shirupure.html',app:false}),broken=environment({app:false,error:true}).child;let retries=0;
    broken.location.reload=()=>{retries++};e.ctx.dataFrameRef.current={contentWindow:broken};e.ctx.dataFrameLoaded=true;
    assert.equal(e.ctx.syncDataFrameForTest(),false);assert.equal(e.ctx.dataFrameStatus,'failed');e.ctx.retryNotebookData();
    assert.equal(retries,1);assert.equal(e.ctx.dataFrameStatus,'loading');assert.deepEqual(e.navigation,[]);
  });
  await check('closing a data panel releases its auxiliary iframe and readiness state',()=>{
    const e=environment({path:'/notebook/shirupure.html',app:false});e.ctx.panel='backup';e.panelEffect();e.ctx.dataFrameStatus='ready';
    e.ctx.panel=null;e.panelEffect();assert.equal(e.ctx.dataFrameLoaded,false);assert.equal(e.ctx.dataFrameStatus,'loading');
  });
  await check('auxiliary polling stops on failure and restarts for an explicit retry',()=>{
    const e=environment({path:'/notebook/shirupure.html',app:false}),broken=environment({app:false,error:true}).child;
    e.ctx.dataFrameRef.current={contentWindow:broken};e.ctx.dataFrameLoaded=true;const cleanup=e.dataPollingEffect();
    assert.equal(e.ctx.dataFrameStatus,'failed');cleanup();assert.equal(e.timers.size,0);assert.equal(e.dataPollingEffect(),undefined);
    broken.document.getElementById=()=>null;e.ctx.dataFrameStatus='loading';const retryCleanup=e.dataPollingEffect();assert.equal(e.timers.size,2);retryCleanup();
  });
  await check('auxiliary restore honors the active tool generation guard',async()=>{
    const e=environment({path:'/notebook/crossword.html',app:false}),ready=environment().child;let restored=false;
    e.child.NPRecoveryCanRestore=()=>false;ready.NPRecovery.restore=async()=>{restored=true};e.ctx.dataFrameRef.current={contentWindow:ready};
    const facade=e.ctx.notebookForData();assert.equal(facade.NPRecoveryCanRestore(),false);
    await assert.rejects(facade.NPRecovery.restore({}),/問題生成を停止/);assert.equal(restored,false);assert.equal(e.pauseCalls,0);assert.deepEqual(e.navigation,[]);
    await facade.NPBeforeBackup();assert.equal(e.pauseCalls,1);assert.deepEqual(e.navigation,[]);
  });
  await check('restore rechecks the active guard after asynchronous preparation',async()=>{
    const e=environment({path:'/notebook/crossword.html',app:false}),ready=environment().child;let allowed=true,restored=false;
    e.child.NPRecoveryCanRestore=()=>allowed;e.child.appPause=async()=>{allowed=false;return true};ready.NPRecovery.restore=async()=>{restored=true};e.ctx.dataFrameRef.current={contentWindow:ready};
    await assert.rejects(e.ctx.notebookForData().NPRecovery.restore({}),/問題生成を停止/);assert.equal(restored,false);assert.deepEqual(e.navigation,[]);
  });
  await check('restore waits for old tool unload before replacing shared data',async()=>{
    const e=environment({path:'/notebook/shirupure.html',app:false}),ready=environment().child,order=[];
    e.child.appPause=async()=>{order.push('save');return true};ready.NPRecovery.restore=async()=>{order.push('restore');return 'done'};e.ctx.dataFrameRef.current={contentWindow:ready};
    const restoring=e.ctx.notebookForData().NPRecovery.restore({});await new Promise(setImmediate);
    assert.deepEqual(e.navigation,['about:blank']);assert.deepEqual(order,['save']);
    e.frameLoad();assert.deepEqual(order,['save']);e.child.location.href='about:blank';e.frameLoad();
    assert.equal(await restoring,'done');assert.deepEqual(order,['save','restore']);assert.equal(e.timers.size,0);
  });
  await check('failed restore reopens the previously saved tool document',async()=>{
    const e=environment({path:'/notebook/tenbin.html',app:false}),ready=environment().child,previous=e.child.location.href;
    ready.NPRecovery.restore=async()=>{throw Error('restore failed')};e.ctx.dataFrameRef.current={contentWindow:ready};
    const restoring=e.ctx.notebookForData().NPRecovery.restore({});await new Promise(setImmediate);e.child.location.href='about:blank';e.frameLoad();
    await assert.rejects(restoring,/restore failed/);assert.deepEqual(e.navigation,['about:blank',previous]);assert.equal(e.ctx.expectedDocument.current,'/notebook/tenbin.html');assert.equal(e.ctx.practiceStatus,'loading');
  });
  await check('an unload timeout leaves imported storage untouched and restores the old route',async()=>{
    const e=environment({path:'/notebook/shirupure.html',app:false}),ready=environment().child,previous=e.child.location.href;let restored=false;
    ready.NPRecovery.restore=async()=>{restored=true};e.ctx.dataFrameRef.current={contentWindow:ready};
    const restoring=e.ctx.notebookForData().NPRecovery.restore({});await new Promise(setImmediate);[...e.timers.values()].find(timer=>timer.type==='timeout').fn();
    await assert.rejects(restoring,/読み込みに時間/);assert.equal(restored,false);assert.deepEqual(e.navigation,['about:blank',previous]);assert.equal(e.timers.size,0);
  });
  await check('native persistence pauses after capture and validation, before imported keys change',async()=>{
    const e=nativeRestoreEnvironment(),restoring=e.ctx.restore();await new Promise(setImmediate);
    assert.deepEqual(e.busyStates,[true]);assert.equal(e.ctx.operations.current,1);
    assert.deepEqual(e.events.slice(0,4),['capture','backup-download','validate','restore-state:true']);
    assert.equal(e.storage.get('np-practice-resume-v1'),'imported-resume');const count=e.events.length;e.ctx.persistForTest();assert.equal(e.events.length,count);
    e.finish();await restoring;assert.equal(e.ctx.restoreInProgress.current,true);assert(e.events.includes('reload:true'));assert.equal(e.storage.get('np-practice-resume-v1'),'imported-resume');
    assert(!e.events.includes('restore-state:false'));assert.deepEqual(e.busyStates,[true,false]);
  });
  await check('failed restore rolls native keys back before allowing persistence again',async()=>{
    const e=nativeRestoreEnvironment(),restoring=e.ctx.restore();await new Promise(setImmediate);e.fail();await restoring;
    assert.equal(e.storage.get('np-practice-resume-v1'),'old-resume');assert.equal(e.storage.get('native-extra'),'old-extra');assert.equal(e.ctx.restoreInProgress.current,false);
    assert(e.events.indexOf('write:native-extra:old-extra')<e.events.indexOf('restore-state:false'));assert.equal(e.messages.at(-1),'restore failed');
    e.ctx.persistForTest();assert.equal(JSON.parse(e.storage.get('np-practice-resume-v1')).session.id,'ordinary');
  });
  await check('validation failure never pauses persistence or changes native keys',async()=>{
    const e=nativeRestoreEnvironment();e.validationError=Error('invalid backup');await e.ctx.restore();
    assert.deepEqual(e.events,['capture','backup-download','validate']);assert.equal(e.ctx.restoreInProgress.current,false);assert.equal(e.storage.get('np-practice-resume-v1'),'old-resume');
  });
  await check('partial native write failure rolls back before clearing the restore pause',async()=>{
    const e=nativeRestoreEnvironment();e.writeError=true;await e.ctx.restore();
    assert(!e.events.includes('notebook-restore'));assert.equal(e.storage.get('np-practice-resume-v1'),'old-resume');assert.equal(e.storage.get('native-extra'),'old-extra');
    assert(e.events.indexOf('write:native-extra:old-extra')<e.events.indexOf('restore-state:false'));assert.equal(e.ctx.restoreInProgress.current,false);
  });
  await check('Escape, backdrop and close cannot dismiss a busy or restoring backup panel',()=>{
    const e=environment();let prevented=0;const surface={};e.ctx.setBackupOperationBusy(true);
    e.ctx.cancelDialogForTest({preventDefault:()=>prevented++});e.ctx.backdropForTest({target:surface,currentTarget:surface});e.ctx.dismissPanel();
    assert.equal(prevented,1);assert.deepEqual(e.panels,[]);
    e.ctx.restoreInProgress.current=true;e.ctx.setBackupOperationBusy(false);e.ctx.dismissPanel();assert.deepEqual(e.panels,[]);
    e.ctx.restoreInProgress.current=false;e.ctx.cancelDialogForTest({preventDefault:()=>prevented++});assert.deepEqual(e.panels,[null]);assert.equal(prevented,2);
  });
  await check('an in-flight operation retains the auxiliary iframe even if the panel changes',()=>{
    const e=environment({path:'/notebook/shirupure.html',app:false});e.ctx.panel='backup';e.panelEffect();e.ctx.setBackupOperationBusy(true);
    e.ctx.panel=null;e.panelEffect();assert.equal(e.ctx.dataFrameLoaded,true);
    e.ctx.restoreInProgress.current=true;e.ctx.setBackupOperationBusy(false);e.panelEffect();assert.equal(e.ctx.dataFrameLoaded,true);
    e.ctx.restoreInProgress.current=false;e.panelEffect();assert.equal(e.ctx.dataFrameLoaded,false);
  });
  await check('standalone capture holds parent dismissal until its asynchronous snapshot completes',async()=>{
    const parent=environment(),e=captureEnvironment(parent),capturing=e.ctx.capture();
    assert.equal(parent.ctx.backupOperation.current,true);parent.ctx.dismissPanel();assert.deepEqual(parent.panels,[]);
    await new Promise(setImmediate);e.finish();await capturing;assert.deepEqual(e.busyStates,[true,false]);assert.equal(e.ctx.operations.current,0);
    parent.ctx.dismissPanel();assert.deepEqual(parent.panels,[null]);
  });
  await check('nested export capture never releases the parent lock before download finishes',async()=>{
    const parent=environment(),e=captureEnvironment(parent),exporting=e.ctx.out();assert.equal(e.ctx.operations.current,2);
    await new Promise(setImmediate);e.finish();await exporting;
    assert(e.events.includes('download:1'));assert.deepEqual(e.busyStates,[true,false]);assert.equal(parent.ctx.backupOperation.current,false);
  });
  await check('capture rejection releases its operation lock and permits closing again',async()=>{
    const parent=environment(),e=captureEnvironment(parent),capturing=e.ctx.capture();await new Promise(setImmediate);e.fail();
    await assert.rejects(capturing,/capture failed/);assert.equal(e.ctx.operations.current,0);assert.deepEqual(e.busyStates,[true,false]);
    parent.ctx.dismissPanel();assert.deepEqual(parent.panels,[null]);
  });
  console.log(JSON.stringify({passed,failed:0}));
})().catch(error=>{console.error(error);process.exitCode=1});
