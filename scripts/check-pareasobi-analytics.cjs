const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=process.cwd(),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const hub=read('plaza.html'),tracker=read('scripts/client-overrides/public/pare-analytics.js');
const cards=[...hub.matchAll(/<a class="game-card[^"]*" href="([^"]+)"/g)].map(m=>m[1]);
assert(cards.length>=15,'Expected the published PareAsobi game catalogue');
for(const href of cards){
 const url=new URL(href,'https://atugari.github.io/plaza.html');
 let file=decodeURIComponent(url.pathname).replace(/^\//,'');
 if(!file||file.endsWith('/'))file+='index.html';
 assert(fs.existsSync(path.join(root,file)),`Game entry not found: ${href} -> ${file}`);
 const html=read(file);
 assert(html.includes('/scripts/client-overrides/public/pare-analytics.js'),`Game missing analytics loader: ${href}`);
 assert(/<body[^>]*data-game=/.test(html),`Game missing stable analytics ID: ${href}`);
}
assert(hub.includes('/scripts/client-overrides/public/pare-analytics.js'),'PareAsobi hub must be measured');
assert(tracker.includes('navigator.globalPrivacyControl===true'),'Respect Global Privacy Control');
assert(tracker.includes("navigator.doNotTrack==='1'"),'Respect Do Not Track');
for(const event of ['page_view','game_access','game_start','game_complete','screen_view','ad_impression','ad_click'])assert(tracker.includes(event),`Missing event: ${event}`);
assert(tracker.includes('adImpression:'),'Expose actual ad impression callback');
assert(tracker.includes('adClick:'),'Expose actual ad click callback');
assert(tracker.includes('screen:'),'Expose screen tracking callback');
assert(!tracker.includes('document.referrer'),'Do not collect referrers');
assert(!tracker.includes('location.href'),'Do not send full URLs');
const api=read('nanpure-api/src/pare-analytics.js');
assert(api.includes('await owner(request,env)'),'Analytics report must be owner-only');
assert(api.includes("request.headers.get('DNT')==='1'"),'Analytics intake must respect DNT');
assert(read('nanpure-api/migrations/0010_pareasobi_analytics.sql').includes('pare_analytics_daily'),'Daily aggregates schema missing');
console.log(`PareAsobi analytics covers ${cards.length} published game cards.`);
