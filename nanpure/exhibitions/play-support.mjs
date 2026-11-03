export async function attachRecorder(target){
 if(target.NPReplayRecorder)return;
 let script=target.document.querySelector('script[data-replay-recorder]');
 if(!script){script=target.document.createElement('script');script.src='/nanpure/exhibitions/recorder.js';script.dataset.replayRecorder='';target.document.head.append(script);}
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{cleanup();reject(Error('リプレイの準備に時間がかかっています。閉じて開き直してください。'));},15000);const done=()=>{cleanup();target.NPReplayRecorder?resolve():reject(Error('リプレイを準備できませんでした。'));},error=()=>{cleanup();reject(Error('リプレイを準備できませんでした。'));},cleanup=()=>{clearTimeout(timer);script.removeEventListener('load',done);script.removeEventListener('error',error);};script.addEventListener('load',done);script.addEventListener('error',error);if(target.NPReplayRecorder)done();});
}
