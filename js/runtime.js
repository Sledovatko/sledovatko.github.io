// Card runtimes: visible titles only, a shared queue and compact reusable metadata.
// Series estimates are per episode; they are never saved as an exact series total.
function createRuntimeHydrator(deps = {}) {
  const api = deps.api || API;
  const storage = deps.storage || Storage;
  const store = deps.store || localStorage;
  const doc = deps.document || document;
  const now = deps.now || Date.now;
  const later = deps.setTimeout || setTimeout;
  const cancel = deps.clearTimeout || clearTimeout;
  const Observer = deps.IntersectionObserver || globalThis.IntersectionObserver;
  const KEY = 'wm_runtime_v1';
  const DAY = 86400000;
  const SPACING = 350;
  const CONCURRENCY = 2;
  const TIMEOUT = 15000;
  const COOLDOWN = 5 * 60000;
  const observed = new Map();
  const jobs = new Map();
  const queue = [];
  const failures = new Map();
  let generation = 0, active = 0, lastStart = -Infinity, pauseUntil = 0;
  let pumpTimer = null, saveTimer = null, paused = !!doc.hidden;
  let cache = {};

  const readJSON = key => {
    try { const value = JSON.parse(store.getItem(key) || '{}'); return value && !Array.isArray(value) && typeof value === 'object' ? value : {}; }
    catch { return {}; }
  };
  const validRecord = record => Array.isArray(record) && record.length === 3 &&
    Number.isFinite(record[0]) && ['movie', 'episode', 'missing'].includes(record[1]) &&
    Number.isFinite(record[2]) && record[2] >= 0 && record[2] <= 1440;
  cache = Object.fromEntries(Object.entries(readJSON(KEY)).filter(([key, value]) => /^(movie|tv):\d+$/.test(key) && validRecord(value)).slice(-600));

  function identity(movie) {
    const type = movie?.mediaType === 'tv' || String(movie?.imdbId || '').startsWith('tv:') ? 'tv' : 'movie';
    const id = String(movie?.id ?? movie?.imdbId ?? '').replace(/^tv:/, '');
    return /^\d+$/.test(id) && Number(id) > 0 ? { type, id: Number(id), key: type + ':' + Number(id) } : null;
  }
  function fresh(record) {
    if (!validRecord(record)) return false;
    const age = now() - record[0];
    return age >= 0 && age < (record[1] === 'movie' ? 30 * DAY : DAY);
  }
  function metadata(movie) {
    const media = identity(movie);
    if (!media) return null;
    // Respect exact runtime metadata obtained by the existing detail screen.
    const exact = readJSON('wm_media_meta')[media.key];
    if (exact?.runtime > 0 && Number.isFinite(exact.runtime) && Number.isFinite(exact.updatedAt)) {
      const age = now() - exact.updatedAt;
      if (age >= 0 && age < (media.type === 'movie' ? 30 * DAY : DAY / 2))
        return { minutes: Math.round(exact.runtime), kind: media.type === 'tv' ? 'total' : 'movie' };
    }
    const hit = cache[media.key];
    return fresh(hit) ? { minutes: hit[2], kind: hit[1] } : null;
  }
  function label(meta) {
    if (meta?.kind === 'missing') return 'Délka není uvedena';
    if (!meta?.minutes) return '';
    if (meta.kind === 'episode') return `≈ ${meta.minutes} min/díl`;
    if (meta.kind === 'total') return `${Math.round(meta.minutes / 60)} h celkem`;
    return `${Math.floor(meta.minutes / 60)}:${String(meta.minutes % 60).padStart(2, '0')}`;
  }
  function paint(card, meta) {
    if (!card?.isConnected) return;
    const el = card.querySelector('.movie-card__runtime');
    if (!el) return;
    el.textContent = meta?.kind === 'missing' ? label(meta) : meta?.minutes ? '· ' + label(meta) : '';
    el.title = meta?.kind === 'episode' ? 'Orientační délka jednoho dílu podle TMDB. Délky jednotlivých epizod se liší.' : meta?.kind === 'total' ? 'Součet délek epizod načtených v detailu seriálu.' : meta?.kind === 'movie' ? `Délka filmu: ${meta.minutes} minut` : meta?.kind === 'missing' ? 'TMDB nemá u tohoto titulu uvedenou délku.' : '';
    el.setAttribute('aria-label', meta?.kind === 'movie' ? `Délka filmu: ${meta.minutes} minut` : meta?.kind === 'episode' ? `Přibližná délka jednoho dílu: ${meta.minutes} minut` : meta?.kind === 'total' ? `Celková délka seriálu: ${meta.minutes} minut` : label(meta));
    el.dataset.runtimeState = meta?.kind === 'missing' ? 'missing' : meta?.minutes ? 'ready' : 'loading';
    if (meta?.kind === 'episode') el.dataset.runtimeEstimate = 'true';
    else delete el.dataset.runtimeEstimate;
  }
  function flush() {
    if (saveTimer !== null) { cancel(saveTimer); saveTimer = null; }
    cache = Object.fromEntries(Object.entries(cache).filter(([, value]) => fresh(value)).sort((a, b) => b[1][0] - a[1][0]).slice(0, 600));
    try { store.setItem(KEY, JSON.stringify(cache)); } catch { /* Metadata cache is optional. */ }
  }
  function remember(key, kind, minutes) {
    cache[key] = [now(), kind, minutes];
    if (saveTimer === null) saveTimer = later(flush, 500);
  }
  function liveCards(key) {
    return [...observed].filter(([card, state]) => card.isConnected && state.visible && state.key === key).map(([card]) => card);
  }
  function forgetDetached() {
    for (const [card] of observed) if (!card.isConnected) { observer?.unobserve(card); observed.delete(card); }
    for (const job of jobs.values()) if (!liveCards(job.key).length && job.controller) job.controller.abort();
  }
  function schedule(delay = 0) {
    if (pumpTimer !== null) return;
    pumpTimer = later(() => { pumpTimer = null; pump(); }, Math.max(0, delay));
  }
  function enqueue(movie) {
    const media = identity(movie);
    if (!media || !liveCards(media.key).length) return;
    const hit = metadata(movie);
    if (hit) { liveCards(media.key).forEach(card => paint(card, hit)); return; }
    if (jobs.has(media.key) || (failures.get(media.key) || 0) > now()) return;
    const job = { ...media, movie, generation, controller: null };
    jobs.set(media.key, job); queue.push(job); schedule();
  }
  function pump() {
    forgetDetached();
    if (paused || doc.hidden || active >= CONCURRENCY) return;
    const wait = Math.max(lastStart + SPACING, pauseUntil) - now();
    if (wait > 0) { if (queue.length) schedule(wait); return; }
    let job;
    while (queue.length) {
      const candidate = queue.shift();
      if (candidate.generation === generation && liveCards(candidate.key).length) { job = candidate; break; }
      if (jobs.get(candidate.key) === candidate) jobs.delete(candidate.key);
    }
    if (!job) return;
    // A cache hit may have arrived since this card entered the queue.
    const hit = metadata(job.movie);
    if (hit) { jobs.delete(job.key); liveCards(job.key).forEach(card => paint(card, hit)); schedule(); return; }
    job.controller = new AbortController();
    active++; lastStart = now();
    let timedOut = false;
    const timer = later(() => { timedOut = true; job.controller.abort(); }, TIMEOUT);
    (async () => {
      try {
        const details = await (job.type === 'tv'
          ? api.getTVDetails(job.id, { signal: job.controller.signal })
          : api.getMovieDetails(job.id, { signal: job.controller.signal }));
        if (job.controller.signal.aborted || job.generation !== generation || !liveCards(job.key).length) return;
        let minutes = 0;
        if (job.type === 'tv') {
          const times = (Array.isArray(details?.episodeRunTime) ? details.episodeRunTime : []).filter(n => Number.isFinite(n) && n > 0 && n <= 1440).sort((a, b) => a - b);
          // Median typical episode length; no season/episode requests or invented total.
          if (times.length) minutes = Math.round(times[Math.floor(times.length / 2)]);
          else if (Number.isFinite(details?.lastEpisodeRuntime) && details.lastEpisodeRuntime > 0 && details.lastEpisodeRuntime <= 1440) minutes = Math.round(details.lastEpisodeRuntime);
        } else if (Number.isFinite(details?.runtime) && details.runtime > 0 && details.runtime <= 1440) minutes = Math.round(details.runtime);
        const kind = minutes ? (job.type === 'tv' ? 'episode' : 'movie') : 'missing';
        remember(job.key, kind, minutes);
        if (minutes && job.type === 'movie') {
          // Keep library duration filtering compatible with the existing exact movie cache.
          try { storage.setMediaRuntime('movie', job.id, minutes); } catch { /* Display still works without persistent storage. */ }
        }
        liveCards(job.key).forEach(card => paint(card, metadata(job.movie) || { minutes, kind }));
      } catch (error) {
        if (timedOut || !job.controller.signal.aborted) {
          failures.set(job.key, now() + COOLDOWN);
          if (/\b429\b/.test(String(error?.message || ''))) pauseUntil = now() + 60000;
          if (job.generation === generation) {
            const hit = metadata(job.movie);
            liveCards(job.key).forEach(card => {
              if (hit) { paint(card, hit); return; }
              const el = card.querySelector('.movie-card__runtime');
              if (!el) return;
              el.textContent = 'Délka nedostupná';
              el.title = 'Délku se nepodařilo načíst. Zkus to později.';
              el.setAttribute('aria-label', 'Délka nedostupná');
              el.dataset.runtimeState = 'error'; delete el.dataset.runtimeEstimate;
            });
          }
        }
      } finally {
        cancel(timer); active--;
        if (jobs.get(job.key) === job) jobs.delete(job.key);
        // A route may have replaced an aborted request with a new card of the same title.
        if (!paused && !doc.hidden) {
          const state = [...observed.values()].find(s => s.key === job.key && s.visible);
          if (state) enqueue(state.movie);
        }
        if (queue.length) schedule();
      }
    })();
    if (queue.length) schedule(SPACING);
  }
  const observer = Observer ? new Observer(entries => {
    for (const entry of entries) {
      const state = observed.get(entry.target);
      if (!state) continue;
      state.visible = entry.isIntersecting && entry.intersectionRatio > 0;
      if (state.visible) enqueue(state.movie);
      else if (!liveCards(state.key).length) jobs.get(state.key)?.controller?.abort();
    }
  }, { root: null, rootMargin: '0px', threshold: 0.01 }) : null;

  function observe(container) {
    if (!container) return;
    forgetDetached();
    const cards = container.matches?.('.movie-card') ? [container] : [...container.querySelectorAll('.movie-card')];
    for (const card of cards) {
      if (observed.has(card)) continue;
      let movie; try { movie = JSON.parse(card.dataset.movie); } catch { continue; }
      const media = identity(movie); if (!media) continue;
      observed.set(card, { ...media, movie, visible: false });
      const hit = metadata(movie); if (hit) paint(card, hit);
      observer?.observe(card);
    }
  }
  function request(card, movie) {
    observe(card);
    const state = observed.get(card);
    // Hover is a fallback on browsers without IntersectionObserver. Never scan all cards.
    if (state) { state.visible = true; enqueue(movie || state.movie); }
    return Promise.resolve();
  }
  function reset() {
    generation++;
    observer?.disconnect(); observed.clear(); queue.length = 0;
    if (pumpTimer !== null) { cancel(pumpTimer); pumpTimer = null; }
    for (const [key, job] of jobs) {
      if (job.controller) job.controller.abort(); else jobs.delete(key);
    }
    if (saveTimer !== null) flush();
  }
  function refresh(movie) {
    const media = identity(movie), hit = metadata(movie);
    if (media && hit) for (const [card, state] of observed) if (state.key === media.key) paint(card, hit);
  }
  function visibilityChanged() {
    paused = !!doc.hidden;
    if (paused) {
      for (const job of jobs.values()) job.controller?.abort();
      if (saveTimer !== null) flush();
    } else {
      for (const state of observed.values()) if (state.visible) enqueue(state.movie);
      schedule();
    }
  }
  doc.addEventListener?.('visibilitychange', visibilityChanged);
  return { observe, request, reset, refresh, peek: metadata, label,
    destroy() { reset(); doc.removeEventListener?.('visibilitychange', visibilityChanged); },
    stats() { return { active, queued: queue.length, observed: observed.size, cached: Object.keys(cache).length }; }
  };
}

const RuntimeHydrator = createRuntimeHydrator();
