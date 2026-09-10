'use strict';
const assert = require('node:assert/strict');
const { select, _test: { rank, describe, similar, choose } } = require('../js/image-selection.js');
const W = 96, H = 54;

function pixels(seed = 0) {
  const result = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    const scene = 110 + 30 * Math.sin((x + seed * 19) / 13) + 23 * Math.cos((y + seed * 11) / 9) + 16 * Math.sin((x + y + seed * 7) / 7);
    result[i] = scene + 13; result[i + 1] = scene; result[i + 2] = scene - 11; result[i + 3] = 255;
  }
  return result;
}

function crop(input, scale) {
  const result = new Uint8ClampedArray(input.length);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const px = (W - 1) * (1 - scale) / 2 + x * scale, py = (H - 1) * (1 - scale) / 2 + y * scale;
    const x0 = Math.floor(px), y0 = Math.floor(py), dx = px - x0, dy = py - y0;
    const x1 = Math.min(W - 1, x0 + 1), y1 = Math.min(H - 1, y0 + 1);
    for (let c = 0; c < 4; c++) result[(y * W + x) * 4 + c] =
      input[(y0 * W + x0) * 4 + c] * (1 - dx) * (1 - dy) + input[(y0 * W + x1) * 4 + c] * dx * (1 - dy) +
      input[(y1 * W + x0) * 4 + c] * (1 - dx) * dy + input[(y1 * W + x1) * 4 + c] * dx * dy;
  }
  return result;
}

const item = (index, overrides = {}) => ({ file_path: `/image${index}.jpg`, width: 1920, height: 1080, iso_639_1: null, vote_average: 6, vote_count: 15, ...overrides });
const descriptor = pixels => describe(pixels, W, H);

