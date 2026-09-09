// Navigation, modal history and shared accessible controls.
const Icons = {
  home:'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
  search:'<circle cx="10.5" cy="10.5" r="7.5"/><path d="m16 16 5 5"/>',
  library:'<path d="M4 4h16v5H4zM3 12h18v8H3zM9 15h6"/>',
  transfer:'<path d="M4 7h15m-4-4 4 4-4 4M20 17H5m4-4-4 4 4 4"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',check:'<path d="m5 12 4 4L19 6"/>',
  more:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  close:'<path d="m6 6 12 12M6 18 18 6"/>',filter:'<path d="M3 6h18M6 12h12M9 18h6"/>',
  arrow:'<path d="M5 12h14m-6-6 6 6-6 6"/>'
};
function icon(name) { return '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'+(Icons[name]||Icons.more)+'</svg>'; }
function actionButton(name,label,attrs='') {return `<button type="button" class="glass-icon" aria-label="${escHtml(label)}" title="${escHtml(label)}" ${attrs}>${icon(name)}</button>`;}

const Dialogs = {
  stack: [], restoring:false,
  attach(overlay, opts) {
    const id=crypto.randomUUID(), previous=document.activeElement;
    overlay.dataset.layer=id;
    const modal=overlay.querySelector('.modal');
    modal.setAttribute('role','dialog'); modal.setAttribute('aria-modal','true'); modal.tabIndex=-1;
    modal.setAttribute('aria-label', opts.title || 'Detail titulu');
    const prior=this.stack.at(-1); if(prior) prior.inert=true;
    document.getElementById('app').inert=true;
    this.stack.push(overlay);
    if(!this.restoring && App.currentScreen) {
      App.saveRoute();
      history.pushState({...history.state,layer:id},'',location.href);
    }
    const nativeRemove=overlay.remove.bind(overlay);
    overlay.remove=()=> {
      if(!overlay.isConnected)return;
      const wasCurrent=history.state?.layer===id;
      nativeRemove(); this.stack=this.stack.filter(x=>x!==overlay);
      document.getElementById('app').inert=this.stack.length>0;
      if(this.stack.length)this.stack.at(-1).inert=false;
      overlay.dispatchEvent(new Event('modal-closed'));
      previous?.isConnected && previous.focus?.({preventScroll:true});
      if(wasCurrent&&!this.restoring)history.back();
    };
    overlay.addEventListener('keydown',e=>{
      if(e.key==='Escape'){e.preventDefault();e.stopPropagation();overlay.remove();return;}
      if(e.key!=='Tab')return;
      const focusable=[...modal.querySelectorAll('button,input,textarea,select,a[href],[tabindex="0"]')].filter(x=>!x.disabled&&x.getClientRects().length);
      const first=focusable[0]||modal,last=focusable.at(-1)||modal;
      if(e.shiftKey&&(document.activeElement===first||document.activeElement===modal)){e.preventDefault();last.focus();}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
    });
    requestAnimationFrame(()=> { if(!overlay.isConnected)return; (modal.querySelector('[autofocus],.detail-close,.modal-close')||modal).focus({preventScroll:true}); });
  },
  restore(layer) {
    this.restoring=true;
    while(this.stack.length&&this.stack.at(-1).dataset.layer!==layer)this.stack.at(-1).remove();
    this.restoring=false;
  }
};

