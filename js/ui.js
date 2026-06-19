// ═══════════════════════════════════════════════════════════════════════════════
//  ui.js
// ═══════════════════════════════════════════════════════════════════════════════

function showToast(message, duration = 2500) {
  const existing = document.querySelector('.wm-toast');
  if (existing) existing.remove();
  const t = document.createElement('div');
  t.className = 'wm-toast'; t.innerHTML = message;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, duration);
}

function showModal(contentHTML, opts = {}) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal ${opts.wide ? 'modal--wide' : ''} ${opts.tall ? 'modal--tall' : ''}">
      ${opts.title ? `<div class="modal-header"><h3>${opts.title}</h3><button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button></div>` : ''}
      <div class="modal-body">${contentHTML}</div>
    </div>`;
  if (!opts.noClose) overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
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
    overlay.querySelector('#_yes').onclick = () => { overlay.remove(); resolve(true); };
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
    const ok = () => { const v = inp.value.trim(); if (v) { overlay.remove(); resolve(v); } };
    overlay.querySelector('#_pyes').onclick = ok;
    overlay.querySelector('#_pno').onclick  = () => { overlay.remove(); resolve(null); };
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') ok(); });
  });
}

function spinner(text = 'Načítám...') {
  return `<div class="spinner-wrap"><div class="spinner"></div><p>${text}</p></div>`;
}

// ── Movie card ────────────────────────────────────────────────────────────────
function movieCard(movie, opts = {}) {
  const isFav     = Storage.isFavorite(movie.imdbId);
  const isWatched = Storage.isWatched(movie.imdbId);
  const rating    = Storage.getRating(movie.imdbId);
  const label     = Storage.getLabels()[movie.imdbId];
  const allDefs   = getAllLabelDefs();
  const labelDef  = label ? allDefs[label] : null;
  const dateStr   = opts.showDate && movie.releaseDate ? formatRelease(movie.releaseDate) : '';
  const hlText    = opts.highlight || '';
  const titleHtml = hlText ? highlightText(movie.title, hlText) : escHtml(movie.title);
  const isUpcoming = movie.releaseDate && new Date(movie.releaseDate) > new Date();
  const ratingDisplay = movie.rating > 0
    ? `★ ${movie.rating.toFixed(1)}`
    : (isUpcoming ? '<span class="soon">Brzy</span>' : '<span class="no-rating">—</span>');

  const ctxHtml = opts.ctxBtn
    ? `<button class="fav-ctx-btn" data-action="ctx-menu"
         data-id="${opts.ctxBtn.id}"
         data-movie='${opts.ctxBtn.data.replace(/'/g,"&#39;")}'
         title="Možnosti">⋯</button>`
    : '';

  return `
  <div class="movie-card" data-id="${movie.imdbId}" data-movie='${JSON.stringify(movie).replace(/'/g,"&#39;")}'>
    <div class="movie-card__poster-wrap">
      ${movie.posterUrl
        ? `<img class="movie-card__poster" src="${movie.posterUrl}" alt="${escHtml(movie.title)}" loading="lazy">`
        : `<div class="movie-card__placeholder"><span>🎬</span></div>`}
      ${isWatched ? '<div class="movie-card__watched-overlay"></div>' : ''}
      ${labelDef ? `<div class="movie-card__label-strip" style="background:${labelDef.color}"></div>` : ''}
      <div class="movie-card__hover-overlay">
        <button class="btn btn--quick-add ${isFav ? 'active' : ''}" data-action="quick-add"
          style="transition:background .35s ease,color .35s ease,opacity .12s ease,transform .12s ease">
          ${isFav ? '✓ Uloženo' : '+ Přidat'}
        </button>
      </div>
      ${opts.watchedToggle
        ? (isWatched
            ? `<div class="movie-card__watched-badge movie-card__watched-toggle" data-action="toggle-watched" title="Označit jako neshlédnuté" style="cursor:pointer">✓</div>`
            : `<div class="movie-card__watched-badge movie-card__watched-toggle movie-card__watched-toggle--unseen" data-action="toggle-watched" title="Označit jako shlédnuté" style="cursor:pointer;background:rgba(0,0,0,0.55);color:rgba(255,255,255,0.7)">👁</div>`)
        : (isWatched ? '<div class="movie-card__watched-badge">✓</div>' : '')}
      ${dateStr ? `<div class="movie-card__date-badge">${dateStr}</div>` : ''}
      ${ctxHtml}
    </div>
    <div class="movie-card__title" title="${escHtml(movie.title)}">${titleHtml}</div>
    <div class="movie-card__meta">
      <span class="movie-card__year">${movie.year}</span>
      <span class="movie-card__rating">
        ${ratingDisplay}
        ${rating ? `<span class="personal-rating">👤 ${rating}</span>` : ''}
      </span>
    </div>
  </div>`;
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
      ${opts.collapsible ? `<button class="category__collapse" data-cat="${title}">${collapsed ? '▼' : '▲'}</button>` : ''}
    </div>
    <div class="category__body ${collapsed ? 'collapsed' : ''}">
      <div class="category__scroll-wrap">
        <button class="category__arrow category__arrow--left" style="opacity:0;pointer-events:none">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div class="category__row" id="row-${id}">
          ${movies.map(m => movieCard(m, { showDate: opts.showDates })).join('')}
        </div>
        <button class="category__arrow category__arrow--right" style="opacity:0;pointer-events:none">
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

    row.addEventListener('scroll', updateDots, { passive: true });
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
      card._hoverActive = true;
      clearTimeout(card._miniTimer);
      card._miniTimer = setTimeout(async () => {
        if (!card._hoverActive) return;
        if (!document.body.contains(card)) return; // card may have been removed
        let movie; try { movie = JSON.parse(card.dataset.movie); } catch { return; }
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
    poster.querySelectorAll('button, [data-action], .btn--quick-add, .fav-ctx-btn, .movie-card__watched-badge').forEach(btn => {
      btn.addEventListener('mouseenter', () => {
        card._hoverActive = false;
        clearTimeout(card._miniTimer);
        hideMiniTrailer(card);
      });
      btn.addEventListener('mouseleave', (e) => {
        // Only restart if cursor stayed inside the poster-wrap
        const rel = e.relatedTarget;
        if (rel && poster.contains(rel) && !rel.closest('button, [data-action], .fav-ctx-btn')) {
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

      if (action === 'quick-add') {
        e.stopPropagation();
        hideMiniTrailer(card); // always kill preview on any button click
        const isFav = Storage.isFavorite(movie.imdbId);
        if (isFav) Storage.removeFavorite(movie.imdbId); else Storage.saveFavorite(movie);
        const newState = !isFav;
        document.querySelectorAll(`.movie-card[data-id="${movie.imdbId}"]`).forEach(c => updateCardFavState(c, newState));
        showToast(newState ? `🔖 ${movie.title} přidán` : `❌ ${movie.title} odebrán`);
        document.dispatchEvent(new CustomEvent('favorites-changed'));
      } else if (action === 'toggle-watched') {
        e.stopPropagation();
        hideMiniTrailer(card);
        const newWatched = Storage.toggleWatched(movie.imdbId);
        // Update all matching cards on screen
        document.querySelectorAll(`.movie-card[data-id="${movie.imdbId}"]`).forEach(c => {
          const overlay = c.querySelector('.movie-card__watched-overlay');
          const badge = c.querySelector('.movie-card__watched-toggle');
          if (overlay) overlay.style.display = newWatched ? '' : 'none';
          else if (newWatched) {
            const pw = c.querySelector('.movie-card__poster-wrap');
            if (pw) { const ov = document.createElement('div'); ov.className = 'movie-card__watched-overlay'; pw.insertBefore(ov, pw.firstChild.nextSibling); }
          }
          if (badge) {
            if (newWatched) {
              badge.textContent = '✓';
              badge.title = 'Označit jako neshlédnuté';
              badge.style.background = '';
              badge.style.color = '';
              badge.classList.remove('movie-card__watched-toggle--unseen');
            } else {
              badge.textContent = '👁';
              badge.title = 'Označit jako shlédnuté';
              badge.style.background = 'rgba(0,0,0,0.55)';
              badge.style.color = 'rgba(255,255,255,0.7)';
              badge.classList.add('movie-card__watched-toggle--unseen');
            }
          }
        });
        showToast(newWatched ? `👁 ${movie.title} — shlédnuto` : `○ ${movie.title} — neshlédnuto`);
        document.dispatchEvent(new CustomEvent('favorites-changed'));
      } else if (action === 'ctx-menu') {
        e.stopPropagation();
        hideMiniTrailer(card);
        let m; try { m = JSON.parse(actionEl.dataset.movie || card.dataset.movie); } catch { return; }
        document.dispatchEvent(new CustomEvent('card-ctx-menu', { detail: { event: e, movie: m } }));
      } else if (!action) {
        hideMiniTrailer(card);
        if (opts.onCardClick) opts.onCardClick(movie);
        else openMovieDetail(movie);
      }
    });
  }
}

function _bindQuickAddHover(qa) {
  if (qa._hoverBound) return;
  qa._hoverBound = true;
  qa.addEventListener('mouseenter', () => {
    if (!qa.classList.contains('active')) return;
    qa.style.opacity = '0.7';
    qa.style.transform = 'scale(0.96)';
    setTimeout(() => {
      if (!qa.classList.contains('active')) return;
      qa.textContent = '✕ Odebrat';
      qa.style.opacity = '1';
      qa.style.transform = 'scale(1)';
    }, 110);
  });
  qa.addEventListener('mouseleave', () => {
    if (!qa.classList.contains('active')) return;
    qa.style.opacity = '0.7';
    qa.style.transform = 'scale(0.96)';
    setTimeout(() => {
      qa.textContent = '✓ Uloženo';
      qa.style.opacity = '1';
      qa.style.transform = 'scale(1)';
    }, 110);
  });
}

function updateCardFavState(card, isFav) {
  const qa = card.querySelector('.btn--quick-add');
  if (!qa) return;
  qa.classList.toggle('active', isFav);
  qa.textContent = isFav ? '✓ Uloženo' : '+ Přidat';
  _bindQuickAddHover(qa);
}

// ── Mini trailer — Netflix-style backdrop preview ─────────────────────────────
let _miniPlayerActive = null;
let _miniBox = null;

async function showMiniTrailer(card, movie) {
  if (_miniPlayerActive) hideMiniTrailer(_miniPlayerActive);
  _miniPlayerActive = card;

  // Darken viewport
  let bd = document.getElementById('_mini-bd');
  if (!bd) {
    bd = document.createElement('div');
    bd.id = '_mini-bd';
    bd.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0);z-index:40;pointer-events:none;transition:background .35s';
    document.body.appendChild(bd);
  }
  requestAnimationFrame(() => { bd.style.background = 'rgba(0,0,0,0.55)'; });

  // Fetch backdrops + optionally Vimeo (YouTube embeds are universally blocked by video owners — Error 153)
  let vimeoId = null;
  let backdropUrls = [];
  try {
    const [videos, images] = await Promise.all([
      API.getMovieVideos(movie.id).catch(() => []),
      API.getMovieImages(movie.id).catch(() => []),
    ]);
    const vim = videos.find(v => v.site === 'Vimeo' && v.type === 'Trailer') || videos.find(v => v.site === 'Vimeo');
    if (vim) vimeoId = vim.key;
    backdropUrls = images;
  } catch {}

  if (!card._hoverActive || _miniPlayerActive !== card || !document.body.contains(card)) {
    _cleanupBackdrop(); return;
  }

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
        <!-- Bottom gradient with info -->
        <div style="position:absolute;bottom:0;left:0;right:0;padding:14px 14px 12px;background:linear-gradient(transparent,rgba(0,0,0,.92) 60%)" id="_mf-info">
          <div style="font-size:13px;font-weight:800;color:#fff;line-height:1.2;margin-bottom:4px;text-shadow:0 1px 6px rgba(0,0,0,.8);opacity:0;transform:translateY(6px);transition:all .5s .1s" id="_mf-title">${escHtml(movie.title)}</div>
          <div style="display:flex;align-items:center;gap:8px;opacity:0;transform:translateY(4px);transition:all .5s .25s" id="_mf-meta">
            ${movie.rating > 0 ? `<span style="color:#FFB300;font-size:11px;font-weight:700">★ ${movie.rating.toFixed(1)}</span>` : ''}
            ${movie.year ? `<span style="color:rgba(255,255,255,.5);font-size:11px">${movie.year}</span>` : ''}
            ${movie.overview ? `<span style="color:rgba(255,255,255,.35);font-size:10px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(movie.overview.substring(0,60))}…</span>` : ''}
          </div>
        </div>
        <!-- Progress bar -->
        ${hasMultiple ? `<div style="position:absolute;bottom:0;left:0;right:0;height:2px;background:rgba(255,255,255,.12)">
          <div id="_mf-prog" style="height:100%;background:var(--accent,#00C9A7);width:0%;transition:width ${INTERVAL}ms linear;border-radius:1px"></div>
        </div>` : ''}
      </div>`;

    // Animate info in after short delay
    const titleEl = box.querySelector('#_mf-title');
    const metaEl  = box.querySelector('#_mf-meta');
    setTimeout(() => {
      if (titleEl) { titleEl.style.opacity = '1'; titleEl.style.transform = 'translateY(0)'; }
      if (metaEl)  { metaEl.style.opacity  = '1'; metaEl.style.transform  = 'translateY(0)'; }
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
    _miniPlayerActive = null;
    if (_miniBox) { clearInterval(_miniBox._slideInterval); _miniBox.remove(); _miniBox = null; }
    _cleanupBackdrop();
  }
}

// ── Movie Detail ──────────────────────────────────────────────────────────────
async function openMovieDetail(movie) {
  const isFav     = Storage.isFavorite(movie.imdbId);
  const isWatched = Storage.isWatched(movie.imdbId);
  const myRating  = Storage.getRating(movie.imdbId);
  const myComment = Storage.getComment(movie.imdbId);

  const overlay = showModal(`
    <div class="detail-hero" ${movie.backdropUrl ? `style="background-image:url('${movie.backdropUrl}')"` : ''}>
      <div class="detail-hero__gradient"></div>
      <div class="detail-hero__content">
        ${movie.posterUrl ? `<img class="detail-poster" src="${movie.posterUrl}" alt="${escHtml(movie.title)}">` : ''}
        <div class="detail-info">
          <h2 class="detail-title" id="_detail-title" title="Klikni pro kopírování">${escHtml(movie.title)}</h2>
          <div class="detail-meta">
            ${movie.year ? `<span>${movie.year}</span>` : ''}
            ${movie.rating > 0 ? `<span>★ ${movie.rating.toFixed(1)}</span>` : ''}
            ${movie.mediaType === 'tv' ? '<span class="badge">Seriál</span>' : ''}
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
      <div class="detail-section" id="_gallery-section" style="display:none">
        <h3>Záběry z filmu</h3>
        <div class="gallery-wrap">
          <button class="gallery-arrow gallery-arrow--left" id="_gal-left">‹</button>
          <div class="gallery" id="_gallery"></div>
          <button class="gallery-arrow gallery-arrow--right" id="_gal-right">›</button>
        </div>
      </div>
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
        <textarea class="input detail-comment" id="_comment" placeholder="Napiš si poznámku...">${escHtml(myComment)}</textarea>
        <button class="btn btn--primary" id="_save-comment" style="margin-top:8px">Uložit poznámku</button>
      </div>
    </div>
  `, { wide: true, tall: true });

  overlay.querySelector('#_detail-title').addEventListener('click', () => {
    navigator.clipboard?.writeText(movie.title);
    showToast('📋 Název zkopírován');
  });

  const favBtn = overlay.querySelector('#_btn-fav');
  favBtn.addEventListener('click', () => {
    const now = Storage.isFavorite(movie.imdbId);
    if (now) Storage.removeFavorite(movie.imdbId); else Storage.saveFavorite(movie);
    favBtn.textContent = now ? '🤍 Uložit' : '❤️ Uloženo';
    favBtn.className   = `btn ${now ? 'btn--ghost' : 'btn--primary'}`;
    document.dispatchEvent(new CustomEvent('favorites-changed'));
  });

  const watchedBtn = overlay.querySelector('#_btn-watched');
  watchedBtn.addEventListener('click', () => {
    const now = Storage.toggleWatched(movie.imdbId);
    watchedBtn.textContent = now ? '✓ Viděno' : '○ Neviděno';
    watchedBtn.className   = `btn ${now ? 'btn--success' : 'btn--ghost'}`;
    document.dispatchEvent(new CustomEvent('favorites-changed'));
  });

  overlay.querySelector('#_btn-trailer').addEventListener('click', async () => {
    const btn = overlay.querySelector('#_btn-trailer');
    btn.textContent = '⏳...'; btn.disabled = true;
    try {
      const videos = await API.getMovieVideos(movie.id);
      const ytT = videos.find(v => v.site === 'YouTube' && v.type === 'Trailer') || videos.find(v => v.site === 'YouTube');
      const vim = videos.find(v => v.site === 'Vimeo' && v.type === 'Trailer') || videos.find(v => v.site === 'Vimeo');
      const videoKey = ytT?.key || vim?.key;
      const isYT = !!ytT;

      if (videoKey) {
        if (isYT) {
          // YouTube: thumbnail overlay + popup (embeds blocked by Error 153 on most trailers)
          const tOverlay = document.createElement('div');
          tOverlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.92);z-index:2000;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:24px;cursor:pointer';
          const iW = Math.min(640, window.innerWidth - 48);
          const iH = Math.round(iW * 9/16);
          const thumb = `https://img.youtube.com/vi/${videoKey}/maxresdefault.jpg`;
          tOverlay.innerHTML = `
            <div style="color:#fff;font-size:15px;font-weight:700;max-width:${iW}px;width:100%">${escHtml(movie.title)} — Trailer</div>
            <div style="position:relative;width:${iW}px;height:${iH}px;border-radius:12px;overflow:hidden;cursor:pointer" id="_yt-detail-box">
              <img src="${thumb}" style="width:100%;height:100%;object-fit:cover;display:block"
                onerror="this.src='https://img.youtube.com/vi/${videoKey}/mqdefault.jpg'">
              <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.25)">
                <div style="width:72px;height:72px;border-radius:50%;background:rgba(255,0,0,.92);display:flex;align-items:center;justify-content:center;box-shadow:0 6px 32px rgba(0,0,0,.6)">
                  <svg viewBox="0 0 24 24" width="30" height="30" fill="#fff"><polygon points="9,7 19,12 9,17"/></svg>
                </div>
              </div>
            </div>
            <div style="color:rgba(255,255,255,.5);font-size:12px">Klikni na náhled pro otevření na YouTube</div>
            <button style="color:rgba(255,255,255,.6);font-size:13px;padding:8px 20px;border-radius:8px;background:rgba(255,255,255,.08);border:none;cursor:pointer">✕ Zavřít</button>`;
          tOverlay.querySelector('#_yt-detail-box').addEventListener('click', e => {
            e.stopPropagation();
            const pw = Math.min(960, screen.width - 40), ph = Math.round(pw * 9/16) + 30;
            const pl = Math.round((screen.width - pw) / 2), pt = Math.round((screen.height - ph) / 2);
            window.open(`https://www.youtube.com/watch?v=${videoKey}`,
              'yt_trailer', `width=${pw},height=${ph},left=${pl},top=${pt},resizable=yes`);
          });
          tOverlay.querySelector('button').onclick = () => tOverlay.remove();
          tOverlay.addEventListener('click', e => { if (e.target === tOverlay) tOverlay.remove(); });
          document.body.appendChild(tOverlay);
        } else {
          // Vimeo: full inline iframe
          const tOverlay = document.createElement('div');
          tOverlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.92);z-index:2000;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px';
          const iW = Math.min(860, window.innerWidth - 32);
          const iH = Math.round(iW * 9 / 16);
          tOverlay.innerHTML = `
            <div style="color:#fff;font-size:15px;font-weight:700;max-width:${iW}px;width:100%;padding:0 8px">${escHtml(movie.title)}</div>
            <iframe src="https://player.vimeo.com/video/${videoKey}?autoplay=1&badge=0&byline=0&title=0"
              allow="autoplay;fullscreen;picture-in-picture" allowfullscreen frameborder="0"
              style="width:${iW}px;height:${iH}px;border-radius:10px;display:block;border:none"></iframe>
            <button style="color:rgba(255,255,255,.6);font-size:13px;padding:8px 20px;border-radius:8px;background:rgba(255,255,255,.08);border:none;cursor:pointer">✕ Zavřít</button>`;
          tOverlay.querySelector('button').onclick = () => tOverlay.remove();
          tOverlay.addEventListener('click', e => { if (e.target === tOverlay) tOverlay.remove(); });
          document.body.appendChild(tOverlay);
        }
      } else {
        // No video found — show backdrop gallery or message
        const images = await API.getMovieImages(movie.id).catch(() => []);
        if (images.length) {
          const tOverlay = document.createElement('div');
          tOverlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.92);z-index:2000;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:24px';
          let imgIdx = 0;
          const show6 = images.slice(0, 6);
          tOverlay.innerHTML = `
            <div style="color:#fff;font-size:15px;font-weight:700">${escHtml(movie.title)} — záběry z filmu</div>
            <img id="_trl-img" src="${show6[0]}" style="max-width:100%;max-height:60vh;border-radius:10px;object-fit:contain;transition:opacity .3s">
            <div style="display:flex;gap:6px">${show6.map((_,i)=>`<span class="_trl-dot" style="width:8px;height:8px;border-radius:50%;background:rgba(255,255,255,${i===0?'.9':'.3'});cursor:pointer;transition:background .2s"></span>`).join('')}</div>
            <button style="color:rgba(255,255,255,.6);font-size:13px;padding:8px 20px;border-radius:8px;background:rgba(255,255,255,.08);border:none;cursor:pointer">✕ Zavřít</button>`;
          const tImg = tOverlay.querySelector('#_trl-img');
          const tDots = [...tOverlay.querySelectorAll('._trl-dot')];
          const goTo = (i) => {
            imgIdx = i; tImg.style.opacity='0';
            setTimeout(() => { tImg.src = show6[i]; tImg.style.opacity='1'; }, 200);
            tDots.forEach((d,j) => d.style.background = j===i?'rgba(255,255,255,.9)':'rgba(255,255,255,.3)');
          };
          tDots.forEach((d,i) => d.addEventListener('click', () => goTo(i)));
          tOverlay.querySelector('button').onclick = () => tOverlay.remove();
          tOverlay.addEventListener('click', e => { if (e.target === tOverlay) tOverlay.remove(); });
          document.body.appendChild(tOverlay);
        } else {
          showToast('🎬 Trailer není k dispozici pro tento film');
        }
      }
    } catch { showToast('Nepodařilo se načíst trailer'); }
    finally { btn.textContent = '▶ Trailer'; btn.disabled = false; }
  });

  overlay.querySelector('#_btn-watch')?.addEventListener('click', () => {
    const name = movie.originalTitle || movie.title;
    window.open('https://movies2watch.biz/search/' + encodeURIComponent(name), '_blank');
  });

  const similarBtn = overlay.querySelector('#_btn-similar');
  let _simPage = 1, _simLoading = false, _simHasMore = true, _simMovies = [];
  const _renderSimilarGrid = (section) => {
    const grid = section.querySelector('#_sim-grid');
    if (!grid) return;
    const frag = document.createDocumentFragment();
    _simMovies.forEach((s, i) => {
      if (i < (_simPage - 1) * 12) return; // already rendered
      const w = document.createElement('div');
      w.innerHTML = movieCard(s);
      frag.appendChild(w.firstElementChild);
    });
    grid.appendChild(frag);
    attachCardEvents(grid);
  };

  const _loadMoreSimilar = async (section) => {
    if (_simLoading || !_simHasMore) return;
    _simLoading = true;
    const sentinel = section.querySelector('#_sim-sentinel');
    if (sentinel) sentinel.innerHTML = '<div class="spinner" style="width:24px;height:24px;margin:8px auto;border-width:2px"></div>';
    try {
      // Pages 1 and 2 from recommendations+similar, page 3+ via discover with same genres
      let batch = [];
      if (_simPage <= 2) {
        batch = await API.getSmartSimilar(movie.id, movie.genreIds || []);
        _simHasMore = false; // getSmartSimilar returns full list in one shot
        const seen = new Set(_simMovies.map(m => m.imdbId));
        batch = batch.filter(m => !seen.has(m.imdbId));
      }
      _simMovies = [..._simMovies, ...batch];
      _simPage++;
      const grid = section.querySelector('#_sim-grid');
      if (grid) {
        batch.forEach(s => {
          const w = document.createElement('div');
          w.innerHTML = movieCard(s);
          if (w.firstElementChild) grid.appendChild(w.firstElementChild);
        });
        attachCardEvents(grid);
      }
    } catch {}
    _simLoading = false;
    if (sentinel) sentinel.innerHTML = _simHasMore ? '' : '';
    if (!_simHasMore && sentinel) sentinel.remove();
  };

  similarBtn.addEventListener('click', async () => {
    const existingSection = overlay.querySelector('#_similar-section');
    if (existingSection) {
      existingSection.remove();
      similarBtn.textContent = '✨ Podobné';
      _simPage = 1; _simLoading = false; _simHasMore = true; _simMovies = [];
      return;
    }
    similarBtn.textContent = '⏳...'; similarBtn.disabled = true;
    try {
      const section = document.createElement('div');
      section.id = '_similar-section'; section.className = 'detail-section';
      section.style.paddingBottom = '20px';
      section.innerHTML = `<h3>Podobné filmy</h3>
        <div id="_sim-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:14px 12px;padding:6px 0 4px"></div>
        <div id="_sim-sentinel" style="height:32px;margin-top:4px"></div>`;
      overlay.querySelector('.detail-body').appendChild(section);
      await _loadMoreSimilar(section);
      // Observe sentinel for scroll-based loading
      const sentinel = section.querySelector('#_sim-sentinel');
      if (sentinel) {
        const modalBody = overlay.querySelector('.modal-body');
        const obs = new IntersectionObserver(entries => {
          if (entries[0].isIntersecting) _loadMoreSimilar(section);
        }, { root: modalBody, rootMargin: '80px' });
        obs.observe(sentinel);
        section._simObs = obs;
      }
      similarBtn.textContent = '✨ Skrýt';
    } catch (err) { showToast('Nepodařilo se načíst podobné filmy'); }
    finally { similarBtn.disabled = false; }
  });

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

  overlay.querySelector('#_save-comment').addEventListener('click', () => {
    Storage.setComment(movie.imdbId, overlay.querySelector('#_comment').value);
    showToast('💾 Poznámka uložena');
  });

  // Seriály: načti sezóny a epizody do vyhrazené sekce
  if (movie.mediaType === 'tv') {
    initSeriesEpisodes(overlay, movie).catch(() => {});
  }

  // Galerie záběrů je endpoint /movie/* — pro seriály ji přeskočíme
  if (movie.mediaType !== 'tv') try {
    const images = await API.getMovieImages(movie.id);
    if (images.length) {
      const section  = overlay.querySelector('#_gallery-section');
      const gallery  = overlay.querySelector('#_gallery');
      const galLeft  = overlay.querySelector('#_gal-left');
      const galRight = overlay.querySelector('#_gal-right');
      section.style.display = '';
      gallery.innerHTML = images.map(url =>
        `<img class="gallery__img" src="${url}" alt="záběr" loading="lazy" data-full="${url.replace('w780','w1280')}" style="cursor:zoom-in">`
      ).join('');
      gallery.addEventListener('click', e => {
        const img = e.target.closest('.gallery__img');
        if (!img) return;
        const lb = document.createElement('div');
        lb.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.95);z-index:9999;display:flex;align-items:center;justify-content:center;cursor:pointer';
        const lbImg = document.createElement('img');
        lbImg.src = img.dataset.full;
        lbImg.style.cssText = 'max-width:88vw;max-height:88vh;border-radius:6px;object-fit:contain';
        lb.appendChild(lbImg); lb.addEventListener('click', () => lb.remove()); document.body.appendChild(lb);
      });
      const updateGalArrows = () => {
        galLeft.style.display  = gallery.scrollLeft > 2 ? 'flex' : 'none';
        galRight.style.display = gallery.scrollLeft < gallery.scrollWidth - gallery.clientWidth - 2 ? 'flex' : 'none';
      };
      galLeft.addEventListener('click',  () => gallery.scrollBy({ left: -300, behavior: 'smooth' }));
      galRight.addEventListener('click', () => gallery.scrollBy({ left:  300, behavior: 'smooth' }));
      gallery.addEventListener('scroll', updateGalArrows, { passive: true });
      await Promise.allSettled([...gallery.querySelectorAll('img')].map(img => new Promise(res => { if (img.complete) res(); else { img.onload = res; img.onerror = res; } })));
      updateGalArrows();
    }
  } catch {}
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

  const totalEpisodes = tv.numberOfEpisodes || tv.seasons.reduce((a, s) => a + s.episodeCount, 0);
  const epCache = {};  // seasonNumber -> [episode objektů]
  const epNums  = {};  // seasonNumber -> [čísla epizod]
  let current = tv.seasons[0].seasonNumber;

  const seasonByNum = (n) => tv.seasons.find(s => s.seasonNumber === n);

  const refreshTopProgress = () => {
    const w = Storage.getWatchedEpisodeCount(tvId);
    progEl.style.width = (totalEpisodes ? Math.round(w / totalEpisodes * 100) : 0) + '%';
    progLabel.textContent = `${w}/${totalEpisodes} epizod`;
  };
  // Provázání: celý seriál je „Viděno", právě když jsou shlédnuté všechny epizody
  const syncSeriesWatched = () => {
    const w = Storage.getWatchedEpisodeCount(tvId);
    Storage.setWatched(tvId, totalEpisodes > 0 && w >= totalEpisodes);
    if (watchedBtn) {
      const on = Storage.isWatched(tvId);
      watchedBtn.textContent = on ? '✓ Viděno' : '○ Neviděno';
      watchedBtn.className    = `btn ${on ? 'btn--success' : 'btn--ghost'}`;
    }
    document.dispatchEvent(new CustomEvent('favorites-changed'));
  };

  const updateMarkBtn = () => {
    const nums = epNums[current] || [];
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
    const wc = epNums[current] ? Storage.getSeasonWatchedCount(tvId, current, epNums[current]) : 0;
    const summary = `<div class="ep-season-summary">Shlédnuto <b>${wc}</b>/${eps.length}${s && s.airDate ? ` · ${s.airDate.substring(0, 4)}` : ''}</div>`;
    listEl.innerHTML = summary + '<div class="tv-episode-list">' + eps.map(ep => {
      const w = Storage.isEpisodeWatched(tvId, current, ep.episodeNumber);
      const date = ep.airDate ? new Date(ep.airDate).toLocaleDateString('cs-CZ') : '';
      return `
      <div class="tv-episode ${w ? 'tv-episode--watched' : ''}">
        <button class="tv-ep-check ${w ? 'tv-ep-check--on' : ''}" data-ep="${ep.episodeNumber}" title="Označit jako shlédnuté">${w ? '✓' : '○'}</button>
        <div class="tv-ep-thumb ${ep.stillUrl ? '' : 'tv-ep-thumb--empty'}">${ep.stillUrl ? `<img src="${ep.stillUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:6px" loading="lazy">` : '📺'}</div>
        <div class="tv-ep-info">
          <div class="tv-ep-num">${current}×${String(ep.episodeNumber).padStart(2, '0')}${date ? ` · ${date}` : ''}</div>
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
      try { const eps = await API.getSeasonDetails(movie.id, n); epCache[n] = eps; epNums[n] = eps.map(x => x.episodeNumber); }
      catch { epCache[n] = []; epNums[n] = []; }
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
    const nums = epNums[current] || [];
    const turnOn = !Storage.isSeasonWatched(tvId, current, nums);
    Storage.setSeasonWatched(tvId, current, nums, turnOn);
    renderEpisodes(); updateMarkBtn();
    refreshTopProgress(); syncSeriesWatched();
  });

  // Klik na jednotlivou epizodu (delegace)
  listEl.addEventListener('click', (e) => {
    const chk = e.target.closest('.tv-ep-check');
    if (!chk) return;
    const epNum = +chk.dataset.ep;
    const now = Storage.toggleEpisodeWatched(tvId, current, epNum);
    chk.classList.toggle('tv-ep-check--on', now);
    chk.textContent = now ? '✓' : '○';
    chk.closest('.tv-episode')?.classList.toggle('tv-episode--watched', now);
    const sum = listEl.querySelector('.ep-season-summary b');
    if (sum && epNums[current]) sum.textContent = Storage.getSeasonWatchedCount(tvId, current, epNums[current]);
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
          try {
            const eps = await API.getSeasonDetails(movie.id, s.seasonNumber);
            epCache[s.seasonNumber] = eps; epNums[s.seasonNumber] = eps.map(x => x.episodeNumber);
          } catch {
            epNums[s.seasonNumber] = Array.from({ length: s.episodeCount }, (_, i) => i + 1);
          }
        }
        Storage.setSeasonWatched(tvId, s.seasonNumber, epNums[s.seasonNumber], turnOn);
      }
      Storage.setWatched(tvId, turnOn);
      watchedBtn.disabled = false;
      renderEpisodes(); updateMarkBtn();
      refreshTopProgress(); syncSeriesWatched();
    });
  }

  // Výchozí: první série
  refreshTopProgress();
  seasonSel.value = String(current);
  await loadSeason(current);
}

// ── Sync Modal ──────────────────────────────────────────────────────────────
function showSyncModal() {
  const overlay = showModal(`
    <div style="padding:4px 0">
      <div style="display:flex;gap:8px;margin-bottom:18px" id="_sync-tabs">
        <button class="btn btn--primary btn--sm" id="_tab-export" style="flex:1">📤 Exportovat</button>
        <button class="btn btn--ghost btn--sm" id="_tab-import" style="flex:1">📥 Importovat</button>
      </div>

      <div id="_sync-export">
        <p style="color:var(--text2);font-size:13px;margin-bottom:14px;line-height:1.5">
          Vygeneruj kód na <strong>tomto zařízení</strong> a vlož ho na druhém.
          Kód obsahuje oblíbené, hodnocení, komentáře a kolekce (ne API token).
        </p>
        <button class="btn btn--primary" id="_gen-code" style="width:100%;justify-content:center">🔄 Vygenerovat kód</button>
        <div id="_export-result" style="display:none;margin-top:14px">
          <textarea id="_export-code" readonly style="width:100%;height:90px;font-size:11px;font-family:monospace;word-break:break-all;resize:none;border-radius:8px;padding:10px;background:var(--surface2);border:1px solid var(--border);color:var(--text)"></textarea>
          <div style="display:flex;gap:8px;margin-top:8px">
            <button class="btn btn--primary btn--sm" id="_copy-code" style="flex:1">📋 Kopírovat</button>
            <button class="btn btn--ghost btn--sm" id="_show-qr" style="flex:1">📱 QR kód</button>
          </div>
          <canvas id="_qr-canvas" style="display:none;margin:12px auto 0;border-radius:8px;background:#fff;padding:10px;max-width:200px;width:100%"></canvas>
          <p id="_qr-note" style="display:none;font-size:11px;color:var(--text3);text-align:center;margin-top:6px">Namiř kamerou mobilu na QR kód</p>
        </div>
      </div>

      <div id="_sync-import" style="display:none">
        <p style="color:var(--text2);font-size:13px;margin-bottom:14px;line-height:1.5">
          Vlož kód vygenerovaný na druhém zařízení. Data se <strong>sloučí</strong> — nic se nesmaže.
        </p>
        <textarea id="_import-code" placeholder="Vlož kód sem..." style="width:100%;height:90px;font-size:11px;font-family:monospace;resize:none;border-radius:8px;padding:10px;background:var(--surface2);border:1px solid var(--border);color:var(--text);margin-bottom:10px"></textarea>
        <button class="btn btn--primary" id="_do-import" style="width:100%;justify-content:center">📥 Importovat data</button>
        <div id="_import-status" style="margin-top:10px;font-size:13px;text-align:center;display:none"></div>
      </div>
    </div>
  `, { title: '🔄 Synchronizace zařízení' });

  // Tab switching
  const tabExport = overlay.querySelector('#_tab-export');
  const tabImport = overlay.querySelector('#_tab-import');
  const paneExport = overlay.querySelector('#_sync-export');
  const paneImport = overlay.querySelector('#_sync-import');

  const switchTab = (isExport) => {
    tabExport.className = `btn btn--sm ${isExport ? 'btn--primary' : 'btn--ghost'}`;
    tabImport.className = `btn btn--sm ${!isExport ? 'btn--primary' : 'btn--ghost'}`;
    paneExport.style.display = isExport ? '' : 'none';
    paneImport.style.display = isExport ? 'none' : '';
  };
  tabExport.addEventListener('click', () => switchTab(true));
  tabImport.addEventListener('click', () => switchTab(false));

  // Export
  overlay.querySelector('#_gen-code').addEventListener('click', () => {
    const code = Storage.exportAllData();
    const result = overlay.querySelector('#_export-result');
    overlay.querySelector('#_export-code').value = code;
    result.style.display = '';
    // Save last export timestamp
    localStorage.setItem('wm_last_export', new Date().toISOString());
  });

  overlay.querySelector('#_copy-code').addEventListener('click', () => {
    const code = overlay.querySelector('#_export-code').value;
    navigator.clipboard?.writeText(code).then(() => showToast('📋 Kód zkopírován!')).catch(() => {
      overlay.querySelector('#_export-code').select();
      document.execCommand('copy');
      showToast('📋 Kód zkopírován!');
    });
  });

  overlay.querySelector('#_show-qr').addEventListener('click', async () => {
    const canvas = overlay.querySelector('#_qr-canvas');
    const note = overlay.querySelector('#_qr-note');
    if (canvas.style.display !== 'none') { canvas.style.display = 'none'; note.style.display = 'none'; return; }
    const code = overlay.querySelector('#_export-code').value;
    // QR via free API — no dependencies needed
    const url = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(code)}`;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      canvas.width = img.width; canvas.height = img.height;
      canvas.getContext('2d').drawImage(img, 0, 0);
      canvas.style.display = 'block';
      note.style.display = 'block';
    };
    img.onerror = () => {
      // Fallback: just show URL link
      note.textContent = 'QR se nepodařilo načíst — zkopíruj kód ručně.';
      note.style.display = 'block';
    };
    img.src = url;
  });

  // Import
  overlay.querySelector('#_do-import').addEventListener('click', () => {
    const code = overlay.querySelector('#_import-code').value.trim();
    const status = overlay.querySelector('#_import-status');
    if (!code) { status.style.display = ''; status.textContent = '⚠️ Vlož kód nejdřív.'; return; }
    const ok = Storage.importAllData(code);
    status.style.display = '';
    if (ok) {
      status.innerHTML = '✅ Data úspěšně importována! <br><small style="color:var(--text3)">Stránka se za 2s obnoví.</small>';
      setTimeout(() => { overlay.remove(); location.reload(); }, 2000);
    } else {
      status.textContent = '❌ Neplatný kód, zkus znovu.';
    }
  });
}
