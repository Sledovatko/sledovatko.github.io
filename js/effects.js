// Decorative card motion only: no click handlers, data access or network work.
(() => {
  'use strict';

  function init() {
    const screen = document.getElementById('screen');
    if (!screen || !window.matchMedia) return;

    const finePointer = window.matchMedia('(any-hover: hover) and (any-pointer: fine)');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const passive = { passive: true };
    const properties = ['--fx-x', '--fx-y', '--fx-rx', '--fx-ry'];
    const pendingReveal = new Set();
    const seen = new WeakSet();
    const maxPendingReveal = 120;
    let revealObserver = null;
    let activeCard = null;
    let cardRect = null;
    let pointerX = 0;
    let pointerY = 0;
    let frame = 0;

    function clearPointer() {
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      if (activeCard) {
        activeCard.classList.remove('fx-card-active');
        properties.forEach(property => activeCard.style.removeProperty(property));
      }
      activeCard = null;
      cardRect = null;
    }

    function pointerAllowed() {
      return (finePointer.matches || document.documentElement.dataset.input === 'mouse') && !reducedMotion.matches && !document.hidden;
    }

    function paintPointer() {
      frame = 0;
      if (!pointerAllowed() || !activeCard?.isConnected || activeCard.closest('[inert]')) {
        clearPointer();
        return;
      }
      // Measure once before adding the active transform, avoiding tilt feedback.
      if (!cardRect) cardRect = activeCard.getBoundingClientRect();
      if (!cardRect.width || !cardRect.height) {
        clearPointer();
        return;
      }
      const x = Math.max(0, Math.min(1, (pointerX - cardRect.left) / cardRect.width));
      const y = Math.max(0, Math.min(1, (pointerY - cardRect.top) / cardRect.height));
      activeCard.style.setProperty('--fx-x', `${(x * 100).toFixed(2)}%`);
      activeCard.style.setProperty('--fx-y', `${(y * 100).toFixed(2)}%`);
      activeCard.style.setProperty('--fx-rx', `${((0.5 - y) * 7).toFixed(2)}deg`);
      activeCard.style.setProperty('--fx-ry', `${((x - 0.5) * 8).toFixed(2)}deg`);
      activeCard.classList.add('fx-card-active');
    }

    document.addEventListener('pointermove', event => {
      if (!pointerAllowed() || event.isPrimary === false || event.pointerType === 'touch' || event.buttons) {
        clearPointer();
        return;
      }
      const card = event.target.closest?.('.movie-card');
      if (!card || !screen.contains(card)) {
        clearPointer();
        return;
      }
      if (card !== activeCard) {
        clearPointer();
        activeCard = card;
      }
      pointerX = event.clientX;
      pointerY = event.clientY;
      if (!frame) frame = window.requestAnimationFrame(paintPointer);
    }, passive);

    document.addEventListener('pointerout', event => {
      if (activeCard && (!event.relatedTarget || !activeCard.contains(event.relatedTarget))) clearPointer();
    }, passive);
    document.addEventListener('pointercancel', clearPointer, passive);
    document.addEventListener('pointerdown', clearPointer, passive);
    document.addEventListener('scroll', clearPointer, { passive: true, capture: true });
    window.addEventListener('resize', clearPointer, passive);
    window.addEventListener('blur', clearPointer, passive);
    window.addEventListener('pagehide', clearPointer, passive);
    window.addEventListener('hashchange', clearPointer, passive);
    window.addEventListener('popstate', clearPointer, passive);

    function reveal(card) {
      pendingReveal.delete(card);
      revealObserver?.unobserve(card);
      if (card.isConnected) card.classList.add('fx-visible');
    }

    function disableReveal() {
      revealObserver?.disconnect();
      revealObserver = null;
      pendingReveal.forEach(card => card.classList.remove('fx-reveal', 'fx-visible'));
      pendingReveal.clear();
      screen.querySelectorAll('.fx-reveal').forEach(card => card.classList.remove('fx-reveal', 'fx-visible'));
    }

    function prepareCard(card) {
      if (!revealObserver || seen.has(card)) return;
      seen.add(card);
      // Overflow cards remain ordinary visible cards; observer memory stays bounded.
      if (pendingReveal.size >= maxPendingReveal) return;
      try {
        revealObserver.observe(card);
        pendingReveal.add(card);
        // This class must never hide a card by itself: failure remains visible.
        card.classList.add('fx-reveal');
      } catch {
        pendingReveal.delete(card);
        card.classList.remove('fx-reveal');
      }
    }

    function scan(node) {
      if (node.nodeType !== 1) return;
      if (node.matches('.movie-card')) prepareCard(node);
      node.querySelectorAll('.movie-card').forEach(prepareCard);
    }

    function refreshPreferences() {
      clearPointer();
      if (reducedMotion.matches || document.hidden) {
        disableReveal();
        return;
      }
      if (!revealObserver && 'IntersectionObserver' in window) {
        try {
          revealObserver = new IntersectionObserver(entries => {
            entries.forEach(entry => { if (entry.isIntersecting) reveal(entry.target); });
          }, { threshold: 0.06 });
          scan(screen);
        } catch {
          disableReveal();
        }
      }
    }

    // One observer for all dynamic routes; attribute updates cannot retrigger it.
    if ('MutationObserver' in window) {
      const mutations = new MutationObserver(records => {
        if (activeCard && !activeCard.isConnected) clearPointer();
        pendingReveal.forEach(card => {
          if (!card.isConnected) {
            revealObserver?.unobserve(card);
            pendingReveal.delete(card);
            card.classList.remove('fx-reveal');
          }
        });
        if (!revealObserver) return;
        records.forEach(record => record.addedNodes.forEach(scan));
      });
      mutations.observe(screen, { childList: true, subtree: true });
    }

    [finePointer, reducedMotion].forEach(media => {
      if (media.addEventListener) media.addEventListener('change', refreshPreferences);
      else media.addListener?.(refreshPreferences);
    });
    document.addEventListener('visibilitychange', refreshPreferences, passive);
    refreshPreferences();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
