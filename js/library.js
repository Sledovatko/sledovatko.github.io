// The filter already has a CSS color dot; do not repeat its emoji in the name.
function libraryLabelName(definition) {
  const label = String(definition.label || definition.name || '').trim();
  const emoji = String(definition.emoji || '').trim();
  return (emoji && label.startsWith(emoji) ? label.slice(emoji.length).trim() : label) || 'Štítek';
}

// Device-local onboarding; never included in account sync or library exports.
const LibraryGuide = {
  dismissed:false,
  show(force=false){
    if(document.querySelector('.library-guide'))return;
    if(!force){
      if(this.dismissed)return;
      try{if(localStorage.getItem('sledovatko_library_guide_v1'))return;}catch{}
    }
    const library=document.querySelector('.library-page');if(!library)return;
    const previous=document.activeElement;
    const guide=document.createElement('button');
    guide.type='button';guide.className='library-guide';
    guide.setAttribute('aria-label','Nápověda Šuplíku. Stav sledování filtruje sbírku. Štítky seskupují tituly. Nabídka nahoře obsahuje vlastní štítky, statistiky a přenos. Kliknutím nebo klávesou Escape zavřete.');
    guide.innerHTML=`<svg class="library-guide__arrows" aria-hidden="true"></svg>
      <span class="library-guide__note"><strong>Co už máš za sebou?</strong><span>Tady přepneš stav sledování.</span></span>
      <span class="library-guide__note"><strong>Udělej si v tom pořádek.</strong><span>Štítky seskupí tvoje filmy a seriály.</span></span>
      <span class="library-guide__note"><strong>Ještě něco navíc.</strong><span>Vlastní štítky, statistiky a přenos jsou tady.</span></span>
      <span class="library-guide__dismiss">Klikni kamkoli a pokračuj · Esc</span>`;
    library.appendChild(guide);
    const notes=[...guide.querySelectorAll('.library-guide__note')];
    const selectors=['.library-status','.labels-row','.library-menu>summary'];
    const draw=()=>{
      if(!guide.isConnected)return;
      const w=innerWidth,h=innerHeight,mobile=w<700;
      const start=mobile?Math.max(210,h-350):Math.max(350,h-240);
      let paths='';
      notes.forEach((note,i)=>{
        const target=library.querySelector(selectors[i]);if(!target)return;
        const r=target.getBoundingClientRect();
        const x=mobile?Math.min(w-24,58+i*10):w*(.22+i*.28),y=mobile?start+i*82:start;
        note.style.left=x+'px';note.style.top=y+'px';
        note.style.width=(mobile?w-x-22:Math.min(260,w*.24))+'px';
        const tx=Math.max(16,Math.min(w-16,i===2?r.left+r.width/2:r.left+Math.min(r.width/2,100+i*80)));
        const ty=Math.max(18,Math.min(h-100,r.bottom+6));
        const sx=mobile?x-10:x+30,sy=y+10,cx=mobile?20+i*9:sx-65;
        paths+=`<path d="M ${sx} ${sy} Q ${cx} ${(sy+ty)/2} ${tx} ${ty}"/><path d="M ${tx-7} ${ty+10} L ${tx} ${ty} L ${tx+7} ${ty+10}"/>`;
        paths+=`<rect x="${r.left-4}" y="${r.top-4}" width="${r.width+8}" height="${r.height+8}" rx="12" class="library-guide__outline"/>`;
      });
      guide.querySelector('svg').innerHTML=paths;
    };
    const dismiss=()=>{
      this.dismissed=true;
      try{localStorage.setItem('sledovatko_library_guide_v1','1');}catch{}
      guide.remove();cleanup();
      if(previous?.isConnected)previous.focus({preventScroll:true});
    };
    const key=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();dismiss();}};
    const cleanup=()=>{window.removeEventListener('resize',draw);document.removeEventListener('scroll',draw,true);document.removeEventListener('keydown',key,true);removed.disconnect();};
    const removed=new MutationObserver(()=>{if(!guide.isConnected)cleanup();});
    removed.observe(document.getElementById('screen'),{childList:true,subtree:true});
    guide.onclick=e=>{e.stopPropagation();dismiss();};
    document.addEventListener('keydown',key,true);
    window.addEventListener('resize',draw);document.addEventListener('scroll',draw,true);
    requestAnimationFrame(()=>{draw();guide.focus({preventScroll:true});});
  }
};

