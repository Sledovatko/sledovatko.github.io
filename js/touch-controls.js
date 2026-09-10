// A real tap activates a card once; scrolling and pinch gestures never do.
// Safari's edge navigation needs an early cancelable touchstart. Only the
// narrow edge strip uses manual scrolling; normal scrolling stays native.
(() => {
  'use strict';
  const edgeWidth = 18, tapDistance = 10;
  const horizontalSelector = '.category__row,.gallery,.mood-chips,.labels-row,.cal-row';
  let gesture = null, lastTouch = 0, compatibilityTap = null;
  const now = () => Date.now();
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

  document.addEventListener('touchstart', event => {
    lastTouch = now();
    compatibilityTap = null;
    document.documentElement.dataset.input = 'touch';
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
    gesture = {
      id: touch.identifier, x: touch.clientX, y: touch.clientY, started: lastTouch,
      card, target, owned, horizontal, vertical, left: horizontal?.scrollLeft || 0,
      top: vertical?.scrollTop || 0, moved: false, axis: null,
      action: card ? target.closest('[data-action]') || card : target.closest('button,a,summary')
    };
  }, { capture: true, passive: false });

  document.addEventListener('touchmove', event => {
    const state = gesture;
    if (!state) return;
    if (event.touches.length !== 1) { reset(); return; }
    const touch = point(event.touches, state.id);
    if (!touch) { reset(); return; }
    const dx = touch.clientX - state.x, dy = touch.clientY - state.y;
    if (Math.hypot(dx, dy) > tapDistance) state.moved = true;
    if (!state.owned) return;
    if (event.cancelable) event.preventDefault();
    if (!state.axis && Math.max(Math.abs(dx), Math.abs(dy)) >= 6) state.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    if (state.axis === 'x' && available(state.horizontal)) state.horizontal.scrollLeft = state.left - dx;
    if (state.axis === 'y' && available(state.vertical)) state.vertical.scrollTop = state.top - dy;
  }, { capture: true, passive: false });

  document.addEventListener('touchend', event => {
    const state = gesture; reset();
    if (!state || event.touches.length) return;
    const touch = point(event.changedTouches, state.id);
    if (!touch || !available(state.target)) return;
    const moved = state.moved || Math.hypot(touch.clientX - state.x, touch.clientY - state.y) > tapDistance;
    if (state.owned || (state.card && moved)) {
      if (event.cancelable) event.preventDefault();
    }
    if (moved || now() - state.started > 650 || !available(state.action) || !event.cancelable) return;
    // Cancel iOS's emulated mouse/hover sequence before opening a dialog.
    event.preventDefault();
    compatibilityTap = { time: now(), x: touch.clientX, y: touch.clientY };
    state.action.click();
  }, { capture: true, passive: false });

  document.addEventListener('click', event => {
    if (!compatibilityTap || !event.detail || event.pointerType && event.pointerType !== 'touch' || event.sourceCapabilities?.firesTouchEvents === false) return;
    if (now() - compatibilityTap.time < 750 && Math.hypot(event.clientX - compatibilityTap.x, event.clientY - compatibilityTap.y) < 25) {
      event.preventDefault(); event.stopImmediatePropagation(); compatibilityTap = null;
    }
  }, true);
  document.addEventListener('touchcancel', reset, { capture: true, passive: true });
  document.addEventListener('scroll', () => { if (gesture && !gesture.owned) gesture.moved = true; }, { capture: true, passive: true });
  document.addEventListener('pointermove', event => {
    if (event.pointerType === 'mouse' && now() - lastTouch > 800) document.documentElement.dataset.input = 'mouse';
  }, { passive: true });
  window.addEventListener('blur', reset);
  window.addEventListener('pagehide', reset);
})();
