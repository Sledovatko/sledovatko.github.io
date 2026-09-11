// The picker checks the same exclusions for saved titles and catalog results.
// Missing metadata is verified in a small queue; an unknown genre never silently
// bypasses a genre exclusion. No library objects are changed by recommendation.
function createTonightPicker({api=API,storage=Storage,random=Math.random,today=()=>new Date().toISOString().slice(0,10),peekRuntime=movie=>typeof RuntimeHydrator!=='undefined'?RuntimeHydrator.peek(movie):null}={}) {
  const check = signal => { if(signal?.aborted)throw new DOMException('Aborted','AbortError'); };
  const shuffle = values => {
    const result=[...values];
    for(let i=result.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[result[i],result[j]]=[result[j],result[i]];}
    return result;
  };
  const typeOf=movie=>movie.mediaType==='tv'||String(movie.imdbId).startsWith('tv:')?'tv':'movie';
  const idOf=movie=>String(movie.id??movie.imdbId).replace(/^tv:/,'');
  const keyOf=movie=>(typeOf(movie)==='tv'?'tv:':'')+idOf(movie);
  const validMinutes=minutes=>Number.isFinite(minutes)&&minutes>0&&minutes<=1440;
  const episodeMinutes=details=>{
    const times=(Array.isArray(details?.episodeRunTime)?details.episodeRunTime:[]).filter(validMinutes).sort((a,b)=>a-b);
    return times.length?Math.round(times[Math.floor(times.length/2)]):validMinutes(details?.lastEpisodeRuntime)?Math.round(details.lastEpisodeRuntime):0;
  };
  return async function pick({source='saved',mediaType='movie',runtime=0,unseen=true,excludedGenres=[],excludedGenresByType}={}, {signal}={}) {
    check(signal);
    const types=mediaType==='all'?['movie','tv']:[mediaType==='tv'?'tv':'movie'];
    const exclusions=Object.fromEntries(types.map(type=>[type,new Set((excludedGenresByType?.[type]||excludedGenres).map(Number).filter(id=>Number.isSafeInteger(id)&&id>0))]));
    let pool;
    if(source==='saved')pool=storage.getFavorites();
    else {
      // Mixed picks spend the same two catalog requests on one page per type.
      // TV duration is checked from an episode below, independently of season count.
      const pages=await Promise.all(types.map(async type=>{
        const options={searchTV:type==='tv',maxRuntime:type==='movie'?runtime:0,excludedGenres:[...exclusions[type]],releasedBefore:today(),signal};
        const first=await api.searchPage('',options);check(signal);
        if(types.length>1)return first.items;
        const page=1+Math.floor(random()*Math.min(first.totalPages||1,20));
        const extra=page>1?await api.searchPage('',{...options,page}):null;check(signal);
        return [...first.items,...(extra?.items||[])];
      }));
      check(signal);pool=pages.flat();
    }
    const movies=[],seen=new Set(),episodeRuntimes={};
    let requests=0,unavailable=0,failed=0,limited=false;
    const candidates=shuffle(pool.filter(movie=>{
      const type=typeOf(movie),key=keyOf(movie);
      if(!types.includes(type)||seen.has(key)||unseen&&storage.isWatched(key)||movie.releaseDate&&movie.releaseDate>today())return false;
      seen.add(key);
      return !Array.isArray(movie.genreIds)||!movie.genreIds.some(id=>exclusions[type].has(id));
    }));
    // Prefer catalog cards with usable artwork, while keeping all saved titles
    // eligible and preserving the shuffle order within each artwork group.
    if(source!=='saved')candidates.sort((a,b)=>Number(!!b.posterUrl)-Number(!!a.posterUrl));
    // At most three in-flight detail lookups, and thirty total per selection.
    // Stop as soon as enough suitable titles have been found.
    for(let offset=0;offset<candidates.length&&movies.length<3;offset+=3){
      check(signal);
      const batch=await Promise.all(candidates.slice(offset,offset+3).map(async movie=>{
        const type=typeOf(movie),excluded=exclusions[type],key=keyOf(movie);
        const cachedEpisode=type==='tv'?peekRuntime(movie):null;
        // wm_media_meta may contain the duration of an entire series. Never use
        // that value as an episode length or overwrite it with an estimate.
        let genreIds=movie.genreIds,minutes=type==='tv'?(cachedEpisode?.kind==='episode'&&validMinutes(cachedEpisode.minutes)?cachedEpisode.minutes:0):storage.getMediaRuntime('movie',key);
        const needGenres=excluded.size&&(!Array.isArray(genreIds)||!genreIds.length);
        const needRuntime=runtime&&(source==='saved'||type==='tv')&&!minutes;
        if(needGenres||needRuntime){
          if(requests>=30){limited=true;unavailable++;return null;}
          requests++;
          try {
            const details=await (type==='tv'?api.getTVDetails(idOf(movie),{signal}):api.getMovieDetails(movie.id,{signal}));check(signal);
            if(needGenres)genreIds=details.genreIds;
            if(type==='tv')minutes=episodeMinutes(details)||minutes;
            else if(validMinutes(details.runtime)){
              minutes=details.runtime;
              try{storage.setMediaRuntime('movie',key,minutes);}catch{/* Optional metadata must not block a usable recommendation. */}
            }
          }catch(error){check(signal);failed++;unavailable++;return null;}
        }
        if(excluded.size&&(!Array.isArray(genreIds)||!genreIds.length)){unavailable++;return null;}
        if(genreIds?.some(id=>excluded.has(id)))return null;
        if(runtime&&(source==='saved'||type==='tv')&&!minutes){unavailable++;return null;}
        if(runtime&&minutes>runtime)return null;
        if(type==='tv'&&minutes)episodeRuntimes[key]=minutes;
        return movie;
      }));
      check(signal);movies.push(...batch.filter(Boolean));
    }
    return {movies:movies.slice(0,3),episodeRuntimes,unavailable,failed,limited};
  };
}

