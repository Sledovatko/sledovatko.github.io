// Choose real, varied stills. Image pixels stay in memory; no extra TMDB API calls.
const ImageSelection = (() => {
  const MAX_CANDIDATES = 24, TARGET = 8, CONCURRENCY = 3;
  const IMAGE_TIMEOUT = 3000, BUDGET = 9000;
  const SAMPLE_W = 24, SAMPLE_H = 14;
  const queue = [];
  let active = 0;

  function rank(backdrops) {
    const unique = new Map();
    for (const item of Array.isArray(backdrops) ? backdrops : []) {
      if (!item || typeof item.file_path !== 'string' || !/^\/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$/i.test(item.file_path)) continue;
      const width = Number(item.width), height = Number(item.height), ratio = width / height;
      if (!Number.isFinite(ratio) || width < 600 || height < 330 || ratio < 1.3 || ratio > 2.5) continue;
      const language = item.iso_639_1;
      const languageRank = !language || language === 'xx' ? 0 : language === 'cs' ? 1 : language === 'en' ? 2 : 3;
      const count = Math.max(0, Number(item.vote_count) || 0);
      const average = Math.max(0, Math.min(10, Number(item.vote_average) || 0));
      const score = (average * count + 5 * 8) / (count + 8) + Math.min(width, 1920) / 1920 * 0.4;
      const candidate = { ...item, languageRank, qualityRank: width >= 780 && height >= 400 ? 0 : 1, score };
      const existing = unique.get(item.file_path);
      if (!existing || compareRank(candidate, existing) < 0) unique.set(item.file_path, candidate);
    }
    return [...unique.values()].sort(compareRank).slice(0, MAX_CANDIDATES);
  }

  function compareRank(a, b) {
    return a.languageRank - b.languageRank || a.qualityRank - b.qualityRank || b.score - a.score || a.file_path.localeCompare(b.file_path);
  }

  function median(values) {
    const sorted = values.slice().sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)] || 0;
  }

  // Several centered views tolerate a modest re-crop. Keeping spatial samples,
  // rather than just a color histogram, distinguishes scenes with the same palette.
  function describe(data, width, height) {
    if (!data || data.length !== width * height * 4 || width < 2 || height < 2) throw new Error('Invalid image pixels');
    return [1, 0.9, 0.8].map(scale => {
      const samples = [], cropW = (width - 1) * scale, cropH = (height - 1) * scale;
      const startX = (width - 1 - cropW) / 2, startY = (height - 1 - cropH) / 2;
      for (let y = 0; y < SAMPLE_H; y++) for (let x = 0; x < SAMPLE_W; x++) {
        const px = startX + x / (SAMPLE_W - 1) * cropW;
        const py = startY + y / (SAMPLE_H - 1) * cropH;
        const x0 = Math.floor(px), y0 = Math.floor(py), dx = px - x0, dy = py - y0;
        const x1 = Math.min(x0 + 1, width - 1), y1 = Math.min(y0 + 1, height - 1);
        const rgb = [0, 1, 2].map(channel =>
          data[(y0 * width + x0) * 4 + channel] * (1 - dx) * (1 - dy) +
          data[(y0 * width + x1) * 4 + channel] * dx * (1 - dy) +
          data[(y1 * width + x0) * 4 + channel] * (1 - dx) * dy +
          data[(y1 * width + x1) * 4 + channel] * dx * dy);
        samples.push([rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114, rgb[0] - rgb[1], rgb[2] - rgb[1]]);
      }
      return samples;
    });
  }

  function sameView(a, b, flipped = false) {
    // Most different scenes can be rejected before allocating/sorting residuals.
    const fullMeanA = a.reduce((sum, p) => sum + p[0], 0) / a.length;
    const fullMeanB = b.reduce((sum, p) => sum + p[0], 0) / b.length;
    let fullVarA = 0, fullVarB = 0, fullCovariance = 0;
    for (let i = 0; i < a.length; i++) {
      const j = flipped ? Math.floor(i / SAMPLE_W) * SAMPLE_W + SAMPLE_W - 1 - i % SAMPLE_W : i;
      const da = a[i][0] - fullMeanA, db = b[j][0] - fullMeanB;
      fullVarA += da * da; fullVarB += db * db; fullCovariance += da * db;
    }
    if (fullVarA > a.length * 64 && fullVarB > b.length * 64 && fullCovariance / Math.sqrt(fullVarA * fullVarB) < 0.55) return false;
    const pairs = a.map((pixel, index) => {
      const other = b[flipped ? Math.floor(index / SAMPLE_W) * SAMPLE_W + SAMPLE_W - 1 - index % SAMPLE_W : index];
      return { a: pixel, b: other, delta: pixel[0] - other[0] };
    });
    const brightness = median(pairs.map(pair => pair.delta));
    // Ignore only a small outlier area, such as a title added to one version.
    pairs.sort((a, b) => Math.abs(a.delta - brightness) - Math.abs(b.delta - brightness));
    const retained = pairs.slice(0, Math.ceil(pairs.length * 0.85));
    const n = retained.length;
    let sumA = 0, sumB = 0, residual = 0, chroma = 0;
    for (const p of retained) {
      sumA += p.a[0]; sumB += p.b[0];
      residual += Math.abs(p.delta - brightness);
      chroma += (Math.abs(p.a[1] - p.b[1]) + Math.abs(p.a[2] - p.b[2])) / 2;
    }
    const meanA = sumA / n, meanB = sumB / n;
    let varianceA = 0, varianceB = 0, covariance = 0;
    for (const p of retained) {
      const da = p.a[0] - meanA, db = p.b[0] - meanB;
      varianceA += da * da; varianceB += db * db; covariance += da * db;
    }
    const contrast = Math.min(Math.sqrt(varianceA / n), Math.sqrt(varianceB / n));
    const correlation = covariance / Math.sqrt(varianceA * varianceB || 1);
    const error = residual / n, colorError = chroma / n;
    // Flat/dark scenes are deliberately conservative: no structure is not a match.
    if (contrast < 8) return Math.abs(brightness) < 3 && error < 1.5 && colorError < 3;
    return Math.abs(brightness) < 65 && colorError < 12 && correlation > 0.965 && error < Math.max(3.2, contrast * 0.14);
  }

  function similar(a, b) {
    if (!a || !b) return false;
    for (const viewA of a) for (const viewB of b) {
      if (sameView(viewA, viewB) || sameView(viewA, viewB, true)) return true;
    }
    return false;
  }

  function distance(a, b) {
    const first = a[0], second = b[0], n = first.length;
    const meanA = first.reduce((sum, p) => sum + p[0], 0) / n;
    const meanB = second.reduce((sum, p) => sum + p[0], 0) / n;
    let varianceA = 0, varianceB = 0, covariance = 0, color = 0;
    for (let i = 0; i < n; i++) {
      const da = first[i][0] - meanA, db = second[i][0] - meanB;
      varianceA += da * da; varianceB += db * db; covariance += da * db;
      color += (Math.abs(first[i][1] - second[i][1]) + Math.abs(first[i][2] - second[i][2])) / 2;
    }
    const correlation = covariance / Math.sqrt(varianceA * varianceB || 1);
    return Math.max(0, Math.min(1, (1 - correlation) * 0.4 + color / n / 120));
  }

  function artworkColor(descriptor) {
    const buckets = new Array(12).fill(0), samples = descriptor[0];
    for (const [luminance, redGreen, blueGreen] of samples) {
      const green = luminance - 0.299 * redGreen - 0.114 * blueGreen;
      const red = green + redGreen, blue = green + blueGreen;
      const max = Math.max(red, green, blue), min = Math.min(red, green, blue), span = max - min;
      // Use only a strongly saturated dominant background. Ordinary dark or
      // neutral movie scenes must never be grouped just for sharing a palette.
      if (max < 80 || span / Math.max(1, max) < 0.65) continue;
      let hue = max === red ? (green - blue) / span : max === green ? (blue - red) / span + 2 : (red - green) / span + 4;
      hue = ((hue * 60) % 360 + 360) % 360;
      buckets[Math.round(hue / 30) % 12]++;
    }
    const maximum = Math.max(...buckets);
    return maximum > samples.length * 0.5 ? buckets.indexOf(maximum) : null;
  }

  function choose(pool) {
    const remaining = pool.map(item => ({ ...item, artworkColor: artworkColor(item.descriptor) })), chosen = [];
    while (remaining.length && chosen.length < TARGET) {
      // Language and usable resolution stay ahead of the small variety bonus.
      const tier = remaining[0].candidate;
      const sameTier = item => item.candidate.languageRank === tier.languageRank && item.candidate.qualityRank === tier.qualityRank;
      const repeatsArt = item => item.artworkColor !== null && chosen.some(other => other.artworkColor === item.artworkColor);
      const hasFreshLook = remaining.some(item => sameTier(item) && !repeatsArt(item));
      let bestIndex = 0, bestScore = -Infinity;
      for (let i = 0; i < remaining.length; i++) {
        const item = remaining[i];
        if (!sameTier(item) || (hasFreshLook && repeatsArt(item))) continue;
        const variety = chosen.length ? Math.min(...chosen.map(other => distance(item.descriptor, other.descriptor))) : 0;
        const score = item.candidate.score + variety * 0.65;
        if (score > bestScore) { bestScore = score; bestIndex = i; }
      }
      chosen.push(remaining.splice(bestIndex, 1)[0]);
    }
    return chosen.map(item => item.path);
  }

  function pump() {
    while (active < CONCURRENCY && queue.length) {
      const task = queue.shift();
      if (Date.now() >= task.deadline) { task.finish(null); continue; }
      active++;
      Promise.resolve().then(() => task.load(task.path, Math.min(IMAGE_TIMEOUT, task.deadline - Date.now())))
        .catch(() => null).then(task.finish).finally(() => { active--; pump(); });
    }
  }

  function enqueue(path, deadline, load) {
    return new Promise(resolve => {
      let settled = false;
      const task = { path, deadline, load, finish(result) {
        if (settled) return;
        settled = true; clearTimeout(timer); resolve(result);
      } };
      const timer = setTimeout(() => {
        const index = queue.indexOf(task);
        if (index !== -1) queue.splice(index, 1);
        task.finish(null);
      }, Math.max(0, deadline - Date.now()));
      queue.push(task); pump();
    });
  }

  function loadDescriptor(path, timeout) {
    return new Promise(resolve => {
      const image = new Image();
      let settled = false;
      const finish = value => {
        if (settled) return;
        settled = true; clearTimeout(timer); image.onload = image.onerror = null;
        image.removeAttribute('src'); resolve(value);
      };
      const timer = setTimeout(() => finish(null), Math.max(1, timeout));
      image.crossOrigin = 'anonymous';
      image.decoding = 'async';
      image.onerror = () => finish(null);
      image.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = 96; canvas.height = 54;
          const context = canvas.getContext('2d', { willReadFrequently: true });
          if (!context || !image.naturalWidth || !image.naturalHeight) { finish(null); return; }
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          finish(describe(context.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height));
        } catch { finish(null); } // CORS, privacy restrictions, or decode failure.
      };
      image.src = 'https://image.tmdb.org/t/p/w300' + path;
    });
  }

  async function select(backdrops, options = {}) {
    const candidates = rank(backdrops);
    if (!candidates.length) return { paths: [], verified: true };
    const selected = [], deadline = Date.now() + Math.min(BUDGET, Math.max(1, options.budget || BUDGET));
    let incomplete = false, processed = 0;
    const load = options.load || loadDescriptor;
    // A small pool beyond the final eight gives variety a real choice, without
    // downloading the entire TMDB gallery or scanning every card on the page.
    for (let i = 0; i < candidates.length && selected.length < 12 && Date.now() < deadline; i += CONCURRENCY) {
      const batch = candidates.slice(i, i + CONCURRENCY);
      const descriptors = await Promise.all(batch.map(item => enqueue(item.file_path, deadline, load)));
      processed += batch.length;
      for (let j = 0; j < batch.length && selected.length < 12; j++) {
        const descriptor = descriptors[j];
        if (!descriptor) incomplete = true;
        if (descriptor && !selected.some(item => similar(item.descriptor, descriptor))) selected.push({ path: batch[j].file_path, candidate: batch[j], descriptor });
      }
      if (i + CONCURRENCY < candidates.length && selected.length < 12) await new Promise(resolve => setTimeout(resolve, 0));
    }
    if (!selected.length) return { paths: candidates.slice(0, 3).map(item => item.file_path), verified: false };
    const paths = choose(selected);
    const unfinished = selected.length < 12 && processed < candidates.length;
    // Retry a short partial result sooner after network/canvas failures. Eight
    // successfully inspected distinct frames already satisfy the requested set.
    return { paths, verified: paths.length >= TARGET || (!incomplete && !unfinished) };
  }

  const api = { select };
  if (typeof module !== 'undefined' && module.exports) module.exports = { ...api, _test: { rank, describe, similar, choose, artworkColor } };
  return api;
})();
