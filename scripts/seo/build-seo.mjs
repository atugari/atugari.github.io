import fs from 'node:fs';
import path from 'node:path';

export const siteURL = 'https://atugari.github.io/nanpure/';
export const escapeHTML = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const jsonScript = value => JSON.stringify(value).replace(/</g,'\\u003c');
export const readSiteContent = repo => JSON.parse(fs.readFileSync(path.join(repo,'scripts/seo/content.json'),'utf8'));

export function searchHead({title,description,url=siteURL,icon,graph}) {
  return `<title>${escapeHTML(title)}</title>
<meta name="description" content="${escapeHTML(description)}">
<meta name="robots" content="index, follow, max-image-preview:large">
<link rel="canonical" href="${escapeHTML(url)}">
<link rel="icon" href="${escapeHTML(icon)}" type="image/svg+xml">
<meta property="og:type" content="website">
<meta property="og:site_name" content="ナンプレ帳">
<meta property="og:locale" content="ja_JP">
<meta property="og:title" content="${escapeHTML(title)}">
<meta property="og:description" content="${escapeHTML(description)}">
<meta property="og:url" content="${escapeHTML(url)}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${escapeHTML(title)}">
<meta name="twitter:description" content="${escapeHTML(description)}">
<script type="application/ld+json">${jsonScript({'@context':'https://schema.org','@graph':graph})}</script>`;
}

export function applicationData(content) {
  return {
    '@type':'WebApplication','@id':siteURL+'#app',name:'ナンプレ帳',alternateName:'Sudoku Notebook',
    url:siteURL,description:content.description,applicationCategory:'GameApplication',
    operatingSystem:'Any',browserRequirements:'Requires JavaScript',isAccessibleForFree:true,
    inLanguage:['ja','en','zh-Hans','zh-Hant','ko','es','fr','de','pt'],
    offers:{'@type':'Offer',price:'0',priceCurrency:'JPY'}
  };
}

function sectionHTML(section,index) {
  let body=(section.paragraphs||[]).map(text=>`<p>${escapeHTML(text)}</p>`).join('\n');
  if(section.steps?.length)body+=`<ol>${section.steps.map(text=>`<li>${escapeHTML(text)}</li>`).join('')}</ol>`;
  if(section.bullets?.length)body+=`<ul>${section.bullets.map(text=>`<li>${escapeHTML(text)}</li>`).join('')}</ul>`;
  if(section.table){
    const {headers,rows}=section.table;
    if(!headers.length||rows.some(row=>row.length!==headers.length))throw Error('Invalid guide table');
    body+=`<div class="table-wrap" role="region" aria-label="${escapeHTML(section.heading)}" tabindex="0"><table><thead><tr>${headers.map(text=>`<th scope="col">${escapeHTML(text)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map((text,column)=>column===0?`<th scope="row">${escapeHTML(text)}</th>`:`<td>${escapeHTML(text)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }
  return `<section id="section-${index+1}"><h2>${escapeHTML(section.heading)}</h2>${body}</section>`;
}

export function buildSearchPages(repo,version,base) {
  const content=readSiteContent(repo),files=[];
  const date=content.updated;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw Error('Missing actual guide modification date');
  const write=(name,body)=>{const file=path.join(repo,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,body);files.push(file)};
  const slugs=new Set();
  for(const guide of content.guides){
    if(!/^[a-z][a-z0-9-]*$/.test(guide.slug)||slugs.has(guide.slug))throw Error('Invalid or duplicate guide slug');
    slugs.add(guide.slug);
    const url=siteURL+guide.slug+'/';
    const graph=[{'@type':'WebPage','@id':url,name:guide.title,url,description:guide.description,inLanguage:'ja',about:{'@id':siteURL+'#app'},dateModified:date},
      {'@type':'BreadcrumbList',itemListElement:[{'@type':'ListItem',position:1,name:'ナンプレ帳',item:siteURL},{'@type':'ListItem',position:2,name:guide.label||guide.title,item:url}]}];
    const related=content.guides.filter(item=>item.slug!==guide.slug).map(item=>`<a href="/nanpure/${item.slug}/"><span>${escapeHTML(item.label||item.title)}</span><span aria-hidden="true">›</span></a>`).join('');
    write(`nanpure/${guide.slug}/index.html`,`<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#f4efe3">
${searchHead({title:guide.title+' — ナンプレ帳',description:guide.description,url,icon:base+'favicon.svg',graph})}
<link rel="stylesheet" href="/nanpure/assets/guide.css"></head>
<body><a class="skip-link" href="#content">本文へ移動</a>
<header class="guide-header"><a class="brand" href="/nanpure/"><span class="brand-mark" aria-hidden="true">数</span>ナンプレ帳</a><a class="header-play" href="/nanpure/">遊ぶ <span aria-hidden="true">↗</span></a></header>
<main id="content" class="guide-main"><nav class="breadcrumbs" aria-label="現在の位置"><a href="/nanpure/">ナンプレ帳</a><span aria-hidden="true">/</span><span>${escapeHTML(guide.label||guide.title)}</span></nav>
<article><header class="article-header"><p class="eyebrow">ナンプレ帳の使い方</p><h1>${escapeHTML(guide.heading||guide.title.split('｜')[0])}</h1><p class="lead">${escapeHTML(guide.lead)}</p></header>
<nav class="contents" aria-label="このページの内容"><strong>このページの内容</strong><ol>${guide.sections.map((section,index)=>`<li><a href="#section-${index+1}">${escapeHTML(section.heading)}</a></li>`).join('')}</ol></nav>
${guide.sections.map(sectionHTML).join('\n')}
<section class="play-callout"><h2>ナンプレ帳で遊んでみる</h2><p>インストール・会員登録なしで、スマホやパソコンのブラウザから遊べます。</p><div class="play-links"><a class="primary" href="/nanpure/">ナンプレ帳を開く</a><a href="/nanpure/?view=daily">日替わり問題を選ぶ</a><a href="/nanpure/?view=tutorial">操作を練習する</a></div></section>
</article><nav class="related" aria-label="ほかの遊び方ガイド"><h2>あわせて読む</h2>${related}</nav>
</main><footer class="guide-footer"><a href="/nanpure/">ナンプレ帳ホーム</a><a href="/nanpure/?view=privacy">利用案内・プライバシー</a><a href="/nanpure/?view=contact">お問い合わせ</a><p>更新：<time datetime="${date}">${date}</time> <span>サイト ${version}</span></p></footer></body></html>\n`);
  }
  write('nanpure/assets/guide.css',fs.readFileSync(path.join(repo,'scripts/seo/guide.css'),'utf8'));
  const urls=['https://atugari.github.io/plaza.html',siteURL,...content.guides.map(guide=>siteURL+guide.slug+'/')];
  write('sitemap.xml',`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(url=>`  <url><loc>${escapeHTML(url)}</loc><lastmod>${url===siteURL?version.split('.').slice(0,3).join('-'):date}</lastmod></url>`).join('\n')}\n</urlset>\n`);
  // Keep versioned scripts/styles crawlable: the playable app needs them to render.
  write('robots.txt','User-agent: *\nAllow: /\n\nSitemap: https://atugari.github.io/sitemap.xml\n');
  return files;
}
