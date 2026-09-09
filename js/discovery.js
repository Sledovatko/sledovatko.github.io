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
    const s=document.getElementById('screen');
    s.innerHTML=`<section class="tonight-page"><header class="page-heading"><h1>Co si pustit dnes?</h1><button class="btn btn--ghost" id="tonight-back">Zpět</button></header>
      <form id="tonight-form" class="glass-panel"><div class="tonight-fields"><label>Vybírat z<select name="source"><option value="saved">Můj Šuplík</option><option value="catalog">Objevovat nové filmy</option></select></label><label>Kolik máš času?<select name="runtime"><option value="">Bez omezení</option><option value="90">Do 90 minut</option><option value="120">Do 2 hodin</option><option value="150">Do 2,5 hodiny</option></select></label></div>
      <div class="check-options"><label><input name="unseen" type="checkbox" checked> Jen neviděné</label><label><input name="noHorror" type="checkbox"> Vynechat horory</label></div><button class="btn btn--primary" type="submit">Vybrat film ${icon('arrow')}</button></form><div id="tonight-results" aria-live="polite"></div></section>`;
    document.getElementById('tonight-back').onclick=()=>this.back();
    const form=document.getElementById('tonight-form'),results=document.getElementById('tonight-results');
    form.elements.source.value=Storage.getFavorites().some(m=>m.mediaType!=='tv')?'saved':'catalog';
    let request=0;
    form.onsubmit=async e=>{
      e.preventDefault();const current=++request,button=form.querySelector('[type=submit]');button.disabled=true;results.innerHTML=spinner('Vybírám film…');
      const values=new FormData(form),runtime=+values.get('runtime')||0,unseen=values.has('unseen'),noHorror=values.has('noHorror');
      try{
        let movies;
        if(values.get('source')==='saved'){
          movies=Storage.getFavorites().filter(m=>m.mediaType!=='tv'&&(!unseen||!Storage.isWatched(m.imdbId))&&(!noHorror||!m.genreIds?.includes(27)));
          if(runtime){
            let cursor=0;
            await Promise.all(Array.from({length:Math.min(4,movies.length)},async()=>{while(cursor<movies.length){const m=movies[cursor++];if(!Storage.getMediaRuntime('movie',m.imdbId)){const d=await API.getMovieDetails(m.id);if(d.runtime)Storage.setMediaRuntime('movie',m.imdbId,d.runtime);}}}));
            movies=movies.filter(m=>{const n=Storage.getMediaRuntime('movie',m.imdbId);return n>0&&n<=runtime;});
          }
        }else{
          const first=await API.searchPage('',{maxRuntime:runtime,noHorror});
          const page=first.totalPages>1?1+Math.floor(Math.random()*Math.min(first.totalPages,20)):1;
          movies=(page===1?first:await API.searchPage('',{maxRuntime:runtime,noHorror,page})).items.filter(m=>!unseen||!Storage.isWatched(m.imdbId));
        }
        if(current!==request||!results.isConnected)return;
        movies=movies.filter(m=>!m.releaseDate||m.releaseDate<=new Date().toISOString().slice(0,10));
        for(let i=movies.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[movies[i],movies[j]]=[movies[j],movies[i]];}
        results.innerHTML=movies.length?'<h2>Dnes by to mohlo být…</h2><div class="movie-grid tonight-picks">'+movies.slice(0,3).map(m=>movieCard(m)).join('')+'</div>':'<div class="empty-state"><h2>Žádný film nevyhovuje</h2><p>Zkus více času, jiné podmínky nebo výběr z katalogu.</p></div>';
        attachCardEvents(results);
      }catch{if(results.isConnected)results.innerHTML='<p class="inline-notice">Výběr se nepodařilo načíst. Zkus to prosím znovu.</p>';}
      finally{if(form.isConnected)button.disabled=false;}
    };
  }
});
