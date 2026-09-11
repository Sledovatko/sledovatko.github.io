// ═══════════════════════════════════════════════════════════════════════════════
//  bored.js — smooth grid: spotlight vignette, exponential zoom
// ═══════════════════════════════════════════════════════════════════════════════

class BoredGrid {
  static capacity(width, height) {
    const tile = width <= 600 ? 30 : 44;
    return Math.max(1, Math.min(1600, Math.ceil(width / tile) * Math.ceil(height / (tile * 1.5))));
  }

  static layout(width, height, available) {
    const count = Math.min(BoredGrid.capacity(width, height), available);
    if (!count) return { cols: 0, rows: 0, total: 0 };
    const cols = Math.max(1, Math.min(count, Math.round(Math.sqrt(count * width / Math.max(1, height) * 1.5))));
    const rows = Math.max(1, Math.floor(count / cols));
    return { cols, rows, total: cols * rows };
  }

  constructor(canvas, movies, opts = {}) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');
    this.movies = movies;
    this.opts   = opts;

    this.mouse      = { x: -9999, y: -9999 };
    this.scales     = {};
    this.targetSc   = {};
    this.opacities  = {};
    this.targetOp   = {};
    this.images     = {};
    this.loading    = new Set();
    this._pendingImages = [];
    this._imageRequests = 0;
    this._dirty = true;
    this._destroyed = false;
    this._requested = opts.requestedCount || movies.length;
    this.hoveredIdx = -1;

    this.cellW = 1; this.cellH = 1;
    this.cols  = 1; this.rows  = 1; this.total = 0;

    // Zoom params — wider radius so MORE tiles around cursor get some zoom
    this.MAG_RADIUS   = 160;   // ZOOM radius — tight, only nearby tiles zoom
    this.CENTER_SCALE = 4.8;   // max zoom on center tile
    this.ZOOM_POWER   = 2.0;   // steep — center large, quick dropoff
    this.MIN_SCALE    = 1.0;
    this.EASING       = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ? 1 : 0.11;

    // Opacity — whole canvas dims, mouse lights up area around it
    this.OP_HOT  = 1.0;
    this.OP_IDLE = 0.55;  // when mouse off canvas
    this.OP_FAR  = 0.12;  // darkest tiles when mouse on canvas far away
    // Spotlight: smooth radial gradient, NOT hard circle
    this.SPOT_INNER = 160; // fully bright inside this dist
    this.SPOT_OUTER = 420; // fades to OP_FAR by this dist

