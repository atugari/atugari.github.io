import {cleanPuzzle} from '../gallery/model.mjs';

export const events=[{
 id:'cats-202611',title:'ねこのナンプレ展',theme:'ねこ',subtitle:'数字の向こうに、ねこがいる。',
 description:'耳、しっぽ、丸まった姿。あなたらしい「ねこ」を、模様ナンプレにして飾りませんか。見るだけ、解くだけの参加も歓迎です。',
 announce:'2026-11-01T00:00:00+09:00',start:'2026-11-03T00:00:00+09:00',end:'2026-11-24T00:00:00+09:00',
}];
export const reactions=['beautiful','idea','pleasant'];
export const reactionLabels={beautiful:'かわいい・きれい',idea:'発想が好き',pleasant:'解き心地がいい'};
export const MAX_REPLAY_BYTES=512*1024,MAX_STEPS=16000;
export function phase(event,now=Date.now()){return now<Date.parse(event.start)?'upcoming':now<Date.parse(event.end)?'open':'closed';}
export function cleanText(value,max,required=false,normalize=true){if(typeof value!=='string')throw Error('文章を確認してください。');const s=(normalize?value.normalize('NFKC'):value).trim();if([...s].length>max||/[\p{Cc}\p{Cf}]/u.test(s.replace(/\n/g,''))||required&&!s)throw Error('文字数と入力内容を確認してください。');return s;}
// A replay is a device record, never a certified ranking result. Every transition
// is checked against its own puzzle; the finished grid must match the solution.
export function cleanReplay(input){
 if(!input||input.version!==1)throw Error('リプレイの形式を確認してください。');
 const record=cleanPuzzle(input.record),len=record.puzzle.length,max=Math.max(record.n,...record.solution);
 const values=(a)=>Array.isArray(a)&&a.length===len&&a.every((v,i)=>Number.isInteger(v)&&v>=0&&v<=max&&(!record.puzzle[i]||v===record.puzzle[i]));
 if(!values(input.initial)||!Array.isArray(input.steps)||!input.steps.length||input.steps.length>MAX_STEPS)throw Error('リプレイの手順を確認してください。');
 const initial=input.initial.slice(),grid=initial.slice();let time=0;
 const steps=input.steps.map(s=>{
  if(!s||!Number.isSafeInteger(s.at)||s.at<time||s.at>31536000000||!Number.isSafeInteger(s.i)||s.i<0||s.i>=len||record.puzzle[s.i]||!Number.isInteger(s.v)||s.v<0||s.v>max)throw Error('リプレイの手順を確認してください。');
  time=s.at;grid[s.i]=s.v;return {at:s.at,i:s.i,v:s.v};
 });
 if(!grid.every((v,i)=>v===record.solution[i]))throw Error('完成まで記録されたリプレイを選んでください。');
 if(!Array.isArray(input.annotations)||input.annotations.length>32)throw Error('説明は32件までです。');
 const annotations=input.annotations.map(a=>{if(!Number.isSafeInteger(a.step)||a.step<0||a.step>steps.length)throw Error('説明を付ける手順を確認してください。');return {step:a.step,text:cleanText(a.text,180,true,false)};});
 const out={version:1,record,initial,steps,annotations,partial:!!input.partial,elapsed:Number.isSafeInteger(input.elapsed)&&input.elapsed>=time?input.elapsed:time};
 if(new TextEncoder().encode(JSON.stringify(out)).length>MAX_REPLAY_BYTES)throw Error('リプレイの容量が上限を超えています。');return out;
}
export function replayGrid(replay,step){const grid=replay.initial.slice();for(const s of replay.steps.slice(0,Math.max(0,Math.min(replay.steps.length,step))))grid[s.i]=s.v;return grid;}
export const puzzleKey=p=>JSON.stringify([p.kind,p.n,p.puzzle,p.regions||null,p.linked||null]);
