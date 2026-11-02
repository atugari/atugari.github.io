// OCI Always Free target. Node >=22.16; bind to loopback behind a TLS reverse proxy.
import http from 'node:http';import fs from 'node:fs';import path from 'node:path';import {DatabaseSync} from 'node:sqlite';import {pathToFileURL} from 'node:url';
import worker from '../src/index.js';
export function openDatabase(filename){
 fs.mkdirSync(path.dirname(path.resolve(filename)),{recursive:true});const raw=new DatabaseSync(filename);raw.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS gallery_migrations (name TEXT PRIMARY KEY)');
 for(const name of fs.readdirSync(new URL('../migrations/',import.meta.url)).sort())if(!raw.prepare('SELECT name FROM gallery_migrations WHERE name=?').get(name)){
  raw.exec('BEGIN');try{raw.exec(fs.readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));raw.prepare('INSERT INTO gallery_migrations(name) VALUES(?)').run(name);raw.exec('COMMIT')}catch(e){raw.exec('ROLLBACK');throw e}
 }
 function prepare(sql,args=[]){const perform=()=>{const statement=raw.prepare(sql),rows=statement.all(...args);return {results:rows,success:true,meta:{changes:raw.prepare('SELECT changes() n').get().n}}};return {bind:(...v)=>prepare(sql,v),first:async()=>perform().results[0]||null,all:async()=>perform(),run:async()=>perform(),perform};}
 return {prepare,raw,batch:async list=>{raw.exec('BEGIN');try{const out=list.map(s=>s.perform());raw.exec('COMMIT');return out}catch(e){raw.exec('ROLLBACK');throw e}}};
}
export function createServer(DB){return http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://127.0.0.1');if(!['/api/gallery','/api/health'].includes(url.pathname)){res.writeHead(404);res.end();return;}
  let size=0;const chunks=[];for await(const c of req){size+=c.length;if(size>280000){res.writeHead(413);res.end('{"error":"入力が長すぎます。"}');return;}chunks.push(c);}
  const headers=new Headers();for(const [k,v]of Object.entries(req.headers))if(v)headers.set(k,Array.isArray(v)?v.join(','):v);headers.set('cf-connecting-ip',req.socket.remoteAddress||'local');
  const request=new Request(url,{method:req.method,headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})});
  const response=await worker.fetch(request,{DB,SITE_VERSION:'gallery-oci'});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch{res.writeHead(503,{'Content-Type':'application/json'});res.end('{"error":"通信できませんでした。少し待って再試行してください。"}');}
 });}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){const db=openDatabase(process.env.GALLERY_DB||'./data/gallery.sqlite'),server=createServer(db);server.listen(Number(process.env.GALLERY_PORT||8787),'127.0.0.1',()=>console.log('Gallery backend listening on loopback.'));const stop=()=>server.close(()=>{db.raw.close();process.exit(0)});process.on('SIGTERM',stop);process.on('SIGINT',stop);}
