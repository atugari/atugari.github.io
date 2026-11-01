// Shirupure and the site share one persisted audio preference set.
// Legacy puzzle progress keeps its shape; only the audio fields are adapted.
(function(w){
 'use strict';
 const tracks=['cozy-puzzle-1','cozy-puzzle-2','cozy-puzzle-3','magic-puzzle-1'];
 let settings=null;
 const api=()=>w.NPSiteAudio;
 let owner=w;
 try{if(w.parent!==w&&w.parent.NPSiteAudio===api())owner=w.parent;}catch{}
 function pull(){
  if(!settings||!api())return;
  const p=api().get();
  Object.assign(settings,{music:p.music,fx:p.effects,musicVolume:p.musicVolume/100,fxVolume:p.effectsVolume/100,track:'bgm-'+(Math.max(0,tracks.indexOf(p.track))+1)});
  const on=settings.music||settings.fx,icon=document.getElementById('sound-button'),chip=document.querySelector('[data-act="toggle-sound"]');
  if(icon&&icon.textContent!==(on?'♫':'♪̸'))icon.textContent=on?'♫':'♪̸';
  const label=on?'♫ 音あり':'♪ 音なし';
  if(chip)chip.textContent=w.NPI18n?.t(label)||label;
  for(const key of ['music','fx']){const input=document.querySelector('[data-setting="'+key+'"]');if(input)input.checked=settings[key];}
  for(const key of ['musicVolume','fxVolume']){const input=document.querySelector('[data-volume="'+key+'"]');if(input)input.value=String(Math.round(settings[key]*100));}
  for(const button of document.querySelectorAll('[data-act="pick-music"]')){
   const selected=button.dataset.track===settings.track;
   button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected));
   const label=button.querySelector('strong');if(label)label.textContent='BGM '+button.dataset.track.slice(-1)+(selected?'　✓':'');
  }
 }
 w.ShiruAudio={
  available:()=>!!api(),
  // Opening a game must respect the shared mute choice, rather than restoring
  // stale defaults from an older saved puzzle. Rebind after a course switch.
  connect(value){settings=value;pull();},
  settings(value){
   settings=value;if(!api())return;
   const update={music:!!value.music,effects:!!value.fx,musicVolume:Math.round(value.musicVolume*100),effectsVolume:Math.round(value.fxVolume*100),track:tracks[Number(value.track.slice(-1))-1]||tracks[0]};
   api().unlock();api().set(update);
  },
  gesture:()=>api()?.unlock(),
  effect:name=>api()?.effect(({clear:'complete',draw:'input',join:'note',color:'note',erase:'erase',undo:'undo',next:'next'})[name]||'input')
 };
 owner.addEventListener('np-audio-change',pull);
 w.addEventListener('pagehide',()=>owner.removeEventListener('np-audio-change',pull),{once:true});
})(window);
