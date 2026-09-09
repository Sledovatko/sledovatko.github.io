/* Static frontend authentication and versioned library sync.
 * Passwords are handled exclusively by Supabase Auth. Library writes use the
 * ownership-checked, compare-and-swap RPCs in backend/setup.sql.
 */
function createAccount(deps = {}) {
  const disk = deps.disk || localStorage, data = deps.data || Storage;
  const doc = deps.document || document, win = deps.window || window;
  const online = deps.online || (() => navigator.onLine !== false);
  const OWNER = 'wm_library_owner', GUEST = 'wm_guest_library', CACHE = 'wm_account_library';
  let generation = 0, timer = null, busy = null, suspended = false, initialized = false;
  let localRevision = 0, dirty = false, edits = 0, remoteConflict = null;
  let client = deps.client || null;
  const state = { configured: false, user: null, status: 'guest', message: '', ready: false, recovery: false, githubEnabled: false, emailEnabled: true };
  const read = key => { try { return JSON.parse(disk.getItem(key) || 'null'); } catch { return null; } };
  const write = (key, value) => disk.setItem(key, JSON.stringify(value));
  const normalize = snapshot => data.mergeCloudSnapshots(snapshot, data.emptyCloudSnapshot());
  const noteDraftKey = owner => 'wm_pending_notes:' + (owner || 'guest');
  function flushPendingNotes() {
    const errors = [];
    doc.dispatchEvent(new CustomEvent('librarybeforechange', { detail: { errors } }));
    if (errors.length) throw errors[0];
  }
  function withPendingNotes(owner, snapshot) {
    const drafts = read(noteDraftKey(owner));
    if (!drafts || !Object.keys(drafts).length) return { snapshot, pending: false, changed: false };
    const comments = { ...(snapshot.wm_comments || {}) };
    for (const [id, draft] of Object.entries(drafts)) {
      if (!/^(tv:)?[0-9]{1,15}$/.test(id) || typeof draft?.value !== 'string') throw Error('Invalid pending note');
      const value = draft.value.trim();
      if (value) comments[id] = value; else delete comments[id];
    }
    const changed = JSON.stringify(comments) !== JSON.stringify(snapshot.wm_comments || {});
    return { snapshot: normalize({ ...snapshot, wm_comments: comments }), pending: true, changed };
  }
  function emit(status, message = '') {
    state.status = status; state.message = message;
    doc.dispatchEvent(new CustomEvent('accountchange'));
  }
  function apply(snapshot) {
    suspended = true;
    try { data.applyCloudSnapshot(snapshot); } finally { suspended = false; }
  }
  function refresh() {
    doc.dispatchEvent(new CustomEvent('favorites-changed'));
    doc.dispatchEvent(new CustomEvent('tv-progress-changed'));
  }
  function envelope(snapshot = data.getCloudSnapshot()) {
    return { userId: state.user.id, revision: localRevision, dirty, snapshot };
  }
  function persist() { if (state.user) write(CACHE, envelope()); }
  function own() { return state.user && disk.getItem(OWNER) === state.user.id; }
  function clearTimer() { if (timer !== null) { clearTimeout(timer); timer = null; } }
  function schedule(delay = 1200) {
    clearTimer();
    timer = setTimeout(() => { timer = null; sync().catch(() => {}); }, delay);
  }
  function failure(error) {
    if (!online()) emit('offline', 'Jsi offline. Změny zůstávají v tomto zařízení.');
    else emit('error', error?.code === '42501'
      ? 'Úložiště účtu není správně nastavené. Místní data zůstala zachována.'
      : 'Synchronizace se nezdařila. Změny jsou uložené v tomto zařízení; zkus to znovu.');
  }
  function change() {
    if (suspended || !initialized) return;
    if (!state.user) return; // Guest data already lives in wm_* and never uploads implicitly.
    if (!own() || !state.ready) { emit('error', 'Účet se změnil v jiné kartě. Obnov stránku před dalšími úpravami.'); return; }
    dirty = true; edits++;
    try { persist(); } catch { emit('error', 'Chybí místo pro zálohu synchronizace. Exportuj knihovnu a uvolni místo.'); return; }
    if (remoteConflict) { emit('conflict', 'Na jiném zařízení se knihovna změnila. Vyber způsob sloučení.'); return; }
    emit(online() ? 'pending' : 'offline', online() ? 'Změny čekají na synchronizaci.' : 'Jsi offline. Změny zůstávají v tomto zařízení.');
    schedule();
  }
  async function rpc(name, params, signal) {
    let request = client.rpc(name, params);
    if (request.abortSignal) request = request.abortSignal(signal);
    const result = await request;
    if (result.error) throw result.error;
    return result.data;
  }
  function validRemote(result) {
    if (!result || !Number.isSafeInteger(result.revision) || result.revision < 0) throw Error('Invalid revision');
    return { ...result, snapshot: result.snapshot ? normalize(result.snapshot) : data.emptyCloudSnapshot() };
  }
  async function sync() {
    if (!client || !state.user || !state.ready || !own()) return false;
    if (remoteConflict) { emit('conflict', 'Knihovna se změnila i na jiném zařízení. Vyber, co zachovat.'); return false; }
    if (!online()) { emit('offline', 'Jsi offline. Změny zůstávají v tomto zařízení.'); return false; }
    if (busy) return busy;
    const epoch = generation, userId = state.user.id;
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 20000);
    const active = () => epoch === generation && state.user?.id === userId && own();
    emit('connecting', 'Synchronizuji knihovnu…');
    const operation = (async () => {
      try {
        // Always read first: another device may have edited or deleted entries.
        const beforeEdits = edits;
        const remote = validRemote(await rpc('get_library', {}, controller.signal));
        if (!active()) return false;
        if (remote.revision !== localRevision) {
          if (dirty || edits !== beforeEdits) {
            remoteConflict = remote;
            emit('conflict', 'Na jiném zařízení se knihovna změnila. Vyber způsob sloučení.');
            return false;
          }
          apply(remote.snapshot); localRevision = remote.revision; persist(); refresh();
        }
        if (dirty) {
          const sentEdits = edits, sent = data.getCloudSnapshot();
          const result = await rpc('save_library', { p_expected_revision: localRevision, p_snapshot: sent }, controller.signal);
          if (!active()) return false;
          if (result?.conflict) {
            remoteConflict = validRemote(result);
            emit('conflict', 'Obě zařízení uložila změny současně. Vyber způsob sloučení.'); return false;
          }
          if (!result?.ok || !Number.isSafeInteger(result.revision) || result.revision <= localRevision) throw Error('Invalid save response');
          localRevision = result.revision;
          dirty = edits !== sentEdits;
          persist();
        }
        emit(dirty ? 'pending' : 'synced', dirty ? 'Dokončuji poslední změny…' : 'Knihovna je synchronizovaná.');
        if (dirty) schedule();
        return !dirty;
      } catch (error) { if (active()) failure(error); return false; }
      finally { clearTimeout(timeout); }
    })();
    busy = operation;
    try { return await operation; } finally { if (busy === operation) busy = null; }
  }
  async function acceptSession(session) {
    const next = session?.user || null;
    if (state.user?.id === next?.id && state.ready) return;
    generation++; busy = null; clearTimer(); remoteConflict = null;
    // The old library is still owned/editable here. Complete synchronous UI
    // drafts before closing dialogs, taking a rollback, or installing next's data.
    try { flushPendingNotes(); }
    catch {
      clearTimer(); state.ready = false;
      emit('error', 'Rozepsanou poznámku se nepodařilo uložit. Zkopíruj ji a ověř volné místo.');
      return false;
    }
    clearTimer(); // A completed draft may have scheduled a save for the old user.
    state.ready = false;
    // Close dialogs tied to a different library. Avoid navigating backward through them.
    if (typeof Dialogs !== 'undefined') {
      Dialogs.restore(null);
      if (win.history.state?.layer) { const route = { ...win.history.state }; delete route.layer; win.history.replaceState(route, '', win.location.href); }
    }
    const owner = disk.getItem(OWNER), cached = read(CACHE);
    try {
      if (owner && owner !== next?.id) {
        // Account snapshot is already durable after every edit. Never expose it as guest data.
        if (state.user?.id === owner) persist();
        const leaving = read(CACHE);
        // Forced sign-out/account changes can happen in another tab. Retain an
        // unsent replica under its owner, never mix it into the guest library.
        if (leaving?.userId === owner) {
          const notes = withPendingNotes(owner, data.getCloudSnapshot()), snapshot = notes.snapshot;
          if (leaving.dirty || notes.changed || JSON.stringify(snapshot) !== JSON.stringify(leaving.snapshot)) {
            write(CACHE + ':' + owner, { ...leaving, dirty: true, snapshot });
          }
          if (notes.pending) disk.removeItem(noteDraftKey(owner));
        }
        const guest = withPendingNotes(null, read(GUEST) || data.emptyCloudSnapshot());
        apply(guest.snapshot); disk.removeItem(OWNER);
        if (guest.pending) disk.removeItem(noteDraftKey(null));
      }
      if (!next) {
        if (!owner) {
          const notes = withPendingNotes(null, data.getCloudSnapshot());
          if (notes.changed) apply(notes.snapshot);
          if (notes.pending) disk.removeItem(noteDraftKey(null));
        }
        state.user = null; localRevision = 0; dirty = false;
        state.ready = true; emit(state.configured ? 'guest' : 'disabled', 'Knihovna je uložená v tomto zařízení.');
        refresh(); return true;
      }
      if (!owner) {
        const guest = withPendingNotes(null, data.getCloudSnapshot());
        write(GUEST, guest.snapshot);
        if (guest.pending) disk.removeItem(noteDraftKey(null));
      }
      state.user = next;
      const existing = cached?.userId === next.id ? cached : read(CACHE + ':' + next.id);
      localRevision = existing?.revision || 0; dirty = !!existing?.dirty; edits++;
      const current = owner === next.id ? data.getCloudSnapshot() : null;
      if (current && JSON.stringify(current) !== JSON.stringify(existing?.snapshot)) dirty = true;
      const notes = withPendingNotes(next.id, current || (existing ? normalize(existing.snapshot) : data.emptyCloudSnapshot()));
      dirty ||= notes.changed;
      apply(notes.snapshot);
      disk.setItem(OWNER, next.id);
      persist(); disk.removeItem(CACHE + ':' + next.id); state.ready = true;
      if (notes.pending) disk.removeItem(noteDraftKey(next.id));
      emit('connecting', 'Načítám knihovnu účtu…'); refresh();
      await sync();
      return true;
    } catch (error) {
      state.user = next; state.ready = false;
      emit('error', 'Knihovnu účtu nelze bezpečně otevřít. Exportuj místní data a ověř volné místo.');
      return false;
    }
  }
  async function resolveConflict(mode) {
    if (!remoteConflict || !own()) return false;
    const remote = remoteConflict, local = data.getCloudSnapshot();
    if (!['remote', 'local', 'merge'].includes(mode)) throw Error('Unknown conflict strategy');
    // Keep the replaced snapshot as a local rollback until the next resolution.
    write('wm_sync_rollback', { userId: state.user.id, snapshot: local, at: Date.now() });
    const chosen = mode === 'remote' ? remote.snapshot : mode === 'merge' ? data.mergeCloudSnapshots(local, remote.snapshot) : local;
    apply(chosen); localRevision = remote.revision; dirty = mode !== 'remote'; edits++;
    remoteConflict = null; persist(); refresh();
    return sync();
  }
  function getGuestSnapshot() { return state.user ? normalize(read(GUEST) || data.emptyCloudSnapshot()) : data.getCloudSnapshot(); }
  function hasGuest() {
    const snapshot = getGuestSnapshot();
    return ['wm_favorites','wm_watched','wm_ratings','wm_comments','wm_labels','wm_order','wm_saved_searches','wm_watched_episodes','wm_custom_labels','wm_hidden_labels'].some(key => Object.keys(snapshot[key] || {}).length > 0);
  }
  async function importGuest() {
    if (!own() || !state.ready) throw Error('Account not ready');
    apply(data.mergeCloudSnapshots(data.getCloudSnapshot(), getGuestSnapshot()));
    change(); refresh(); return sync();
  }
  async function signOut() {
    if (!state.user) return;
    // Flushing can turn a previously clean library dirty; sync that final edit
    // before signing out, while the original owner's write gate is still open.
    flushPendingNotes();
    if (dirty || remoteConflict) {
      await sync();
      if (dirty || remoteConflict) throw Error('Nejdřív dokonči synchronizaci nebo vyřeš konflikt, aby změny zůstaly bezpečně uložené.');
    }
    state.ready = false;
    emit('connecting', 'Odhlašuji účet…');
    let result;
    try { result = await client.auth.signOut({ scope: 'local' }); }
    catch { state.ready = true; emit('error', 'Odhlášení se nezdařilo. Zkus to znovu.'); throw Error(state.message); }
    if (result.error) { state.ready = true; emit('error', 'Odhlášení se nezdařilo. Zkus to znovu.'); throw Error(state.message); }
    await acceptSession(null);
    if (!state.ready || disk.getItem(OWNER)) throw Error('Odhlášení účtu proběhlo, ale místní knihovnu nelze obnovit. Záložní kopie zůstala zachovaná.');
    // A completed, signed-out account needs no local replica.
    disk.removeItem(CACHE); disk.removeItem('wm_sync_rollback');
  }
  async function init() {
    if (initialized) return;
    initialized = true;
    const config = deps.config || win.SLEDOVATKO_AUTH || {};
    state.githubEnabled = config.githubEnabled === true;
    state.emailEnabled = config.emailEnabled !== false;
    state.configured = !!(client || (/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(config.url || '') && config.publishableKey));
    if (!state.configured) { await acceptSession(null); return; }
    if (!client) {
      if (!win.supabase?.createClient) { emit('error', 'Nepodařilo se načíst přihlašování. Obnov stránku.'); return; }
      // Reject accidental privileged keys in a public configuration.
      let privileged = /^sb_secret_/.test(config.publishableKey);
      try { privileged ||= JSON.parse(atob(config.publishableKey.split('.')[1])).role === 'service_role'; } catch {}
      if (privileged) { state.configured = false; await acceptSession(null); emit('error', 'Konfigurace účtu obsahuje nevhodný klíč. Použij veřejný publishable key.'); return; }
      client = win.supabase.createClient(config.url, config.publishableKey, {
        auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'sledovatko-auth' }
      });
    }
    doc.addEventListener('librarychange', change);
    win.addEventListener('online', () => schedule(250));
    win.addEventListener('offline', () => { if (state.user) emit('offline', 'Jsi offline. Změny zůstávají v tomto zařízení.'); });
    doc.addEventListener('visibilitychange', () => { if (!doc.hidden) schedule(250); });
    win.addEventListener('beforeunload', event => { if (state.user && dirty) { event.preventDefault(); event.returnValue = ''; } });
    win.addEventListener('storage', event => {
      if (![OWNER, CACHE].includes(event.key)) return;
      // Another tab owns the shared localStorage. Stop stale RPC completions.
      generation++; busy = null; clearTimer();
      if (!state.user || !own()) {
        state.ready = false;
        emit('error', 'Účet se změnil v jiné kartě. Obnov stránku.');
      } else {
        const latest = read(CACHE);
        if (latest?.userId === state.user.id) {
          localRevision = latest.revision; dirty = latest.dirty; edits++;
          remoteConflict = null;
          emit(dirty ? 'pending' : 'synced', dirty ? 'Dokončuji změny z další karty…' : 'Knihovna je synchronizovaná.');
          refresh(); schedule(2000);
        }
      }
    });
    let booting = true;
    client.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') state.recovery = true;
      // Do not await Supabase calls inside its auth lock/callback.
      if (!booting && ['SIGNED_IN', 'SIGNED_OUT', 'PASSWORD_RECOVERY'].includes(event)) {
        setTimeout(() => { acceptSession(session).then(() => {
          if (state.recovery && typeof openAccount === 'function') openAccount('recovery');
        }); }, 0);
      }
    });
    try {
      const url = new URL(win.location.href), code = url.searchParams.get('code');
      if (new URLSearchParams(url.hash.slice(1)).has('error')) throw Error('Expired callback');
      let session;
      if (code) {
        const result = await client.auth.exchangeCodeForSession(code);
        if (result.error) throw result.error;
        session = result.data.session;
        state.recovery = url.searchParams.get('auth') === 'recovery';
      } else {
        const result = await client.auth.getSession();
        if (result.error) throw result.error;
        session = result.data.session;
      }
      // Tokens and callback codes never enter app route history or export links.
      if (code || url.searchParams.has('auth') || url.searchParams.has('error')) {
        const callbackError = url.searchParams.has('error');
        for (const key of ['code','auth','error','error_code','error_description']) url.searchParams.delete(key);
        win.history.replaceState(null, '', url.pathname + url.search + '#home');
        if (callbackError) throw Error('Expired callback');
      }
      await acceptSession(session);
    } catch {
      await acceptSession(null);
      emit('error', 'Odkaz už neplatí nebo byl otevřen v jiném prohlížeči. Přihlas se nebo si vyžádej nový odkaz.');
      const url = new URL(win.location.href);
      for (const key of ['code','auth','error','error_code','error_description']) url.searchParams.delete(key);
      win.history.replaceState(null, '', url.pathname + url.search + '#home');
    } finally { booting = false; }
  }
  Object.assign(state, {
    init, sync, acceptSession, resolveConflict, signOut, importGuest, hasGuest, getGuestSnapshot,
    getLocalSnapshot: () => data.getCloudSnapshot(),
    canEdit: () => !state.configured || (state.ready && (!state.user ? !disk.getItem(OWNER) : own())),
    debug: () => ({ revision: localRevision, dirty, edits, generation }),
  });
  Object.defineProperties(state, { client: { get: () => client }, conflict: { get: () => remoteConflict?.snapshot || null } });
  return state;
}
const Account = createAccount();
