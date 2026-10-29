import fs from 'node:fs';
import path from 'node:path';

export const siteURL = 'https://atugari.github.io/nanpure/';
export const escapeHTML = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const jsonScript = value => JSON.stringify(value).replace(/</g,'\\u003c');
export const readSiteContent = repo => JSON.parse(fs.readFileSync(path.join(repo,'scripts/seo/content.json'),'utf8'));
export const readInternationalContent = repo => JSON.parse(fs.readFileSync(path.join(repo,'scripts/seo/international.json'),'utf8'));
const localeURL = locale => locale.code==='ja'?siteURL:siteURL+locale.slug+'/';
const localesFor = repo => [{code:'ja',slug:'',ogLocale:'ja_JP'},...readInternationalContent(repo).locales];

export function searchHead({title,description,url=siteURL,icon,graph,ogLocale='ja_JP',alternates=[]}) {
  return `<title>${escapeHTML(title)}</title>
<meta name="description" content="${escapeHTML(description)}">
<meta name="robots" content="index, follow, max-image-preview:large">
<link rel="canonical" href="${escapeHTML(url)}">
${alternates.map(locale=>`<link rel="alternate" hreflang="${escapeHTML(locale.code)}" href="${escapeHTML(localeURL(locale))}">`).join('\n')}${alternates.length?'\n<link rel="alternate" hreflang="x-default" href="'+siteURL+'en/">':''}
<link rel="icon" href="${escapeHTML(icon)}" type="image/svg+xml">
<meta property="og:type" content="website">
<meta property="og:site_name" content="ナンプレ帳">
<meta property="og:locale" content="${escapeHTML(ogLocale)}">
<meta property="og:title" content="${escapeHTML(title)}">
<meta property="og:description" content="${escapeHTML(description)}">
<meta property="og:url" content="${escapeHTML(url)}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${escapeHTML(title)}">
<meta name="twitter:description" content="${escapeHTML(description)}">
<script type="application/ld+json">${jsonScript({'@context':'https://schema.org','@graph':graph})}</script>`;
}

export function applicationData(content,locales=['ja','en','zh-Hans','zh-Hant','ko','es','fr','de','pt','it','nl','sv','pl','cs','ru','id','vi','th','hi','ar']) {
  return {
    '@type':'WebApplication','@id':siteURL+'#app',name:'ナンプレ帳',alternateName:'Sudoku Notebook',
    url:siteURL,description:content.description,applicationCategory:'GameApplication',
    operatingSystem:'Any',browserRequirements:'Requires JavaScript',isAccessibleForFree:true,
    inLanguage:locales,
    offers:{'@type':'Offer',price:'0',priceCurrency:'JPY'}
  };
}

function languageNavigation(repo,current='ja',label='言語 / Language') {
  const names=JSON.parse(fs.readFileSync(path.join(repo,'scripts/i18n/languages.json'),'utf8'));
  return `<nav class="language-directory" aria-label="${escapeHTML(label)}"><h2>${escapeHTML(label)}</h2><div class="language-links">${localesFor(repo).map(locale=>`<a href="${new URL(localeURL(locale)).pathname}" hreflang="${locale.code}" lang="${locale.code}" translate="no"${locale.code===current?' aria-current="page"':''}>${escapeHTML(names[locale.code])}</a>`).join('')}</div></nav>`;
}

function buildInternationalPages(repo,base,write) {
  const international=readInternationalContent(repo),locales=localesFor(repo);
  const expected=Object.keys(JSON.parse(fs.readFileSync(path.join(repo,'scripts/i18n/languages.json'),'utf8')));
  if(JSON.stringify(locales.map(l=>l.code))!==JSON.stringify(expected))throw Error('Search pages must cover the supported game languages in order');
  for(const locale of international.locales){
    if(!/^[a-z][a-z-]*$/.test(locale.slug)||locale.labels.length!==7||locale.sections.length<5)throw Error('Incomplete localized search page: '+locale.code);
    const [play,daily,learn,language,privacy,contact,skip]=locale.labels;
    const game='/nanpure/?lang='+locale.code,url=localeURL(locale);
    const graph=[{'@type':'WebPage','@id':url,url,name:locale.title,description:locale.description,inLanguage:locale.code,dateModified:international.updated,about:{'@id':siteURL+'#app'}},applicationData({...locale,description:locale.description})];
    write(`nanpure/${locale.slug}/index.html`,`<!doctype html>
<html lang="${locale.code}" dir="${locale.code==='ar'?'rtl':'ltr'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#f4efe3">
${searchHead({title:locale.title,description:locale.description,url,icon:base+'favicon.svg',graph,ogLocale:locale.ogLocale,alternates:locales})}
<link rel="stylesheet" href="/nanpure/assets/guide.css"><link rel="stylesheet" href="/nanpure/assets/international.css"></head>
<body><a class="skip-link" href="#content">${escapeHTML(skip)}</a>
<header class="guide-header international-header"><a class="brand" href="${game}" dir="ltr">Sudoku Notebook</a><a class="header-play" href="${game}">${escapeHTML(play)}</a></header>
<main id="content" class="guide-main"><article><header class="article-header"><p class="eyebrow" translate="no" dir="ltr">SUDOKU NOTEBOOK · NANPURE CHO</p><h1>${escapeHTML(locale.heading)}</h1><p class="lead">${escapeHTML(locale.lead)}</p><div class="play-links international-actions"><a class="primary" href="${game}">${escapeHTML(play)}</a><a href="${game}&amp;view=daily">${escapeHTML(daily)}</a><a href="${game}&amp;view=tutorial">${escapeHTML(learn)}</a></div></header>
${locale.sections.map(([heading,text],index)=>sectionHTML({heading,paragraphs:[text]},index)).join('\n')}
<div class="play-links international-actions"><a class="primary" href="${game}">${escapeHTML(play)}</a><a href="${game}&amp;view=daily">${escapeHTML(daily)}</a></div></article>
${languageNavigation(repo,locale.code,language)}</main>
<footer class="guide-footer"><a href="${game}&amp;view=privacy">${escapeHTML(privacy)}</a><a href="${game}&amp;view=contact">${escapeHTML(contact)}</a><p translate="no">Sudoku Notebook / <span lang="ja">ナンプレ帳</span></p></footer></body></html>\n`);
  }
}

