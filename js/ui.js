// ═══════════════════════════════════════════════════════════════════════════════
//  ui.js
// ═══════════════════════════════════════════════════════════════════════════════

function showToast(message, duration = 2500) {
  const existing = document.querySelector('.wm-toast');
  if (existing) existing.remove();
  const t = document.createElement('div');
  t.className = 'wm-toast'; t.textContent = message; t.setAttribute('role','status');
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, duration);
}

// Spodní oznámení po odebrání filmu. Po dobu 6,5 s nabízí vrácení změny
// a vizuálně odpočítává zbývající čas.
function showUndoToast(movie, onUndo, duration = 6500) {
  const existing = document.querySelector('.wm-undo-toast');
  if (existing) {
    clearTimeout(existing._removeTimer);
    existing.remove();
  }

  const toast = document.createElement('div');
  toast.className = 'wm-undo-toast';
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.innerHTML = `
    <div class="wm-undo-toast__content">
      <div class="wm-undo-toast__message"><strong>${escHtml(movie.title)}</strong> byl odebrán</div>
      <button class="wm-undo-toast__button" type="button">Vrátit změny</button>
    </div>
    <div class="wm-undo-toast__track"><div class="wm-undo-toast__progress"></div></div>`;
  document.body.appendChild(toast);

  const close = () => {
    clearTimeout(toast._removeTimer);
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 220);
  };
  toast.querySelector('.wm-undo-toast__button').addEventListener('click', () => {
    onUndo?.();
    close();
  });
  requestAnimationFrame(() => {
    toast.classList.add('show');
    const progress = toast.querySelector('.wm-undo-toast__progress');
    progress.style.transitionDuration = `${duration}ms`;
    requestAnimationFrame(() => { progress.style.transform = 'scaleX(0)'; });
  });
  toast._removeTimer = setTimeout(close, duration);
}

function removeFavoriteWithUndo(movie, { onRemove, onUndo } = {}) {
  Storage.removeFavorite(movie.imdbId);
  onRemove?.();
  document.dispatchEvent(new CustomEvent('favorites-changed'));
  showUndoToast(movie, () => {
    Storage.saveFavorite(movie);
    onUndo?.();
    document.dispatchEvent(new CustomEvent('favorites-changed'));
  });
}

