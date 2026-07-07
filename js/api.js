// ═══════════════════════════════════════════════════════════════════════════════
//  api.js — TMDB API wrapper
// ═══════════════════════════════════════════════════════════════════════════════

const API = (() => {
  const BASE = 'https://api.themoviedb.org/3';
  const IMG_BASE = 'https://image.tmdb.org/t/p';
  let _token = '';
  let _genreCache = null;

  const headers = () => ({
    'Authorization': `Bearer ${_token}`,
    'Content-Type': 'application/json',
  });

  const get = async (path) => {
    const res = await fetch(`${BASE}${path}`, { headers: headers() });
    if (!res.ok) throw new Error(`API ${res.status}: ${path}`);
    return res.json();
  };

  const poster = (path, size = 'w342') => path ? `${IMG_BASE}/${size}${path}` : '';
  const backdrop = (path, size = 'w780') => path ? `${IMG_BASE}/${size}${path}` : '';
  const still = (path, size = 'w300') => path ? `${IMG_BASE}/${size}${path}` : '';

  const parseMovie = (j, mediaType = 'movie') => {
    const release = j.release_date || j.first_air_date || '';
    const votes = j.vote_count || 0;
    return {
      id: j.id,
      title: j.title || j.name || 'Neznámý název',
      originalTitle: j.original_title || j.original_name || j.title || j.name || '',
      year: release.length >= 4 ? release.substring(0, 4) : '',
      imdbId: String(j.id),
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
    const [csData, skData, enData] = await Promise.all([
      get(`${endpoint}${sep}language=cs-CZ&page=${page}`).catch(() => ({results:[]})),
      get(`${endpoint}${sep}language=sk-SK&page=${page}`).catch(() => ({results:[]})),
      get(`${endpoint}${sep}language=en-US&page=${page}`).catch(() => ({results:[]})),
    ]);
    let results = (csData.results || []).map(j => parseMovie(j));
    [skData, enData].forEach(fb => {
      const fbMap = new Map((fb.results || []).map(j => [j.id, j]));
      for (const m of results) {
        if (!m.overview) {
          const fbMovie = fbMap.get(Number(m.imdbId));
          if (fbMovie?.overview) m.overview = fbMovie.overview;
        }
      }
    });
    return results;
  };

  const fetchMultiPage = async (endpoint, pages = 3) => {
    const promises = Array.from({ length: pages }, (_, i) => fetchPage(endpoint, i + 1));
    const results = await Promise.all(promises);
    return results.flat();
  };

  return {
    setToken(token) { _token = token; },
    getToken() { return _token; },

    poster, backdrop, still,

    async getPopular()    { return fetchMultiPage('/movie/popular', 3); },
    async getNowPlaying() { return fetchMultiPage('/movie/now_playing', 3); },
    async getTopRated()   { return fetchMultiPage('/movie/top_rated', 3); },
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

    async getGenres() {
      if (_genreCache) return _genreCache;
      const data = await get('/genre/movie/list?language=cs-CZ');
      _genreCache = data.genres || [];
      return _genreCache;
    },

    async getByGenre(genreId, pages = 3) {
      return fetchMultiPage(`/discover/movie?with_genres=${genreId}&sort_by=popularity.desc`, pages);
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
    async getSmartSimilar(movieId, sourceGenreIds = []) {
      const [recs, sim] = await Promise.all([
        fetchPage(`/movie/${movieId}/recommendations`, 1).catch(() => []),
        fetchPage(`/movie/${movieId}/similar`, 1).catch(() => []),
      ]);
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
      const data = await get(`/movie/${movieId}/images`);
      const backdrops = (data.backdrops || [])
        .filter(b => !b.iso_639_1 || b.iso_639_1 === 'en' || b.iso_639_1 === 'xx')
        .sort((a, b) => b.vote_average - a.vote_average);
      const seen = new Set();
      const unique = [];
      for (const b of backdrops) {
        const bucket = `${Math.round(b.width / 50)}_${Math.round(b.height / 50)}`;
        if (!seen.has(bucket)) { seen.add(bucket); unique.push(b); }
      }
      return unique.slice(0, 10).map(b => backdrop(b.file_path));
    },

    async getMovieVideos(movieId) {
      const data = await get(`/movie/${movieId}/videos?language=en-US`);
      return (data.results || []).filter(v => v.site === 'YouTube' || v.site === 'Vimeo');
    },

    // ── Seriály: sezóny a epizody ─────────────────────────────────────────────
    // Detail seriálu se seznamem sezón (přeskakuje "Speciály" = season_number 0,
    // pokud nemají epizody). Vrací jen sezóny s alespoň jednou epizodou.
    async getTVDetails(tvId) {
      const data = await get(`/tv/${tvId}?language=cs-CZ`);
      const seasons = (data.seasons || [])
        .filter(s => (s.episode_count || 0) > 0)
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
        };
      });
    },

    async searchMovies(query, { yearFrom, yearTo, genreId, minRating, searchTV = false, page = 1 } = {}) {
      if (!query.trim()) {
        // Discover mode — fetch multiple pages for filter-only searches
        const type = searchTV ? 'tv' : 'movie';
        let ep = `/discover/${type}?sort_by=popularity.desc`;
        if (genreId)   ep += `&with_genres=${genreId}`;
        if (yearFrom)  ep += `&primary_release_date.gte=${yearFrom}-01-01`;
        if (yearTo)    ep += `&primary_release_date.lte=${yearTo}-12-31`;
        if (minRating) ep += `&vote_average.gte=${minRating}&vote_count.gte=50`;
        const results = await fetchPage(ep, page);
        if (searchTV) results.forEach(r => { r.mediaType = 'tv'; });
        return results;
      }
      const type = searchTV ? 'tv' : 'movie';
      const [csData, skData, enData] = await Promise.all([
        get(`/search/${type}?query=${encodeURIComponent(query)}&language=cs-CZ&page=${page}`).catch(() => ({results:[]})),
        get(`/search/${type}?query=${encodeURIComponent(query)}&language=sk-SK&page=${page}`).catch(() => ({results:[]})),
        get(`/search/${type}?query=${encodeURIComponent(query)}&language=en-US&page=${page}`).catch(() => ({results:[]})),
      ]);
      let results = (csData.results || []).map(j => parseMovie(j, type));
      [skData, enData].forEach(fb => {
        const fbMap = new Map((fb.results || []).map(j => [j.id, j]));
        for (const m of results) {
          if (!m.overview) {
            const fbMovie = fbMap.get(Number(m.imdbId));
            if (fbMovie?.overview) m.overview = fbMovie.overview;
          }
        }
      });
      if (yearFrom)  results = results.filter(m => parseInt(m.year) >= yearFrom);
      if (yearTo)    results = results.filter(m => parseInt(m.year) <= yearTo);
      if (minRating) results = results.filter(m => m.rating >= minRating);
      if (genreId)   results = results.filter(m => m.genreIds.includes(genreId));
      return results;
    },

    async getBoredMovies({ genreId, decade } = {}) {
      let ep = '/discover/movie?sort_by=popularity.desc';
      if (genreId) ep += `&with_genres=${genreId}`;
      if (decade)  ep += `&primary_release_date.gte=${decade}-01-01&primary_release_date.lte=${parseInt(decade)+9}-12-31`;

      const allPages = Array.from({ length: 500 }, (_, i) => i + 1);
      // Shuffle
      for (let i = allPages.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [allPages[i], allPages[j]] = [allPages[j], allPages[i]];
      }
      const selected = allPages.slice(0, 80); // FIX #26: more movies
      const all = [];
      for (let i = 0; i < selected.length; i += 10) {
        const batch = selected.slice(i, i + 10);
        const results = await Promise.all(batch.map(p => fetchPage(ep, p)));
        all.push(...results.flat());
      }
      const withPoster = all.filter(m => m.posterUrl);
      // Shuffle result
      for (let i = withPoster.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [withPoster[i], withPoster[j]] = [withPoster[j], withPoster[i]];
      }
      return withPoster;
    },

    async getKinoVecer(sourceMovies) {
      if (!sourceMovies.length) return null;
      const seed = sourceMovies[Math.floor(Math.random() * sourceMovies.length)];
      const similar = await this.getSimilar(seed.id);
      const genres = await this.getGenres();
      const genreMap = Object.fromEntries(genres.map(g => [g.id, g.name]));
      const seedGenres = new Set(seed.genreIds);

      const pool = new Map([[seed.imdbId, seed]]);
      for (const m of similar) {
        if (m.posterUrl && m.genreIds.some(g => seedGenres.has(g))) pool.set(m.imdbId, m);
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