// Fetch the next page only when the end of this horizontal row approaches.
function attachHomePagination(slot, initial, loadPage) {
  const row = slot.querySelector('.category__row');
  if (!row || !initial.hasMore) return;
  let page=1, loading=false, hasMore=true, failed=false;
  const seen=new Set(initial.items.map(m=>m.imdbId));
  const more=document.createElement('button');
  more.type='button';more.className='category-load-more btn btn--ghost';
  more.textContent='Další tituly';row.appendChild(more);
  const load=async()=>{
    if(loading||!hasMore||!row.isConnected)return;
    loading=true;failed=false;more.disabled=true;more.textContent='Načítám…';
    try {
      const result=await loadPage(page+1);
      if(!row.isConnected)return;
      page++;hasMore=result.hasMore;
      const fresh=result.items.filter(m=>{if(seen.has(m.imdbId))return false;seen.add(m.imdbId);return true;});
      more.insertAdjacentHTML('beforebegin',fresh.map(m=>movieCard(m)).join(''));
      more.textContent='Další tituly';
      if(!hasMore){more.remove();observer.disconnect();}
      row.dispatchEvent(new Event('scroll'));
    }catch{failed=true;more.textContent='Zkusit znovu';}
    finally{
      loading=false;more.disabled=false;
      // Recheck after short/duplicate pages, without retrying errors in a loop.
      if(hasMore&&!failed&&row.isConnected){observer.unobserve(more);observer.observe(more);}
    }
  };
  more.onclick=load;
  const observer=new IntersectionObserver(entries=>{
    if(entries.some(e=>e.isIntersecting)&&!failed)void load();
  },{root:row,rootMargin:'0px 600px 0px 0px'});
  observer.observe(more);
  const removed=new MutationObserver(()=>{
    if(!row.isConnected){observer.disconnect();removed.disconnect();}
  });
  removed.observe(document.getElementById('screen'),{childList:true,subtree:true});
}

