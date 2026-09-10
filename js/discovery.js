// The picker checks the same exclusions for saved titles and catalog results.
// Missing metadata is verified in a small queue; an unknown genre never silently
// bypasses a genre exclusion. No library objects are changed by recommendation.
function createTonightPicker({api=API,storage=Storage,random=Math.random,today=()=>new Date().toISOString().slice(0,10)}={}) {
  const check = signal => { if(signal?.aborted)throw new DOMException('Aborted','AbortError'); };
  const shuffle = values => {
    const result=[...values];
    for(let i=result.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[result[i],result[j]]=[result[j],result[i]];}
    return result;
  };
  return async function pick({source='saved',runtime=0,unseen=true,excludedGenres=[]}={}, {signal}={}) {
    check(signal);
    const excluded=new Set(excludedGenres.map(Number).filter(id=>Number.isSafeInteger(id)&&id>0));
    let pool;
    if(source==='saved')pool=storage.getFavorites();
    else {
      const options={maxRuntime:runtime,excludedGenres:[...excluded],releasedBefore:today(),signal};
      const first=await api.searchPage('',options);check(signal);
      const pages=Math.min(first.totalPages||1,20),page=1+Math.floor(random()*pages);
      const extra=page>1?await api.searchPage('',{...options,page}):null;check(signal);
      pool=[...first.items,...(extra?.items||[])];
    }
    const movies=[],seen=new Set();
    let requests=0,unavailable=0,failed=0,limited=false;
    const candidates=shuffle(pool.filter(movie=>{
      if(movie.mediaType==='tv'||seen.has(movie.imdbId)||unseen&&storage.isWatched(movie.imdbId)||movie.releaseDate&&movie.releaseDate>today())return false;
      seen.add(movie.imdbId);
      return !Array.isArray(movie.genreIds)||!movie.genreIds.some(id=>excluded.has(id));
    }));
    // At most three in-flight detail lookups, and thirty total per selection.
    // Stop as soon as enough suitable films have been found.
    for(let offset=0;offset<candidates.length&&movies.length<3;offset+=3){
      check(signal);
      const batch=await Promise.all(candidates.slice(offset,offset+3).map(async movie=>{
        let genreIds=movie.genreIds,minutes=storage.getMediaRuntime('movie',movie.imdbId);
        const needGenres=excluded.size&&(!Array.isArray(genreIds)||!genreIds.length);
        const needRuntime=runtime&&source==='saved'&&!minutes;
        if(needGenres||needRuntime){
          if(requests>=30){limited=true;unavailable++;return null;}
          requests++;
          try {
            const details=await api.getMovieDetails(movie.id,{signal});check(signal);
            if(needGenres)genreIds=details.genreIds;
            if(details.runtime>0){minutes=details.runtime;storage.setMediaRuntime('movie',movie.imdbId,minutes);}
          }catch(error){check(signal);failed++;unavailable++;return null;}
        }
        if(excluded.size&&(!Array.isArray(genreIds)||!genreIds.length)){unavailable++;return null;}
        if(genreIds?.some(id=>excluded.has(id)))return null;
        if(runtime&&source==='saved'&&!minutes){unavailable++;return null;}
        if(runtime&&minutes>runtime)return null;
        return movie;
      }));
      check(signal);movies.push(...batch.filter(Boolean));
    }
    return {movies:movies.slice(0,3),unavailable,failed,limited};
  };
}