    this._raf  = null;
    this._diag = 1;
    this._setupGrid();
    this._bindEvents();
    this._loop();
  }

  destroy() {
    this._destroyed = true;
    this._pendingImages = [];
    clearTimeout(this._resizeTimer);
    cancelAnimationFrame(this._raf);
    this.canvas.removeEventListener('mousemove', this._onMove);
    this.canvas.removeEventListener('mouseleave', this._onLeave);
    this.canvas.removeEventListener('click', this._onClick);
    this.canvas.removeEventListener('touchstart', this._onTouchStart);
    this.canvas.removeEventListener('touchmove', this._onTouchMove);
    this.canvas.removeEventListener('touchend', this._onTouchEnd);
    this.canvas.removeEventListener('touchcancel', this._onTouchCancel);
    window.removeEventListener('resize', this._onResize);
  }

  updateOpts(o) { this.opts = { ...this.opts, ...o }; }

  setMovies(movies) {
    this.movies = movies;
    this.scales = {}; this.targetSc = {}; this.opacities = {}; this.targetOp = {};
    this.hoveredIdx = -1;
    this._setupGrid();
  }

  _setupGrid() {
    const W = this.canvas.width  = this.canvas.offsetWidth;
    const H = this.canvas.height = this.canvas.offsetHeight;
    this._diag = Math.sqrt(W * W + H * H);
    Object.assign(this, BoredGrid.layout(W, H, this.movies.length));
    this.cellW = W / Math.max(1, this.cols);
    this.cellH = H / Math.max(1, this.rows);
    this.canvas.dataset.titleCount = String(this.movies.length);
    this.canvas.dataset.cellCount = String(this.total);
    this.canvas.dataset.columns = String(this.cols);
    this.canvas.dataset.rows = String(this.rows);
    this.canvas.setAttribute('aria-label', `Filmová mozaika, ${this.movies.length} titulů`);
    this._dirty = true;
    this._preload();
  }

  _preload() {
    for (let i = 0; i < this.total; i++) {
      const movie = this.movies[i], key = movie?.imdbId;
      if (this.loading.has(key) || this.images[key]) continue;
      const url = movie?.posterUrl;
      if (!url) continue;
      this.loading.add(key);
      this._pendingImages.push({ key, url });
    }
    this._pumpImages();
  }

  _pumpImages() {
    while (!this._destroyed && this._imageRequests < 8 && this._pendingImages.length) {
      const { key, url } = this._pendingImages.shift();
      this._imageRequests++;
      const img = new Image();
      img.crossOrigin = 'anonymous';
      const finish = loaded => {
        this._imageRequests--;
        if (this._destroyed) return;
        if (loaded) this.images[key] = img;
        this._dirty = true;
        this._pumpImages();
      };
      img.onload = () => finish(true);
      img.onerror = () => finish(false);
      img.src = url.replace('/w342/', '/w185/');
    }
  }

  _bindEvents() {
    this._onMove   = e => this._handleMove(e);
    this._onLeave  = () => this._handleLeave();
    this._onClick  = e => this._handleClick(e);
    this._onTouchStart = e => { if (e.defaultPrevented || e.touches.length !== 1) this._touchCanceled = true; if (e.cancelable) e.preventDefault(); if (!this._touchCanceled) this._syncTouch(e); };
    this._onTouchMove  = e => { if (e.touches.length !== 1) this._touchCanceled = true; if (e.cancelable) e.preventDefault(); if (!this._touchCanceled) this._syncTouch(e); };
    this._onTouchEnd   = e => { const touch = e.changedTouches?.[0]; if (touch && !this._touchCanceled && !e.touches.length && !e.defaultPrevented) this._handleClick(touch); if (!e.touches.length) this._touchCanceled = false; this._handleLeave(); };
    this._onTouchCancel = e => { this._touchCanceled = !!e.touches.length; this._handleLeave(); };
    this._onResize = () => {
      clearTimeout(this._resizeTimer);
      this._resizeTimer = setTimeout(() => {
        this._setupGrid();
        const needed = BoredGrid.capacity(this.canvas.offsetWidth, this.canvas.offsetHeight);
        if (needed > this.movies.length && needed > this._requested) {
          this._requested = needed;
          this.opts.onNeedMore?.(needed);
        }
      }, 200);
    };
    this.canvas.addEventListener('mousemove',  this._onMove,  { passive: true });
    this.canvas.addEventListener('mouseleave', this._onLeave, { passive: true });
    this.canvas.addEventListener('click',      this._onClick);
    this.canvas.addEventListener('touchstart', this._onTouchStart, { passive: false });
    this.canvas.addEventListener('touchmove',  this._onTouchMove,  { passive: false });
    this.canvas.addEventListener('touchend',   this._onTouchEnd);
    this.canvas.addEventListener('touchcancel', this._onTouchCancel);
    window.addEventListener('resize', this._onResize);
  }

  _syncTouch(e) {
    this._dirty = true;
    const t = e.touches[0];
    if (!t) return;
    const rect = this.canvas.getBoundingClientRect();
    this.mouse.x = t.clientX - rect.left;
    this.mouse.y = t.clientY - rect.top;
    const newHot = this._closestIdx(this.mouse.x, this.mouse.y);
    if (newHot !== this._prevHot) {
      this._prevHot = newHot;
    }
    this.hoveredIdx = newHot;
    for (let i = 0; i < this.total; i++) {
      const ts = this._scaleFor(i);
      const to = this._opFor(i);
      if (ts > this.MIN_SCALE || i in this.scales) {
        this.targetSc[i] = ts;
        if (!(i in this.scales)) this.scales[i] = this.MIN_SCALE;
      }
      this.targetOp[i] = to;
      if (!(i in this.opacities)) this.opacities[i] = this.OP_IDLE;
    }
  }

  _cx(i) { return (i % this.cols) * this.cellW + this.cellW / 2; }
  _cy(i) { return Math.floor(i / this.cols) * this.cellH + this.cellH / 2; }

  _closestIdx(x, y) {
    return Math.max(0, Math.min(this.rows - 1, Math.floor(y / this.cellH))) * this.cols
         + Math.max(0, Math.min(this.cols - 1, Math.floor(x / this.cellW)));
  }

  // Scale: exponential, wide radius
  _scaleFor(i) {
    if (this.mouse.x < -1000) return this.MIN_SCALE;
    const dx = this.mouse.x - this._cx(i), dy = this.mouse.y - this._cy(i);
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d >= this.MAG_RADIUS) return this.MIN_SCALE;
    return this.MIN_SCALE + (this.CENTER_SCALE - this.MIN_SCALE)
         * Math.pow(1 - d / this.MAG_RADIUS, this.ZOOM_POWER);
  }

  // #11: Opacity with smooth spotlight — no hard circle, gradual inner/outer
  _opFor(i) {
    if (this.mouse.x < -1000) return this.OP_IDLE;
    const dx = this.mouse.x - this._cx(i), dy = this.mouse.y - this._cy(i);
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d <= this.SPOT_INNER) return this.OP_HOT;
    if (d >= this.SPOT_OUTER) return this.OP_FAR;
    // Smooth interpolation between inner and outer
    const t = (d - this.SPOT_INNER) / (this.SPOT_OUTER - this.SPOT_INNER);
    const smooth = t * t * (3 - 2 * t); // smoothstep
    return this.OP_HOT - smooth * (this.OP_HOT - this.OP_FAR);
  }



  _prevHot = -1;

  _handleMove(e) {
    this._dirty = true;
    const rect = this.canvas.getBoundingClientRect();
    this.mouse.x = e.clientX - rect.left;
    this.mouse.y = e.clientY - rect.top;
    const newHot = this._closestIdx(this.mouse.x, this.mouse.y);
    if (newHot !== this._prevHot) {
      this._prevHot = newHot;
    }
    this.hoveredIdx = newHot;

    // Update all tiles — full canvas effect
    for (let i = 0; i < this.total; i++) {
      const ts = this._scaleFor(i);
      const to = this._opFor(i);
      if (ts > this.MIN_SCALE || i in this.scales) {
        this.targetSc[i] = ts;
        if (!(i in this.scales)) this.scales[i] = this.MIN_SCALE;
      }
      this.targetOp[i] = to;
      if (!(i in this.opacities)) this.opacities[i] = this.OP_IDLE;
    }
  }

  _handleLeave() {
    this._dirty = true;
    this.mouse = { x: -9999, y: -9999 };
    this.hoveredIdx = -1; this._prevHot = -1;
    for (const i in this.targetSc)  this.targetSc[i]  = this.MIN_SCALE;
    for (const i in this.targetOp)  this.targetOp[i]  = this.OP_IDLE;
  }

  _handleClick(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    const idx = this._closestIdx(x, y);
    if (idx >= 0 && idx < this.total && this.opts.onSelect)
      this.opts.onSelect(this.movies[idx]);
  }

  _tick() {
    let changed = false;
    for (const i in this.scales) {
      const t = this.targetSc[i] ?? this.MIN_SCALE;
      const d = t - this.scales[i];
      if (d !== 0) changed = true;
      if (Math.abs(d) < 0.003) {
        this.scales[i] = t;
        if (t <= this.MIN_SCALE + 0.002) { delete this.scales[i]; delete this.targetSc[i]; }
      } else { this.scales[i] += d * this.EASING; }
    }
    for (const i in this.opacities) {
      const t = this.targetOp[i] ?? this.OP_IDLE;
      const d = t - this.opacities[i];
      if (d !== 0) changed = true;
      if (Math.abs(d) < 0.004) {
        this.opacities[i] = t;
        if (Math.abs(t - this.OP_IDLE) < 0.01) { delete this.opacities[i]; delete this.targetOp[i]; }
      } else { this.opacities[i] += d * this.EASING; }
    }
    return changed;
  }

  _drawTile(i) {
    const ctx   = this.ctx;
    const scale = this.scales[i] ?? this.MIN_SCALE;
    const op    = Math.max(0, Math.min(1, this.opacities[i] ?? this.OP_IDLE));

    let cx = this._cx(i), cy = this._cy(i);
    cx = Math.max(this.cellW * scale / 2, Math.min(this.canvas.width  - this.cellW * scale / 2, cx));
    cy = Math.max(this.cellH * scale / 2, Math.min(this.canvas.height - this.cellH * scale / 2, cy));

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    ctx.translate(-this.cellW / 2, -this.cellH / 2);
    ctx.beginPath();
    ctx.roundRect(0, 0, this.cellW, this.cellH, 2);
    ctx.clip();
    ctx.globalAlpha = op;

    const img = this.images[this.movies[i]?.imdbId];
    if (img && img.complete) {
      ctx.drawImage(img, 0, 0, this.cellW, this.cellH);
    } else {
      ctx.fillStyle = '#1A2535';
      ctx.fillRect(0, 0, this.cellW, this.cellH);
    }

    // Hovered: title + rating overlay + accent border
    if (i === this.hoveredIdx) {
      ctx.globalAlpha = 1;
      const g = ctx.createLinearGradient(0, this.cellH * 0.5, 0, this.cellH);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.88)');
      ctx.fillStyle = g;
      ctx.fillRect(0, this.cellH * 0.5, this.cellW, this.cellH);

      const m = this.movies[i];
      if (m?.rating > 0) {
        ctx.font = `bold ${Math.max(6, this.cellW * 0.2)}px sans-serif`;
        ctx.fillStyle = '#FFD700'; ctx.shadowColor = '#000'; ctx.shadowBlur = 2;
        ctx.fillText(`★ ${m.rating.toFixed(1)}`, 3, this.cellH - 10);
        ctx.shadowBlur = 0;
      }
      if (m?.title) {
        ctx.font = `600 ${Math.max(5, this.cellW * 0.17)}px sans-serif`;
        ctx.fillStyle = '#fff';
        let t = m.title;
        const mw = this.cellW - 5;
        while (ctx.measureText(t).width > mw && t.length > 2) t = t.slice(0, -1);
        if (t !== m.title) t += '…';
        ctx.fillText(t, 2, this.cellH - 2);
      }

      // Accent border glow
      ctx.globalAlpha = 0.75;
      ctx.strokeStyle = '#00C9A7';
      ctx.lineWidth = 1.2 / scale;
      ctx.shadowColor = '#00C9A7'; ctx.shadowBlur = 6 / scale;
      ctx.beginPath();
      ctx.roundRect(1 / scale, 1 / scale, this.cellW - 2 / scale, this.cellH - 2 / scale, 2);
      ctx.stroke();
    }

    ctx.restore();
  }

  _draw() {
    const ctx = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;
    ctx.clearRect(0, 0, W, H);

    // Draw all tiles except hot
    for (let i = this.total - 1; i >= 0; i--) {
      if (i === this.hoveredIdx) continue;
      this._drawTile(i);
    }
    // Hot tile on top
    if (this.hoveredIdx >= 0 && this.hoveredIdx < this.total)
      this._drawTile(this.hoveredIdx);

  }

  _loop() {
    const changing = this._tick();
    if (this._dirty || changing) { this._draw(); this._dirty = false; }
    this._raf = requestAnimationFrame(() => this._loop());
  }
}