function showModal(contentHTML, opts = {}) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal ${opts.wide ? 'modal--wide' : ''} ${opts.tall ? 'modal--tall' : ''}">
      ${opts.title ? `<div class="modal-header"><h3>${escHtml(opts.title)}</h3><button class="modal-close" aria-label="Zavřít" onclick="this.closest('.modal-overlay').remove()">✕</button></div>` : ''}
      <div class="modal-body">${contentHTML}</div>
    </div>`;
  if (!opts.noClose) overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
  Dialogs.attach(overlay, opts);
  requestAnimationFrame(() => overlay.classList.add('show'));
  return overlay;
}

function confirmDialog(message) {
  return new Promise(resolve => {
    const overlay = showModal(`<p style="margin:0 0 20px">${message}</p>
      <div style="display:flex;gap:10px;justify-content:flex-end">
        <button class="btn btn--ghost" id="_no">Zrušit</button>
        <button class="btn btn--primary" id="_yes">Potvrdit</button>
      </div>`, { title: 'Potvrdit', noClose: true });
    overlay.addEventListener('modal-closed', () => resolve(false), {once:true});
    overlay.querySelector('#_yes').onclick = () => { resolve(true); overlay.remove(); };
    overlay.querySelector('#_no').onclick  = () => { overlay.remove(); resolve(false); };
  });
}

function promptDialog(message, placeholder = '') {
  return new Promise(resolve => {
    const overlay = showModal(`<p style="margin:0 0 12px">${message}</p>
      <input class="input" id="_pinput" placeholder="${placeholder}" style="width:100%;margin-bottom:16px">
      <div style="display:flex;gap:10px;justify-content:flex-end">
        <button class="btn btn--ghost" id="_pno">Zrušit</button>
        <button class="btn btn--primary" id="_pyes">OK</button>
      </div>`, { title: 'Zadej název' });
    const inp = overlay.querySelector('#_pinput');
    inp.focus();
    const ok = () => { const v = inp.value.trim(); if (v) { resolve(v); overlay.remove(); } };
    overlay.querySelector('#_pyes').onclick = ok;
    overlay.querySelector('#_pno').onclick  = () => { overlay.remove(); resolve(null); };
    overlay.addEventListener('modal-closed', () => resolve(null), {once:true});
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') ok(); });
  });
}

function spinner(text = 'Načítám...') {
  return `<div class="spinner-wrap"><div class="spinner"></div><p>${text}</p></div>`;
}

// ── Movie card ────────────────────────────────────────────────────────────────
function cardControlIcon(name) { return `<span class="card-control__disc" aria-hidden="true">${icon(name)}</span>`; }
function movieCard(movie, opts = {}) {
  const saved=Storage.isFavorite(movie.imdbId),watched=Storage.isWatched(movie.imdbId);
  const rating=Storage.getRating(movie.imdbId),progress=movie.mediaType==='tv'?Storage.getTVProgress(movie.imdbId):null;
  const label=getAllLabelDefs()[Storage.getLabels()[movie.imdbId]];
  const runtime=Storage.getMediaRuntime(movie.mediaType||'movie',movie.imdbId);
  const data=escHtml(JSON.stringify(movie));
  return `<article class="movie-card ${watched?'movie-card--watched':''}" data-id="${escHtml(movie.imdbId)}" data-movie="${data}">
    <div class="movie-card__poster-wrap">
      ${movie.posterUrl?`<img class="movie-card__poster" src="${escHtml(movie.posterUrl)}" alt="${escHtml(movie.title)}" loading="lazy" width="342" height="513">`:'<div class="movie-card__placeholder">🎬</div>'}
      <button class="movie-card__open" data-action="detail" aria-label="Detail: ${escHtml(movie.title)}"></button>
      <div class="movie-card__watched-overlay" aria-hidden="true"></div>
      <span class="movie-card__watched-badge movie-card__watched-badge--compact" aria-label="Viděno" ${watched?'':'hidden'}>✓</span>
      ${label?`<div class="movie-card__label-strip" style="background:${/^#[a-f0-9]{6}$/i.test(label.color)?label.color:'#888888'}"></div>`:''}
      ${opts.hideActions?'':`<button class="btn--quick-add glass-icon ${saved?'active':''}" data-action="quick-add" aria-pressed="${saved}" aria-label="${saved?'Odebrat ze Šuplíku':'Uložit do Šuplíku'}: ${escHtml(movie.title)}">${cardControlIcon(saved?'check':'plus')}</button>
      <button class="fav-ctx-btn glass-icon" data-action="ctx-menu" aria-label="Možnosti: ${escHtml(movie.title)}">${cardControlIcon('more')}</button>`}
      ${opts.showDate&&movie.releaseDate?`<span class="movie-card__date-badge">${formatRelease(movie.releaseDate)}</span>`:''}
    </div>
    <button class="movie-card__title" data-action="detail" title="${escHtml(movie.title)}">${opts.highlight?highlightText(movie.title,opts.highlight):escHtml(movie.title)}</button>
    <div class="movie-card__meta"><span class="movie-card__year">${escHtml(movie.year||'—')}</span><span class="movie-card__runtime">${runtime?'· '+formatCardRuntime(runtime,movie.mediaType):''}</span><span class="movie-card__rating">${movie.rating>0?'★ '+movie.rating.toFixed(1):'—'}${rating?`<span class="personal-rating"> · ${escHtml(rating)}/10</span>`:''}</span></div>
    ${movie.mediaType==='tv'?'<span class="media-kind">Seriál</span>':''}
    ${progress&&progress.watched>0&&!watched?`<div class="movie-card__series-progress"><div class="movie-card__series-progress-row"><span>${progress.watched}/${progress.total} dílů</span><span>${progress.percent}%</span></div><div class="movie-card__series-progress-track"><div style="width:${progress.percent}%"></div></div></div>`:''}
  </article>`;
}

function formatRelease(dateStr) {
  if (!dateStr || dateStr.length < 10) return dateStr;
  const d = new Date(dateStr), now = new Date();
  const diff = Math.round((d - now) / 86400000);
  if (diff === 0) return 'Dnes!';
  if (diff === 1) return 'Zítra';
  if (diff > 0 && diff <= 7) return `Za ${diff} dní`;
  return `${d.getDate()}.${d.getMonth()+1}.${d.getFullYear()}`;
}

function formatRuntime(totalMinutes) {
  const minutes = Math.max(0, Math.round(Number(totalMinutes) || 0));
  if (!minutes) return '';
  if (minutes < 60) return `${minutes} min`;
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days) return `${days} d ${hours ? `${hours} h` : ''}${mins ? ` ${mins} min` : ''}`.trim();
  return `${hours} h${mins ? ` ${mins} min` : ''}`;
}

function formatCardRuntime(totalMinutes, mediaType = 'movie') {
  const minutes = Math.max(0, Math.round(Number(totalMinutes) || 0));
  if (!minutes) return '';
  if (mediaType === 'tv') return `${Math.round(minutes / 60)} h`;
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
}

function highlightText(text, query) {
  const lower = text.toLowerCase(), lq = query.toLowerCase();
  const idx = lower.indexOf(lq);
  if (idx < 0) return escHtml(text);
  return escHtml(text.substring(0, idx))
    + `<mark>${escHtml(text.substring(idx, idx + query.length))}</mark>`
    + escHtml(text.substring(idx + query.length));
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Category row ──────────────────────────────────────────────────────────────
function buildCategoryRow(id, title, movies, opts = {}) {
  const collapsed = Storage.getCollapsed().has(title);
  const accentColor = opts.accentColor || 'var(--accent)';
  return `
  <section class="category" id="cat-${id}">
    <div class="category__header">
      <div class="category__accent" style="background:${accentColor}"></div>
      <h2 class="category__title" style="color:${accentColor}">${title}</h2>
      ${opts.collapsible ? `<button class="category__collapse" aria-label="Sbalit nebo rozbalit: ${escHtml(title)}" aria-expanded="${!collapsed}" data-cat="${escHtml(title)}">${collapsed ? '▼' : '▲'}</button>` : ''}
    </div>
    <div class="category__body ${collapsed ? 'collapsed' : ''}">
      <div class="category__scroll-wrap">
        <button class="category__arrow category__arrow--left" aria-label="Předchozí tituly" style="opacity:0;pointer-events:none">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div class="category__row" id="row-${id}">
          ${movies.map(m => movieCard(m, { showDate: opts.showDates, hideActions: opts.hideActions })).join('')}
        </div>
        <button class="category__arrow category__arrow--right" aria-label="Další tituly" style="opacity:0;pointer-events:none">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      </div>
      <div class="category__dots" id="dots-${id}"></div>
    </div>
  </section>`;
}

function attachCategoryEvents(containerId, opts = {}) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.querySelectorAll('.category').forEach(cat => {
    const row      = cat.querySelector('.category__row');
    const leftBtn  = cat.querySelector('.category__arrow--left');
    const rightBtn = cat.querySelector('.category__arrow--right');
    const dotsEl   = cat.querySelector('.category__dots');
    if (!row) return;

    const updateDots = () => {
      if (!dotsEl) return;
      const max = row.scrollWidth - row.clientWidth;
      if (max <= 4) { dotsEl.innerHTML = ''; return; }
      const step = Math.round(row.clientWidth * 0.8);
      const dotCount = Math.max(2, Math.min(12, Math.ceil(max / step) + 1));
      const progress = row.scrollLeft / max;
      const active = Math.min(dotCount - 1, Math.round(progress * (dotCount - 1)));
      dotsEl.innerHTML = Array.from({ length: dotCount }, (_, i) =>
        `<span class="dot ${i === active ? 'active' : ''}"></span>`).join('');
    };

    const canL = () => row.scrollLeft > 2;
    const canR = () => row.scrollLeft < row.scrollWidth - row.clientWidth - 2;

    row.addEventListener('scroll', () => {
      updateDots();
      // Skryj šipku, pokud jsme na konci — aktualizuje se i při kliku na šipku
      if (leftBtn.style.opacity === '1' && !canL()) {
        leftBtn.style.opacity = '0'; leftBtn.style.pointerEvents = 'none';
      }
      if (rightBtn.style.opacity === '1' && !canR()) {
        rightBtn.style.opacity = '0'; rightBtn.style.pointerEvents = 'none';
      }
    }, { passive: true });
    leftBtn.addEventListener('click',  () => row.scrollBy({ left: -Math.round(row.clientWidth * 0.8), behavior: 'smooth' }));
    rightBtn.addEventListener('click', () => row.scrollBy({ left:  Math.round(row.clientWidth * 0.8), behavior: 'smooth' }));

    cat.addEventListener('mousemove', e => {
      const rect = cat.getBoundingClientRect();
      const x = e.clientX - rect.left, w = rect.width;
      const showL = x < 140 && canL();
      const showR = x > w - 140 && canR();
      leftBtn.style.opacity       = showL ? '1' : '0';
      leftBtn.style.pointerEvents = showL ? 'auto' : 'none';
      rightBtn.style.opacity      = showR ? '1' : '0';
      rightBtn.style.pointerEvents= showR ? 'auto' : 'none';
    });
    cat.addEventListener('mouseleave', () => {
      leftBtn.style.opacity = '0'; leftBtn.style.pointerEvents = 'none';
      rightBtn.style.opacity = '0'; rightBtn.style.pointerEvents = 'none';
    });
    setTimeout(updateDots, 200);
  });

  container.querySelectorAll('.category__collapse').forEach(btn => {
    btn.addEventListener('click', () => {
      const cat = btn.dataset.cat;
      Storage.toggleCollapsed(cat);
      const body = btn.closest('.category').querySelector('.category__body');
      body.classList.toggle('collapsed');
      btn.textContent = body.classList.contains('collapsed') ? '▼' : '▲';
      btn.setAttribute('aria-expanded',String(!body.classList.contains('collapsed')));
    });
  });

  attachCardEvents(container, opts);
}

// ── Card events ───────────────────────────────────────────────────────────────
// FIX #1: Use mouseenter/mouseleave on each card directly, NOT event delegation
// Delegation was broken because mouseover on child elements re-triggered incorrectly.
function attachCardEvents(container, opts = {}) {
  if (!container) return;

  // We use event delegation for clicks (reliable),
  // but for trailer timer we use direct mouseenter/mouseleave on each card.
  // For dynamically added cards, we use MutationObserver.

  const attachToCard = (card) => {
    RuntimeHydrator.observe(card);
    if (card._trailerAttached) return;
    card._trailerAttached = true;

    // Bind quick-add hover for all cards immediately — covers initially-saved cards
    const qa = card.querySelector('.btn--quick-add');
    if (qa) _bindQuickAddHover(qa);

    // Only trigger when idling directly on the poster image — not on any button/overlay
    const poster = card.querySelector('.movie-card__poster-wrap');
    if (!poster) return;

    // Enter poster area → start timer
    poster.addEventListener('mouseenter', () => {
      if (!window.matchMedia?.('(hover: hover) and (pointer: fine)').matches || document.documentElement.dataset.input === 'touch') return;
      card._hoverActive = true;
      clearTimeout(card._miniTimer);
      card._miniTimer = setTimeout(async () => {
        if (!card._hoverActive) return;
        if (!document.body.contains(card)) return; // card may have been removed
        let movie; try { movie = JSON.parse(card.dataset.movie); } catch { return; }
        ensureCardRuntime(card, movie).catch(() => {});
        await showMiniTrailer(card, movie);
      }, 2000);
    });

    // Leave poster area → cancel completely
    poster.addEventListener('mouseleave', () => {
      card._hoverActive = false;
      clearTimeout(card._miniTimer);
      hideMiniTrailer(card);
    });

    // Buttons inside poster: pause on enter, RESTART timer on leave (cursor back on poster image)
    poster.querySelectorAll('button, [data-action], .btn--quick-add, .fav-ctx-btn').forEach(btn => {
      btn.addEventListener('mouseenter', () => {
        card._hoverActive = false;
        clearTimeout(card._miniTimer);
        hideMiniTrailer(card);
      });
      btn.addEventListener('mouseleave', (e) => {
        // Only restart if cursor stayed inside the poster-wrap
        const rel = e.relatedTarget;
        if (rel && poster.contains(rel) && !rel.closest('button, [data-action], .fav-ctx-btn') && window.matchMedia?.('(hover: hover) and (pointer: fine)').matches && document.documentElement.dataset.input !== 'touch') {
          card._hoverActive = true;
          clearTimeout(card._miniTimer);
          card._miniTimer = setTimeout(async () => {
            if (!card._hoverActive) return;
            if (!document.body.contains(card)) return;
            let movie; try { movie = JSON.parse(card.dataset.movie); } catch { return; }
            await showMiniTrailer(card, movie);
          }, 1200); // slightly shorter restart delay
        }
      });
    });

    card.addEventListener('mouseleave', () => {
      card._hoverActive = false;
      clearTimeout(card._miniTimer);
      hideMiniTrailer(card);
    });
  };

  // Attach to all existing cards
  container.querySelectorAll('.movie-card').forEach(attachToCard);

  // Watch for new cards added dynamically
  if (!container._trailerObserver) {
    container._trailerObserver = new MutationObserver(mutations => {
      mutations.forEach(m => m.addedNodes.forEach(node => {
        if (node.nodeType !== 1) return;
        if (node.classList?.contains('movie-card')) attachToCard(node);
        node.querySelectorAll?.('.movie-card').forEach(attachToCard);
      }));
    });
    container._trailerObserver.observe(container, { childList: true, subtree: true });
  }

  // Click delegation (reliable for dynamic content)
  if (!container._clickAttached) {
    container._clickAttached = true;
    container.addEventListener('click', e => {
      const card = e.target.closest('.movie-card');
      if (!card) return;
      const actionEl = e.target.closest('[data-action]');
      const action = actionEl?.dataset.action;
      let movie; try { movie = JSON.parse(card.dataset.movie); } catch { return; }
      const touchLike = window.matchMedia?.('(hover: none), (pointer: coarse)').matches;

      if (action === 'quick-add') {
        e.stopPropagation();
        hideMiniTrailer(card); // always kill preview on any button click
        const isFav = Storage.isFavorite(movie.imdbId);
        if (isFav) {
          removeFavoriteWithUndo(movie, {
            onRemove: () => document.querySelectorAll(`.movie-card[data-id="${movie.imdbId}"]`).forEach(c => updateCardFavState(c, false)),
            onUndo: () => document.querySelectorAll(`.movie-card[data-id="${movie.imdbId}"]`).forEach(c => updateCardFavState(c, true)),
          });
        } else {
          Storage.saveFavorite(movie);
          document.querySelectorAll(`.movie-card[data-id="${movie.imdbId}"]`).forEach(c => updateCardFavState(c, true));
          showToast(`🔖 ${movie.title} přidán`);
          document.dispatchEvent(new CustomEvent('favorites-changed'));
        }
      } else if (action === 'ctx-menu') {
        e.stopPropagation();
        hideMiniTrailer(card);
        let m; try { m = JSON.parse(actionEl.dataset.movie || card.dataset.movie); } catch { return; }
        document.dispatchEvent(new CustomEvent('card-ctx-menu', { detail: { event: e, movie: m } }));
      } else if (!action || action === 'detail') {
        hideMiniTrailer(card);
        if (opts.onCardClick) opts.onCardClick(movie);
        else openMovieDetail(movie);
      }
    });
  }
}

function _bindQuickAddHover() { /* State changes are explicit on both touch and mouse. */ }
function updateCardFavState(card, isFav) {
  const qa=card.querySelector('.btn--quick-add'); if(!qa)return;
  qa.classList.toggle('active',isFav);qa.innerHTML=cardControlIcon(isFav?'check':'plus');qa.setAttribute('aria-pressed',String(isFav));
  const title=card.querySelector('.movie-card__title')?.textContent||'';
  qa.setAttribute('aria-label',(isFav?'Odebrat ze Šuplíku: ':'Uložit do Šuplíku: ')+title);
}

function updateCardWatchedState(card, isWatched) {
  card?.classList.toggle('movie-card--watched', isWatched);
  const badge=card?.querySelector('.movie-card__watched-badge');if(badge)badge.hidden=!isWatched;
}

function syncMovieCardsWatched(imdbId, isWatched) {
  document.querySelectorAll(`.movie-card[data-id="${imdbId}"]`)
    .forEach(card => updateCardWatchedState(card, isWatched));
}

function syncMovieCardsProgress(imdbId) {
  const progress = Storage.getTVProgress(imdbId);
  document.querySelectorAll(`.movie-card[data-id="${imdbId}"]`).forEach(card => {
    card.querySelector('.movie-card__series-progress')?.remove();
    if (!progress || progress.watched <= 0 || Storage.isWatched(imdbId)) return;
    const el = document.createElement('div');
    el.className = 'movie-card__series-progress';
    el.setAttribute('aria-label', `Shlédnuto ${progress.watched} z ${progress.total} epizod`);
    el.innerHTML = `<div class="movie-card__series-progress-row"><span>${progress.watched}/${progress.total} dílů</span><span>${progress.percent}%</span></div>
      <div class="movie-card__series-progress-track"><div style="width:${progress.percent}%"></div></div>`;
    card.appendChild(el);
  });
}

function syncMovieCardsRuntime(movie) {
  RuntimeHydrator.refresh(movie);
  const mediaType = movie.mediaType || 'movie';
  const runtime = Storage.getMediaRuntime(mediaType, movie.imdbId);
  if (!runtime) return;
  document.querySelectorAll(`.movie-card[data-id="${movie.imdbId}"] .movie-card__runtime`).forEach(el => {
    el.textContent = `· ${formatCardRuntime(runtime, mediaType)}`;
  });
}

async function ensureCardRuntime(card, movie) {
  return RuntimeHydrator.request(card, movie);
}

// ── Mini trailer — Netflix-style backdrop preview ─────────────────────────────
let _miniPlayerActive = null;
let _miniBox = null;
let _miniRequest = 0;

async function showMiniTrailer(card, movie) {
  if (_miniPlayerActive) hideMiniTrailer(_miniPlayerActive);
  _miniPlayerActive = card;
  const request = ++_miniRequest;

  // Fetch backdrops + optionally Vimeo (YouTube embeds are universally blocked by video owners — Error 153)
  let vimeoId = null;
  let backdropUrls = [];
  try {
    const loadVideos = movie.mediaType === 'tv' ? API.getTVVideos : API.getMovieVideos;
    const loadImages = movie.mediaType === 'tv' ? API.getTVImages : API.getMovieImages;
    const [videos, images] = await Promise.all([
      loadVideos(movie.id).catch(() => []),
      loadImages(movie.id).catch(() => []),
    ]);
    const vim = videos.find(v => v.site === 'Vimeo' && v.type === 'Trailer') || videos.find(v => v.site === 'Vimeo');
    if (vim) vimeoId = vim.key;
    backdropUrls = images;
  } catch {}

  if (request !== _miniRequest || !card._hoverActive || _miniPlayerActive !== card || !document.body.contains(card)) {
    return;
  }
  if (!vimeoId && !backdropUrls.length && !movie.backdropUrl && !movie.posterUrl) return;

  // Keep browsing unobstructed while the first set of varied frames is selected.
  // An obsolete request must not clear a newer preview's backdrop.
  document.getElementById('_mini-bd')?.remove();
  const bd = document.createElement('div');
  bd.id = '_mini-bd';
  bd.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0);z-index:40;pointer-events:none;transition:background .35s';
  document.body.appendChild(bd);
  requestAnimationFrame(() => { bd.style.background = 'rgba(0,0,0,0.55)'; });

  const rect = card.getBoundingClientRect();
  const BOX_W = Math.min(380, window.innerWidth - 32);
  const BOX_H = Math.round(BOX_W * 9 / 16);
  let left = rect.left + rect.width / 2 - BOX_W / 2;
  left = Math.max(16, Math.min(window.innerWidth - BOX_W - 16, left));
  let top = rect.top - BOX_H - 10;
  if (top < 16) top = rect.bottom + 10;
  if (top + BOX_H > window.innerHeight - 16) top = Math.max(16, rect.top - BOX_H - 10);

  const box = document.createElement('div');
  box.id = '_mini-trailer';
  box.style.cssText = `position:fixed;left:${left}px;top:${top}px;width:${BOX_W}px;height:${BOX_H}px;
    background:#000;border-radius:14px;z-index:50;box-shadow:0 16px 56px rgba(0,0,0,.9);
    overflow:hidden;animation:mini-fadein .25s ease`;

  if (vimeoId) {
    // Vimeo actually allows embedding — use it
    box.innerHTML = `<iframe src="https://player.vimeo.com/video/${vimeoId}?autoplay=1&muted=1&badge=0&byline=0&title=0&portrait=0"
      allow="autoplay;fullscreen;picture-in-picture" allowfullscreen frameborder="0"
      style="width:100%;height:100%;display:block;border:none"></iframe>`;
  } else {
    // Netflix-style: fast cinematic backdrop slideshow with animated info overlay
    // Use poster as first frame so something shows immediately while backdrops load
    const frames = backdropUrls.length > 0 ? backdropUrls.slice(0, 8) : (movie.backdropUrl ? [movie.backdropUrl] : [movie.posterUrl]);
    const hasMultiple = frames.length > 1;
    const INTERVAL = 1600; // ms per frame — fast like a real trailer montage
    box._slideIntervalMs = INTERVAL;

    box.innerHTML = `
      <div style="position:relative;width:100%;height:100%;background:#111;overflow:hidden">
        <img id="_mf-a" src="${frames[0]}"
          style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:1;transition:opacity .6s ease;transform:scale(1.04);animation:_mf-ken ${INTERVAL * frames.length}ms linear infinite alternate">
        <img id="_mf-b" src="${frames[Math.min(1, frames.length-1)]}"
          style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity .6s ease">
        <style>
          @keyframes _mf-ken { from{transform:scale(1.0) translate(0,0)} to{transform:scale(1.08) translate(-1%,-1%)} }
        </style>
        <!-- Cinematic vignette -->
        <div style="position:absolute;inset:0;background:radial-gradient(ellipse at center,transparent 40%,rgba(0,0,0,.55) 100%)"></div>
        <!-- Top gradient -->
        <div style="position:absolute;top:0;left:0;right:0;height:60px;background:linear-gradient(rgba(0,0,0,.5),transparent)"></div>
        <!-- Bottom gradient with info posunutý výš -->
        <div style="position:absolute;bottom:0;left:0;right:0;padding:70px 14px 16px;background:linear-gradient(transparent 20%,rgba(0,0,0,.92) 70%)" id="_mf-info">
          <div style="font-size:13px;font-weight:800;color:#fff;line-height:1.2;margin-bottom:4px;text-shadow:0 1px 6px rgba(0,0,0,.8);opacity:0;transform:translateY(6px);transition:all .5s .1s" id="_mf-title">${escHtml(movie.title)}</div>
          <div style="display:flex;align-items:center;gap:8px;opacity:0;transform:translateY(4px);transition:all .5s .25s" id="_mf-meta">
            ${movie.rating > 0 ? `<span style="color:#FFB300;font-size:11px;font-weight:700">★ ${movie.rating.toFixed(1)}</span>` : ''}
            ${movie.year ? `<span style="color:rgba(255,255,255,.5);font-size:11px">${escHtml(movie.year)}</span>` : ''}
          </div>
          ${movie.overview ? `<div style="color:rgba(255,255,255,.7);font-size:10px;line-height:1.55;margin-top:4px;text-shadow:0 1px 4px rgba(0,0,0,.7);display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden;opacity:0;transform:translateY(4px);transition:all .5s .35s" id="_mf-overview">${escHtml(movie.overview)}</div>` : ''}
        </div>
        <!-- Progress bar -->
        ${hasMultiple ? `<div style="position:absolute;bottom:0;left:0;right:0;height:2px;background:rgba(255,255,255,.12)">
          <div id="_mf-prog" style="height:100%;background:var(--accent,#00C9A7);width:0%;transition:width ${INTERVAL}ms linear;border-radius:1px"></div>
        </div>` : ''}
      </div>`;

    // Animate info in after short delay
    const titleEl = box.querySelector('#_mf-title');
    const metaEl  = box.querySelector('#_mf-meta');
    const overviewEl = box.querySelector('#_mf-overview');
    setTimeout(() => {
      if (titleEl) { titleEl.style.opacity = '1'; titleEl.style.transform = 'translateY(0)'; }
      if (metaEl)  { metaEl.style.opacity  = '1'; metaEl.style.transform  = 'translateY(0)'; }
      if (overviewEl) { overviewEl.style.opacity = '1'; overviewEl.style.transform = 'translateY(0)'; }
    }, 200);

    // Crossfade slideshow
    if (hasMultiple) {
      const imgA   = box.querySelector('#_mf-a');
      const imgB   = box.querySelector('#_mf-b');
      const prog   = box.querySelector('#_mf-prog');
      let idx = 0, useA = true;

      box._slideInterval = setInterval(() => {
        if (!document.body.contains(box)) return;
        idx = (idx + 1) % frames.length;
        const next = frames[idx];
        if (useA) {
          imgB.src = next; imgB.style.opacity = '1'; imgA.style.opacity = '0';
        } else {
          imgA.src = next; imgA.style.opacity = '1'; imgB.style.opacity = '0';
        }
        useA = !useA;
        // Reset & restart progress bar
        if (prog) {
          prog.style.transition = 'none'; prog.style.width = '0%';
          requestAnimationFrame(() => {
            prog.style.transition = `width ${INTERVAL}ms linear`;
            prog.style.width = '100%';
          });
        }
      }, INTERVAL);
    }
  }

  document.body.appendChild(box);
  _miniBox = box;

  // FIX 1: start progress bar AFTER box is in DOM (rAF is reliable only then)
  if (!vimeoId) {
    const prog2 = box.querySelector('#_mf-prog');
    if (prog2) {
      prog2.style.transition = 'none'; prog2.style.width = '0%';
      requestAnimationFrame(() => requestAnimationFrame(() => {
        prog2.style.transition = `width ${box._slideIntervalMs || 1600}ms linear`;
        prog2.style.width = '100%';
      }));
    }
  }
}
function _cleanupBackdrop() {
  const bd = document.getElementById('_mini-bd');
  if (bd) { bd.style.background = 'rgba(0,0,0,0)'; setTimeout(() => bd.remove(), 400); }
}

function hideMiniTrailer(card) {
  if (!card) return;
  clearTimeout(card._miniTimer);
  if (_miniPlayerActive === card) {
    _miniRequest++;
    _miniPlayerActive = null;
    if (_miniBox) { clearInterval(_miniBox._slideInterval); _miniBox.remove(); _miniBox = null; }
    _cleanupBackdrop();
  }
}

// ── Movie Detail ──────────────────────────────────────────────────────────────
function bindCommentAutosave(overlay, movie, commentEl) {
  const owner = localStorage.getItem('wm_library_owner') || 'guest';
  const draftKey = 'wm_pending_notes:' + owner;
  const editorId = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
  let savedValue = commentEl.value, timer;
  commentEl.maxLength = 20000;
  const readDrafts = () => { try { return JSON.parse(localStorage.getItem(draftKey) || '{}'); } catch { return {}; } };
  function keepDraft() {
    const drafts = readDrafts();
    drafts[movie.imdbId] = { value: commentEl.value, updatedAt: Date.now(), editorId };
    localStorage.setItem(draftKey, JSON.stringify(drafts));
  }
  function dropDraft() {
    const drafts = readDrafts();
    if (drafts[movie.imdbId]?.editorId !== editorId) return;
    delete drafts[movie.imdbId];
    if (Object.keys(drafts).length) localStorage.setItem(draftKey, JSON.stringify(drafts)); else localStorage.removeItem(draftKey);
  }
  function flush() {
    clearTimeout(timer);
    if (commentEl.value === savedValue) { dropDraft(); return; }
    keepDraft();
    // A timer from a closed/stale tab must never write A's note into B's data.
    // Its small owner-scoped draft will be recovered only when A opens again.
    if ((localStorage.getItem('wm_library_owner') || 'guest') !== owner || (typeof Account !== 'undefined' && !Account.canEdit())) return;
    Storage.setComment(movie.imdbId, commentEl.value);
    savedValue = commentEl.value;
    dropDraft();
  }
  const beforeChange = event => { try { flush(); } catch (error) { event.detail?.errors?.push(error); } };
  document.addEventListener('librarybeforechange', beforeChange);
  overlay.addEventListener('modal-closed', () => {
    document.removeEventListener('librarybeforechange', beforeChange);
    try { flush(); } catch { showToast('Poznámku se nepodařilo uložit. Zkontroluj místo v prohlížeči.'); }
  }, { once: true });
  commentEl.addEventListener('input', () => {
    clearTimeout(timer);
    // Store the draft before debounce so even another tab switching owners does
    // not erase the final keystrokes. It is excluded from exports/cloud snapshots.
    try { keepDraft(); }
    catch { showToast('Rozepsanou poznámku se nepodařilo zálohovat. Zkopíruj si ji.'); }
    timer = setTimeout(() => { try { flush(); } catch { showToast('Poznámku se nepodařilo uložit. Zkontroluj místo v prohlížeči.'); } }, 300);
  });
}

async function openMovieDetail(movie, opts = {}) {
  const isFav     = Storage.isFavorite(movie.imdbId);
  const isWatched = Storage.isWatched(movie.imdbId);
  const myRating  = Storage.getRating(movie.imdbId);
  const myComment = Storage.getComment(movie.imdbId);

  const overlay = showModal(`
    <button class="detail-close" type="button" aria-label="Zavřít detail" title="Zavřít">✕</button>
    <div class="detail-hero" ${movie.backdropUrl ? `style="background-image:url('${escHtml(movie.backdropUrl)}')"` : ''}>
      <div class="detail-hero__gradient"></div>
      <div class="detail-hero__content">
        ${movie.posterUrl ? `<img class="detail-poster" src="${escHtml(movie.posterUrl)}" alt="${escHtml(movie.title)}">` : ''}
        <div class="detail-info">
          <h2 class="detail-title" id="_detail-title" title="Klikni pro kopírování">${escHtml(movie.title)}</h2>
          <div class="detail-meta">
            ${movie.year ? `<span>${escHtml(movie.year)}</span>` : ''}
            ${movie.rating > 0 ? `<span>★ ${movie.rating.toFixed(1)}</span>` : ''}
            ${movie.mediaType === 'tv' ? '<span class="badge">Seriál</span>' : ''}
            <span id="_detail-runtime" class="detail-runtime">${movie.mediaType === 'tv' ? '⏱ Počítám…' : ''}</span>
          </div>
          <div class="detail-actions">
            <button class="btn ${isFav ? 'btn--primary' : 'btn--ghost'}" id="_btn-fav">${isFav ? '❤️ Uloženo' : '🤍 Uložit'}</button>
            <button class="btn ${isWatched ? 'btn--success' : 'btn--ghost'}" id="_btn-watched">${isWatched ? '✓ Viděno' : '○ Neviděno'}</button>
            <button class="btn btn--ghost" id="_btn-trailer">▶ Trailer</button>
            <button class="btn btn--ghost" id="_btn-similar">✨ Podobné</button>
            ${!movie.releaseDate || new Date(movie.releaseDate) <= new Date() ? `<button class="btn btn--ghost" id="_btn-watch" title="Sledovat na movies2watch.biz">🎬 Sledovat</button>` : ''}
          </div>
        </div>
      </div>
    </div>
    <div class="detail-body">
      <div class="detail-section" id="_gallery-section">
        <h3>Obrázky</h3>
        <p id="_gallery-status" role="status" style="color:var(--text3);font-size:13px">Vybírám záběry…</p>
        <div class="gallery-wrap" style="display:none">
          <button class="gallery-arrow gallery-arrow--left" id="_gal-left" aria-label="Předchozí obrázky">‹</button>
          <div class="gallery" id="_gallery"></div>
          <button class="gallery-arrow gallery-arrow--right" id="_gal-right" aria-label="Další obrázky">›</button>
        </div>
      </div>
      ${movie.overview ? `<div class="detail-section"><h3>Popis</h3><p class="detail-overview">${escHtml(movie.overview)}</p></div>` : ''}
      ${movie.mediaType === 'tv' ? `
      <div class="detail-section" id="_episodes-section">
        <div class="ep-head">
          <h3 style="margin:0">📺 Epizody</h3>
          <div class="ep-progress-track"><div class="ep-progress-fill" id="_ep-progress"></div></div>
          <span class="ep-progress-label" id="_ep-progress-label"></span>
        </div>
        <div class="ep-controls">
          <div class="ep-select-wrap">
            <span class="ep-select-icon">▾</span>
            <select class="ep-select" id="_ep-season-select"></select>
          </div>
          <button class="btn btn--ghost btn--sm" id="_ep-mark-season">✓ Označit sérii</button>
        </div>
        <div id="_ep-list" class="ep-list"><div class="spinner" style="width:28px;height:28px;margin:24px auto;border-width:3px"></div></div>
      </div>` : ''}
      <div class="detail-section">
        <h3>👤 Moje hodnocení</h3>
        <div class="rating-buttons" id="_rating-btns">
          ${Array.from({ length: 10 }, (_, i) => i + 1).map(n =>
            `<button class="rating-btn ${myRating === n ? 'active' : ''}" data-n="${n}">${n}</button>`
          ).join('')}
          <button class="rating-btn rating-btn--clear ${myRating ? '' : 'hidden'}" id="_clear-rating">✕ Odebrat</button>
        </div>
      </div>
      <div class="detail-section" style="padding-bottom:20px">
        <h3>📝 Poznámka</h3>
        <textarea class="input detail-comment" id="_comment" placeholder="Napiš si poznámku..." style="resize:vertical">${escHtml(myComment)}</textarea>
      </div>
    </div>
  `, { wide: true, tall: true });

  overlay.classList.add('detail-overlay');
  const actions = overlay.querySelector('.detail-actions');
  actions.classList.add('detail-footer');
  overlay.querySelector('.modal').appendChild(actions);
  overlay.querySelector('.modal').setAttribute('aria-label', movie.title);
  overlay.querySelector('.detail-close').addEventListener('click', () => overlay.remove());
  if (!movie.overview) API.getOverview(movie.id,movie.mediaType||'movie').then(text=>{
    if(!text||!overlay.isConnected)return;
    const section=document.createElement('section');section.className='detail-section';
    section.innerHTML='<h3>Popis</h3><p class="detail-overview">'+escHtml(text)+'</p>';
    overlay.querySelector('#_gallery-section').after(section);
  }).catch(()=>{});

  // Stopáž filmu se načítá až v detailu, aby karty a hover náhledy nedělaly
  // stovky zbytečných API požadavků.
  if (movie.mediaType !== 'tv') {
    API.getMovieDetails(movie.id).then(details => {
      const el = overlay.querySelector('#_detail-runtime');
      if (details.runtime) {
        Storage.setMediaRuntime('movie', movie.imdbId, details.runtime);
        syncMovieCardsRuntime(movie);
      }
      if (el) el.textContent = details.runtime ? `⏱ ${formatRuntime(details.runtime)}` : '';
    }).catch(() => {});
  }

  overlay.querySelector('#_detail-title').addEventListener('click', () => {
    navigator.clipboard?.writeText(movie.title);
    showToast('📋 Název zkopírován');
  });

  const favBtn = overlay.querySelector('#_btn-fav');
  const setFavButton = (saved) => {
    if (!document.body.contains(favBtn)) return;
    favBtn.textContent = saved ? '❤️ Uloženo' : '🤍 Uložit';
    favBtn.className = `btn ${saved ? 'btn--primary' : 'btn--ghost'}`;
  };
  favBtn.addEventListener('click', () => {
    const now = Storage.isFavorite(movie.imdbId);
    if (now) {
      removeFavoriteWithUndo(movie, {
        onRemove: () => setFavButton(false),
        onUndo: () => setFavButton(true),
      });
    } else {
      Storage.saveFavorite(movie);
      setFavButton(true);
      document.dispatchEvent(new CustomEvent('favorites-changed'));
    }
  });

  const watchedBtn = overlay.querySelector('#_btn-watched');
  watchedBtn.addEventListener('click', () => {
    if(movie.mediaType === 'tv') return;
    const now = Storage.toggleWatched(movie.imdbId);
    if (now && !Storage.isFavorite(movie.imdbId)) {
      Storage.saveFavorite(movie);
      setFavButton(true);
    }
    watchedBtn.textContent = now ? '✓ Viděno' : '○ Neviděno';
    watchedBtn.className   = `btn ${now ? 'btn--success' : 'btn--ghost'}`;
    syncMovieCardsWatched(movie.imdbId, now);
    document.dispatchEvent(new CustomEvent('favorites-changed'));
  });

  overlay.querySelector('#_btn-trailer').addEventListener('click', async () => {
    const btn = overlay.querySelector('#_btn-trailer'); btn.disabled = true;
    try {
      const videos = await (movie.mediaType === 'tv' ? API.getTVVideos(movie.id) : API.getMovieVideos(movie.id));
      if (!overlay.isConnected) return;
      const v = videos.find(v => ['YouTube','Vimeo'].includes(v.site) && v.type === 'Trailer') || videos.find(v => ['YouTube','Vimeo'].includes(v.site));
      if (!v) { showToast('Trailer není k dispozici. Fotografie najdeš v galerii detailu.'); return; }
      const key = encodeURIComponent(v.key);
      const url = v.site === 'YouTube' ? 'https://www.youtube.com/watch?v='+key : 'https://vimeo.com/'+key;
      showModal('<a class="trailer-link" href="'+url+'" target="_blank" rel="noopener noreferrer">'+(v.site === 'YouTube' ? '<img src="https://img.youtube.com/vi/'+key+'/hqdefault.jpg" alt="Náhled traileru">':'')+'<span class="btn btn--primary">▶ Otevřít trailer na '+escHtml(v.site)+' ↗</span></a>', {title:movie.title+' — trailer'});
    } catch { showToast('Nepodařilo se načíst trailer'); }
    finally { btn.disabled = false; }
  });

  overlay.querySelector('#_btn-watch')?.addEventListener('click', () => {
    const name = movie.originalTitle || movie.title;
    window.open('https://movies2watch.biz/search/' + encodeURIComponent(name), '_blank');
  });

  const similarBtn = overlay.querySelector('#_btn-similar');
  const toggleSimilar = async () => {
    const existingSection = overlay.querySelector('#_similar-section');
    if (existingSection) {
      existingSection.remove();
      similarBtn.textContent = '✨ Podobné';
      return;
    }
    const section = document.createElement('div');
    section.id = '_similar-section';
    section.className = 'detail-section';
    section.innerHTML = `<h3>${movie.mediaType === 'tv' ? 'Podobné seriály' : 'Podobné filmy'}</h3>
      <div id="_sim-grid" class="movie-grid similar-grid"></div>
      <p class="similar-status" role="status">Načítám podobné tituly…</p>`;
    overlay.querySelector('.detail-body').appendChild(section);
    similarBtn.textContent = '⏳...';
    similarBtn.disabled = true;
    const scrollToSimilar = () => {
      if (overlay.isConnected && opts.showSimilar) section.scrollIntoView({ block: 'start', behavior: 'instant' });
    };
    scrollToSimilar();
    try {
      const movies = await API.getSmartSimilar(movie.id, movie.genreIds || [], movie.mediaType || 'movie');
      if (!overlay.isConnected) return;
      const grid = section.querySelector('#_sim-grid');
      grid.innerHTML = movies.map(m => movieCard(m)).join('');
      attachCardEvents(grid);
      const status = section.querySelector('.similar-status');
      if (movies.length) status.remove();
      else status.textContent = 'Žádné podobné tituly jsme nenašli.';
      similarBtn.textContent = '✨ Skrýt';
      scrollToSimilar();
    } catch {
      section.remove();
      similarBtn.textContent = '✨ Podobné';
      showToast('Nepodařilo se načíst podobné filmy. Zkus to znovu.');
    } finally {
      similarBtn.disabled = false;
    }
  };
  similarBtn.addEventListener('click', toggleSimilar);
  if (opts.showSimilar) void toggleSimilar();

  const ratingWrap = overlay.querySelector('#_rating-btns');
  const clearBtn   = overlay.querySelector('#_clear-rating');
  const refreshRatingUI = (active) => {
    ratingWrap.querySelectorAll('.rating-btn[data-n]').forEach(b =>
      b.classList.toggle('active', parseInt(b.dataset.n) === active));
    clearBtn.classList.toggle('hidden', !active);
  };
  ratingWrap.addEventListener('click', e => {
    const btn = e.target.closest('.rating-btn');
    if (!btn) return;
    if (btn.id === '_clear-rating') {
      Storage.clearRating(movie.imdbId); refreshRatingUI(null);
      document.querySelectorAll(`.movie-card[data-id="${movie.imdbId}"] .personal-rating`).forEach(el => el.remove());
      return;
    }
    const n = parseInt(btn.dataset.n);
    Storage.setRating(movie.imdbId, n); refreshRatingUI(n);
    document.querySelectorAll(`.movie-card[data-id="${movie.imdbId}"]`).forEach(card => {
      let pr = card.querySelector('.personal-rating');
      if (!pr) { const rs = card.querySelector('.movie-card__rating'); if (rs) { pr = document.createElement('span'); pr.className = 'personal-rating'; rs.appendChild(pr); } }
      if (pr) pr.textContent = `👤 ${n}`;
    });
  });

  // Owner-bound autosave also flushes synchronously before session changes.
  const commentEl = overlay.querySelector('#_comment');
  if (commentEl) bindCommentAutosave(overlay, movie, commentEl);

  // Seriály: načti sezóny a epizody do vyhrazené sekce
  if (movie.mediaType === 'tv') {
    initSeriesEpisodes(overlay, movie).catch(() => {});
  }

  // Galerie používá správný endpoint podle typu média. Číselná ID filmů a
  // seriálů se mohou shodovat, proto je nelze zaměňovat.
  try {
    const images = await (movie.mediaType === 'tv' ? API.getTVImages(movie.id) : API.getMovieImages(movie.id));
    if (!overlay.isConnected) return;
    if (images.length) {
      const section  = overlay.querySelector('#_gallery-section');
      const gallery  = overlay.querySelector('#_gallery');
      const galLeft  = overlay.querySelector('#_gal-left');
      const galRight = overlay.querySelector('#_gal-right');
      section.querySelector('#_gallery-status').remove();
      section.querySelector('.gallery-wrap').style.display = '';
      gallery.innerHTML = images.map((url, index) =>
        `<button type="button" class="gallery__preview" aria-label="Zvětšit záběr ${index + 1} z ${images.length}: ${escHtml(movie.title)}" style="border:0;padding:0;background:none;flex-shrink:0;border-radius:8px;cursor:zoom-in">
          <img class="gallery__img" src="${escHtml(url.replace('/w780/', '/w300/'))}" srcset="${escHtml(url.replace('/w780/', '/w300/'))} 300w, ${escHtml(url)} 780w" sizes="214px" width="214" height="120" alt="${escHtml(movie.title)} — záběr ${index + 1}" loading="lazy" decoding="async" data-full="${escHtml(url.replace('/w780/','/w1280/'))}" style="display:block">
        </button>`
      ).join('');
      gallery.addEventListener('click', e => {
        const img = e.target.closest('.gallery__preview')?.querySelector('img');
        if (!img) return;
        showModal('<img class="gallery-full" src="'+escHtml(img.dataset.full)+'" alt="Záběr z '+escHtml(movie.title)+'">', {title:movie.title+' — galerie'});
      });
      const updateGalArrows = () => {
        galLeft.style.display  = gallery.scrollLeft > 2 ? 'flex' : 'none';
        galRight.style.display = gallery.scrollLeft < gallery.scrollWidth - gallery.clientWidth - 2 ? 'flex' : 'none';
      };
      galLeft.addEventListener('click',  () => gallery.scrollBy({ left: -300, behavior: 'smooth' }));
      galRight.addEventListener('click', () => gallery.scrollBy({ left:  300, behavior: 'smooth' }));
      gallery.addEventListener('scroll', updateGalArrows, { passive: true });
      gallery.querySelectorAll('img').forEach(img => img.addEventListener('error', () => {
        img.closest('.gallery__preview').remove();
        if (!gallery.childElementCount) section.style.display = 'none';
        updateGalArrows();
      }, { once: true }));
      if ('ResizeObserver' in window) {
        const resize = new ResizeObserver(updateGalArrows);
        resize.observe(gallery);
        overlay.addEventListener('modal-closed', () => resize.disconnect(), { once: true });
      }
      updateGalArrows();
    } else {
      overlay.querySelector('#_gallery-section').style.display = 'none';
    }
  } catch {
    const status = overlay.querySelector('#_gallery-status');
    if (status && overlay.isConnected) status.textContent = 'Záběry se nepodařilo načíst.';
  }
}

// Otevři detail seriálu (zajistí mediaType='tv' → ukáže výběr sérií a epizod)
function openTVDetail(show) {
  if (show) show.mediaType = 'tv';
  return openMovieDetail(show);
}

// ── Seriály: sezóny a epizody v detailu ───────────────────────────────────────
function _injectEpisodeStyles() {
  if (document.getElementById('_ep-extra-styles')) return;
  const s = document.createElement('style');
  s.id = '_ep-extra-styles';
  s.textContent = `
  .ep-head{display:flex;align-items:center;gap:12px;margin:2px 0 12px;flex-wrap:wrap}
  .ep-progress-track{flex:1;min-width:120px;height:7px;border-radius:4px;background:var(--surface2);overflow:hidden}
  .ep-progress-fill{height:100%;width:0;background:var(--accent);border-radius:4px;transition:width .35s}
  .ep-progress-label{font-size:12px;font-weight:700;color:var(--text2);white-space:nowrap}
  .ep-controls{display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap}
  .ep-select-wrap{position:relative;flex:1;min-width:170px}
  .ep-select-icon{position:absolute;right:12px;top:50%;transform:translateY(-50%);pointer-events:none;color:var(--accent);font-size:11px}
  .ep-select{appearance:none;-webkit-appearance:none;width:100%;padding:10px 30px 10px 14px;border-radius:10px;
    background:var(--surface2);border:1px solid var(--border);color:var(--text);font-weight:700;font-size:13px;cursor:pointer;
    transition:border-color .2s,box-shadow .2s}
  .ep-select:hover{border-color:var(--accent)}
  .ep-select:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 3px rgba(0,201,167,.2)}
  .ep-select option{background:#15110a;color:#f3ead8}
  .ep-season-summary{display:flex;align-items:center;gap:8px;font-size:11px;color:var(--text3);margin:0 2px 10px}
  .ep-season-summary b{color:var(--accent)}
  .tv-episode-list{display:flex;flex-direction:column;gap:1px}
  .tv-episode{align-items:flex-start}
  .tv-ep-titlerow{display:flex;align-items:baseline;gap:6px;flex-wrap:wrap}
  .tv-ep-rating{font-size:10px;color:var(--gold);font-weight:700}
  .tv-ep-overview{font-size:11.5px;line-height:1.45;color:var(--text2);margin-top:4px;
    display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
  .tv-ep-overview--empty{color:var(--text3);font-style:italic}
  .ep-empty{color:var(--text3);font-size:13px;text-align:center;padding:18px}
  `;
  document.head.appendChild(s);
}

async function initSeriesEpisodes(overlay, movie) {
  _injectEpisodeStyles();
  const tvId      = movie.imdbId;
  const listEl    = overlay.querySelector('#_ep-list');
  const progEl    = overlay.querySelector('#_ep-progress');
  const progLabel = overlay.querySelector('#_ep-progress-label');
  const seasonSel = overlay.querySelector('#_ep-season-select');
  const markBtn   = overlay.querySelector('#_ep-mark-season');
  let   watchedBtn = overlay.querySelector('#_btn-watched');
  if (!listEl || !seasonSel) return;

  let tv;
  try { tv = await API.getTVDetails(movie.id); }
  catch { listEl.innerHTML = '<p class="ep-empty">Epizody se nepodařilo načíst.</p>'; return; }
  if (!tv.seasons.length) { listEl.innerHTML = '<p class="ep-empty">Tento seriál nemá dostupné epizody.</p>'; return; }
  if (!Storage.getTVMeta(tvId)) Storage.setTVMeta(tvId, tv);

  // Součet pouze běžných sezón; speciály (sezóna 0) se nezapočítávají.
  const totalEpisodes = tv.seasons.reduce((a, s) => a + s.episodeCount, 0);
  const epCache = {};  // seasonNumber -> [episode objektů]
  const epNums  = {};  // seasonNumber -> [čísla epizod]
  const seasonLoads = {};
  let releaseDataReady = false;
  let current = tv.seasons[0].seasonNumber;

  const seasonByNum = (n) => tv.seasons.find(s => s.seasonNumber === n);
  const getSeasonRuntime = (n) => (epCache[n] || []).reduce((sum, ep) => sum + (ep.runtime || 0), 0);
  const releasedNums = (n) => (epCache[n] || []).filter(ep => ep.isReleased).map(ep => ep.episodeNumber);

  const updateSeasonOption = (n) => {
    const option = seasonSel.querySelector(`option[value="${n}"]`);
    const season = seasonByNum(n);
    if (!option || !season) return;
    const runtime = getSeasonRuntime(n);
    option.textContent = `${season.name} · ${season.episodeCount} dílů${runtime ? ` · ${formatRuntime(runtime)}` : ''}`;
  };

  const fetchSeason = async (n) => {
    if (epCache[n]) return epCache[n];
    if (!seasonLoads[n]) {
      seasonLoads[n] = API.getSeasonDetails(movie.id, n)
        .then(eps => {
          epCache[n] = eps;
          epNums[n] = eps.map(x => x.episodeNumber);
          updateSeasonOption(n);
          return eps;
        })
        .catch(() => {
          epCache[n] = [];
          epNums[n] = [];
          return [];
        });
    }
    return seasonLoads[n];
  };

  const getRegularWatchedCount = () => tv.seasons.reduce((sum, s) => {
    const nums = releaseDataReady ? releasedNums(s.seasonNumber) : [];
    return sum + Storage.getSeasonWatchedCount(tvId, s.seasonNumber, nums);
  }, 0);

  const getReleasedTotal = () => tv.seasons.reduce((sum, s) => sum + releasedNums(s.seasonNumber).length, 0);

  const refreshTopProgress = () => {
    const cached = !releaseDataReady ? Storage.getTVProgress(tvId) : null;
    const w = cached ? cached.watched : getRegularWatchedCount();
    const total = cached ? cached.total : (releaseDataReady ? getReleasedTotal() : totalEpisodes);
    progEl.style.width = (total ? Math.round(w / total * 100) : 0) + '%';
    progLabel.textContent = `${w}/${total} vydaných epizod`;
  };
  // Provázání: celý seriál je „Viděno", právě když jsou shlédnuté všechny epizody
  const syncSeriesWatched = () => {
    if (!releaseDataReady) return;
    const w = getRegularWatchedCount();
    const releasedTotal = getReleasedTotal();
    Storage.setWatched(tvId, releasedTotal > 0 && w >= releasedTotal);
    if (watchedBtn) {
      const on = Storage.isWatched(tvId);
      watchedBtn.textContent = on ? '✓ Viděno' : '○ Neviděno';
      watchedBtn.className    = `btn ${on ? 'btn--success' : 'btn--ghost'}`;
    }
    syncMovieCardsWatched(tvId, Storage.isWatched(tvId));
    syncMovieCardsProgress(tvId);
    document.dispatchEvent(new CustomEvent('favorites-changed'));
    document.dispatchEvent(new CustomEvent('tv-progress-changed'));
  };

  // Automaticky uloží seriál do oblíbených při prvním shlédnutém dílu
  const autoFavIfNeeded = () => {
    if (!Storage.isFavorite(movie.imdbId)) {
      Storage.saveFavorite(movie);
      document.dispatchEvent(new CustomEvent('favorites-changed'));
    }
  };

  const updateMarkBtn = () => {
    const nums = releasedNums(current);
    const wc = nums.length ? Storage.getSeasonWatchedCount(tvId, current, nums) : 0;
    const done = nums.length > 0 && wc >= nums.length;
    markBtn.classList.toggle('btn--success', done);
    markBtn.classList.toggle('btn--ghost', !done);
    markBtn.textContent = done ? '↩︎ Odznačit sérii' : '✓ Označit sérii';
  };

  const renderEpisodes = () => {
    const eps = epCache[current] || [];
    const s = seasonByNum(current);
    if (!eps.length) { listEl.innerHTML = '<p class="ep-empty">Epizody se nepodařilo načíst.</p>'; return; }
    const currentReleased = releasedNums(current);
    const wc = Storage.getSeasonWatchedCount(tvId, current, currentReleased);
    const seasonRuntime = getSeasonRuntime(current);
    const summary = `<div class="ep-season-summary">Shlédnuto <b>${wc}</b>/${currentReleased.length} vydaných${s && s.airDate ? ` · ${s.airDate.substring(0, 4)}` : ''}${seasonRuntime ? ` · ⏱ ${formatRuntime(seasonRuntime)} celkem` : ''}</div>`;
    listEl.innerHTML = summary + '<div class="tv-episode-list">' + eps.map(ep => {
      const w = Storage.isEpisodeWatched(tvId, current, ep.episodeNumber);
      const date = ep.airDate ? new Date(ep.airDate).toLocaleDateString('cs-CZ') : '';
      return `
      <div class="tv-episode ${w ? 'tv-episode--watched' : ''}">
        <button class="tv-ep-check ${w ? 'tv-ep-check--on' : ''}" aria-label="Viděno: ${current}×${ep.episodeNumber} ${escHtml(ep.name)}" aria-pressed="${w}" data-ep="${ep.episodeNumber}" ${ep.isReleased ? '' : 'disabled'} title="${ep.isReleased ? 'Změnit stav epizody' : 'Epizoda ještě nevyšla'}">${ep.isReleased ? (w ? '✓' : '○') : '◷'}</button>
        <div class="tv-ep-thumb ${ep.stillUrl ? '' : 'tv-ep-thumb--empty'}">${ep.stillUrl ? `<img src="${ep.stillUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:6px" loading="lazy">` : '📺'}</div>
        <div class="tv-ep-info">
          <div class="tv-ep-num">${current}×${String(ep.episodeNumber).padStart(2, '0')}${date ? ` · ${date}` : ''}${ep.runtime ? ` · ⏱ ${formatRuntime(ep.runtime)}` : ''}</div>
          <div class="tv-ep-titlerow"><span class="tv-ep-title">${escHtml(ep.name)}</span>${ep.rating > 0 ? `<span class="tv-ep-rating">★ ${ep.rating.toFixed(1)}</span>` : ''}</div>
          ${ep.overview ? `<p class="tv-ep-overview">${escHtml(ep.overview)}</p>` : '<p class="tv-ep-overview tv-ep-overview--empty">Popis epizody zatím není k dispozici.</p>'}
        </div>
      </div>`;
    }).join('') + '</div>';
  };

  const loadSeason = async (n) => {
    current = n;
    if (!epCache[n]) {
      listEl.innerHTML = '<div class="spinner" style="width:26px;height:26px;margin:24px auto;border-width:3px"></div>';
      await fetchSeason(n);
    }
    renderEpisodes();
    updateMarkBtn();
  };

  // Naplň rozbalovací výběr série
  seasonSel.innerHTML = tv.seasons.map(s =>
    `<option value="${s.seasonNumber}">${escHtml(s.name)} · ${s.episodeCount} dílů</option>`
  ).join('');

  // Přepnutí série
  seasonSel.addEventListener('change', () => loadSeason(+seasonSel.value));

  // Označit / odznačit celou aktuální sérii
  markBtn.addEventListener('click', async () => {
    if (!epCache[current]) await loadSeason(current);
    const nums = releasedNums(current);
    const turnOn = !Storage.isSeasonWatched(tvId, current, nums);
    Storage.setSeasonWatched(tvId, current, nums, turnOn);
    if (turnOn) autoFavIfNeeded();
    renderEpisodes(); updateMarkBtn();
    refreshTopProgress(); syncSeriesWatched();
  });

  // Klik na jednotlivou epizodu (delegace)
  listEl.addEventListener('click', (e) => {
    const chk = e.target.closest('.tv-ep-check');
    if (!chk) return;
    const epNum = +chk.dataset.ep;
    const ep = (epCache[current] || []).find(x => x.episodeNumber === epNum);
    if (!ep?.isReleased) return;
    const now = Storage.toggleEpisodeWatched(tvId, current, epNum);
    if (now) autoFavIfNeeded();
    chk.classList.toggle('tv-ep-check--on', now);
    chk.setAttribute('aria-pressed',String(now));
    chk.textContent = now ? '✓' : '○';
    chk.closest('.tv-episode')?.classList.toggle('tv-episode--watched', now);
    const sum = listEl.querySelector('.ep-season-summary b');
    if (sum) sum.textContent = Storage.getSeasonWatchedCount(tvId, current, releasedNums(current));
    updateMarkBtn();
    refreshTopProgress(); syncSeriesWatched();
  });

  // Horní tlačítko „Viděno" pro seriál označí/odznačí všechny epizody (oboustranné provázání)
  if (watchedBtn) {
    const fresh = watchedBtn.cloneNode(true);
    watchedBtn.replaceWith(fresh);
    watchedBtn = fresh;
    watchedBtn.addEventListener('click', async () => {
      const turnOn = !Storage.isWatched(tvId);
      watchedBtn.disabled = true;
      watchedBtn.textContent = '⏳...';
      for (const s of tv.seasons) {
        if (!epNums[s.seasonNumber]) {
          const eps = await fetchSeason(s.seasonNumber);
          if (!eps.length) {
            epNums[s.seasonNumber] = Array.from({ length: s.episodeCount }, (_, i) => i + 1);
          }
        }
        Storage.setSeasonWatched(tvId, s.seasonNumber, releasedNums(s.seasonNumber), turnOn);
      }
      Storage.setWatched(tvId, turnOn);
      if (turnOn) autoFavIfNeeded();
      watchedBtn.disabled = false;
      renderEpisodes(); updateMarkBtn();
      refreshTopProgress(); syncSeriesWatched();
    });
  }

  // Výchozí: první série
  refreshTopProgress();
  seasonSel.value = String(current);
  await loadSeason(current);

  // Přesnou celkovou stopáž získáme až součtem jednotlivých epizod. Sezóny
  // načítáme nejvýše po třech souběžně, aby detail zůstal rychlý a API nebylo zahlcené.
  (async () => {
    let cursor = 0;
    const workers = Array.from({ length: Math.min(3, tv.seasons.length) }, async () => {
      while (cursor < tv.seasons.length) {
        const season = tv.seasons[cursor++];
        await fetchSeason(season.seasonNumber);
      }
    });
    await Promise.all(workers);
    if (!document.body.contains(overlay)) return;
    Storage.setTVReleaseMeta(tvId, tv, epCache);
    releaseDataReady = true;
    const totalRuntime = tv.seasons.reduce((sum, s) => sum + getSeasonRuntime(s.seasonNumber), 0);
    const runtimeEl = overlay.querySelector('#_detail-runtime');
    if (runtimeEl) runtimeEl.textContent = totalRuntime ? `⏱ ${formatRuntime(totalRuntime)} celkem` : '';
    if (totalRuntime) {
      Storage.setMediaRuntime('tv', movie.imdbId, totalRuntime);
      syncMovieCardsRuntime(movie);
    }
    refreshTopProgress();
    syncSeriesWatched();
    renderEpisodes();
  })().catch(() => {});
}
