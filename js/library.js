// The filter already has a CSS color dot; do not repeat its emoji in the name.
function libraryLabelName(definition) {
  const label = String(definition.label || definition.name || '').trim();
  const emoji = String(definition.emoji || '').trim();
  return (emoji && label.startsWith(emoji) ? label.slice(emoji.length).trim() : label) || 'Štítek';
}

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
      <button data-account-open>Účet a synchronizace</button><button id="btn-help">Nápověda a soukromí</button><button id="btn-random-unseen">Náhodný neviděný</button><button id="btn-calendar">${st.calendarView?'Zobrazit mřížku':'Seskupit podle roku'}</button><button id="btn-stats">Statistiky</button><button id="btn-share">Přenést na jiné zařízení</button><button id="btn-new-label">Nový štítek</button><button id="manage-labels">Spravovat štítky</button><button id="theme-toggle">${Storage.getTheme()==='dark'?'Světlý':'Tmavý'} vzhled</button></div></details></header>
      <div class="search-input-wrap">${icon('search')}<input type="search" id="library-query" aria-label="Hledat ve Šuplíku" placeholder="Hledat ve Šuplíku" value="${escHtml(st.query||'')}"></div>
      <div class="library-status segmented" aria-label="Stav sledování">${[['all','Vše'],['planned','Chci vidět'],['watching','Rozkoukané'],['watched','Viděné']].map(([id,label])=>`<button data-status="${id}" aria-pressed="${(st.status||'all')===id}" class="${(st.status||'all')===id?'active':''}">${label}</button>`).join('')}</div>
      <div class="favs-toolbar"><label class="sr-only" for="fav-sort">Řazení Šuplíku</label><select id="fav-sort" class="sort-select">${[['added','Datum přidání'],['title','Název A–Z'],['rating','Moje hodnocení'],['year','Rok'],['watched','Neviděné první']].map(([id,label])=>`<option value="${id}" ${st.sortBy===id?'selected':''}>${label}</option>`).join('')}</select><span class="muted">${filtered.length} titulů</span></div>
      <div class="labels-row"><button type="button" class="label-filter ${!st.filterLabel?'active':''}" data-label="" aria-pressed="${!st.filterLabel}">Všechny štítky</button>${Object.entries(defs).map(([key,def])=>`<button type="button" class="label-filter ${st.filterLabel===key?'active':''}" data-label="${escHtml(key)}" aria-pressed="${st.filterLabel===key}" style="--label-color:${def.color}">${escHtml(libraryLabelName(def))}</button>`).join('')}</div>
      <div id="stats-panel" class="stats-panel ${st.showStats?'open':''}"><div class="stats-grid">${[['Celkem',stats.total],['Viděno',stats.watched],['Zbývá',stats.notWatched],['Moje průměrné hodnocení',stats.avgRating?stats.avgRating.toFixed(1):'—']].map(([name,value])=>`<div class="stat-item"><div class="stat-item__val">${value}</div><span>${name}</span></div>`).join('')}</div></div>
      <div id="favs-content">${!favs.length?this._emptyFavs():!filtered.length?'<div class="empty-state"><h2>Žádný titul nevyhovuje</h2><p>Zkus změnit hledání nebo filtry.</p></div>':st.calendarView?this._buildCalendarView(filtered):'<div class="movie-grid favorites-grid">'+filtered.map(m=>movieCard(m)).join('')+'</div>'}</div></section>`;
    this._attachFavEvents(filtered);
    bindAccountButtons();
    document.getElementById('btn-help').onclick=()=>openHelp();
    const input=document.getElementById('library-query');input.oninput=()=>{st.query=input.value;this.renderFavorites();};
    if(focus){input.focus({preventScroll:true});try{input.setSelectionRange(selection,selection);}catch{}}
    document.querySelectorAll('[data-status]').forEach(b=>b.onclick=()=>{st.status=b.dataset.status;this.renderFavorites();});
    document.getElementById('find-first')?.addEventListener('click',()=>this.navigate('search'));
    document.getElementById('theme-toggle').onclick=()=>{this.applyTheme(Storage.getTheme()==='dark'?'light':'dark');this.renderFavorites();};
    document.getElementById('manage-labels').onclick=()=>this.manageLabels();
    document.querySelectorAll('.library-menu-body button').forEach(b=>b.addEventListener('click',()=>document.querySelector('.library-menu')?.removeAttribute('open')));
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