Object.assign(App, {
  async renderHome(){
    const state=this._homeState,s=document.getElementById('screen');
    s.innerHTML=`<div class="home-page">
      <header class="page-heading"><h1 class="home-logo">Sledovátko</h1><div class="heading-actions">${actionButton('transfer','Přenést na jiné zařízení','id="btn-sync"')}${accountButton()}</div></header>
      <div id="continue-slot"></div>
      <section class="tonight-section"><h2>Co si pustit dnes?</h2><div class="tonight-hero" id="daily-slot"><div class="tonight-copy"><p>Najdi film podle času a nálady.</p><button class="btn btn--primary" id="btn-tonight">Vybrat film ${icon('arrow')}</button></div></div></section>
      <section class="discover-section"><h2>Objevovat</h2><div class="segmented home-media-tabs" id="media-tabs" aria-label="Typ obsahu">${[['movie','Filmy'],['tv','Seriály']].map(([id,label])=>`<button class="home-media-tab ${state.mediaType===id?'active':''}" data-media="${id}" aria-pressed="${state.mediaType===id}">${label}</button>`).join('')}</div>
      <div class="mood-chips" id="mood-chips" aria-label="Žánr"></div><div id="main-cats">${spinner('Načítám tituly…')}</div></section>
      <div class="discovery-extras"><button class="bored-btn" id="btn-bored"><span class="bored-btn__emoji">🎲</span><span>Nevím, co si pustit</span>${icon('arrow')}</button><button class="bored-btn" id="btn-hotnot-home"><span class="bored-btn__emoji">🔥</span><span>Hot or Not</span>${icon('arrow')}</button><button class="btn btn--ghost" id="btn-kino">Kino večer · program tří filmů</button></div>
    </div>`;
    bindAccountButtons();
    document.getElementById('btn-sync').onclick=()=>showSyncModal();
    document.getElementById('btn-tonight').onclick=()=>this.navigate('tonight');
    document.getElementById('btn-bored').onclick=()=>this.navigate('bored');
    document.getElementById('btn-hotnot-home').onclick=()=>this.navigate('hotnot');
    document.getElementById('btn-kino').onclick=()=>this.navigate('program');
    document.getElementById('media-tabs').onclick=e=>{
      const b=e.target.closest('[data-media]');if(!b)return;
      state.mediaType=b.dataset.media;state.genreId=null;
      document.querySelectorAll('[data-media]').forEach(t=>{t.classList.toggle('active',t===b);t.setAttribute('aria-pressed',String(t===b));});
      this._loadMainCategories();
    };
    const slot=document.getElementById('daily-slot');
    const unseen=Storage.getFavorites().filter(m=>m.mediaType!=='tv'&&!Storage.isWatched(m.imdbId));
    const pick=unseen.length?Promise.resolve(unseen[Math.floor(Math.random()*unseen.length)]):API.getDailyMovie();
    pick.then(movie=>{
      if(!movie||!slot.isConnected)return;
      if(movie.backdropUrl){const img=document.createElement('img');img.src=movie.backdropUrl;img.alt='';img.className='tonight-backdrop';slot.prepend(img);}
      const copy=slot.querySelector('.tonight-copy');
      copy.querySelector('p').textContent=unseen.length?'Ze tvého Šuplíku':'Film dne';
      const title=document.createElement('button');title.className='tonight-title';title.textContent=movie.title;title.onclick=()=>openMovieDetail(movie);
      copy.querySelector('p').after(title);
    }).catch(()=>{});
    await Promise.all([this._renderContinueWatching(),this._loadMainCategories()]);
  },
  async _renderContinueWatching(){
    const slot=document.getElementById('continue-slot');if(!slot)return;
    const seq=(this._continueSeq||0)+1;this._continueSeq=seq;
    const candidates=Storage.getFavorites().filter(m=>m.mediaType==='tv'&&Storage.getWatchedEpisodeCount(m.imdbId)>0&&!Storage.isWatched(m.imdbId));
    await Promise.all(candidates.filter(m=>!Storage.getTVMeta(m.imdbId)).slice(0,6).map(async m=>{try{Storage.setTVMeta(m.imdbId,await API.getTVDetails(m.id));}catch{}}));
    if(!slot.isConnected||seq!==this._continueSeq)return;
    const partial=candidates.filter(m=>{const p=Storage.getTVProgress(m.imdbId);return p&&p.watched<p.total;});
    if(!partial.length){slot.innerHTML='';return;}
    slot.innerHTML=buildCategoryRow('continue','Pokračovat ve sledování',partial,{accentColor:'var(--accent)',hideActions:true});
    slot.querySelectorAll('.movie-card').forEach(card=>{
      const m=JSON.parse(card.dataset.movie),meta=Storage.getTVMeta(m.imdbId),seen=Storage.getWatchedEpisodes(m.imdbId);
      for(const season of meta?.seasons||[]){
        const nums=season.releasedEpisodeNumbers||Array.from({length:season.episodeCount},(_,i)=>i+1);
        const next=nums.find(n=>!seen.has('s'+season.seasonNumber+'e'+n));
        if(next){const p=document.createElement('p');p.className='next-episode';p.textContent='Další: S'+season.seasonNumber+' · E'+next;card.appendChild(p);break;}
      }
    });
    attachCategoryEvents('continue-slot');
  },
  async _loadMainCategories(){
    const main=document.getElementById('main-cats'),chips=document.getElementById('mood-chips');if(!main)return;
    const seq=++this._homeSeq,state={...this._homeState};
    main.innerHTML=spinner('Načítám…');
    try {
      const genres=await API.getGenres(state.mediaType);
      if(seq!==this._homeSeq||!main.isConnected)return;
      this.genreCache=state.mediaType==='movie'?genres:this.genreCache;
      chips.innerHTML=[{id:0,name:'Vše'},...genres].map(g=>`<button class="mood-chip ${(+state.genreId||0)===g.id?'active':''}" aria-pressed="${(+state.genreId||0)===g.id}" data-genre="${g.id}">${escHtml(g.name)}</button>`).join('');
      chips.onclick=e=>{const b=e.target.closest('[data-genre]');if(!b)return;this._homeState.genreId=+b.dataset.genre||null;this._loadMainCategories();};
      const sections=state.genreId
        ?[['genre',genres.find(g=>g.id===+state.genreId)?.name||'Žánr',()=>API.getByGenre(state.genreId,1,state.mediaType)]]
        :state.mediaType==='tv'
          ?[['popular','Populární seriály',()=>API.getTVPopular()],['rated','Nejlépe hodnocené',()=>API.getTVTopRated()],['onair','Právě vysílané',()=>API.getTVOnAir()],['today','Dnes na programu',()=>API.getTVAiringToday()]]
          :[['popular','Populární',()=>API.getPopular()],['nowplaying','Právě v kinech',()=>API.getNowPlaying()],['toprated','Top hodnocené',()=>API.getTopRated()],['upcoming','Nadcházející',()=>API.getUpcoming()]];
      main.innerHTML=sections.map(([id])=>`<div id="home-${id}" class="home-category-slot">${spinner('Načítám…')}</div>`).join('');
      await Promise.all(sections.map(async ([id,title,load])=>{
        const slot=main.querySelector('#home-'+id);
        try{
          const movies=await load();if(seq!==this._homeSeq||!slot.isConnected)return;
          slot.innerHTML=movies.length?buildCategoryRow(state.mediaType+'-'+id,title,movies,{accentColor:'var(--text)',collapsible:true,sectionKey:state.mediaType+'-'+id}):`<div class="inline-notice">${escHtml(title)}: zatím bez titulů.</div>`;
          attachCategoryEvents('home-'+id);
        }catch{if(seq!==this._homeSeq||!slot.isConnected)return;slot.innerHTML=`<div class="inline-notice">${escHtml(title)} se nepodařilo načíst. <button class="btn btn--ghost">Zkusit znovu</button></div>`;slot.querySelector('button').onclick=()=>this._loadMainCategories();}
      }));
    }catch{
      if(seq!==this._homeSeq||!main.isConnected)return;
      main.innerHTML='<div class="empty-state"><h2>Tituly se nepodařilo načíst</h2><p>Zkontroluj připojení. Tvůj Šuplík je dostupný i bez načtení katalogu.</p><button class="btn btn--primary" id="home-retry">Zkusit znovu</button></div>';
      main.querySelector('button').onclick=()=>this._loadMainCategories();
    }
  },
  async renderTonight(){
    this._tonightController?.abort();
    const s=document.getElementById('screen');
    const state=this._tonightState||(this._tonightState={source:Storage.getFavorites().some(m=>m.mediaType!=='tv')?'saved':'catalog',runtime:'',unseen:true,excludedGenres:[]});
    const times=[['','Bez omezení'],[30,'Do 30 minut'],[45,'Do 45 minut'],[60,'Do 1 hodiny'],[90,'Do 1,5 hodiny'],[120,'Do 2 hodin'],[150,'Do 2,5 hodiny'],[180,'Do 3 hodin'],[210,'Do 3,5 hodiny'],[240,'Do 4 hodin'],[300,'Do 5 hodin'],[360,'Do 6 hodin']];
    s.innerHTML=`<section class="tonight-page"><header class="page-heading"><h1>Co si pustit dnes?</h1><button class="btn btn--ghost" id="tonight-back">Zpět</button></header>
      <form id="tonight-form" class="glass-panel"><div class="tonight-fields"><label>Vybírat z<select name="source"><option value="saved">Můj Šuplík</option><option value="catalog">Objevovat nové filmy</option></select></label><label>Kolik máš času?<select name="runtime">${times.map(([value,label])=>`<option value="${value}">${label}</option>`).join('')}</select></label></div>
      <div class="check-options"><label><input name="unseen" type="checkbox"> Jen neviděné</label></div>
      <details class="tonight-genres" ${state.excludedGenres.length?'open':''}><summary class="tonight-genres-summary">Vynechat žánry <span class="tonight-genres-count" id="tonight-genres-count"></span></summary>
        <p class="tonight-filter-help" id="tonight-genres-help">Vyber žánry, které dnes nechceš — například horory. Můžeš označit více možností.</p>
        <fieldset class="tonight-genre-options" aria-describedby="tonight-genres-help"><legend class="sr-only">Žánry k vynechání</legend><div class="tonight-genre-chips" id="tonight-genre-chips"></div></fieldset><div class="tonight-filter-status" id="tonight-genres-status" aria-live="polite"></div>
      </details><button class="btn btn--primary" type="submit">Vybrat film ${icon('arrow')}</button></form><div id="tonight-results" aria-live="polite"></div></section>`;
    const form=document.getElementById('tonight-form'),results=document.getElementById('tonight-results');
    document.getElementById('tonight-back').onclick=()=>{this._tonightController?.abort();this.back();};
    form.elements.source.value=state.source;form.elements.runtime.value=String(state.runtime);form.elements.unseen.checked=state.unseen;
    const chips=document.getElementById('tonight-genre-chips'),genreStatus=document.getElementById('tonight-genres-status'),count=document.getElementById('tonight-genres-count');
    let genres=this._tonightGenres||[{id:27,name:'Horory'}];
    const renderGenres=()=>{
      chips.innerHTML=genres.map(g=>`<label class="tonight-genre-chip"><input type="checkbox" name="excludedGenre" value="${g.id}" ${state.excludedGenres.includes(g.id)?'checked':''}><span>${escHtml(g.name)}</span></label>`).join('');
      count.textContent=state.excludedGenres.length?state.excludedGenres.map(id=>genres.find(g=>g.id===id)?.name||'Žánr '+id).join(', '):'Žádné';
    };
    renderGenres();
    let genreRequest=0;
    const loadGenres=async()=>{
      const current=++genreRequest;genreStatus.textContent='Načítám další žánry…';
      try {
        const loaded=await API.getGenres('movie');
        if(!form.isConnected||current!==genreRequest)return;
        if(!loaded.length)throw Error('Genres unavailable');
        this._tonightGenres=genres=loaded;renderGenres();genreStatus.textContent='';
      }catch{
        if(!form.isConnected||current!==genreRequest)return;
        genreStatus.innerHTML='Všechny žánry se nepodařilo načíst. <button class="btn btn--ghost" type="button">Zkusit znovu</button>';
        genreStatus.querySelector('button').onclick=loadGenres;
      }
    };
    loadGenres();
    let request=0;
    const button=form.querySelector('[type=submit]');
    form.onchange=()=>{
      state.source=form.elements.source.value;state.runtime=form.elements.runtime.value;state.unseen=form.elements.unseen.checked;
      state.excludedGenres=[...form.querySelectorAll('[name=excludedGenre]:checked')].map(input=>+input.value);
      count.textContent=state.excludedGenres.length?state.excludedGenres.map(id=>genres.find(g=>g.id===id)?.name||'Žánr '+id).join(', '):'Žádné';
      const wasLoading=button.disabled;request++;this._tonightController?.abort();button.disabled=false;results.removeAttribute('aria-busy');
      if(wasLoading||results.innerHTML)results.innerHTML='<p class="inline-notice">Podmínky se změnily. Vyber film znovu.</p>';
    };
    const picker=createTonightPicker();
    form.onsubmit=async e=>{
      e.preventDefault();this._tonightController?.abort();
      const current=++request,controller=new AbortController();this._tonightController=controller;
      button.disabled=true;results.setAttribute('aria-busy','true');results.innerHTML=spinner('Vybírám film…');
      const active=()=>current===request&&form.isConnected&&!controller.signal.aborted;
      try{
        const selection=await picker({...state,runtime:+state.runtime||0,excludedGenres:[...state.excludedGenres]},{signal:controller.signal});
        if(!active())return;
        const {movies,unavailable,failed,limited}=selection;
        results.innerHTML=movies.length?'<h2>Dnes by to mohlo být…</h2><div class="movie-grid tonight-picks">'+movies.map(m=>movieCard(m)).join('')+'</div>':'<div class="empty-state"><h2>Žádný film nevyhovuje</h2><p>Zkus více času, jiné podmínky nebo výběr z katalogu.</p></div>';
        if(unavailable)results.insertAdjacentHTML('beforeend',`<p class="inline-notice">${limited?'U části filmů zatím nemáme ověřené údaje.':'Filmy bez ověřeného žánru nebo délky jsme pro tento výběr přeskočili.'}${failed||limited?' <button class="btn btn--ghost" type="button" data-tonight-retry>Zkusit znovu</button>':''}</p>`);
        const retry=results.querySelector('[data-tonight-retry]');if(retry)retry.onclick=()=>form.requestSubmit();
        attachCardEvents(results);
      }catch(error){
        if(!active())return;
        results.innerHTML='<div class="inline-notice">Výběr se nepodařilo načíst. Zkontroluj připojení. <button class="btn btn--ghost" type="button">Zkusit znovu</button></div>';
        results.querySelector('button').onclick=()=>form.requestSubmit();
      }finally{if(active()){button.disabled=false;results.removeAttribute('aria-busy');}}
    };
  }
});