(async () => {
  const source = pixels(), original = descriptor(source);
  assert(similar(original, descriptor(source)), 'Exact duplicates must match');
  const bright = source.map((value, index) => index % 4 === 3 ? value : value + 23);
  assert(similar(original, descriptor(bright)), 'A brighter export of the same scene must match');
  const titled = source.slice();
  for (let y = H - 9; y < H; y++) for (let x = 12; x < 74; x++) {
    if ((x % 7) < 5) for (let c = 0; c < 3; c++) titled[(y * W + x) * 4 + c] = 240;
  }
  assert(similar(original, descriptor(titled)), 'Small title overlays must not create another scene');
  assert(similar(original, descriptor(crop(source, 0.9))), 'A modest centered re-crop must match');
  const flipped = new Uint8ClampedArray(source.length);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) for (let c = 0; c < 4; c++) flipped[(y * W + x) * 4 + c] = source[(y * W + W - 1 - x) * 4 + c];
  assert(similar(original, descriptor(flipped)), 'Mirrored artwork must match');
  const rearranged = new Uint8ClampedArray(source.length);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) for (let c = 0; c < 4; c++) rearranged[(y * W + x) * 4 + c] = source[(((y + H / 2) % H) * W + x) * 4 + c];
  assert(!similar(original, descriptor(rearranged)), 'Same dimensions and identical color palette do not mean the same scene');
  assert(!similar(original, descriptor(pixels(4))), 'Different scene structure must survive');
  const nearPixels = source.map((value, index) => index % 4 === 3 ? value : value * 0.65 + rearranged[index] * 0.35);
  const varietyDescriptors = { '/image0.jpg': original, '/image1.jpg': descriptor(nearPixels), '/image4.jpg': descriptor(rearranged) };
  assert(!similar(original, varietyDescriptors['/image1.jpg']), 'A similar palette with changed composition remains a distinct frame');
  const varietyPool = rank([item(0), item(1), item(4)]).map(candidate => ({
    candidate, path: candidate.file_path, descriptor: varietyDescriptors[candidate.file_path],
  }));
  assert.equal(choose(varietyPool)[1], '/image4.jpg', 'With equal quality, a more different composition is shown sooner');
  const redArtwork = input => input.map((value, index) => index % 4 === 0 ? 150 + value / 3 : index % 4 === 3 ? 255 : value / 12);
  const redPool = rank([item(0), item(1), item(2)]).map((candidate, index) => ({
    candidate: { ...candidate, score: candidate.score - index * 0.2 }, path: candidate.file_path,
    descriptor: index === 0 ? descriptor(redArtwork(source)) : index === 1 ? descriptor(redArtwork(rearranged)) : original,
  }));
  assert.deepEqual(choose(redPool), ['/image0.jpg', '/image2.jpg', '/image1.jpg'], 'Similar red promotional artwork follows a different-looking alternative without deleting distinct frames');

  const ranking = rank([
    item(1, { width: 720, height: 405 }), item(2, { iso_639_1: 'en', vote_average: 9 }),
    item(3, { vote_count: 1, vote_average: 10 }), item(4, { vote_count: 100, vote_average: 7 }),
    item(4), item(5, { iso_639_1: 'cs' }), item(6, { width: 400, height: 600 }),
    item(7, { file_path: 'https://other.example/image.jpg' }), item(8, { width: 300, height: 160 }),
  ]);
  assert.equal(ranking[0].file_path, '/image4.jpg', 'Supported rating beats a single perfect vote');
  assert.equal(ranking.filter(i => i.file_path === '/image4.jpg').length, 1, 'Path duplicates are removed');
  assert.equal(ranking.length, 5, 'Portrait, tiny, and foreign URLs are excluded');
  assert(ranking.findIndex(i => i.file_path === '/image1.jpg') < ranking.findIndex(i => i.file_path === '/image2.jpg'), 'Older unlabelled 720p still remains a usable fallback');
  assert(ranking.findIndex(i => i.file_path === '/image5.jpg') < ranking.findIndex(i => i.file_path === '/image2.jpg'), 'Czech is preferred over English when artwork is labelled');
  assert.equal(rank(Array.from({ length: 50 }, (_, i) => item(i))).length, 24, 'Metadata candidate cap');

  let concurrent = 0, maximum = 0, downloads = 0;
  const load = async () => {
    downloads++; concurrent++; maximum = Math.max(maximum, concurrent);
    await new Promise(resolve => setTimeout(resolve, 2)); concurrent--; return original;
  };
  const candidates = Array.from({ length: 50 }, (_, i) => item(i));
  const results = await Promise.all([select(candidates, { load }), select(candidates, { load })]);
  assert.equal(maximum, 3, 'The download concurrency cap is global across titles');
  assert.equal(downloads, 48, 'No title downloads more than 24 small candidates');
  for (const result of results) {
    assert.equal(result.paths.length, 1, 'Do not refill a selection with known duplicates');
    assert.equal(result.verified, true);
  }

  const unique = await select(Array.from({ length: 12 }, (_, i) => item(i)), { load: async path => descriptor(pixels(Number(path.match(/\d+/)[0]))) });
  assert(unique.paths.length <= 8 && unique.paths.length >= 6, 'A varied result stays bounded and preserves different scenes');
  const rejected = await select(candidates, { load: async () => { throw new Error('CORS unavailable'); } });
  assert.equal(rejected.verified, false);
  assert.equal(rejected.paths.length, 3, 'Failure falls back to only a few ranked images');
  const partial = await select([item(1), item(2)], { load: async path => path === '/image1.jpg' ? original : null });
  assert.deepEqual(partial, { paths: ['/image1.jpg'], verified: false }, 'A short selection after partial network failure should be retried sooner');

  const previousImage = global.Image, previousDocument = global.document;
  let requestedSource, requestedCors;
  global.Image = class {
    constructor() { this.naturalWidth = W; this.naturalHeight = H; }
    set src(value) { requestedSource = value; requestedCors = this.crossOrigin; queueMicrotask(() => this.onload?.()); }
    removeAttribute() {}
  };
  global.document = { createElement: () => ({ getContext: () => ({ drawImage() {}, getImageData() { throw new Error('SecurityError'); } }) }) };
  const corsResult = await select([item(1)]);
  assert.equal(corsResult.verified, false, 'Canvas SecurityError is handled');
  assert.equal(requestedCors, 'anonymous', 'CORS is set before image loading');
  assert.equal(requestedSource, 'https://image.tmdb.org/t/p/w300/image1.jpg', 'Only the small CDN size is inspected');
  global.Image = class { set src(value) {} removeAttribute() {} };
  const started = Date.now();
  const timedOut = await select(candidates, { budget: 25 });
  assert(Date.now() - started < 300, 'A stalled CDN cannot hold the selection past its budget');
  assert.equal(timedOut.verified, false);
  global.Image = previousImage; global.document = previousDocument;
  assert.deepEqual(await select([]), { paths: [], verified: true });
  console.log('Image selection passed: similarity, visual variety, ranking, bounded requests, global concurrency, CORS, timeout, partial-failure retry.');
})().catch(error => { console.error(error); process.exitCode = 1; });