Object.assign(App, {
  _searchState:{query:'',filters:{},sortBy:'relevance',items:[],pages:{},loaded:false},
  _homeState:{mediaType:'movie',genreId:null},
  _routes:new Map(),
  async init() {
    if(this._initialized)return;
    this.applyTheme(Storage.getTheme());
    Storage.migrateMediaKeys?.();
    const token=Storage.getToken()||window.SLEDOVATKO_CONFIG?.tmdbToken;
    if(!token){this.showSetup();return;}
    API.setToken(token);
    this._initialized=true;
    const nav=document.getElementById('bottom-nav'); nav.classList.remove('hidden');
    nav.setAttribute('aria-label','Hlavní navigace');
    const names={home:['home','Domů'],search:['search','Hledat'],favorites:['library','Šuplík']};
    nav.querySelectorAll('[data-screen]').forEach(btn=>{
      const [i,label]=names[btn.dataset.screen];
      btn.innerHTML=icon(i)+`<span>${label}</span>`+(btn.dataset.screen==='favorites'?'<span id="fav-badge" class="nav-btn__badge hidden"></span>':'');
      btn.onclick=()=>this.navigate(btn.dataset.screen);
    });
    document.addEventListener('favorites-changed',()=>{
      this.updateBadge();
      document.querySelectorAll('.movie-card').forEach(card=>updateCardFavState(card,Storage.isFavorite(card.dataset.id)));
      if(this.currentScreen==='favorites') this.renderFavorites();
      if(this.currentScreen==='home') this._renderContinueWatching();
    });
    document.addEventListener('tv-progress-changed',()=>{
      if(this.currentScreen==='home')this._renderContinueWatching();
      if(this.currentScreen==='favorites')this.renderFavorites();
    });
    document.addEventListener('card-ctx-menu',e=>this._showCtxMenu(e.detail.event,e.detail.movie));
    window.addEventListener('popstate',async e=>{
      const state=e.state;
      Dialogs.restore(state?.layer);
      if(!state?.sledovatko)return;
      if(state.layer){
        if(Dialogs.stack.some(x=>x.dataset.layer===state.layer))return;
        const page={...state};delete page.layer;history.replaceState(page,'',location.href);
      }
      if(state.key===this._routeKey)return;
      await this.navigate(state.screen,{restore:state});
    });
    window.addEventListener('hashchange',()=>{if(location.hash.startsWith('#sync='))handleSyncLinkFromUrl();});
    this.updateBadge();
    const initialHash=location.hash;
    const screen=['home','search','favorites','bored','hotnot','tonight','program'].includes(initialHash.slice(1))?initialHash.slice(1):'home';
    await this.navigate(screen,{replace:true,preserveHash:initialHash.startsWith('#sync=')});
    if(initialHash.startsWith('#sync='))handleSyncLinkFromUrl();
    API.getGenres().then(genres=>{this.genreCache=genres;}).catch(()=>{});
  },
  saveRoute() {
    if(!this.currentScreen || !history.state?.sledovatko)return;
    const snapshot={...history.state,screen:this.currentScreen,scroll:document.getElementById('screen').scrollTop,
      search:JSON.parse(JSON.stringify(this._searchState)),home:{...this._homeState},favorites:{...this._favState}};
    history.replaceState(snapshot,'',location.href);
  },
  back(){if(history.state?.sledovatko && history.length>1)history.back();else this.navigate('home');},
  async navigate(screen,{replace=false,restore=null,preserveHash=false}={}) {
    if(!restore&&this.currentScreen===screen)return;
    RuntimeHydrator.reset();
    if(!restore)this.saveRoute();
    this._searchController?.abort(); this._searchSeq=(this._searchSeq||0)+1;
    this._homeSeq=(this._homeSeq||0)+1;
    document.querySelectorAll('.movie-card').forEach(card=>{card._hoverActive=false;clearTimeout(card._miniTimer);hideMiniTrailer(card);});
    if(this._boredGrid){this._boredGrid.destroy();this._boredGrid=null;}
    this.currentScreen=screen;
    this._routeKey=restore?.key||crypto.randomUUID();
    if(restore){this._searchState=restore.search||this._searchState;this._homeState=restore.home||this._homeState;this._favState=restore.favorites||this._favState;}
    else {
      const state={sledovatko:true,key:this._routeKey,screen,scroll:0};
      history[replace?'replaceState':'pushState'](state,'',preserveHash?location.href:'#'+screen);
    }
    document.querySelectorAll('[data-screen]').forEach(b=>{
      const active=b.dataset.screen===screen; b.classList.toggle('active',active);
      active?b.setAttribute('aria-current','page'):b.removeAttribute('aria-current');
    });
    const s=document.getElementById('screen');s.style.overflow='';s.style.height='';s.scrollTop=0;
    const render={home:'renderHome',search:'renderSearch',favorites:'renderFavorites',bored:'renderBored',hotnot:'renderHotOrNotLanding',tonight:'renderTonight',program:'renderKinoVecer'}[screen]||'renderHome';
    const key=this._routeKey;
    const pending=this[render]();
    s.classList.remove('screen-enter');void s.offsetWidth;s.classList.add('screen-enter');
    if(!restore)s.focus({preventScroll:true});
    if(restore) s.scrollTop=restore.scroll||0;
    await pending;
    if(this._routeKey===key){if(restore)s.scrollTop=restore.scroll||0;this.saveRoute();}
  }
});