Object.assign(App, {
  async renderHome(){
    const state=this._homeState,s=document.getElementById('screen');
    s.innerHTML=`<div class="home-page">
      <header class="page-heading"><h1 class="home-logo">Sledovátko</h1><div class="heading-actions">${actionButton('transfer','Přenést na jiné zařízení','id="btn-sync"')}${accountButton()}</div></header>
      <div id="continue-slot"></div>
      <section class="tonight-section"><h2>Co si pustit dnes?</h2><div class="tonight-hero" id="daily-slot"><div class="tonight-copy"><p>Najdi film nebo seriál podle času a nálady.</p><button class="btn btn--primary" id="btn-tonight">Vybrat tip ${icon('arrow')}</button></div></div></section>
      <section class="discover-section"><h2>Objevovat</h2><div class="segmented home-media-tabs" id="media-tabs" aria-label="Typ obsahu">${[['movie','Filmy'],['tv','Seriály']].map(([id,label])=>`<button class="home-media-tab ${state.mediaType===id?'active':''}" data-media="${id}" aria-pressed="${state.mediaType===id}">${label}</button>`).join('')}</div>
      <div class="mood-chips" id="mood-chips" aria-label="Žánr"></div><div id="main-cats">${spinner('Načítám tituly…')}</div></section>
      <div class="discovery-extras"><button class="bored-btn" id="btn-bored"><span class="bored-btn__emoji">🎲</span><span>Nevím, co si pustit</span>${icon('arrow')}</button><button class="bored-btn" id="btn-hotnot-home"><span class="bored-btn__emoji">🔥</span><span>Hot or Not</span>${icon('arrow')}</button><button class="btn btn--ghost" id="btn-kino">Kino večer · program tří filmů</button></div>
      <footer class="site-footer"><a href="privacy.html">Soukromí</a><span aria-hidden="true">·</span><a href="terms.html">Podmínky používání</a></footer>
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
    const unseen=Storage.getFavorites().filter(m=>!Storage.isWatched(m.imdbId));
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
        ?[['genre',genres.find(g=>g.id===+state.genreId)?.name||'Žánr']]
        :state.mediaType==='tv'
          ?[['popular','Populární seriály'],['rated','Nejlépe hodnocené'],['onair','Právě vysílané'],['today','Dnes na programu']]
          :[['popular','Populární'],['nowplaying','Právě v kinech'],['toprated','Top hodnocené'],['upcoming','Nadcházející']];
      main.innerHTML=sections.map(([id])=>`<div id="home-${id}" class="home-category-slot">${spinner('Načítám…')}</div>`).join('');
      await Promise.all(sections.map(async ([id,title])=>{
        const slot=main.querySelector('#home-'+id);
        try{
          const loadPage=page=>API.getHomePage(id,{...state,page});
          const initial=await loadPage(1),movies=[...new Map(initial.items.map(m=>[m.imdbId,m])).values()];if(seq!==this._homeSeq||!slot.isConnected)return;
          slot.innerHTML=movies.length?buildCategoryRow(state.mediaType+'-'+id,title,movies,{accentColor:'var(--text)',collapsible:true,sectionKey:state.mediaType+'-'+id}):`<div class="inline-notice">${escHtml(title)}: zatím bez titulů.</div>`;
          attachCategoryEvents('home-'+id);
          attachHomePagination(slot,initial,loadPage);
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
    const state=this._tonightState||(this._tonightState={source:Storage.getFavorites().length?'saved':'catalog',mediaType:'all',runtime:'',unseen:true,excludedGenres:[]});
    if(!['movie','tv','all'].includes(state.mediaType))state.mediaType='all';
    state.excludedGenresByType||={movie:[...(state.excludedGenres||[])],tv:[]};
    const mediaTypes=()=>state.mediaType==='all'?['movie','tv']:[state.mediaType];
    const mediaName=type=>type==='tv'?'Seriály':'Filmy';
    const activeExclusions=()=>mediaTypes().flatMap(type=>state.excludedGenresByType[type]);
    const times=[['','Bez omezení'],[30,'Do 30 minut'],[45,'Do 45 minut'],[60,'Do 1 hodiny'],[90,'Do 1,5 hodiny'],[120,'Do 2 hodin'],[150,'Do 2,5 hodiny'],[180,'Do 3 hodin'],[210,'Do 3,5 hodiny'],[240,'Do 4 hodin'],[300,'Do 5 hodin'],[360,'Do 6 hodin']];
    s.innerHTML=`<section class="tonight-page"><header class="page-heading"><h1>Co si pustit dnes?</h1><button class="btn btn--ghost" id="tonight-back">Zpět</button></header>
      <form id="tonight-form" class="glass-panel"><fieldset class="tonight-media-options"><legend>Co si chceš pustit?</legend><div class="segmented tonight-media-tabs">${[['all','Vše'],['movie','Filmy'],['tv','Seriály']].map(([type,label])=>`<label class="tonight-media-tab"><input type="radio" name="mediaType" value="${type}" ${state.mediaType===type?'checked':''}><span>${label}</span></label>`).join('')}</div></fieldset>
      <div class="tonight-fields"><label>Vybírat z<select name="source"><option value="saved">Můj Šuplík</option><option value="catalog">Objevovat nové tituly</option></select></label><label>Kolik máš času?<select name="runtime" aria-describedby="tonight-runtime-help">${times.map(([value,label])=>`<option value="${value}">${label}</option>`).join('')}</select></label></div>
      <p class="tonight-filter-help" id="tonight-runtime-help" ${state.mediaType==='movie'?'hidden':''}>U seriálů limit platí pro přibližnou délku jednoho dílu. Jednotlivé epizody mohou být různě dlouhé.</p>
      <div class="check-options"><label><input name="unseen" type="checkbox"> Vynechat viděné</label></div>
      <details class="tonight-genres" ${activeExclusions().length?'open':''}><summary class="tonight-genres-summary">Vynechat žánry <span class="tonight-genres-count" id="tonight-genres-count"></span></summary>
        <p class="tonight-filter-help" id="tonight-genres-help">Vyber žánry, které dnes nechceš — například horory. Můžeš označit více možností.</p>
        <fieldset class="tonight-genre-options" aria-describedby="tonight-genres-help"><legend class="sr-only">Žánry k vynechání</legend><div class="tonight-genre-chips" id="tonight-genre-chips"></div></fieldset><div class="tonight-filter-status" id="tonight-genres-status" aria-live="polite"></div>
      </details><button class="btn btn--primary" type="submit">Vybrat tip ${icon('arrow')}</button></form><div id="tonight-results" aria-live="polite"></div></section>`;
    const form=document.getElementById('tonight-form'),results=document.getElementById('tonight-results');
    document.getElementById('tonight-back').onclick=()=>{this._tonightController?.abort();this.back();};
    form.elements.source.value=state.source;form.elements.runtime.value=String(state.runtime);form.elements.unseen.checked=state.unseen;
    const chips=document.getElementById('tonight-genre-chips'),genreStatus=document.getElementById('tonight-genres-status'),count=document.getElementById('tonight-genres-count');
    const genres=this._tonightGenresByType||(this._tonightGenresByType={movie:this._tonightGenres||null,tv:null});
    const genreRows=type=>{
      const rows=[...(genres[type]||(type==='movie'?[{id:27,name:'Horory'}]:[]))];
      for(const id of state.excludedGenresByType[type])if(!rows.some(g=>g.id===id))rows.push({id,name:'Žánr '+id});
      return rows;
    };
    const renderCount=()=>{
      const labels=mediaTypes().flatMap(type=>state.excludedGenresByType[type].map(id=>(genreRows(type).find(g=>g.id===id)?.name||'Žánr '+id)+(state.mediaType==='all'?' ('+mediaName(type).toLowerCase()+')':'')));
      count.textContent=labels.length?labels.join(', '):'Žádné';
    };
    const renderGenres=()=>{
      chips.innerHTML=mediaTypes().flatMap(type=>genreRows(type).map(g=>`<label class="tonight-genre-chip"><input type="checkbox" name="excludedGenre" data-genre-type="${type}" value="${g.id}" ${state.excludedGenresByType[type].includes(g.id)?'checked':''}><span>${escHtml(g.name)}${state.mediaType==='all'?` <small>· ${mediaName(type).toLowerCase()}</small>`:''}</span></label>`)).join('');
      renderCount();
    };
    renderGenres();
    let genreRequest=0;
    const genreLoads={};
    const loadGenres=async()=>{
      const current=++genreRequest;genreStatus.textContent='Načítám další žánry…';
      const responses=await Promise.all(mediaTypes().map(async type=>{
        try{
          genreLoads[type]||=API.getGenres(type).finally(()=>{delete genreLoads[type];});
          const loaded=await genreLoads[type];
          if(!loaded.length)throw Error('Genres unavailable');
          return {type,loaded};
        }catch{return {type,failed:true};}
      }));
      if(!form.isConnected||current!==genreRequest)return;
      for(const response of responses)if(!response.failed)genres[response.type]=response.loaded;
      renderGenres();
      if(responses.some(response=>response.failed)){
        genreStatus.innerHTML='Všechny žánry se nepodařilo načíst. <button class="btn btn--ghost" type="button">Zkusit znovu</button>';
        genreStatus.querySelector('button').onclick=loadGenres;
      }else genreStatus.textContent='';
    };
    loadGenres();
    let request=0;
    const button=form.querySelector('[type=submit]');
    const renderMedia=()=>{
      const label=state.mediaType==='movie'?'Vybrat film':state.mediaType==='tv'?'Vybrat seriál':'Vybrat tip';
      button.innerHTML=label+' '+icon('arrow');
      document.getElementById('tonight-runtime-help').hidden=state.mediaType==='movie';
    };
    renderMedia();
    form.onchange=()=>{
      const previousType=state.mediaType;
      // Read the currently displayed checkboxes before switching genre catalogs.
      for(const type of mediaTypes())state.excludedGenresByType[type]=[...form.querySelectorAll('[name=excludedGenre]:checked')].filter(input=>input.dataset.genreType===type).map(input=>+input.value);
      state.mediaType=form.elements.mediaType.value;
      state.source=form.elements.source.value;state.runtime=form.elements.runtime.value;state.unseen=form.elements.unseen.checked;
      renderCount();renderMedia();
      if(previousType!==state.mediaType){renderGenres();loadGenres();}
      const wasLoading=button.disabled;request++;this._tonightController?.abort();button.disabled=false;results.removeAttribute('aria-busy');
      if(wasLoading||results.innerHTML)results.innerHTML='<p class="inline-notice">Podmínky se změnily. Vyber tip znovu.</p>';
    };
    const picker=createTonightPicker();
    form.onsubmit=async e=>{
      e.preventDefault();this._tonightController?.abort();
      const current=++request,controller=new AbortController();this._tonightController=controller;
      button.disabled=true;results.setAttribute('aria-busy','true');results.innerHTML=spinner('Vybírám tituly…');
      const active=()=>current===request&&form.isConnected&&!controller.signal.aborted;
      try{
        const selection=await picker({...state,runtime:+state.runtime||0,excludedGenresByType:Object.fromEntries(['movie','tv'].map(type=>[type,[...state.excludedGenresByType[type]]]))},{signal:controller.signal});
        if(!active())return;
        const {movies,episodeRuntimes,unavailable,failed,limited}=selection;
        results.innerHTML=movies.length?'<h2>Dnes by to mohlo být…</h2><div class="movie-grid tonight-picks">'+movies.map(m=>movieCard(m)).join('')+'</div>':'<div class="empty-state"><h2>Žádný titul nevyhovuje</h2><p>Zkus více času, jiné podmínky nebo výběr z katalogu.</p></div>';
        // These cards describe today's episode choice. The generic card hydrator
        // may otherwise display an exact total previously obtained in TV detail.
        results.querySelectorAll('.movie-card').forEach(card=>{
          const movie=JSON.parse(card.dataset.movie);
          if(movie.mediaType!=='tv'&&!String(movie.imdbId).startsWith('tv:'))return;
          const slot=card.querySelector('.movie-card__runtime');if(!slot)return;
          const minutes=episodeRuntimes['tv:'+String(movie.id??movie.imdbId).replace(/^tv:/,'')];
          slot.classList.replace('movie-card__runtime','tonight-episode-runtime');
          slot.textContent=minutes?'· ≈ '+minutes+' min/díl':'';
          slot.title=minutes?'Orientační délka jednoho dílu. Jednotlivé epizody mohou být různě dlouhé.':'';
        });
        if(unavailable)results.insertAdjacentHTML('beforeend',`<p class="inline-notice">${limited?'U části titulů zatím nemáme ověřené údaje.':'Tituly bez ověřeného žánru nebo délky jsme pro tento výběr přeskočili.'}${failed||limited?' <button class="btn btn--ghost" type="button" data-tonight-retry>Zkusit znovu</button>':''}</p>`);
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
