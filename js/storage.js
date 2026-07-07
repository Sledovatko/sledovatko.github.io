// ═══════════════════════════════════════════════════════════════════════════════
//  storage.js — localStorage wrapper
// ═══════════════════════════════════════════════════════════════════════════════

const Storage = (() => {
  const K = {
    FAVORITES: 'wm_favorites',
    WATCHED: 'wm_watched',
    RATINGS: 'wm_ratings',
    COMMENTS: 'wm_comments',
    LABELS: 'wm_labels',
    ORDER: 'wm_order',
    THEME: 'wm_theme',
    HISTORY: 'wm_search_history',
    SAVED_SEARCHES: 'wm_saved_searches',
    COLLAPSED: 'wm_collapsed',
    TOKEN: 'wm_api_token',
    EPISODES: 'wm_watched_episodes',
  };

  const epCode = (s, e) => `s${s}e${e}`;

  const get = (key, def = null) => {
    try { const v = localStorage.getItem(key); return v !== null ? JSON.parse(v) : def; }
    catch { return def; }
  };
  const set = (key, val) => { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} };

  return {
    // ── Token ────────────────────────────────────────────────────────────────
    getToken() { return localStorage.getItem(K.TOKEN) || ''; },
    setToken(t) { localStorage.setItem(K.TOKEN, t); },

    // ── Témata ───────────────────────────────────────────────────────────────
    getTheme() { return get(K.THEME, 'dark'); },
    setTheme(t) { set(K.THEME, t); },

    // ── Šuplík ──────────────────────────────────────────────────────────────
    getFavorites() {
      const favs = get(K.FAVORITES, []);
      const order = get(K.ORDER, []);
      if (!order.length) return favs;
      return [...favs].sort((a, b) => {
        const ai = order.indexOf(a.imdbId), bi = order.indexOf(b.imdbId);
        if (ai === -1 && bi === -1) return 0;
        if (ai === -1) return 1; if (bi === -1) return -1;
        return ai - bi;
      });
    },
    saveFavorite(movie) {
      const favs = get(K.FAVORITES, []);
      if (!favs.find(m => m.imdbId === movie.imdbId)) {
        favs.push(movie); set(K.FAVORITES, favs);
      }
    },
    removeFavorite(imdbId) {
      const favs = get(K.FAVORITES, []).filter(m => m.imdbId !== imdbId);
      set(K.FAVORITES, favs);
    },
    isFavorite(imdbId) { return get(K.FAVORITES, []).some(m => m.imdbId === imdbId); },
    saveOrder(ids) { set(K.ORDER, ids); },

    // ── Shlédnuto ────────────────────────────────────────────────────────────
    getWatchedIds() { return new Set(get(K.WATCHED, [])); },
    isWatched(imdbId) { return get(K.WATCHED, []).includes(imdbId); },
    toggleWatched(imdbId) {
      const w = get(K.WATCHED, []);
      const idx = w.indexOf(imdbId);
      if (idx >= 0) w.splice(idx, 1); else w.push(imdbId);
      set(K.WATCHED, w);
      return idx < 0; // returns new state
    },
    // Vynutí konkrétní stav (používá provázaná logika seriál ↔ epizody)
    setWatched(imdbId, state) {
      const w = get(K.WATCHED, []);
      const idx = w.indexOf(imdbId);
      if (state && idx < 0) w.push(imdbId);
      else if (!state && idx >= 0) w.splice(idx, 1);
      set(K.WATCHED, w);
    },

    // ── Shlédnuté epizody seriálů ─────────────────────────────────────────────
    // Uloženo jako { [tvId]: ["s1e1", "s1e2", ...] }
    getWatchedEpisodes(tvId) {
      const all = get(K.EPISODES, {});
      return new Set(all[tvId] || []);
    },
    isEpisodeWatched(tvId, season, ep) {
      return this.getWatchedEpisodes(tvId).has(epCode(season, ep));
    },
    toggleEpisodeWatched(tvId, season, ep) {
      const all = get(K.EPISODES, {});
      const list = new Set(all[tvId] || []);
      const code = epCode(season, ep);
      let nowWatched;
      if (list.has(code)) { list.delete(code); nowWatched = false; }
      else { list.add(code); nowWatched = true; }
      all[tvId] = [...list];
      if (!all[tvId].length) delete all[tvId];
      set(K.EPISODES, all);
      return nowWatched;
    },
    // Hromadně označí/odznačí všechny epizody sezóny
    setSeasonWatched(tvId, season, episodeNumbers, watched) {
      const all = get(K.EPISODES, {});
      const list = new Set(all[tvId] || []);
      for (const e of episodeNumbers) {
        const code = epCode(season, e);
        if (watched) list.add(code); else list.delete(code);
      }
      all[tvId] = [...list];
      if (!all[tvId].length) delete all[tvId];
      set(K.EPISODES, all);
    },
    // Kolik epizod sezóny je shlédnutých
    getSeasonWatchedCount(tvId, season, episodeNumbers) {
      const list = this.getWatchedEpisodes(tvId);
      return episodeNumbers.filter(e => list.has(epCode(season, e))).length;
    },
    isSeasonWatched(tvId, season, episodeNumbers) {
      if (!episodeNumbers.length) return false;
      return this.getSeasonWatchedCount(tvId, season, episodeNumbers) === episodeNumbers.length;
    },
    // Celkový počet shlédnutých epizod seriálu
    getWatchedEpisodeCount(tvId) {
      return this.getWatchedEpisodes(tvId).size;
    },

    // ── Hodnocení ─────────────────────────────────────────────────────────────
    getRating(imdbId) { return get(K.RATINGS, {})[imdbId] || null; },
    setRating(imdbId, rating) {
      const r = get(K.RATINGS, {}); r[imdbId] = rating; set(K.RATINGS, r);
    },
    clearRating(imdbId) {
      const r = get(K.RATINGS, {}); delete r[imdbId]; set(K.RATINGS, r);
    },
    getAllRatings() { return get(K.RATINGS, {}); },

    // ── Komentáře ─────────────────────────────────────────────────────────────
    getComment(imdbId) { return get(K.COMMENTS, {})[imdbId] || ''; },
    setComment(imdbId, comment) {
      const c = get(K.COMMENTS, {});
      if (comment.trim()) c[imdbId] = comment.trim(); else delete c[imdbId];
      set(K.COMMENTS, c);
    },

    // ── Štítky ────────────────────────────────────────────────────────────────
    getLabels() { return get(K.LABELS, {}); },
    setLabel(imdbId, color) {
      const l = get(K.LABELS, {});
      if (color) l[imdbId] = color; else delete l[imdbId];
      set(K.LABELS, l);
    },

    // ── Historie hledání ──────────────────────────────────────────────────────
    getHistory() { return get(K.HISTORY, []); },
    addToHistory(q) {
      let h = get(K.HISTORY, []).filter(x => x !== q);
      h.unshift(q); if (h.length > 5) h = h.slice(0, 5);
      set(K.HISTORY, h);
    },
    clearHistory() { set(K.HISTORY, []); },

    // ── Uložená hledání ───────────────────────────────────────────────────────
    getSavedSearches() { return get(K.SAVED_SEARCHES, []); },
    toggleSavedSearch(q) {
      const s = get(K.SAVED_SEARCHES, []);
      const idx = s.indexOf(q);
      if (idx >= 0) s.splice(idx, 1); else s.push(q);
      set(K.SAVED_SEARCHES, s);
    },
    isSavedSearch(q) { return get(K.SAVED_SEARCHES, []).includes(q); },

    // ── Sbalené kategorie ─────────────────────────────────────────────────────
    getCollapsed() { return new Set(get(K.COLLAPSED, [])); },
    toggleCollapsed(cat) {
      const c = get(K.COLLAPSED, []);
      const idx = c.indexOf(cat);
      if (idx >= 0) c.splice(idx, 1); else c.push(cat);
      set(K.COLLAPSED, c);
    },

    // ── Statistiky ────────────────────────────────────────────────────────────
    getStats() {
      const favs = this.getFavorites();
      const watched = this.getWatchedIds();
      const ratings = this.getAllRatings();
      const ratingVals = Object.values(ratings);
      const avgRating = ratingVals.length
        ? ratingVals.reduce((a, b) => a + b, 0) / ratingVals.length : 0;
      const years = favs.map(m => parseInt(m.year)).filter(Boolean);
      const avgYear = years.length ? Math.round(years.reduce((a, b) => a + b, 0) / years.length) : 0;
      const genreCounts = {};
      for (const m of favs) for (const g of m.genreIds) genreCounts[g] = (genreCounts[g] || 0) + 1;
      const topGenreId = Object.keys(genreCounts).sort((a, b) => genreCounts[b] - genreCounts[a])[0];
      return {
        total: favs.length,
        watched: [...watched].filter(id => favs.find(m => m.imdbId === id)).length,
        notWatched: favs.filter(m => !watched.has(m.imdbId)).length,
        avgRating, avgYear, topGenreId: topGenreId ? parseInt(topGenreId) : null,
      };
    },

    // ── Sdílení ───────────────────────────────────────────────────────────────
    generateShareToken() {
      const favs = this.getFavorites();
      const data = favs.map(m => ({ t: m.title, y: m.year, r: m.rating, p: m.posterUrl }));
      return btoa(unescape(encodeURIComponent(JSON.stringify(data))));
    },

    // ── Synchronizace zařízení ────────────────────────────────────────────────
    exportAllData() {
      // Export all keys except API token
      const exportKeys = [K.FAVORITES, K.WATCHED, K.RATINGS, K.COMMENTS,
                          K.LABELS, K.ORDER, K.SAVED_SEARCHES, K.EPISODES];
      const data = { _v: 1, _t: Date.now() };
      for (const k of exportKeys) {
        const v = localStorage.getItem(k);
        if (v) data[k] = v; // store raw JSON strings
      }
      // Custom labels
      const cl = localStorage.getItem('wm_custom_labels');
      if (cl) data['wm_custom_labels'] = cl;
      return btoa(unescape(encodeURIComponent(JSON.stringify(data))));
    },

    importAllData(code) {
      try {
        const json = decodeURIComponent(escape(atob(code.trim())));
        const data = JSON.parse(json);
        if (!data || data._v !== 1) return false;
        const safeKeys = new Set([
          K.FAVORITES, K.WATCHED, K.RATINGS, K.COMMENTS,
          K.LABELS, K.ORDER, K.SAVED_SEARCHES, K.EPISODES, 'wm_custom_labels',
        ]);
        for (const [k, v] of Object.entries(data)) {
          if (!safeKeys.has(k)) continue; // skip _v, _t, token etc.
          // Merge arrays/objects instead of overwrite where possible
          try {
            const incoming = JSON.parse(v);
            const existing = localStorage.getItem(k);
            if (!existing) {
              localStorage.setItem(k, v);
            } else {
              const cur = JSON.parse(existing);
              if (Array.isArray(incoming) && Array.isArray(cur)) {
                // Merge arrays by imdbId for movies, or by value for primitives
                if (incoming[0]?.imdbId !== undefined) {
                  const ids = new Set(cur.map(m => m.imdbId));
                  const merged = [...cur, ...incoming.filter(m => !ids.has(m.imdbId))];
                  localStorage.setItem(k, JSON.stringify(merged));
                } else {
                  const merged = [...new Set([...cur, ...incoming])];
                  localStorage.setItem(k, JSON.stringify(merged));
                }
              } else if (typeof incoming === 'object' && !Array.isArray(incoming)) {
                localStorage.setItem(k, JSON.stringify({ ...cur, ...incoming }));
              } else {
                localStorage.setItem(k, v);
              }
            }
          } catch { localStorage.setItem(k, v); }
        }
        localStorage.setItem('wm_last_import', new Date().toISOString());
        return true;
      } catch { return false; }
    },
  };
})();

