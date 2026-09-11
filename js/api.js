// ═══════════════════════════════════════════════════════════════════════════════
//  api.js — TMDB API wrapper
// ═══════════════════════════════════════════════════════════════════════════════

const API = (() => {
  const BASE = 'https://api.themoviedb.org/3';
  const IMG_BASE = 'https://image.tmdb.org/t/p';
  let _token = '';
  const _genreCache = {};
  const memoryCache = new Map();
  const boredPools = new Map();
  const CACHE_KEY = 'wm_api_cache_v1';
  // Reserve localStorage for the library. Raw image galleries can be hundreds
  // of kilobytes each and never belong in the persistent metadata cache.
  const MAX_CACHE_CHARS = 128 * 1024, MAX_ENTRY_CHARS = 24 * 1024;
  const persistentPath = path => /^\/(movie|tv)\/\d+(?:\/season\/\d+)?\?language=/.test(path);
  const cacheTTL = path => {
    if (/\/movie\/\d+\?language=/.test(path)) return 30 * 86400000;
    if (/\/tv\/\d+\/season\/\d+\?/.test(path)) return 12 * 3600000;
    if (/\/tv\/\d+\?language=/.test(path)) return 12 * 3600000;
    if (/\/(images|videos)/.test(path)) return 3 * 86400000;
    return 5 * 60000;
  };
  function compactCache(cache) {
    if (!cache || typeof cache !== 'object' || Array.isArray(cache)) return {};
    const result = {};
    let size = 2;
    const entries = Object.entries(cache).filter(([path, value]) => persistentPath(path) &&
      Number.isFinite(value?.time) && value.time <= Date.now() && Date.now() - value.time < cacheTTL(path) && value.data && typeof value.data === 'object')
      .sort((a, b) => b[1].time - a[1].time);
    for (const [path, value] of entries) {
      const entrySize = JSON.stringify(path).length + JSON.stringify(value).length + 2;
      if (entrySize > MAX_ENTRY_CHARS || size + entrySize > MAX_CACHE_CHARS) continue;
      result[path] = value; size += entrySize;
      if (Object.keys(result).length >= 40) break;
    }
    return result;
  }
  let persistentCache = {};
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw && raw.length > MAX_CACHE_CHARS) localStorage.removeItem(CACHE_KEY);
    else if (raw) {
      persistentCache = compactCache(JSON.parse(raw));
      const compact = JSON.stringify(persistentCache);
      if (compact !== raw) {
        if (Object.keys(persistentCache).length) localStorage.setItem(CACHE_KEY, compact);
        else localStorage.removeItem(CACHE_KEY);
      }
    }
  } catch {}
  const readCache = (path, ttl) => {
    if (!ttl) return null;
    const hit = persistentCache[path];
    return hit && Date.now() - hit.time < ttl ? hit.data : null;
  };
  const writeCache = (path, data, ttl) => {
    if (!ttl || !persistentPath(path)) return;
    persistentCache[path] = { time: Date.now(), data };
    persistentCache = compactCache(persistentCache);
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(persistentCache));
    } catch { try { localStorage.removeItem(CACHE_KEY); } catch {} }
  };

  const headers = () => ({
    'Authorization': `Bearer ${_token}`,
    'Content-Type': 'application/json',
  });

  const get = async (path, { signal } = {}) => {
    const ttl = cacheTTL(path);
    const hit = memoryCache.get(path);
    if (hit && Date.now() - hit.time < ttl) return hit.data;
    const cached = readCache(path, ttl);
    if (cached) return cached;
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, 18000);
    try {
      const res = await fetch(BASE + path, { headers: headers(), signal: controller.signal });
      if (!res.ok) throw new Error('API ' + res.status);
      const data = await res.json();
      memoryCache.set(path, {time: Date.now(), data});
      if (memoryCache.size > 150) memoryCache.delete(memoryCache.keys().next().value);
      // Persist only detail metadata; lists/search stay in the short-lived memory cache.
      if (/^\/(movie|tv)\/\d+/.test(path)) writeCache(path, data, ttl);
      return data;
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
  };

  const poster = (path, size = 'w342') => path ? `${IMG_BASE}/${size}${path}` : '';
  const backdrop = (path, size = 'w780') => path ? `${IMG_BASE}/${size}${path}` : '';
  const still = (path, size = 'w300') => path ? `${IMG_BASE}/${size}${path}` : '';

  // A gallery and a hover preview share one selection, including concurrent opens.
  // Store only public image paths, never decoded pixels or full image responses.
  const IMAGE_SELECTION_KEY = 'wm_image_selection_v1';
  const imageSelections = new Map();
  const imagesInFlight = new Map();
  const validImagePath = path => typeof path === 'string' && path.length <= 200 && /^\/[A-Za-z0-9_-]+\.(jpe?g|png|webp)$/i.test(path);
  try {
    const raw = localStorage.getItem(IMAGE_SELECTION_KEY) || '[]';
    if (raw.length > 64 * 1024) localStorage.removeItem(IMAGE_SELECTION_KEY);
    const saved = raw.length <= 64 * 1024 ? JSON.parse(raw) : [];
    if (Array.isArray(saved)) saved.slice(0, 50).reverse().forEach(entry => {
      if (!Array.isArray(entry) || entry.length !== 2) return;
      const [key, value] = entry;
      if (/^(movie|tv):\d+$/.test(key) && Number.isFinite(value?.expires) &&
          value.expires > Date.now() && value.expires <= Date.now() + 3 * 86400000 &&
          Array.isArray(value.paths) && value.paths.length <= 8 && value.paths.every(validImagePath)) {
        imageSelections.set(key, value);
      }
    });
  } catch {}
  function getSelectedImages(type, id) {
    const key = `${type}:${id}`;
    if (!/^(movie|tv):\d+$/.test(key)) return Promise.resolve([]);
    const hit = imageSelections.get(key);
    if (hit?.expires > Date.now()) return Promise.resolve(hit.paths.map(path => backdrop(path)));
    if (imagesInFlight.has(key)) return imagesInFlight.get(key);
    const pending = (async () => {
      const data = await get(`/${type}/${id}/images`);
      const selected = await ImageSelection.select(data.backdrops || []);
      const paths = [...new Set(selected.paths.filter(validImagePath))].slice(0, 8);
      const ttl = selected.verified && paths.length ? 3 * 86400000 : 5 * 60000;
      imageSelections.delete(key);
      imageSelections.set(key, { paths, expires: Date.now() + ttl });
      while (imageSelections.size > 50) imageSelections.delete(imageSelections.keys().next().value);
      try {
        const live = [...imageSelections].filter(([, value]) => value.expires > Date.now()).reverse();
        while (live.length && JSON.stringify(live).length > 64 * 1024) live.pop();
        localStorage.setItem(IMAGE_SELECTION_KEY, JSON.stringify(live));
      } catch {}
      return paths.map(path => backdrop(path));
    })().finally(() => imagesInFlight.delete(key));
    imagesInFlight.set(key, pending);
    return pending;
  }

  const parseMovie = (j, mediaType = 'movie') => {
    const release = j.release_date || j.first_air_date || '';
    const votes = j.vote_count || 0;
    return {
      id: j.id,
      title: j.title || j.name || 'Neznámý název',
      originalTitle: j.original_title || j.original_name || j.title || j.name || '',
      year: release.length >= 4 ? release.substring(0, 4) : '',
      imdbId: mediaType === 'tv' ? 'tv:' + j.id : String(j.id),
      posterUrl: poster(j.poster_path),
      backdropUrl: backdrop(j.backdrop_path),
      rating: votes >= 10 ? (j.vote_average || 0) : 0,
      vote_count: votes,
      overview: j.overview || '',
      genreIds: j.genre_ids || [],
      releaseDate: release,
      mediaType,
    };
  };

  const fetchPage = async (endpoint, page = 1) => {
    const sep = endpoint.includes('?') ? '&' : '?';
    const data = await get(endpoint + sep + 'language=cs-CZ&page=' + page);
    const type = /^(\/tv\/|\/discover\/tv|\/trending\/tv)/.test(endpoint) ? 'tv' : 'movie';
    return (data.results || []).map(j => parseMovie(j, type));
  };

  const fetchMultiPage = async (endpoint, pages = 3) => {
    const promises = Array.from({ length: pages }, (_, i) => fetchPage(endpoint, i + 1));
    const results = await Promise.all(promises);
    return [...new Map(results.flat().map(m => [m.imdbId, m])).values()];
  };

  return {
    setToken(token) { _token = token; },
    getToken() { return _token; },

    poster, backdrop, still,

    async getHomePage(category, {mediaType='movie', genreId=null, page=1} = {}) {
      const type = mediaType === 'tv' ? 'tv' : 'movie';
      let endpoint;
      if (genreId) endpoint = `/discover/${type}?with_genres=${encodeURIComponent(genreId)}&sort_by=popularity.desc`;
      else if (type === 'tv') endpoint = {popular:'/tv/popular',rated:'/tv/top_rated',onair:'/tv/on_the_air',today:'/tv/airing_today'}[category];
      else if (category === 'upcoming') {
        const today = new Date().toISOString().slice(0,10), future = new Date();
        future.setMonth(future.getMonth()+8);
        endpoint = `/discover/movie?sort_by=popularity.desc&primary_release_date.gte=${today}&primary_release_date.lte=${future.toISOString().slice(0,10)}&vote_count.gte=0`;
      } else endpoint = {popular:'/movie/popular',nowplaying:'/movie/now_playing?region=CZ',toprated:'/movie/top_rated'}[category];
      if (!endpoint) throw new Error('Unknown home category');
      const data = await get(endpoint + (endpoint.includes('?')?'&':'?') + 'language=cs-CZ&page=' + page);
      return {items:(data.results||[]).map(j=>parseMovie(j,type)),hasMore:page<Math.min(data.total_pages||1,500)};
    },

    async getPopular()    { return fetchMultiPage('/movie/popular', 1); },
    async getNowPlaying() { return fetchMultiPage('/movie/now_playing?region=CZ', 1); },
    async getTopRated()   { return fetchMultiPage('/movie/top_rated', 1); },
    async getUpcoming() {
      const today = new Date().toISOString().substring(0, 10);
      const future = new Date(); future.setMonth(future.getMonth() + 8);
      const futureTo = future.toISOString().substring(0, 10);
      return fetchMultiPage(
        `/discover/movie?sort_by=popularity.desc&primary_release_date.gte=${today}&primary_release_date.lte=${futureTo}&vote_count.gte=0`,
        3
      );
    },
    async getTrending()   { return fetchMultiPage('/trending/movie/day', 1); },

    // ── Seriály: kategorie na domovské stránce ────────────────────────────────
    async getTVPopular()     { const r = await fetchMultiPage('/tv/popular', 2);      r.forEach(m => m.mediaType = 'tv'); return r; },
    async getTVTopRated()    { const r = await fetchMultiPage('/tv/top_rated', 2);    r.forEach(m => m.mediaType = 'tv'); return r; },
    async getTVOnAir()       { const r = await fetchMultiPage('/tv/on_the_air', 2);   r.forEach(m => m.mediaType = 'tv'); return r; },
    async getTVAiringToday() { const r = await fetchMultiPage('/tv/airing_today', 1); r.forEach(m => m.mediaType = 'tv'); return r; },

    async getDailyMovie() {
      const now = new Date();
      const seed = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
      const page = (seed % 20) + 1;
      const data = await get(`/movie/popular?language=cs-CZ&page=${page}`);
      const results = data.results || [];
      if (!results.length) return null;
      return parseMovie(results[seed % results.length]);
    },

    async getGenres(type = 'movie') {
      if (_genreCache[type]) return _genreCache[type];
      const data = await get('/genre/' + type + '/list?language=cs-CZ');
      return _genreCache[type] = data.genres || [];
    },

    async getByGenre(genreId, pages = 1, mediaType = 'movie') {
      return fetchMultiPage('/discover/' + mediaType + '?with_genres=' + genreId + '&sort_by=popularity.desc', pages);
    },

    async getOverview(id, type = 'movie') {
      let data = await get('/' + type + '/' + id + '?language=cs-CZ');
      if (!data.overview) data = await get('/' + type + '/' + id + '?language=en-US');
      return data.overview || '';
    },

    async getByDecade(decade) {
      const to = parseInt(decade) + 9;
      return fetchMultiPage(
        `/discover/movie?sort_by=popularity.desc&primary_release_date.gte=${decade}-01-01&primary_release_date.lte=${to}-12-31`,
        5
      );
    },

    async getSimilar(movieId) {
      return fetchPage(`/movie/${movieId}/similar`, 1);
    },

    // Recommendations are far better quality than /similar
    async getRecommendations(movieId) {
      return fetchPage(`/movie/${movieId}/recommendations`, 1);
    },

    // Smart similar: merge recommendations + similar, filter by shared genres, deduplicate
    async getSmartSimilar(movieId, sourceGenreIds = [], mediaType = 'movie') {
      const endpointType = mediaType === 'tv' ? 'tv' : 'movie';
      const [recs, sim] = await Promise.all([
        fetchPage(`/${endpointType}/${movieId}/recommendations`, 1).catch(() => []),
        fetchPage(`/${endpointType}/${movieId}/similar`, 1).catch(() => []),
      ]);
      if (endpointType === 'tv') [...recs, ...sim].forEach(m => { m.mediaType = 'tv'; });
      // Merge, recommendations first (higher quality)
      const seen = new Set();
      const merged = [];
      for (const m of [...recs, ...sim]) {
        if (!seen.has(m.imdbId) && m.posterUrl) { seen.add(m.imdbId); merged.push(m); }
      }
      if (!sourceGenreIds.length) return merged;
      // Sort: movies sharing most genres with source first,
      // with a small random shuffle within each tier for variety
      return merged.sort((a, b) => {
        const sa = a.genreIds.filter(g => sourceGenreIds.includes(g)).length;
        const sb = b.genreIds.filter(g => sourceGenreIds.includes(g)).length;
        if (sb !== sa) return sb - sa;
        return Math.random() - 0.5; // randomize within same-genre tier
      });
    },

    async getMovieImages(movieId) {
      return getSelectedImages('movie', movieId);
    },

    async getMovieVideos(movieId) {
      const data = await get(`/movie/${movieId}/videos?language=en-US`);
      return (data.results || []).filter(v => v.site === 'YouTube' || v.site === 'Vimeo');
    },

    async getMovieDetails(movieId, options = {}) {
      const data = await get(`/movie/${movieId}?language=cs-CZ`, options);
      return { runtime: data.runtime || 0, genreIds: Array.isArray(data.genres) ? data.genres.map(g=>g.id).filter(Number.isSafeInteger) : null };
    },

    // TV a filmy mohou mít stejné číselné ID. Proto se pro seriály musí vždy
    // používat endpoint /tv/*; jinak se např. u Futuramy načtou obrázky cizího filmu.
    async getTVImages(tvId) {
      return getSelectedImages('tv', tvId);
    },

    async getTVVideos(tvId) {
      const data = await get(`/tv/${tvId}/videos?language=en-US`);
      return (data.results || []).filter(v => v.site === 'YouTube' || v.site === 'Vimeo');
    },

    // ── Seriály: sezóny a epizody ─────────────────────────────────────────────
    // Detail seriálu se seznamem běžných sezón. "Speciály" (season_number 0)
    // se záměrně nikdy nepočítají do stavu shlédnutí celého seriálu.
    async getTVDetails(tvId, options = {}) {
      const data = await get(`/tv/${tvId}?language=cs-CZ`, options);
      const seasons = (data.seasons || [])
        .filter(s => s.season_number > 0 && (s.episode_count || 0) > 0)
        .map(s => ({
          seasonNumber: s.season_number,
          name: s.name || `Sezóna ${s.season_number}`,
          overview: s.overview || '',
          posterUrl: poster(s.poster_path),
          episodeCount: s.episode_count || 0,
          airDate: s.air_date || '',
        }));
      return {
        id: data.id,
        name: data.name || data.original_name || '',
        numberOfSeasons: data.number_of_seasons || seasons.length,
        numberOfEpisodes: data.number_of_episodes || 0,
        episodeRunTime: data.episode_run_time || [],
        lastEpisodeRuntime: data.last_episode_to_air?.runtime || 0,
        genreIds: (data.genres || []).map(g => g.id),
        status: data.status || '',
        seasons,
      };
    },

    // Epizody jedné sezóny — s popiskem, speciálním obrázkem (still), datem a hodnocením.
    async getSeasonDetails(tvId, seasonNumber) {
      const data = await get(`/tv/${tvId}/season/${seasonNumber}?language=cs-CZ`);
      return (data.episodes || []).map(e => {
        const votes = e.vote_count || 0;
        return {
          id: e.id,
          episodeNumber: e.episode_number,
          seasonNumber: e.season_number,
          name: e.name || `Epizoda ${e.episode_number}`,
          overview: e.overview || '',
          stillUrl: still(e.still_path),
          airDate: e.air_date || '',
          rating: votes >= 3 ? (e.vote_average || 0) : 0,
          runtime: e.runtime || 0,
          isReleased: !!e.air_date && new Date(`${e.air_date}T23:59:59`) <= new Date(),
        };
      });
    },

    // One request per media type and page, with accurate pagination and cancellation.
    async searchPage(query, { yearFrom, yearTo, genreId, minRating, searchTV = false, page = 1, signal, maxRuntime, noHorror, excludedGenres = [], releasedBefore } = {}) {
      const type = searchTV ? 'tv' : 'movie';
      const params = new URLSearchParams({ language: 'cs-CZ', page: String(page), include_adult: 'false' });
      const excluded = [...new Set([...(Array.isArray(excludedGenres)?excludedGenres:[]),...(noHorror?[27]:[])].map(Number).filter(id=>Number.isSafeInteger(id)&&id>0))];
      const searching = !!query.trim();
      if (searching) params.set('query', query.trim());
      else {
        params.set('sort_by', 'popularity.desc');
        const date = searchTV ? 'first_air_date' : 'primary_release_date';
        if (yearFrom) params.set(date + '.gte', yearFrom + '-01-01');
        if (yearTo) params.set(date + '.lte', yearTo + '-12-31');
        if (genreId) params.set('with_genres', genreId);
        if (minRating) {params.set('vote_average.gte', minRating);params.set('vote_count.gte', 50);}
        if (maxRuntime) { params.set('with_runtime.gte', 1); params.set('with_runtime.lte', maxRuntime); }
        if (excluded.length) params.set('without_genres', excluded.join(','));
        if (releasedBefore && /^\d{4}-\d{2}-\d{2}$/.test(releasedBefore)) params.set(date + '.lte', releasedBefore);
      }
      const data = await get('/' + (searching ? 'search/' : 'discover/') + type + '?' + params, { signal });
      let items = (data.results || []).map(j => parseMovie(j, type));
      if (searching) items = items.filter(m => (!yearFrom || +m.year >= yearFrom) && (!yearTo || +m.year <= yearTo) && (!minRating || m.rating >= minRating) && (!genreId || m.genreIds.includes(+genreId)));
      if (excluded.length) items = items.filter(m=>!m.genreIds.some(id=>excluded.includes(id)));
      return {items, page, totalPages: Math.min(500, data.total_pages || 0), totalResults: data.total_results || 0};
    },
    async searchMovies(query, options = {}) { return (await this.searchPage(query, options)).items; },

    async getBoredMovies({ genreId, decade, count = 240, signal, onProgress } = {}) {
      const wanted = Math.max(1, Math.min(1600, Math.ceil(Number(count) || 240)));
      const checkAbort = () => { if (signal?.aborted) throw new DOMException('Aborted', 'AbortError'); };
      checkAbort();
      let ep = '/discover/movie?sort_by=popularity.desc&include_adult=false';
      if (genreId) ep += `&with_genres=${genreId}`;
      if (decade)  ep += `&primary_release_date.gte=${decade}-01-01&primary_release_date.lte=${parseInt(decade)+9}-12-31`;
      let pool = boredPools.get(ep);
      const shuffle = values => {
        for (let i = values.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [values[i], values[j]] = [values[j], values[i]];
        }
        return values;
      };
      const append = data => {
        for (const item of data.results || []) {
          const movie = parseMovie(item, 'movie');
          if (movie.posterUrl && !pool.movies.has(movie.imdbId)) pool.movies.set(movie.imdbId, movie);
        }
      };
      if (!pool || Date.now() - pool.created > 5 * 60000) {
        const first = await get(ep + '&language=cs-CZ&page=1', { signal });
        checkAbort();
        const pages = Math.min(500, Math.max(1, first.total_pages || 1));
        pool = { created: Date.now(), movies: new Map(), pages: shuffle(Array.from({ length: pages - 1 }, (_, i) => i + 2)), cursor: 0 };
        append(first);
        boredPools.delete(ep); boredPools.set(ep, pool);
        while (boredPools.size > 4) boredPools.delete(boredPools.keys().next().value);
      }
      const selected = new Map(shuffle([...pool.movies]).slice(0, wanted));
      const publish = () => {
        checkAbort();
        for (const [key, movie] of pool.movies) { if (selected.size >= wanted) break; selected.set(key, movie); }
        const movies = [...selected.values()];
        onProgress?.(movies);
        return movies;
      };
      publish();
      // Fill larger viewports progressively. Bound concurrency and work even if
      // a restrictive filter returns duplicates or titles without a poster.
      let requested = 0;
      const budget = Math.min(90, Math.ceil(wanted / 20) + 10);
      while (selected.size < wanted && pool.cursor < pool.pages.length && requested < budget) {
        checkAbort();
        const batch = pool.pages.slice(pool.cursor, pool.cursor + Math.min(3, budget - requested, Math.ceil((wanted - selected.size) / 20)));
        pool.cursor += batch.length; requested += batch.length;
        const results = await Promise.allSettled(batch.map(page => get(ep + '&language=cs-CZ&page=' + page, { signal })));
        checkAbort();
        for (const result of results) if (result.status === 'fulfilled') append(result.value);
        publish();
        if (results.every(result => result.status === 'rejected')) break;
      }
      return publish();
    },

    async getKinoVecer(sourceMovies, savedOnly = false) {
      sourceMovies = sourceMovies.filter(m => m.mediaType !== 'tv');
      if (!sourceMovies.length) return null;
      const seed = sourceMovies[Math.floor(Math.random() * sourceMovies.length)];
      const similar = savedOnly ? [] : await this.getSimilar(seed.id);
      const genres = await this.getGenres();
      const genreMap = Object.fromEntries(genres.map(g => [g.id, g.name]));
      const seedGenres = new Set(seed.genreIds);

      const pool = new Map([[seed.imdbId, seed]]);
      for (const m of similar) {
        if (m.posterUrl && (savedOnly || m.genreIds.some(g => seedGenres.has(g)))) pool.set(m.imdbId, m);
      }
      for (const m of sourceMovies) {
        if (m.posterUrl && m.genreIds.some(g => seedGenres.has(g))) pool.set(m.imdbId, m);
      }

      const poolArr = [...pool.values()].filter(m => m.imdbId !== seed.imdbId);
      for (let i = poolArr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [poolArr[i], poolArr[j]] = [poolArr[j], poolArr[i]];
      }

      const picked = [seed];
      for (const m of poolArr) {
        if (picked.length >= 3) break;
        if (m.posterUrl) picked.push(m);
      }
      for (const m of similar) {
        if (picked.length >= 3) break;
        if (m.posterUrl && !picked.find(p => p.imdbId === m.imdbId)) picked.push(m);
      }
      if (picked.length < 3) return null;

      const commonGenres = picked.reduce((acc, m) => {
        const s = new Set(m.genreIds);
        return new Set([...acc].filter(g => s.has(g)));
      }, new Set(seed.genreIds));

      let theme;
      if (commonGenres.size > 0) {
        const names = [...commonGenres].slice(0, 2).map(id => genreMap[id]).filter(Boolean);
        theme = `Večer plný: ${names.join(' & ')}`;
      } else {
        const allGenres = [...new Set(picked.flatMap(m => m.genreIds))].slice(0, 2);
        const names = allGenres.map(id => genreMap[id]).filter(Boolean);
        theme = names.length ? `Mix žánrů: ${names.join(' & ')}` : 'Pestrý filmový večer';
      }

      return { movies: picked.slice(0, 3), theme, anchor: seed.title };
    },

    deduplicateAgainst(source, exclude) {
      const ids = new Set(exclude.map(m => m.imdbId));
      return source.filter(m => !ids.has(m.imdbId));
    },
  };
})();

// genre emoji mapping
const GENRE_EMOJIS = {
  28:'💥',12:'🧭',16:'🎨',35:'😂',80:'🔫',99:'🎥',18:'🎭',
  10751:'👨‍👩‍👧',14:'🧙',36:'📜',27:'👻',10402:'🎵',9648:'🔍',
  10749:'❤️',878:'🚀',10770:'📺',53:'😰',10752:'⚔️',37:'🤠',
};
