Object.assign(App, {
  renderSearch() {
    const st=this._searchState;
    document.getElementById('screen').innerHTML=`<section class="search-page">
      <header class="page-heading"><h1>Hledat</h1></header>
      <div class="search-header">
        <div class="search-input-wrap">${icon('search')}<input id="search-input" type="search" autocomplete="off" enterkeyhint="search" aria-label="Název filmu nebo seriálu" placeholder="Název filmu nebo seriálu" value="${escHtml(st.query)}">${actionButton('close','Vymazat hledání','id="search-clear"')}</div>
        <div class="search-controls"><div class="segmented" aria-label="Typ obsahu">${[['all','Vše'],['movie','Filmy'],['tv','Seriály']].map(([id,label])=>`<button data-search-type="${id}" aria-pressed="${(st.filters.typeFilter||'all')===id}" class="${(st.filters.typeFilter||'all')===id?'active':''}">${label}</button>`).join('')}</div>
        <button class="btn btn--ghost" id="filter-toggle">${icon('filter')}Filtry</button><button class="btn btn--ghost" id="search-sort" aria-label="Řazení výsledků">↕ <span>Řazení</span></button></div>
        <div id="active-filters" class="active-filters"></div>
      </div><div id="search-results" aria-live="polite"></div></section>`;
    const page=document.querySelector('.search-page'),input=page.querySelector('#search-input');
    let timer;
    input.addEventListener('input',()=>{
      clearTimeout(timer);this._searchController?.abort();this._searchSeq++;
      st.query=input.value;st.loaded=false;st.items=[];
      timer=setTimeout(()=>{if(this.currentScreen==='search')this._doSearch(st.query);},300);
    });
    input.addEventListener('keydown',e=>{if(e.key==='Enter'){clearTimeout(timer);this._doSearch(input.value);}});
    page.querySelector('#search-clear').onclick=()=>{clearTimeout(timer);input.value='';st.query='';this._doSearch('');input.focus();};
    page.querySelectorAll('[data-search-type]').forEach(b=>b.onclick=()=>{
      st.filters.typeFilter=b.dataset.searchType;st.filters.genreId=null;
      st.loaded=false;st.items=[];this.renderSearch();
    });
    page.querySelector('#filter-toggle').onclick=()=>this.showSearchFilters();
    page.querySelector('#search-sort').onclick=()=>this.showSearchSort();
    this.renderActiveFilters();
    if(!st.query.trim()&&!this._hasSearchFilters(st.filters))return this._doSearch('');
    if(st.loaded){this.renderSearchResults();return;}
    return this._doSearch(st.query);
  },
  _hasSearchFilters(filters=this._searchState.filters){
    return ['movie','tv'].includes(filters.typeFilter)||['genreId','yearFrom','yearTo','minRating'].some(key=>!!filters[key]);
  },
  renderSearchEmpty(){
    const res=document.getElementById('search-results');if(!res)return;
    const saved=Storage.getSavedSearches(),recent=Storage.getHistory().filter(q=>!saved.includes(q));
    res.innerHTML=`<div class="search-empty"><h2>Najdi svůj další oblíbený film</h2><p>Hledej podle názvu, nebo objevuj pomocí filtrů.</p>${saved.length?'<h3>Uložená hledání</h3><div class="saved-search-list">'+saved.map(q=>`<div class="saved-search-chip"><button type="button" class="history-query saved-search-query" data-query="${escHtml(q)}" aria-label="Hledat: ${escHtml(q)}">★ ${escHtml(q)}</button><button type="button" class="saved-search-remove" data-remove-saved-query="${escHtml(q)}" aria-label="Odebrat uložené hledání: ${escHtml(q)}" title="Odebrat uložené hledání">${icon('close')}</button></div>`).join('')+'</div>':''}${recent.length?'<h3>Nedávná hledání</h3>'+recent.map(q=>`<button type="button" class="history-query" data-query="${escHtml(q)}">${escHtml(q)}</button>`).join(''):''}</div>`;
    res.querySelectorAll('[data-query]').forEach(b=>b.onclick=()=>{this._searchState.query=b.dataset.query;this._searchState.loaded=false;this.renderSearch();});
    res.querySelectorAll('[data-remove-saved-query]').forEach(b=>b.onclick=event=>{
      event.stopPropagation();
      const index=saved.indexOf(b.dataset.removeSavedQuery);
      if(!this._setSavedSearch(b.dataset.removeSavedQuery,false))return;
      this.renderSearchEmpty();
      const remaining=res.querySelectorAll('[data-remove-saved-query]');
      (remaining[Math.min(index,remaining.length-1)]||document.getElementById('search-input'))?.focus();
    });
  },
  _setSavedSearch(query,save){
    const value=save?String(query).trim():String(query);
    if(!value.trim())return false;
    try{
      // Desired state is explicit, so a stale/double remove can never save it again.
      if(Storage.getSavedSearches().includes(value)===save)return true;
      Storage.toggleSavedSearch(value);
    }catch{return false;}
    showToast(save?'Hledání uloženo.':'Odebráno z uložených hledání.');
    return true;
  },
  renderActiveFilters(){
    const box=document.getElementById('active-filters');if(!box)return;
    const f=this._searchState.filters;
    const chips=[['genreId',f.genreName],['yearFrom',f.yearFrom?'Od '+f.yearFrom:''],['yearTo',f.yearTo?'Do '+f.yearTo:''],['minRating',f.minRating?'★ '+f.minRating+' a více':'']].filter(([key,label])=>f[key]&&label);
    box.innerHTML=chips.map(([key,label])=>`<button data-clear-filter="${key}" class="filter-pill">${escHtml(label)} ${icon('close')}</button>`).join('');
    box.querySelectorAll('button').forEach(b=>b.onclick=()=>{delete f[b.dataset.clearFilter];this.renderActiveFilters();this._doSearch(this._searchState.query);});
  },
  async showSearchFilters(){
    const st=this._searchState,draft={...st.filters};
    const modal=showModal(`<form id="filter-form" class="filter-form">
      <div class="year-fields"><label>Rok od<input name="yearFrom" type="number" inputmode="numeric" min="1870" max="${new Date().getFullYear()+10}" value="${draft.yearFrom||''}" placeholder="Bez omezení"></label><label>Rok do<input name="yearTo" type="number" inputmode="numeric" min="1870" max="${new Date().getFullYear()+10}" value="${draft.yearTo||''}" placeholder="Bez omezení"></label></div>
      <label>Minimální hodnocení<select name="minRating"><option value="">Libovolné</option>${[5,6,7,8,9].map(n=>`<option value="${n}" ${+draft.minRating===n?'selected':''}>${n}/10 a více</option>`).join('')}</select></label>
      <label>Žánr<select name="genreId" id="filter-genre"><option value="">Všechny žánry</option></select></label><p id="filter-error" role="alert"></p>
      <div class="sheet-actions"><button type="button" class="btn btn--ghost" id="filter-reset">Vymazat filtry</button><button class="btn btn--primary" type="submit">Použít filtry</button></div>
    </form>`,{title:'Filtry'});
    modal.classList.add('sheet-overlay');
    const form=modal.querySelector('form');
    form.onsubmit=e=>{
      e.preventDefault();const values=new FormData(form),from=+values.get('yearFrom')||null,to=+values.get('yearTo')||null;
      if(from&&to&&from>to){modal.querySelector('#filter-error').textContent='Rok od musí být menší nebo stejný jako rok do.';return;}
      const genre=form.elements.genreId;
      st.filters={typeFilter:draft.typeFilter,yearFrom:from,yearTo:to,minRating:+values.get('minRating')||null,genreId:+genre.value||null,genreName:genre.value?genre.selectedOptions[0].textContent:''};
      modal.remove();this.renderActiveFilters();this._doSearch(st.query);
    };
    modal.querySelector('#filter-reset').onclick=()=>{form.elements.yearFrom.value='';form.elements.yearTo.value='';form.elements.minRating.value='';form.elements.genreId.value='';};
    try{
      const type=draft.typeFilter==='tv'?'tv':'movie',genres=await API.getGenres(type);
      if(!modal.isConnected)return;
      form.elements.genreId.innerHTML='<option value="">Všechny žánry</option>'+genres.map(g=>`<option value="${g.id}" ${+draft.genreId===g.id?'selected':''}>${escHtml(g.name)}</option>`).join('');
    }catch{modal.querySelector('#filter-error').textContent='Žánry se nepodařilo načíst. Ostatní filtry můžeš použít.';}
  },
  showSearchSort(){
    const names={relevance:'Relevance',rating_desc:'Nejlépe hodnocené',rating_asc:'Nejhůře hodnocené',year_desc:'Nejnovější',year_asc:'Nejstarší',title_az:'Název A–Z',title_za:'Název Z–A'};
    const modal=showModal(`<p class="muted">Řazení se vztahuje na načtené výsledky.</p><div class="action-list">${Object.entries(names).map(([id,label])=>`<button data-sort="${id}" class="${id===this._searchState.sortBy?'selected':''}">${label}${id===this._searchState.sortBy?' ✓':''}</button>`).join('')}</div>`,{title:'Řazení'});
    modal.classList.add('sheet-overlay');
    modal.querySelectorAll('[data-sort]').forEach(b=>b.onclick=()=>{this._searchState.sortBy=b.dataset.sort;this.renderSearchResults();modal.remove();});
  },
  async _doSearch(query,more=false){
    if(this.currentScreen!=='search')return;
    const st=this._searchState,res=document.getElementById('search-results');if(!res)return;
    this._searchController?.abort();this._searchController=null;
    const seq=++this._searchSeq;st.query=query;
    const filters={...st.filters};
    if(!query.trim()&&!this._hasSearchFilters(filters)){
      st.query='';st.items=[];st.pages={};st.loaded=false;st.partialError=false;
      this.renderSearchEmpty();this.saveRoute();return;
    }
    const controller=new AbortController();this._searchController=controller;
    if(!more){st.items=[];st.pages={};st.loaded=false;res.innerHTML=spinner('Hledám…');}
    else {const b=res.querySelector('#load-more');if(b){b.disabled=true;b.textContent='Načítám…';}}
    try {
      const types=filters.typeFilter&&filters.typeFilter!=='all'?[filters.typeFilter]:['movie','tv'];
      const movieToTV={28:10759,12:10759,878:10765,14:10765,10752:10768};
      const mixed=types.length===2;
      const results=await Promise.allSettled(types.map(async type=>{
        const prior=more?st.pages[type]:null;if(prior?.done)return null;
        let genre=filters.genreId;
        if(mixed&&type==='tv'&&genre){const tvGenres=await API.getGenres('tv');genre=movieToTV[genre]||genre;if(!tvGenres.some(g=>g.id===+genre))return {type,items:[],page:0,totalPages:0};}
        const data=await API.searchPage(query,{...filters,genreId:genre,searchTV:type==='tv',page:(prior?.page||0)+1,signal:controller.signal});
        return {...data,type};
      }));
      if(seq!==this._searchSeq||this.currentScreen!=='search'||controller.signal.aborted)return;
      const fulfilled=results.filter(r=>r.status==='fulfilled').map(r=>r.value).filter(Boolean);
      const failures=results.filter(r=>r.status==='rejected');
      if(!fulfilled.length&&failures.length)throw failures[0].reason;
      for(const result of fulfilled){st.items.push(...result.items);st.pages[result.type]={page:result.page,done:result.page>=result.totalPages};}
      st.items=[...new Map(st.items.map(m=>[m.imdbId,m])).values()];st.loaded=true;
      st.partialError=failures.length>0;
      if(query.trim())Storage.addToHistory(query.trim());
      this.renderSearchResults();this.saveRoute();
    }catch(error){
      if(seq!==this._searchSeq||this.currentScreen!=='search')return;
      res.innerHTML=`<div class="empty-state"><h2>Hledání se nepodařilo</h2><p>Zkontroluj připojení a zkus to znovu.</p><button class="btn btn--primary" id="search-retry">Zkusit znovu</button></div>`;
      res.querySelector('#search-retry').onclick=()=>this._doSearch(query);
    }
  },
  renderSearchResults(){
    const res=document.getElementById('search-results');if(!res)return;
    const st=this._searchState,items=this._sortMovies(st.items||[],st.sortBy,st.query);
    const more=Object.values(st.pages||{}).some(p=>!p.done)||st.partialError;
    const savedQuery=st.query.trim(),querySaved=Storage.getSavedSearches().includes(savedQuery);
    res.innerHTML=`<div class="results-summary"><span>Zobrazeno ${items.length} titulů</span>${savedQuery?`<button type="button" class="btn btn--ghost btn--sm" id="save-query" aria-label="${querySaved?'Odebrat uložené hledání':'Uložit hledání'}: ${escHtml(savedQuery)}">${querySaved?icon('close')+' Odebrat uložené hledání':'☆ Uložit hledání'}</button>`:''}</div>
      ${st.partialError?'<p class="inline-notice">Část výsledků se nepodařilo načíst. Dalším načtením to zkusíme znovu.</p>':''}
      ${items.length?`<div class="movie-grid" id="search-grid">${items.map(m=>movieCard(m,{highlight:st.query})).join('')}</div>`:`<div class="empty-state"><h2>${more?'Zatím žádná shoda':'Žádné výsledky'}</h2><p>${more?'Zkus další stránku nebo uprav filtry.':'Zkus jiný název nebo méně filtrů.'}</p></div>`}
      ${more?'<div class="load-more-wrap"><button class="btn btn--primary" id="load-more">Načíst další</button></div>':''}`;
    attachCardEvents(res);
    res.querySelector('#load-more')?.addEventListener('click',()=>this._doSearch(st.query,true));
    res.querySelector('#save-query')?.addEventListener('click',()=>{if(this._setSavedSearch(savedQuery,!querySaved))this.renderSearchResults();});
  }
});