const LABEL_DEFS = {
  red:    { color: '#E53935', emoji: '🔴', label: '🔴 Urgentní' },
  yellow: { color: '#FDD835', emoji: '🟡', label: '🟡 Někdy' },
  blue:   { color: '#1E88E5', emoji: '🔵', label: '🔵 S partnerem' },
  orange: { color: '#F4511E', emoji: '🟠', label: '🟠 Akce na víkend' },
};

// FIX #27: custom label management
function getCustomLabelDefs() {
  try { return JSON.parse(localStorage.getItem('wm_custom_labels') || '{}'); } catch { return {}; }
}
function saveCustomLabelDef(key, color, name, emoji = '🏷️') {
  const defs = getCustomLabelDefs();
  defs[key] = { color, name, emoji };
  localStorage.setItem('wm_custom_labels', JSON.stringify(defs));
}
function deleteCustomLabelDef(key) {
  const defs = getCustomLabelDefs();
  delete defs[key];
  localStorage.setItem('wm_custom_labels', JSON.stringify(defs));
}

// Hide label (works for both predefined and custom — marks as hidden, does NOT wipe film assignments)
function getHiddenLabelKeys() {
  try { return new Set(JSON.parse(localStorage.getItem('wm_hidden_labels') || '[]')); } catch { return new Set(); }
}
function hideLabel(key) {
  const hidden = getHiddenLabelKeys();
  hidden.add(key);
  localStorage.setItem('wm_hidden_labels', JSON.stringify([...hidden]));
  // If it was a custom label, also remove its definition
  const defs = getCustomLabelDefs();
  if (defs[key]) { delete defs[key]; localStorage.setItem('wm_custom_labels', JSON.stringify(defs)); }
}
function getAllLabelDefs() {
  const custom = getCustomLabelDefs();
  const all = { ...LABEL_DEFS };
  for (const [k, v] of Object.entries(custom)) {
    const em = v.emoji || '🏷️';
    all[k] = { color: v.color, emoji: em, label: `${em} ${v.name}` };
  }
  return all;
}

function movieCountLabel(n) {
  if (n === 1) return '1 film';
  if (n >= 2 && n <= 4) return `${n} filmy`;
  return `${n} filmů`;
}