Object.assign(App, {
  renderFavorites(){
    const st=this._favState,favs=Storage.getFavorites(),watched=Storage.getWatchedIds(),stats=Storage.getStats();
    const focus=document.activeElement?.id==='library-query',selection=focus?document.activeElement.selectionStart:null;
    const query=(st.query||'').toLocaleLowerCase('cs'),labels=Storage.getLabels(),defs=getAllLabelDefs();
    let filtered=favs.filter(m=>(!query||m.title.toLocaleLowerCase('cs').includes(query))&&(!st.filterLabel||labels[m.imdbId]===st.filterLabel));
    if(st.status==='watched')filtered=filtered.filter(m=>watched.has(m.imdbId));
    if(st.status==='watching')filtered=filtered.filter(m=>m.mediaType==='tv'&&!watched.has(m.imdbId)&&Storage.getWatchedEpisodeCount(m.imdbId)>0);
    if(st.status==='planned')filtered=filtered.filter(m=>!watched.has(m.imdbId)&&!(m.mediaType==='tv'&&Storage.getWatchedEpisodeCount(m.imdbId)>0));
    if(st.sortBy==='title')filtered.sort((a,b)=>a.title.localeCompare(b.title,'cs'));
    if(st.sortBy==='rating')filtered.sort((a,b)=>(Storage.getRating(b.imdbId)||0)-(Storage.getRating(a.imdbId)||0));
    if(st.sortBy==='year')filtered.sort((a,b)=>(b.year||'').localeCompare(a.year||''));
    if(st.sortBy==='watched')filtered.sort((a,b)=>Number(watched.has(a.imdbId))-Number(watched.has(b.imdbId)));
    document.getElementById('screen').innerHTML=`<section class="library-page"><header class="page-heading"><h1>Můj Šuplík</h1><details class="library-menu"><summary class="glass-icon" aria-label="Možnosti Šuplíku">${icon('more')}</summary><div class="library-menu-body">
      <button data-account-open>Účet a synchronizace</button><button id="btn-library-guide">Průvodce Šuplíkem</button><button id="btn-help">Nápověda a soukromí</button><button id="btn-random-unseen">Náhodný neviděný</button><button id="btn-calendar">${st.calendarView?'Zobrazit mřížku':'Seskupit podle roku'}</button><button id="btn-stats">Statistiky</button><button id="btn-share">Přenést na jiné zařízení</button><button id="btn-new-label">Nový štítek</button><button id="manage-labels">Spravovat štítky</button><button id="theme-toggle">${Storage.getTheme()==='dark'?'Světlý':'Tmavý'} vzhled</button></div></details></header>
      <div class="search-input-wrap">${icon('search')}<input type="search" id="library-query" aria-label="Hledat ve Šuplíku" placeholder="Hledat ve Šuplíku" value="${escHtml(st.query||'')}"></div>
      <div class="library-status segmented" aria-label="Stav sledování">${[['all','Vše'],['planned','Chci vidět'],['watching','Rozkoukané'],['watched','Viděné']].map(([id,label])=>`<button data-status="${id}" aria-pressed="${(st.status||'all')===id}" class="${(st.status||'all')===id?'active':''}">${label}</button>`).join('')}</div>
      <div class="favs-toolbar"><label class="sr-only" for="fav-sort">Řazení Šuplíku</label><select id="fav-sort" class="sort-select">${[['added','Datum přidání'],['title','Název A–Z'],['rating','Moje hodnocení'],['year','Rok'],['watched','Neviděné první']].map(([id,label])=>`<option value="${id}" ${st.sortBy===id?'selected':''}>${label}</option>`).join('')}</select><span class="muted">${filtered.length} titulů</span></div>
      <div class="labels-row"><button type="button" class="label-filter ${!st.filterLabel?'active':''}" data-label="" aria-pressed="${!st.filterLabel}">Všechny štítky</button>${Object.entries(defs).map(([key,def])=>`<button type="button" class="label-filter ${st.filterLabel===key?'active':''}" data-label="${escHtml(key)}" aria-pressed="${st.filterLabel===key}" style="--label-color:${def.color}">${escHtml(libraryLabelName(def))}</button>`).join('')}</div>
      <div id="stats-panel" class="stats-panel ${st.showStats?'open':''}"><div class="stats-grid">${[['Celkem',stats.total],['Viděno',stats.watched],['Zbývá',stats.notWatched],['Moje průměrné hodnocení',stats.avgRating?stats.avgRating.toFixed(1):'—']].map(([name,value])=>`<div class="stat-item"><div class="stat-item__val">${value}</div><span>${name}</span></div>`).join('')}</div></div>
      <div id="favs-content">${!favs.length?this._emptyFavs():!filtered.length?'<div class="empty-state"><h2>Žádný titul nevyhovuje</h2><p>Zkus změnit hledání nebo filtry.</p></div>':st.calendarView?this._buildCalendarView(filtered):'<div class="movie-grid favorites-grid">'+filtered.map(m=>movieCard(m)).join('')+'</div>'}</div></section>`;
    this._attachFavEvents(filtered);
    bindAccountButtons();
    document.getElementById('btn-help').onclick=()=>openHelp();
    document.getElementById('btn-library-guide').onclick=()=>LibraryGuide.show(true);
    const input=document.getElementById('library-query');input.oninput=()=>{st.query=input.value;this.renderFavorites();};
    if(focus){input.focus({preventScroll:true});try{input.setSelectionRange(selection,selection);}catch{}}
    document.querySelectorAll('[data-status]').forEach(b=>b.onclick=()=>{st.status=b.dataset.status;this.renderFavorites();});
    document.getElementById('find-first')?.addEventListener('click',()=>this.navigate('search'));
    document.getElementById('theme-toggle').onclick=()=>{this.applyTheme(Storage.getTheme()==='dark'?'light':'dark');this.renderFavorites();};
    document.getElementById('manage-labels').onclick=()=>this.manageLabels();
    document.querySelectorAll('.library-menu-body button').forEach(b=>b.addEventListener('click',()=>document.querySelector('.library-menu')?.removeAttribute('open')));
    requestAnimationFrame(()=>LibraryGuide.show());
  },
  _emptyFavs(){return '<div class="empty-state"><div class="empty-state__icon">'+icon('library')+'</div><h2>Tvůj první film čeká</h2><p>Ulož si film nebo seriál pomocí + na plakátu.</p><button class="btn btn--primary" id="find-first">Najít první film</button></div>';},
  manageLabels(){
    const defs=getAllLabelDefs();
    const modal=showModal('<p class="muted">Skrytí štítku neodebere žádný titul.</p><div class="action-list">'+Object.entries(defs).map(([id,d])=>`<button data-hide-label="${escHtml(id)}">${escHtml(d.label)} <span>Skrýt</span></button>`).join('')+'</div><button class="btn btn--ghost" id="restore-labels">Obnovit skryté štítky</button>',{title:'Spravovat štítky'});
    modal.querySelectorAll('[data-hide-label]').forEach(b=>b.onclick=()=>{try{hideLabel(b.dataset.hideLabel);}catch{return;}if(this._favState.filterLabel===b.dataset.hideLabel)this._favState.filterLabel=null;b.remove();this.renderFavorites();});
    modal.querySelector('#restore-labels').onclick=()=>{try{Storage.setHiddenLabels([]);}catch{return;}this.renderFavorites();showToast('Skryté štítky obnoveny');modal.remove();};
  },
  _showCtxMenu(event,movie){
    const saved=Storage.isFavorite(movie.imdbId),defs=getAllLabelDefs();
    const modal=showModal(`<div class="action-list"><button data-card-option="similar">${movie.mediaType==='tv'?'Podobné seriály':'Podobné filmy'}</button><button data-card-option="save">${saved?'Odebrat ze Šuplíku':'Uložit do Šuplíku'}</button><button data-card-option="watched">${movie.mediaType==='tv'?'Spravovat epizody':Storage.isWatched(movie.imdbId)?'Označit jako neviděné':'Označit jako viděné'}</button><button data-card-option="music">Soundtrack na YouTube ↗</button></div>
      ${saved?`<label class="label-select">Štítek<select id="card-label"><option value="">Bez štítku</option>${Object.entries(defs).map(([id,d])=>`<option value="${escHtml(id)}" ${Storage.getLabels()[movie.imdbId]===id?'selected':''}>${escHtml(d.label)}</option>`).join('')}</select></label>`:''}`,{title:movie.title});
    modal.classList.add('sheet-overlay');
    modal.querySelectorAll('[data-card-option]').forEach(b=>b.onclick=()=>{
      const action=b.dataset.cardOption;
      if(action==='similar'){openMovieDetail(movie,{showSimilar:true});return;}
      if(action==='save'){
        if(Storage.isFavorite(movie.imdbId))removeFavoriteWithUndo(movie);
        else{Storage.saveFavorite(movie);document.dispatchEvent(new CustomEvent('favorites-changed'));showToast('Uloženo do Šuplíku');}
        modal.remove();
      }
      if(action==='watched'){
        // The detail owns the series/episode consistency rules.
        openMovieDetail(movie);
        const overlay=Dialogs.stack.at(-1);if(movie.mediaType!=='tv')overlay?.querySelector('#_btn-watched')?.click();
      }
      if(action==='music')window.open('https://www.youtube.com/results?search_query='+encodeURIComponent(movie.title+' soundtrack'),'_blank','noopener,noreferrer');
    });
    modal.querySelector('#card-label')?.addEventListener('change',e=>{Storage.setLabel(movie.imdbId,e.target.value);if(this.currentScreen==='favorites')this.renderFavorites();showToast('Štítek uložen');});
  }
});
