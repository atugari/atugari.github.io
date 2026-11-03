import {ownerKey} from '../gallery/data.mjs';
export async function request(query='',data){
 const origin=window.NPGalleryConfig?.apiOrigin||'https://puzzle-api.puzzle-hub-4826.workers.dev',headers={'X-Gallery-Key':ownerKey()};if(data)headers['Content-Type']='application/json';
 let r;try{r=await fetch(origin+'/api/exhibitions'+query,{method:data?'POST':'GET',headers,credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',...(data?{body:JSON.stringify(data)}:{}),signal:AbortSignal.timeout(20000)});}catch{throw Error('通信できませんでした。端末にある記録は残っています。もう一度お試しください。');}
 let d;try{d=await r.json()}catch{throw Error('サーバーの応答を確認できませんでした。');}if(!r.ok)throw Error(d.error||'操作を完了できませんでした。');return d;
}
