// A real tap activates a card once; scrolling and pinch gestures never do.
// Safari's edge navigation needs an early cancelable touchstart. Only the
// narrow edge strip uses manual scrolling; normal scrolling stays native.
(() => {
  'use strict';
  const edgeWidth = 18, tapDistance = 5, scrollQuietTime = 150;
  const horizontalSelector = '.category__row,.gallery,.mood-chips,.labels-row,.cal-row';
  let gesture = null, lastTouch = 0, compatibilityTap = null;
  let multiTouch = false, standalone = false;
  const displayMode = window.matchMedia?.('(display-mode: standalone)');
  const now = () => Date.now();
  const lastScroll = new WeakMap();
  const point = (list, id) => Array.from(list || []).find(t => t.identifier === id);
  const available = el => el?.isConnected && !el.closest('[inert]') && !el.disabled;

  function scrollParent(target, axis) {
    for (let el = target; el && el !== document.body; el = el.parentElement) {
      const style = getComputedStyle(el);
      if (axis === 'x' && el.scrollWidth > el.clientWidth + 1 && /auto|scroll/.test(style.overflowX)) return el;
      if (axis === 'y' && el.scrollHeight > el.clientHeight + 1 && /auto|scroll/.test(style.overflowY)) return el;
    }
    return null;
  }
  function horizontalAtEdge(target, y) {
    const direct = scrollParent(target, 'x');
    if (direct) return direct;
    // A touch can begin in the page gutter just outside the row itself.
    const surface = target.closest('.modal-overlay') || document.getElementById('screen');
    return Array.from(surface?.querySelectorAll(horizontalSelector) || []).find(el => {
      if (!available(el) || el.scrollWidth <= el.clientWidth + 1) return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && y >= rect.top && y <= rect.bottom;
    }) || null;
  }
  function endHover(card) {
    if (!card) return;
    card._hoverActive = false;
    clearTimeout(card._miniTimer);
    if (typeof hideMiniTrailer === 'function') hideMiniTrailer(card);
  }
  function reset() { gesture = null; }
  function scrollSnapshot(target) {
    const parents = [];
    for (let el = target; el; el = el.parentElement) {
      parents.push({ el, left: el.scrollLeft, top: el.scrollTop });
    }
    return parents;
  }
  const scrollChanged = state => state.parents.some(({ el, left, top }) => el.scrollLeft !== left || el.scrollTop !== top);
  function rememberRelease(touch, state, canceled = false) {
    if (!touch) return;
    compatibilityTap = { time: now(), x: touch.clientX, y: touch.clientY, card: canceled ? state?.card : null };
  }
  function resetTouches() { reset(); multiTouch = false; }
  function updateDisplayMode() {
    standalone = displayMode?.matches === true || window.navigator?.standalone === true;
    document.documentElement.dataset.displayMode = standalone ? 'standalone' : 'browser';
    resetTouches();
  }
  updateDisplayMode();
  if (displayMode?.addEventListener) displayMode.addEventListener('change', updateDisplayMode);
  else displayMode?.addListener?.(updateDisplayMode);
  const appSurface = target => target === document.body || target === document.documentElement || target?.closest?.('#app,.modal-overlay');
  function blockPinch(event) {
    if (!standalone || (!multiTouch && !appSurface(event.target))) return false;
    multiTouch = true;
    reset();
    if (event.cancelable) event.preventDefault();
    return true;
  }
  // WebKit's GestureEvents supplement touch-action on installed iOS apps.
  // Do not release the touch latch at gestureend: one finger can still be down.
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(type, event => {
      if (!standalone || !appSurface(event.target)) return;
      reset();
      if (event.cancelable) event.preventDefault();
    }, { capture: true, passive: false });
  }

  document.addEventListener('touchstart', event => {
    lastTouch = now();
    compatibilityTap = null;
    document.documentElement.dataset.input = 'touch';
    if ((multiTouch || event.touches.length > 1) && blockPinch(event)) return;
    if (event.touches.length !== 1 || !event.target.closest) { reset(); return; }
    const target = event.target, surface = target.closest('#app,.modal-overlay');
    if (!surface || target.closest('[inert]')) { reset(); return; }
    const touch = event.touches[0], card = target.closest('.movie-card');
    endHover(card);
    const edge = touch.clientX <= edgeWidth || touch.clientX >= window.innerWidth - edgeWidth;
    if (!edge && !card) { reset(); return; }
    const owned = edge && event.cancelable;
    if (owned) event.preventDefault();
    const horizontal = owned ? horizontalAtEdge(target, touch.clientY) : null;
    const vertical = owned ? scrollParent(target, 'y') || scrollParent(horizontal, 'y') : null;
    const parents = scrollSnapshot(target);
    // A touch used to stop a still-moving list is not a request to open a film.
    const settling = parents.some(({ el }) => now() - (lastScroll.get(el) ?? -Infinity) < scrollQuietTime);
    gesture = {
      id: touch.identifier, x: touch.clientX, y: touch.clientY, started: lastTouch,
      lastPoint: touch, parents,
      card, target, owned, horizontal, vertical, left: horizontal?.scrollLeft || 0,
      top: vertical?.scrollTop || 0, moved: settling, axis: null,
      action: card ? target.closest('[data-action]') || card : target.closest('button,a,summary')
    };
  }, { capture: true, passive: false });

  document.addEventListener('touchmove', event => {
    if ((multiTouch || event.touches.length > 1) && blockPinch(event)) return;
    const state = gesture;
    if (!state) return;
    if (event.touches.length !== 1) { reset(); return; }
    const touch = point(event.touches, state.id);
    if (!touch) { reset(); return; }
    state.lastPoint = touch;
    const dx = touch.clientX - state.x, dy = touch.clientY - state.y;
    if (Math.hypot(dx, dy) > tapDistance || scrollChanged(state)) state.moved = true;
    if (!state.owned) return;
    if (event.cancelable) event.preventDefault();
    if (!state.axis && Math.max(Math.abs(dx), Math.abs(dy)) >= 6) state.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    if (state.axis === 'x' && available(state.horizontal)) state.horizontal.scrollLeft = state.left - dx;
    if (state.axis === 'y' && available(state.vertical)) state.vertical.scrollTop = state.top - dy;
  }, { capture: true, passive: false });

  document.addEventListener('touchend', event => {
    if (multiTouch) {
      if (event.cancelable) event.preventDefault();
      const touch = event.changedTouches[0];
      if (touch) compatibilityTap = { time: now(), x: touch.clientX, y: touch.clientY };
      if (!event.touches.length) resetTouches();
      return;
    }
    const state = gesture; reset();
    if (!state || event.touches.length) return;
    const touch = point(event.changedTouches, state.id);
    if (!touch || !available(state.target)) return;
    const moved = state.moved || scrollChanged(state) || Math.hypot(touch.clientX - state.x, touch.clientY - state.y) > tapDistance;
    const canceled = moved || now() - state.started > 650 || !available(state.action);
    if (state.owned || (state.card && canceled)) {
      if (event.cancelable) event.preventDefault();
    }
    if (canceled) { rememberRelease(touch, state, true); return; }
    if (!event.cancelable) return;
    // Cancel iOS's emulated mouse/hover sequence before opening a dialog.
    event.preventDefault();
    rememberRelease(touch, state);
    state.action.click();
  }, { capture: true, passive: false });

  document.addEventListener('click', event => {
    if (!compatibilityTap || !event.detail || event.pointerType && event.pointerType !== 'touch' || event.sourceCapabilities?.firesTouchEvents === false) return;
    const sameCanceledCard = compatibilityTap.card && event.target.closest?.('.movie-card') === compatibilityTap.card;
    if (now() - compatibilityTap.time < 750 && (sameCanceledCard || Math.hypot(event.clientX - compatibilityTap.x, event.clientY - compatibilityTap.y) < 25)) {
      event.preventDefault(); event.stopImmediatePropagation(); compatibilityTap = null;
    }
  }, true);
  document.addEventListener('touchcancel', event => {
    if (gesture) rememberRelease(point(event.changedTouches, gesture.id) || gesture.lastPoint, gesture, true);
    reset();
    if (!event.touches.length) multiTouch = false;
  }, { capture: true, passive: true });
  document.addEventListener('scroll', event => {
    const target = event.target === document ? document.documentElement : event.target;
    lastScroll.set(target, now());
    if (gesture?.parents.some(({ el }) => el === target)) gesture.moved = true;
  }, { capture: true, passive: true });
  document.addEventListener('pointermove', event => {
    if (event.pointerType === 'mouse' && now() - lastTouch > 800) document.documentElement.dataset.input = 'mouse';
  }, { passive: true });
  window.addEventListener('blur', resetTouches);
  window.addEventListener('pagehide', resetTouches);
})();
