
// ═══════════════════════════════════════════════════════════════════════════════
//  app.js — Router & screens
// ═══════════════════════════════════════════════════════════════════════════════

const App = {
  currentScreen: null,
  genreCache: [],
  _boredGrid: null,

  applyTheme(theme) {
    document.body.dataset.theme = theme;
    Storage.setTheme(theme);
  },

  updateBadge() {
    const favs = Storage.getFavorites();
    const watched = Storage.getWatchedIds();
    const unwatched = favs.filter(m => !watched.has(m.imdbId)).length;
    const badge = document.getElementById('fav-badge');
    if (badge) {
      badge.textContent = unwatched;
      badge.classList.toggle('hidden', unwatched === 0);
    }
  },

  // ════════════════════════════════════════════════
  //  SETUP
  // ════════════════════════════════════════════════
  showSetup() {
    document.getElementById('screen').innerHTML = `
    <div class="setup-screen">
      <div class="setup-card">
        <div class="setup-logo">Sledov<span>á</span>tko</div>
        <div class="setup-sub">Tvůj osobní filmový watchlist. Pro start potřebuješ API klíč z TMDB.</div>
        <ul class="setup-steps">
          <li>Jdi na <a href="https://www.themoviedb.org" target="_blank">themoviedb.org</a></li>
          <li>Zaregistruj se (zdarma)</li>
          <li>Nastav → API → vytvoř klíč</li>
          <li>Zkopíruj <strong>Bearer Token (API Read Access)</strong></li>
        </ul>
        <div class="setup-input-row">
          <input id="token-input" type="password" class="input" placeholder="Bearer token...">
          <button class="btn btn--primary" id="token-save">Spustit</button>
        </div>
        <p id="token-err" style="color:#E53935;font-size:12px;margin-top:8px;display:none">Neplatný token. Zkus znovu.</p>
      </div>
    </div>`;
    document.getElementById('token-save').addEventListener('click', async () => {
      const val = document.getElementById('token-input').value.trim();
      if (!val) return;
      API.setToken(val);
      try {
        await API.getGenres();
        Storage.setToken(val);
        this.init();
      } catch {
        document.getElementById('token-err').style.display = '';
      }
    });
  },

  // ════════════════════════════════════════════════
  //  HOME
  // ════════════════════════════════════════════════
  _sortMovies(movies, sortBy, query = '') {
    const m = [...movies];
    if (sortBy === 'relevance' && query.trim()) {
      const q = query.toLowerCase().trim();
      m.sort((a, b) => {
        const ta = (a.title || '').toLowerCase();
        const tb = (b.title || '').toLowerCase();
        const score = (title, q) => {
          if (title === q) return 5;              // exact match
          if (title.startsWith(q)) return 4;       // starts with
          if (title.includes(q)) return 3;         // contains
          if (q.split(' ').some(w => title.includes(w))) return 2; // partial word
          return 1;                                  // weak match
        };
        let sa = Math.max(score(ta, q),score((a.originalTitle||'').toLowerCase(),q));
        let sb = Math.max(score(tb, q),score((b.originalTitle||'').toLowerCase(),q));
        if (sa !== sb) return sb - sa;
        // Stejná shoda — rozhodne popularita (vote_count) a rating
        const pa = (a.vote_count || 0) + (a.rating || 0) * 100;
        const pb = (b.vote_count || 0) + (b.rating || 0) * 100;
        return pb - pa;
      });
    } else if (sortBy === 'rating_desc') m.sort((a,b) => b.rating - a.rating);
    else if (sortBy === 'rating_asc')  m.sort((a,b) => a.rating - b.rating);
    else if (sortBy === 'year_desc')   m.sort((a,b) => (b.year||'').localeCompare(a.year||''));
    else if (sortBy === 'year_asc')    m.sort((a,b) => (a.year||'').localeCompare(b.year||''));
    else if (sortBy === 'title_az')    m.sort((a,b) => a.title.localeCompare(b.title, 'cs'));
    else if (sortBy === 'title_za')    m.sort((a,b) => b.title.localeCompare(a.title, 'cs'));
    return m;
  },

  // ════════════════════════════════════════════════
  //  FAVORITES
  // ════════════════════════════════════════════════
  _favState: { sortBy: 'added', filterLabel: null, calendarView: false, showStats: false },

  _buildCalendarView(movies) {
    const grouped = {};
    for (const m of movies) {
      const key = m.year || 'Neznámý';
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(m);
    }
    const sorted = Object.entries(grouped).sort((a, b) => b[0].localeCompare(a[0]));
    return `<div class="calendar-view">` + sorted.map(([year, mms]) => `
      <div class="cal-year">${year}</div>
      <div class="cal-row">
        ${mms.map(m => `<div style="flex-shrink:0;width:var(--card-w)">${movieCard(m)}</div>`).join('')}
      </div>`).join('') + '</div>';
  },

  _attachFavEvents(filtered) {
    const st = this._favState;

    document.getElementById('fav-sort')?.addEventListener('change', e => { st.sortBy = e.target.value; this.renderFavorites(); });
    document.getElementById('btn-random-unseen')?.addEventListener('click', () => {
      const watchedIds = Storage.getWatchedIds();
      const unseen = filtered.filter(m => !watchedIds.has(m.imdbId));
      if (!unseen.length) { showToast('🎉 Všechny filmy jsi viděl!'); return; }
      openMovieDetail(unseen[Math.floor(Math.random() * unseen.length)]);
    });
    document.getElementById('btn-calendar')?.addEventListener('click', () => { st.calendarView = !st.calendarView; this.renderFavorites(); });
    document.getElementById('btn-stats')?.addEventListener('click', () => { st.showStats = !st.showStats; document.getElementById('stats-panel')?.classList.toggle('open', st.showStats); });
    document.getElementById('btn-share')?.addEventListener('click', () => showSyncModal());
    // FIX #27: create custom label
    document.getElementById('btn-new-label')?.addEventListener('click', () => {
      const colors = ['#E53935','#FF6D00','#F9A825','#43A047','#00ACC1','#1E88E5','#5E35B1','#EC407A','#546E7A'];
      const emojis = ['🔴','🟠','🟡','🟢','🔵','🟣','🏷️','⭐','🎯','🎬','💡','🔥','❤️','👑','🎁','⚡','🌙','🎭'];
      const overlay = showModal(`
        <div style="padding:4px">
          <label style="font-size:12px;color:var(--text2);display:block;margin-bottom:6px">Název štítku</label>
          <input class="input" id="_lbl-name" placeholder="např. Romantický večer" style="margin-bottom:14px">
          <label style="font-size:12px;color:var(--text2);display:block;margin-bottom:6px">Ikona</label>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px" id="_lbl-emojis">
            ${emojis.map((em,i) => `<div data-emoji="${em}" style="width:34px;height:34px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:18px;cursor:pointer;border:2px solid ${i===0?'var(--accent)':'transparent'};background:rgba(255,255,255,.06);transition:all .15s">${em}</div>`).join('')}
          </div>
          <label style="font-size:12px;color:var(--text2);display:block;margin-bottom:6px">Barva</label>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px" id="_lbl-colors">
            ${colors.map((col,i) => `<div data-color="${col}" style="width:28px;height:28px;border-radius:50%;background:${col};cursor:pointer;border:3px solid ${i===0?'#fff':'transparent'};transition:border-color .15s"></div>`).join('')}
          </div>
          <div style="display:flex;gap:8px;justify-content:flex-end">
            <button class="btn btn--ghost btn--sm" onclick="this.closest('.modal-overlay').remove()">Zrušit</button>
            <button class="btn btn--primary btn--sm" id="_lbl-save">Vytvořit</button>
          </div>
        </div>`, { title: '🏷️ Nový štítek' });
      let selectedColor = colors[0];
      let selectedEmoji = emojis[0];
      overlay.querySelectorAll('[data-color]').forEach(dot => {
        dot.addEventListener('click', () => {
          overlay.querySelectorAll('[data-color]').forEach(d => d.style.borderColor = 'transparent');
          dot.style.borderColor = '#fff'; selectedColor = dot.dataset.color;
        });
      });
      overlay.querySelectorAll('[data-emoji]').forEach(em => {
        em.addEventListener('click', () => {
          overlay.querySelectorAll('[data-emoji]').forEach(e => e.style.borderColor = 'transparent');
          em.style.borderColor = 'var(--accent)'; selectedEmoji = em.dataset.emoji;
        });
      });
      overlay.querySelector('#_lbl-save').addEventListener('click', () => {
        const name = overlay.querySelector('#_lbl-name').value.trim();
        if (!name) return;
        const key = 'custom_' + Date.now();
        saveCustomLabelDef(key, selectedColor, name, selectedEmoji);
        overlay.remove();
        this.renderFavorites();
      });
    });

    // Label filter + delete
    document.querySelector('.labels-row')?.addEventListener('click', e => {
      const delBtn = e.target.closest('[data-del-label]');
      if (delBtn) {
        e.stopPropagation();
        const key = delBtn.dataset.delLabel;
        hideLabel(key); // works for both predefined and custom
        if (st.filterLabel === key) st.filterLabel = null;
        this.renderFavorites(); return;
      }
      const lf = e.target.closest('[data-label]');
      if (lf) { st.filterLabel = lf.dataset.label || null; this.renderFavorites(); }
    });

    attachCardEvents(document.getElementById('favs-content'));
  },

  // Discovery canvas kept intact; routing owns its lifecycle.
  _boredOpts: {genreId: null, decade: null},
  renderBored() {
    const s = document.getElementById('screen');
    // Override full screen
    s.style.overflow = 'hidden';
    s.style.height = '100%';
    const decades = ['1970','1980','1990','2000','2010','2020'];
    s.innerHTML = `
      <div class="bored-screen">
        <div class="bored-topbar">
          <button class="btn btn--icon" id="bored-back" aria-label="Zpět">←</button>
          <div class="bored-topbar__title">Sledov<span>á</span>tko</div>
          <button class="btn btn--icon" id="bored-shuffle" aria-label="Nová sada" title="Nová sada">🔀</button>
        </div>
        <div class="bored-filters">
          <button class="bored-filter active" data-filter="">✨ Vše</button>
          <button class="bored-filter" data-roulette="">🎡 Ruleta</button>
          ${decades.map(d => `<button class="bored-filter" data-decade="${d}">${d}s</button>`).join('')}
          ${this.genreCache.slice(0,10).map(g =>
            `<button class="bored-filter" data-genre="${g.id}">${GENRE_EMOJIS[g.id]||'🎬'} ${g.name}</button>`
          ).join('')}
        </div>
        <div class="bored-canvas-wrap">
          <div id="bored-loading" style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:14px;color:var(--text2)">
            <div class="spinner"></div>
            <div>Načítám filmy ze světa...</div>
          </div>
          <canvas id="bored-canvas" style="display:none"></canvas>
        </div>
      </div>`;

    document.getElementById('bored-back').addEventListener('click', () => {
      s.style.overflow = '';
      s.style.height = '';
      this.back();
    });

    const opts = this._boredOpts;

    document.getElementById('bored-shuffle').addEventListener('click', () => this._loadBoredMovies());

    // Filters
    document.querySelector('.bored-filters').addEventListener('click', async e => {
      const f = e.target.closest('[data-filter],[data-decade],[data-genre],[data-roulette]');
      if (!f) return;
      document.querySelectorAll('.bored-filter').forEach(x => x.classList.remove('active'));
      f.classList.add('active');

      if ('roulette' in f.dataset) {
        this._showGenreRoulette();
        return;
      }
      opts.genreId = f.dataset.genre ? parseInt(f.dataset.genre) : null;
      opts.decade  = f.dataset.decade || null;
      this._loadBoredMovies();
    });

    this._loadBoredMovies();
  },

  _boredMovies: [],

  async _loadBoredMovies() {
    const seq = this._boredSeq = (this._boredSeq || 0) + 1;
    const routeKey = this._routeKey;
    const opts = {...this._boredOpts};
    document.getElementById('bored-loading').style.display = 'flex';
    document.getElementById('bored-canvas').style.display = 'none';
    if (this._boredGrid) { this._boredGrid.destroy(); this._boredGrid = null; }
    try {
      const movies = await API.getBoredMovies({ genreId: opts.genreId, decade: opts.decade });
      if (seq !== this._boredSeq || routeKey !== this._routeKey) return;
      this._boredMovies = movies;
      const canvas = document.getElementById('bored-canvas');
      if (!canvas || this.currentScreen !== 'bored') return;
      canvas.hidden = false;
      document.getElementById('bored-loading').style.display = 'none';
      canvas.style.display = 'block';
      this._boredGrid = new BoredGrid(canvas, movies, {
        spotlightMode: opts.spotlightMode,
        showHeatmap: opts.showHeatmap,
        onSelect: (movie) => openMovieDetail(movie),
      });
    } catch(e) {
      if (seq === this._boredSeq && routeKey === this._routeKey && document.getElementById('bored-loading')) document.getElementById('bored-loading').innerHTML = '<div style="text-align:center"><div style="font-size:48px">⚠️</div><div>Chyba při načítání</div></div>';
    }
  },

  _showGenreRoulette() {
    if (!this.genreCache.length) return;
    let current = this.genreCache[Math.floor(Math.random() * this.genreCache.length)];
    let spinning = false;
    const overlay = showModal(`
      <div style="text-align:center;padding:16px">
        <div id="roulette-emoji" style="font-size:72px;transition:transform .1s">${GENRE_EMOJIS[current.id]||'🎬'}</div>
        <div id="roulette-name" style="font-size:22px;font-weight:800;margin:12px 0">${current.name}</div>
        <div style="display:flex;gap:10px;justify-content:center;margin-top:16px">
          <button class="btn btn--ghost" id="roulette-spin">🎲 Točit!</button>
          <button class="btn btn--primary" id="roulette-pick">Vybrat tento</button>
        </div>
      </div>`, { title: '🎡 Ruleta žánrů' });

    document.getElementById('roulette-spin').addEventListener('click', () => {
      if (spinning) return;
      spinning = true;
      let count = 0, max = 15 + Math.floor(Math.random() * 10);
      const interval = setInterval(() => {
        if (!overlay.isConnected) { clearInterval(interval); return; }
        current = this.genreCache[Math.floor(Math.random() * this.genreCache.length)];
        document.getElementById('roulette-emoji').textContent = GENRE_EMOJIS[current.id]||'🎬';
        document.getElementById('roulette-name').textContent = current.name;
        count++;
        if (count >= max) { clearInterval(interval); spinning = false; }
      }, 80 + count * 8);
    });
    document.getElementById('roulette-pick').addEventListener('click', () => {
      overlay.remove();
      this._boredOpts.genreId = current.id;
      this._boredOpts.decade = null;
      this._loadBoredMovies();
    });
  },

  // ════════════════════════════════════════════════
  //  HOT OR NOT landing
  // ════════════════════════════════════════════════
  async renderHotOrNotLanding() {
    const s = document.getElementById('screen');
    s.innerHTML = `
      <div style="padding:24px;max-width:480px;margin:0 auto">
        <h2 style="font-size:22px;font-weight:900;margin-bottom:8px">🔥 Hot or Not</h2>
        <p style="color:var(--text2);margin-bottom:24px">Procházej filmy rychle — ukládej nebo přeskakuj. Na konci uvidíš co jsi vybral.</p>
        <button class="btn btn--primary" id="hon-popular" style="padding:16px;font-size:15px;border-radius:14px;width:100%">🌍 Spustit</button>
        <p style="color:var(--text3);font-size:12px;margin-top:20px;text-align:center">Tip: Klikni na film pro detail, nebo použij tlačítka</p>
      </div>`;
    const routeKey = this._routeKey;
    document.getElementById('hon-popular').addEventListener('click', async () => {
      s.innerHTML = spinner('Připravuji náhodné filmy...');
      // FIX #12: fetch truly random movies from random pages
      try {
        const movies = await API.getBoredMovies();
        if (routeKey !== this._routeKey || this.currentScreen !== 'hotnot') return;
        this.renderHotOrNot(movies);
      } catch { if(routeKey===this._routeKey){this.renderHotOrNotLanding();showToast('Chyba při načítání filmů. Zkus to znovu.');} }
    });

  },

  // ═══════════════════���════════════════════════════
  //  HOT OR NOT
  // ════════════════════════════════════════════════
  renderHotOrNot(movies) {
    const s = document.getElementById('screen');
    s.style.overflow = 'hidden';
    s.style.height = '100%';
    let current = 0;
    const saved = [], skipped = [];
    let animating = false;

    const routeKey = this._routeKey;
    const render = () => {
      if (this.currentScreen !== 'hotnot' || routeKey !== this._routeKey) return;
      const isDone = current >= movies.length;
      s.innerHTML = `
        <div class="hon-screen">
          <div class="hon-progress"><div class="hon-progress__fill" style="width:${current/movies.length*100}%"></div></div>
          ${isDone ? `
            <div class="hon-done">
              <div class="hon-done__emoji">🎉</div>
              <div class="hon-done__title">Hotovo!</div>
              <div style="color:var(--accent);font-size:16px;font-weight:700">Uloženo: ${saved.length} filmů</div>
              <div style="color:var(--text2)">Přeskočeno: ${skipped.length}</div>
              ${saved.length ? `<div class="hon-done__picks">
                ${saved.map(m => m.posterUrl ? `<img src="${m.posterUrl}" alt="${escHtml(m.title)}">` : '').join('')}
              </div>` : ''}
              <button class="btn btn--primary" id="hon-back">Zkusit znovu</button>
            </div>` : `
            <div style="padding:8px 16px;text-align:right;color:var(--text3);font-size:13px;flex-shrink:0">${current+1} / ${movies.length}</div>
            <div class="hon-card-area">
              <div class="hon-card" id="hon-card">
                ${movies[current].posterUrl ? `<img class="hon-card__img" src="${movies[current].posterUrl}" alt="">` : '<div style="width:100%;height:100%;background:var(--surface2)"></div>'}
                <div class="hon-card__overlay"></div>
                <div class="hon-card__info">
                  <div class="hon-card__title">${escHtml(movies[current].title)}</div>
                  <div class="hon-card__sub">${movies[current].year}${movies[current].rating>0?' · ★ '+movies[current].rating.toFixed(1):''}</div>
                  ${movies[current].overview ? `<div class="hon-card__overview">${escHtml(movies[current].overview)}</div>` : ''}
                </div>
                <div class="hon-verdict" id="hon-verdict"></div>
              </div>
            </div>
            <div class="hon-btns">
              <button type="button" class="hon-btn hon-btn--skip" id="hon-skip">
                <div class="hon-btn__circle">👎</div>
                <div class="hon-btn__label">Přeskočit</div></button>
              <button type="button" class="hon-btn hon-btn--detail" id="hon-detail">
                <div class="hon-btn__circle">ℹ️</div>
                <div class="hon-btn__label">Detail</div></button>
              <button type="button" class="hon-btn hon-btn--save" id="hon-save">
                <div class="hon-btn__circle">🔥</div>
                <div class="hon-btn__label">Uložit</div></button>
            </div>`}
        </div>`;

      if (isDone) {
        document.getElementById('hon-back').addEventListener('click', () => {
          s.style.overflow = ''; s.style.height = '';
          this.renderHotOrNotLanding();
        });
        return;
      }

      const decide = async (hot) => {
        if (animating) return;
        animating = true;
        const card = document.getElementById('hon-card');
        const verdict = document.getElementById('hon-verdict');
        verdict.textContent = hot ? '🔥' : '👎';
        verdict.className = `hon-verdict ${hot ? 'hot' : 'skip'} visible`;
        card.className = `hon-card ${hot ? 'slide-right' : 'slide-left'}`;
        if (hot) { Storage.saveFavorite(movies[current]); saved.push(movies[current]); document.dispatchEvent(new CustomEvent('favorites-changed')); }
        else skipped.push(movies[current]);
        await new Promise(r => setTimeout(r, 350));
        current++;
        animating = false;
        render();
      };

      document.getElementById('hon-skip').addEventListener('click', () => decide(false));
      document.getElementById('hon-save').addEventListener('click', () => decide(true));
      document.getElementById('hon-detail').addEventListener('click', () => openMovieDetail(movies[current]));
      document.getElementById('hon-card').addEventListener('click', () => { if (!animating) openMovieDetail(movies[current]); });

      // Touch swipe pro mobil — přetažením prstem
      (() => {
        const card = document.getElementById('hon-card');
        if (!card) return;
        let startX = 0, startY = 0, dragging = false;
        const SWIPE_THRESHOLD = 80;
        const onStart = (e) => {
          const t = e.touches[0];
          if (!t) return;
          startX = t.clientX; startY = t.clientY;
          dragging = true;
          card.style.transition = 'none';
        };
        const onMove = (e) => {
          if (!dragging) return;
          const t = e.touches[0];
          if (!t) return;
          const dx = t.clientX - startX;
          const dy = t.clientY - startY;
          const rot = Math.max(-15, Math.min(15, dx * 0.05));
          card.style.transform = `translateX(${dx}px) rotate(${rot}deg)`;
          card.style.opacity = Math.max(0.4, 1 - Math.abs(dx) / 500);
        };
        const onEnd = () => {
          if (!dragging) return;
          dragging = false;
          const dx = parseFloat(card.style.transform?.match(/translateX\(([-\d.]+)px\)/)?.[1] || 0);
          card.style.transition = 'transform .35s ease, opacity .35s ease';
          if (dx > SWIPE_THRESHOLD) {
            decide(true);
          } else if (dx < -SWIPE_THRESHOLD) {
            decide(false);
          } else {
            card.style.transform = ''; card.style.opacity = '';
          }
        };
        card.addEventListener('touchstart', onStart, { passive: true });
        card.addEventListener('touchmove', onMove, { passive: true });
        card.addEventListener('touchend', onEnd);
        card.addEventListener('touchcancel', () => { dragging = false; card.style.transform = ''; card.style.opacity = ''; });
      })();
    };
    render();
  },

  // ════════════════════════════════════════════════
  //  KINO VEČER
  // ════════════════════════════════════════════════
  async renderKinoVecer(fromSaved = false) {
    const s = document.getElementById('screen');
    s.innerHTML = `
      <div class="kv-screen">
        <button class="btn btn--ghost btn--sm" id="kv-back">← Zpět</button>
        <h2 style="margin:16px 0 8px;font-size:20px;font-weight:800">🎬 Kino večer</h2>
        <div class="kv-intro">
          <div style="display:flex;align-items:center;gap:10px">
            <div style="font-size:28px">🍿</div>
            <div>
              <div style="color:var(--text2);font-size:12px">Připravili jsme pro tebe</div>
              <div style="font-weight:800;font-size:15px">dokonalý filmový večer</div>
            </div>
          </div>
          <div id="kv-theme-badge"></div>
          <div id="kv-anchor"></div>
        </div>
        <div class="kv-source-btns">
          <button class="kv-source-btn ${!fromSaved?'active':''}" id="kv-from-recommended">🌍 Z doporučených</button>
          <button class="kv-source-btn ${fromSaved?'active':''}" id="kv-from-saved">❤️ Z mých oblíbených</button>
        </div>
        <div id="kv-movies">${spinner('Skládám dokonalý večer...')}</div>
        <div class="kv-actions">
          <button class="btn btn--ghost" id="kv-refresh">🔀 Jiný program</button>
          <button class="btn btn--primary" id="kv-save-all">🔖 Uložit vše</button>
        </div>
      </div>`;

    document.getElementById('kv-back').addEventListener('click', () => this.navigate('bored'));
    document.getElementById('kv-from-recommended').addEventListener('click', () => this.renderKinoVecer(false));
    document.getElementById('kv-from-saved').addEventListener('click', () => this.renderKinoVecer(true));

    let currentPicks = [];
    const target = document.getElementById('kv-movies');
    let loadSeq = 0;

    const load = async () => {
      const seq = ++loadSeq;
      document.getElementById('kv-movies').innerHTML = spinner('Skládám dokonalý večer...');
      try {
        let source;
        if (fromSaved) {
          source = Storage.getFavorites().filter(m => m.mediaType !== 'tv');
          if (source.length < 3) { document.getElementById('kv-movies').innerHTML = '<div class="empty-state"><div class="empty-state__icon">😅</div><div class="empty-state__title">Potřebuješ alespoň 3 uložené filmy</div></div>'; return; }
        } else {
          source = await API.getPopular();
        }
        const result = await API.getKinoVecer(source, fromSaved);
        if (!target.isConnected || seq !== loadSeq) return;
        if (!result) { document.getElementById('kv-movies').innerHTML = '<div class="empty-state"><div class="empty-state__icon">😕</div><div class="empty-state__title">Nepodařilo se sestavit program</div></div>'; return; }
        currentPicks = result.movies;

        const badge = document.getElementById('kv-theme-badge');
        if (badge) badge.innerHTML = `<div class="kv-theme">${escHtml(result.theme)}</div>`;
        const anchor = document.getElementById('kv-anchor');
        if (anchor) anchor.innerHTML = `<div class="kv-anchor">Inspirováno filmem: ${escHtml(result.anchor)}</div>`;

        const times = ['~19:00','~21:15','~23:30'];
        const slots = ['Film 1','Film 2','Film 3'];
        document.getElementById('kv-movies').innerHTML = result.movies.map((m, i) => `
          <div class="kv-movie-card" role="button" tabindex="0" aria-label="Detail: ${escHtml(m.title)}" data-movie='${JSON.stringify(m).replace(/'/g,"&#39;")}'>
            <div>
              <div class="kv-num">${i+1}</div>
              <div class="kv-time">${times[i]}</div>
            </div>
            ${m.posterUrl ? `<img class="kv-poster" src="${m.posterUrl}" alt="">` : ''}
            <div class="kv-info">
              <div class="kv-slot">${slots[i]}</div>
              <div class="kv-title">${escHtml(m.title)}</div>
              <div class="kv-sub">${m.year}${m.rating>0?` · ★ ${m.rating.toFixed(1)}`:''}</div>
            </div>
            <div style="color:var(--text3)">›</div>
          </div>`).join('');

        document.querySelectorAll('.kv-movie-card').forEach(card => {
          card.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();card.click();}});
          card.addEventListener('click', () => {
            let m; try { m = JSON.parse(card.dataset.movie); } catch { return; }
            openMovieDetail(m);
          });
        });
      } catch(e) {
        if (!target.isConnected || seq !== loadSeq) return;
        document.getElementById('kv-movies').innerHTML = '<div class="empty-state"><div class="empty-state__icon">⚠️</div><div class="empty-state__title">Chyba při načítání</div></div>';
      }
    };

    document.getElementById('kv-refresh').addEventListener('click', load);
    document.getElementById('kv-save-all').addEventListener('click', () => {
      currentPicks.forEach(m => Storage.saveFavorite(m));
      document.dispatchEvent(new CustomEvent('favorites-changed'));
      showToast(`🎬 ${currentPicks.length} filmy uloženy!`);
    });

    await load();
  },
};