function decorateHome(repo,base,write) {
  const file=path.join(repo,'nanpure/index.html');
  if(!fs.existsSync(file))throw Error('Build the playable Japanese home first');
  const content=readSiteContent(repo),locales=localesFor(repo);
  let html=fs.readFileSync(file,'utf8');
  const metadata=/<title>[\s\S]*?<script type="application\/ld\+json">[\s\S]*?<\/script>/;
  if(!metadata.test(html))throw Error('Cannot locate the current home search metadata');
  html=html.replace(metadata,searchHead({title:content.title,description:content.description,icon:base+'favicon.svg',graph:[applicationData(content),{'@type':'WebPage','@id':siteURL,url:siteURL,name:content.title,inLanguage:'ja',about:{'@id':siteURL+'#app'}}],alternates:locales}));
  html=html.replace(/<link rel="stylesheet" href="\/nanpure\/assets\/international\.css">\s*/g,'').replace('</head>','<link rel="stylesheet" href="/nanpure/assets/international.css">\n</head>');
  // Keep the stable collection entry when rebuilding the pre-rendered home.
  html=html.replace(/<link rel="stylesheet" href="\/nanpure\/collection\/entry\.css[^"]*">\s*/g,'').replace(/<script defer src="\/nanpure\/collection\/entry\.js[^"]*"><\/script>\s*/g,'');
  html=html.replace('</head>',"<link rel=\"stylesheet\" href=\"/nanpure/collection/entry.css?v=20261030\">\n<script defer src=\"/nanpure/collection/entry.js?v=20261030\"></script>\n"+'</head>');
  html=html.replace(/<a\b[^>]*data-collection-entry[^>]*>[\s\S]*?<\/a>/g,'');
  const collectionEntry="<a class=\"np-collection-entry\" data-collection-entry href=\"/nanpure/collection/\"><span class=\"np-collection-copy\"><strong>すぐ遊べる10万問</strong><small>23ルール・生成を待たずに遊ぶ</small></span><span aria-hidden=\"true\">›</span></a>";
  const collectionTarget=/<button\b(?=[^>]*class="[^"]*\bshiru-entry\b)[^>]*>/;
  if(!collectionTarget.test(html))throw Error('Cannot locate the home collection entry position');
  html=html.replace(collectionTarget,match=>collectionEntry+match);
  const directory=`<!-- search-directory:start --><aside class="search-home" id="search-directory" lang="ja" translate="no" data-i18n-skip="true"><section class="search-japanese" aria-labelledby="search-about-title"><h2 id="search-about-title">毎日遊べる無料ナンプレ・数独</h2><p>ナンプレ帳は登録不要の無料ナンプレです。スマホ・タブレット・パソコンのブラウザで、問題づくりからプレイ、保存、印刷まで利用できます。英語名はSudoku Notebookです。</p><p><a href="/nanpure/daily-sudoku/">毎日3問の日替わりナンプレ</a>は、日本時間の午前0時に更新。自分のペースで解いたり、ランキングに挑戦したりできます。</p><p>完成済みの<a href="/nanpure/collection/">23ルール・すぐ遊べる10万問の問題集</a>も収録。問題を生成する時間を待たずに、好きなルール・大きさ・難易度で選べます。</p><h3>初めてでも遊べますか？</h3><p><a href="/nanpure/guide/">ナンプレの基本ルールと遊び方</a>を読み、<a href="/nanpure/?view=tutorial">操作を練習</a>してから始められます。通常の9×9は、各行・各列・3×3の枠に1〜9を重複なく入れます。</p><h3>紙に印刷できますか？</h3><p>A4・A3への印刷、答えを別ページに付ける配置、大きな盤面の分割印刷に対応します。PDFはブラウザの印刷画面で保存できます。<a href="/nanpure/print/">印刷とPDF保存の手順</a>を確認できます。</p><h3>途中から続けるには？</h3><p>自由に遊ぶ問題と途中経過は、使っているブラウザに保存されます。別の端末への引き継ぎやバックアップには、保存メニューの引き継ぎファイルを使えます。ブラウザのデータを削除すると端末内の記録が消えることがあります。</p></section>${languageNavigation(repo)}</aside><!-- search-directory:end -->`;
  html=html.replace(/<!-- search-directory:start -->[\s\S]*?<!-- search-directory:end -->/g,'').replace('</body>',directory+'</body>');
  write('nanpure/index.html',html);
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
<link rel="stylesheet" href="/nanpure/assets/guide.css"><link rel="stylesheet" href="/nanpure/assets/international.css"></head>
<body><a class="skip-link" href="#content">本文へ移動</a>
<header class="guide-header"><a class="brand" href="/nanpure/"><span class="brand-mark" aria-hidden="true">数</span>ナンプレ帳</a><a class="header-play" href="/nanpure/">遊ぶ <span aria-hidden="true">↗</span></a></header>
<main id="content" class="guide-main"><nav class="breadcrumbs" aria-label="現在の位置"><a href="/nanpure/">ナンプレ帳</a><span aria-hidden="true">/</span><span>${escapeHTML(guide.label||guide.title)}</span></nav>
<article><header class="article-header"><p class="eyebrow">ナンプレ帳の使い方</p><h1>${escapeHTML(guide.heading||guide.title.split('｜')[0])}</h1><p class="lead">${escapeHTML(guide.lead)}</p></header>
<nav class="contents" aria-label="このページの内容"><strong>このページの内容</strong><ol>${guide.sections.map((section,index)=>`<li><a href="#section-${index+1}">${escapeHTML(section.heading)}</a></li>`).join('')}</ol></nav>
${guide.sections.map(sectionHTML).join('\n')}
<section class="play-callout"><h2>ナンプレ帳で遊んでみる</h2><p>インストール・会員登録なしで、スマホやパソコンのブラウザから遊べます。</p><div class="play-links"><a class="primary" href="/nanpure/">ナンプレ帳を開く</a><a href="/nanpure/?view=daily">日替わり問題を選ぶ</a><a href="/nanpure/?view=tutorial">操作を練習する</a></div></section>
</article><nav class="related" aria-label="ほかの遊び方ガイド"><h2>あわせて読む</h2>${related}</nav>
</main><footer class="guide-footer">${languageNavigation(repo)}<a href="/nanpure/">ナンプレ帳ホーム</a><a href="/nanpure/?view=privacy">利用案内・プライバシー</a><a href="/nanpure/?view=contact">お問い合わせ</a><p>更新：<time datetime="${date}">${date}</time> <span>サイト ${version}</span></p></footer></body></html>\n`);
  }
  write('nanpure/assets/guide.css',fs.readFileSync(path.join(repo,'scripts/seo/guide.css'),'utf8'));
  write('nanpure/assets/international.css',fs.readFileSync(path.join(repo,'scripts/seo/international.css'),'utf8'));
  buildInternationalPages(repo,base,write);
  decorateHome(repo,base,write);
  const sitemapFile=path.join(repo,'sitemap.xml');
  const previous=fs.existsSync(sitemapFile)?fs.readFileSync(sitemapFile,'utf8'):'';
  const urls=new Map([...previous.matchAll(/<url>\s*<loc>([^<]+)<\/loc>(?:\s*<lastmod>([^<]+)<\/lastmod>)?[\s\S]*?<\/url>/g)].map(match=>[match[1],match[2]||null]));
  const updated=[date,readInternationalContent(repo).updated,version.split('.').slice(0,3).join('-')].sort().at(-1);
  if(!urls.has('https://atugari.github.io/plaza.html'))urls.set('https://atugari.github.io/plaza.html',null);
  for(const url of [siteURL,...content.guides.map(guide=>siteURL+guide.slug+'/'),...readInternationalContent(repo).locales.map(localeURL)])urls.set(url,[updated,urls.get(url)||''].sort().at(-1));
  write('sitemap.xml',`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[...urls].map(([url,lastmod])=>`  <url><loc>${escapeHTML(url)}</loc>${lastmod?'<lastmod>'+lastmod+'</lastmod>':''}</url>`).join('\n')}\n</urlset>\n`);
  // Keep versioned scripts/styles crawlable: the playable app needs them to render.
  write('robots.txt','User-agent: *\nAllow: /\n\nSitemap: https://atugari.github.io/sitemap.xml\n');
  return files;
}
