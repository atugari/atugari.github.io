// Executed only by platform UI tests, never bundled into the user-facing app.
window.__workspaceTest=()=>{
 const get=id=>document.getElementById(id),click=id=>get(id).click(),assert=(ok,why)=>{if(!ok)throw Error(why);};
 assert(document.querySelectorAll('.puzzle-card').length===4,'Four questions per screen');
 assert(get('workspace-create').hidden&&!get('workspace-library').hidden,'Generation opens selection');
 click('workspace-tab-print');assert(!get('workspace-print').hidden&&get('workspace-library').hidden,'Print tab');
 assert(!get('workspace-type-settings').open&&!get('workspace-paper-settings').open,'Detailed settings start closed');
 click('workspace-open-settings');assert(get('workspace-settings').open,'Settings dialog opens');
 assert(window.WadoAppBack()&&!get('workspace-settings').open,'Android back closes settings');
 get('workspace-tab-print').dispatchEvent(new KeyboardEvent('keydown',{key:'Home',bubbles:true}));
 assert(!get('workspace-create').hidden&&get('workspace-tab-create').getAttribute('aria-selected')==='true','Keyboard navigation');
 click('workspace-tab-library');assert([...document.querySelectorAll('[data-workspace-selected]')].every(n=>n.textContent==='20'),'Selected count is shared');
 return {navigation:true,settings:true,pagination:4};
};
window.__paperTest=(size,text,kind,hide=false)=>{
 const get=id=>document.getElementById(id),set=(id,value)=>{const n=get(id);n.value=value;n.dispatchEvent(new Event('change',{bubbles:true}));};
 if(!get('preview').hidden)get('close-preview').click();
 set('uiSize','largest');set('problemSize',size);set('printText',text);set('printWeight','bold');set('hint',hide?'0':'3');
 for(const key of WadoPaper.flags)set(key,hide?'no':'yes');
 get('preview-'+kind).click();
 const pages=[...document.querySelectorAll('#paper .wp-sheet')],items=[...document.querySelectorAll('#paper .wp-item')];
 if(!pages.length)throw Error(get('error').textContent||'No automatic pages');
 if(items.length!==JSON.parse(localStorage.getItem('np-wado-print-v1')).puzzles.length*(kind==='hints'?3:1))throw Error('Lost or duplicated questions');
 const clipped=items.some(n=>n.scrollWidth>n.clientWidth+2||n.scrollHeight>n.clientHeight+2)||pages.some(n=>{const grid=n.querySelector('.wp-grid'),r=grid.getBoundingClientRect();return[...grid.children].some(c=>c.getBoundingClientRect().bottom>r.bottom+1);});
 if(clipped)throw Error('Clipped automatic paper: '+[size,text,kind,hide]);
 if(hide&&pages.some(n=>n.querySelector('.wp-head,.wp-foot,.wp-item-label,.sheet-hint')))throw Error('Hidden fields were printed');
 if(document.getElementById('layout'))throw Error('Manual page count remains');
 return {pages:pages.length,counts:pages.map(n=>Number(n.dataset.itemCount)),overflow:clipped,blank:kind!=='questions'||items.every(n=>n.querySelectorAll('.diagram text').length===n.querySelectorAll('.arrow').length),fonts:document.fonts.check('700 64px WadoPrintKanji')};
};

window.__liveTest=()=>{
 const get=id=>document.getElementById(id),assert=(ok,why)=>{if(!ok)throw Error(why);},change=(id,v)=>{get(id).value=v;get(id).dispatchEvent(new Event('change',{bubbles:true}));},flush=()=>change('live-kind','questions');
 get('workspace-tab-print').click();assert(document.querySelectorAll('#live-stage .wp-item').length===20,'Live preview includes every selected question');
 const size=get('problemSize').value,text=get('printText').value;change('problemSize','compact');flush();assert(document.querySelector('#live-stage .wp-sheet').style.getPropertyValue('--wp-board-size')==='45mm','Size changes update preview');
 change('printText',text==='largest'?'normal':'largest');get('live-undo').click();assert(get('printText').value===text&&get('problemSize').value==='compact','Undo preserves earlier setting');get('live-undo').click();assert(get('problemSize').value===size,'Second undo restores size');
 get('live-zoom').click();assert(get('live-zoom').getAttribute('aria-pressed')==='true','One-question zoom');get('live-next').click();assert(get('live-page-number').textContent.startsWith('2 / '),'Next enlarged question');get('live-zoom').click();
 change('live-kind','hints');assert(document.querySelectorAll('#live-stage .wp-item').length===60,'Three hint grades');change('live-kind','questions');get('workspace-tab-library').click();return{live:true,undo:true,zoom:true};
};
