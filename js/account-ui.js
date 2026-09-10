// Account UI stays separate from session handling and conflict-safe cloud storage.
const ACCOUNT_USER_ICON = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="8" r="3.6"/><path d="M4.5 21v-2a7.5 7.5 0 0 1 15 0v2"/></svg>';
const ACCOUNT_GITHUB_ICON = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor"><path d="M12 .8a11.2 11.2 0 0 0-3.54 21.83c.56.1.77-.24.77-.54v-2.1c-3.14.68-3.8-1.33-3.8-1.33-.51-1.3-1.25-1.65-1.25-1.65-1.03-.7.08-.69.08-.69 1.14.08 1.73 1.17 1.73 1.17 1.01 1.73 2.64 1.23 3.29.94.1-.73.4-1.23.72-1.51-2.51-.29-5.15-1.26-5.15-5.59 0-1.24.44-2.25 1.16-3.04-.12-.29-.5-1.44.11-3 0 0 .95-.3 3.08 1.16a10.8 10.8 0 0 1 5.61 0c2.14-1.46 3.08-1.16 3.08-1.16.62 1.56.24 2.71.12 3 .72.79 1.15 1.8 1.15 3.04 0 4.34-2.64 5.29-5.16 5.57.41.35.77 1.04.77 2.1v3.09c0 .3.2.65.78.54A11.2 11.2 0 0 0 12 .8Z"/></svg>';
const ACCOUNT_STATUS = { guest: 'Jen v tomto prohlížeči', connecting: 'Připojuji účet…', synced: 'Uloženo v účtu', pending: 'Čeká na uložení', offline: 'Offline · změny jsou tady', conflict: 'Změny na dvou zařízeních', error: 'Uložení vyžaduje pozornost', disabled: 'Účet není dostupný' };
const ACCOUNT_GOOGLE_ICON = '<svg aria-hidden="true" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6C44.4 38.03 46.98 31.87 46.98 24.55Z"/><path fill="#FBBC05" d="M10.53 28.59A14.42 14.42 0 0 1 9.75 24c0-1.59.27-3.13.76-4.59l-7.98-6.19A23.87 23.87 0 0 0 0 24c0 3.87.93 7.53 2.56 10.78l7.97-6.19Z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.91-5.8l-7.73-6c-2.15 1.45-4.92 2.3-8.18 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z"/></svg>';
let accountOverlay = null;

function accountButton() {
  const state = Account.status || 'guest';
  return `<button type="button" class="glass-icon account-trigger" data-account-open data-account-state="${escHtml(state)}" aria-label="Účet: ${escHtml(ACCOUNT_STATUS[state] || ACCOUNT_STATUS.guest)}" title="Účet"><span class="account-user-icon">${ACCOUNT_USER_ICON}</span><span class="account-status-dot" aria-hidden="true"></span></button>`;
}
function bindAccountButtons(container = document) {
  container.querySelectorAll('[data-account-open]').forEach(button => {
    button.dataset.accountState = Account.status || 'guest';
    button.setAttribute('aria-label', 'Účet: ' + (ACCOUNT_STATUS[Account.status] || ACCOUNT_STATUS.guest));
    if (button._accountBound) return;
    button._accountBound = true;
    button.addEventListener('click', () => openAccount());
  });
}
function accountError(error) {
  const code = String(error?.code || ''), message = String(error?.message || '').toLowerCase();
  if (['provider_disabled', 'oauth_provider_not_supported'].includes(code) || /unsupported provider|provider is not enabled/.test(message)) return 'Tento způsob přihlášení teď není dostupný. Zkus jinou možnost nebo pokračuj bez účtu.';
  if (code === 'manual_linking_disabled') return 'Připojení dalšího přihlášení teď není dostupné. Tvůj současný účet funguje dál.';
  if (['identity_already_exists', 'email_conflict_identity_not_deletable'].includes(code)) return 'Tento Google účet už patří jinému účtu Sledovátka. Použij jiný Google účet nebo se přihlas dosavadním způsobem.';
  if (code === 'library_not_synced') return 'Nejdřív ulož čekající změny nebo vyřeš rozdíl mezi zařízeními. Potom můžeš připojit Google.';
  if (['invalid_credentials', 'invalid_grant'].includes(code) || /invalid login credentials/.test(message)) return 'E-mail nebo heslo nesouhlasí. Zkus údaje znovu, případně obnov heslo.';
  if (code === 'email_not_confirmed' || /email not confirmed/.test(message)) return 'Nejdřív potvrď e-mail od Sledovátka. Potvrzovací zprávu si můžeš poslat znovu.';
  if (['over_email_send_rate_limit', 'over_request_rate_limit'].includes(code) || error?.status === 429) return 'Proběhlo příliš mnoho pokusů. Počkej chvíli a zkus to znovu.';
  if (['weak_password', 'same_password'].includes(code)) return code === 'same_password' ? 'Nové heslo musí být jiné než dosavadní.' : 'Zvol silnější heslo alespoň o 12 znacích. Dobře funguje delší věta.';
  if (['user_already_exists', 'email_exists'].includes(code)) return 'Pro tento e-mail už může existovat účet. Zkus se přihlásit nebo obnovit heslo.';
  if (['signup_disabled', 'email_provider_disabled'].includes(code)) return 'Registrace je teď nedostupná. Můžeš pokračovat bez účtu.';
  if (['otp_expired', 'flow_state_expired', 'flow_state_not_found', 'bad_code_verifier', 'session_not_found'].includes(code)) return 'Odkaz vypršel nebo byl otevřen v jiném prohlížeči. Vyžádej si nový a otevři ho tady.';
  if (['reauthentication_needed', 'reauthentication_not_valid'].includes(code)) return 'Pro změnu hesla se znovu přihlas a zkus to ještě jednou.';
  if (!navigator.onLine || /fetch|network|offline/.test(message)) return 'Připojení se nepodařilo. Zkontroluj internet a zkus to znovu.';
  if (Account.user && ['pending', 'offline', 'conflict'].includes(Account.status)) return 'Nejdřív ulož čekající změny nebo vyřeš rozdíl mezi zařízeními. Zálohu si můžeš stáhnout i teď.';
  return 'Akci se nepodařilo dokončit. Zkus to za chvíli znovu; místní data zůstávají uložená.';
}
function accountCounts(snapshot) {
  const data = snapshot || {};
  return { favorites: Array.isArray(data.wm_favorites) ? data.wm_favorites.length : 0,
    watched: Array.isArray(data.wm_watched) ? data.wm_watched.length : 0,
    episodes: Object.values(data.wm_watched_episodes || {}).reduce((sum, value) => sum + (Array.isArray(value) ? value.length : 0), 0),
    ratings: Object.keys(data.wm_ratings || {}).length, comments: Object.keys(data.wm_comments || {}).length };
}
function accountComparison(left, right, leftLabel, rightLabel) {
  const a = accountCounts(left), b = accountCounts(right);
  const rows = [['Tituly ve Šuplíku', 'favorites'], ['Viděné tituly', 'watched'], ['Viděné epizody', 'episodes'], ['Hodnocení', 'ratings'], ['Poznámky', 'comments']];
  return `<div class="account-comparison"><table><caption class="sr-only">Porovnání obsahu</caption><thead><tr><th scope="col">Obsah</th><th scope="col">${escHtml(leftLabel)}</th><th scope="col">${escHtml(rightLabel)}</th></tr></thead><tbody>${rows.map(([label, key]) => `<tr><th scope="row">${label}</th><td>${a[key]}</td><td>${b[key]}</td></tr>`).join('')}</tbody></table></div>`;
}
function accountRedirect(mode) { return new URL(location.pathname, location.origin).href + '?auth=' + mode; }
function accountEmailEnabled() { return Account.emailEnabled !== false; }
function accountGithubButton() {
  return Account.githubEnabled === true ? `<button type="button" class="btn btn--ghost account-oauth" data-account-oauth="github" data-account-github>${ACCOUNT_GITHUB_ICON}<span>Pokračovat přes GitHub</span></button>` : '';
}
function accountOAuthButtons() {
  const google = Account.googleEnabled === true ? `<button type="button" class="account-oauth account-oauth--google" data-account-oauth="google">${ACCOUNT_GOOGLE_ICON}<span>Pokračovat přes Google</span></button>` : '';
  const buttons = google + accountGithubButton();
  return buttons ? `<div class="account-providers">${buttons}</div>` : '';
}
function accountIdentityProviders() {
  return [...new Set([...(Account.user?.identities || []).map(identity => identity.provider), ...(Account.user?.app_metadata?.providers || [])])]
    .filter(provider => ['google', 'github', 'email'].includes(provider));
}

function openAccount(mode = 'login') {
  if (accountOverlay?.isConnected) { accountOverlay.querySelector('.modal').focus(); return accountOverlay; }
  let currentMode = accountEmailEnabled() ? (Account.recovery ? 'recovery' : mode) : 'login', email = '', busy = false, notice = '', closedForSession = false;
  let previousUser = Account.user?.id || null;
  const overlay = showModal('', { title: 'Tvůj účet' });
  accountOverlay = overlay; overlay.classList.add('account-overlay');
  const body = overlay.querySelector('.modal-body');
  const setTitle = text => { overlay.querySelector('.modal-header h3').textContent = text; overlay.querySelector('.modal').setAttribute('aria-label', text); };
  const flash = (text, error = false) => {
    const el = overlay.querySelector('[data-account-feedback]');
    if (!el) return;
    el.textContent = text; el.classList.toggle('account-feedback--error', error); el.hidden = !text;
    if (error) el.focus({ preventScroll: true });
  };
  const feedback = () => `<p class="account-feedback" data-account-feedback role="status" aria-live="polite" tabindex="-1" ${notice ? '' : 'hidden'}>${escHtml(notice)}</p>`;
  const setBusy = value => {
    busy = value;
    body.setAttribute('aria-busy', String(value));
    body.querySelectorAll('button,input').forEach(el => { el.disabled = value; });
  };
  const run = async action => {
    if (busy) return;
    setBusy(true); flash('');
    try { await action(); }
    catch (error) { if (overlay.isConnected) flash(accountError(error), true); }
    finally { if (overlay.isConnected) setBusy(false); }
  };
  const changeMode = next => { email = body.querySelector('[name=email]')?.value.trim() || email; currentMode = next; notice = ''; render(); };
  const renderAfterAuth = () => {
    if (overlay.isConnected) render();
    else if (closedForSession && !accountOverlay?.isConnected) {
      openAccount(currentMode);
      if (notice) showToast(notice);
    }
  };
  function footer() {
    return `<div class="account-footer"><button type="button" data-account-info>Soukromí a ukládání</button><button type="button" data-account-transfer>Záloha a přenos</button></div>`;
  }
  function bindCommon() {
    body.querySelectorAll('[data-account-mode]').forEach(button => button.onclick = () => changeMode(button.dataset.accountMode));
    body.querySelectorAll('[data-account-transfer]').forEach(button => button.onclick = () => showSyncModal());
    body.querySelectorAll('[data-account-info]').forEach(button => button.onclick = () => showAccountPrivacy());
    body.querySelectorAll('[data-account-close]').forEach(button => button.onclick = () => overlay.remove());
    body.querySelectorAll('[data-account-oauth]').forEach(button => button.onclick = () => run(async () => {
      const provider = button.dataset.accountOauth;
      flash(provider === 'google' ? 'Otevírám přihlášení Google…' : 'Otevírám přihlášení GitHub…');
      await Account.signInOAuth(provider);
    }));
    body.querySelectorAll('[data-password-toggle]').forEach(button => button.onclick = () => {
      const input = body.querySelector('#' + button.dataset.passwordToggle), showing = input.type === 'password';
      input.type = showing ? 'text' : 'password'; button.textContent = showing ? 'Skrýt' : 'Zobrazit'; button.setAttribute('aria-pressed', String(showing));
    });
  }
  function passwordField(name, label, autocomplete, min = 0) {
    return `<label class="account-field" for="account-${name}">${label}<span class="account-password"><input id="account-${name}" name="${name}" type="password" aria-label="${escHtml(label)}" autocomplete="${autocomplete}" ${min ? `minlength="${min}"` : ''} maxlength="256" required><button type="button" data-password-toggle="account-${name}" aria-label="Zobrazit nebo skrýt: ${label}" aria-pressed="false">Zobrazit</button></span></label>`;
  }
  function renderOAuthOnly() {
    setTitle('Tvůj účet');
    const available = Account.googleEnabled === true || Account.githubEnabled === true;
    body.innerHTML = `<div class="account-intro"><div class="account-emblem">${ACCOUNT_USER_ICON}</div><h2>${available ? 'Tvůj Šuplík. Kdekoli.' : 'Šuplík máš pořád po ruce'}</h2><p>${available ? 'Přihlas se a pokračuj tam, kde jsi skončil. Filmy, epizody i poznámky na všech zařízeních.' : 'Přihlášení teď není dostupné. Sbírku můžeš dál používat v tomto prohlížeči.'}</p></div>
      ${feedback()}${accountOAuthButtons()}
      ${available ? '<p class="account-oauth-note">Jsi tu poprvé? Stejným tlačítkem si vytvoříš účet. Žádné nové heslo si pamatovat nemusíš.</p>' : ''}
      <button type="button" class="btn btn--ghost account-guest" data-account-close>Pokračovat bez účtu</button>${footer()}`;
    bindCommon();
  }
  function renderForm() {
    if (!accountEmailEnabled()) { renderOAuthOnly(); return; }
    const registering = currentMode === 'register', reset = currentMode === 'reset';
    const updating = currentMode === 'recovery' || currentMode === 'password';
    const title = updating ? 'Nové heslo' : reset ? 'Obnovit přístup' : registering ? 'Vytvořit účet' : 'Vítej zpátky';
    setTitle(updating ? 'Změna hesla' : reset ? 'Zapomenuté heslo' : 'Tvůj účet');
    body.innerHTML = `<div class="account-intro"><div class="account-emblem">${ACCOUNT_USER_ICON}</div><h2>${title}</h2><p>${updating ? 'Použij vlastní dlouhé heslo. Správce hesel ti s ním může pomoct.' : reset ? 'Pošleme ti odkaz, přes který nastavíš nové heslo.' : 'Šuplík, epizody a hodnocení s tebou na všech zařízeních.'}</p></div>
      ${!updating && !reset ? `<div class="segmented account-tabs"><button type="button" data-account-mode="login" class="${registering ? '' : 'active'}" aria-pressed="${!registering}">Přihlášení</button><button type="button" data-account-mode="register" class="${registering ? 'active' : ''}" aria-pressed="${registering}">Registrace</button></div>` : ''}
      ${!updating && !reset && (Account.googleEnabled === true || Account.githubEnabled === true) ? accountOAuthButtons() + '<div class="account-or"><span>nebo e-mailem</span></div>' : ''}
      <form class="account-form" autocomplete="on">
      ${!updating ? `<label class="account-field" for="account-email">E-mail<input id="account-email" name="email" type="email" autocomplete="username" inputmode="email" autocapitalize="none" spellcheck="false" maxlength="254" value="${escHtml(email)}" required></label>` : ''}
      ${currentMode === 'password' ? passwordField('current-password', 'Současné heslo', 'current-password') : ''}
      ${!reset ? passwordField('password', updating ? 'Nové heslo' : 'Heslo', registering || updating ? 'new-password' : 'current-password', registering || updating ? 12 : 0) : ''}
      ${registering || updating ? passwordField('password-repeat', 'Heslo znovu', 'new-password', 12) + '<p class="account-field-hint">Alespoň 12 znaků. Heslo nikomu neposílej.</p>' : ''}
      ${feedback()}<button class="btn btn--primary account-submit" type="submit">${updating ? 'Uložit nové heslo' : reset ? 'Poslat odkaz' : registering ? 'Vytvořit účet' : 'Přihlásit se'}</button>
      </form>
      ${currentMode === 'login' ? '<div class="account-form-links"><button type="button" data-account-mode="reset">Zapomenuté heslo</button><button type="button" data-account-mode="confirm">Potvrdit e-mail</button></div>' : ''}
      ${reset ? '<button type="button" class="account-back" data-account-mode="login">Zpět na přihlášení</button>' : ''}
      ${!Account.user ? '<button type="button" class="btn btn--ghost account-guest" data-account-close>Pokračovat bez účtu</button>' : ''}${footer()}`;
    bindCommon();
    body.querySelector('form').addEventListener('submit', event => {
      event.preventDefault();
      if (!accountEmailEnabled()) { currentMode = 'login'; render(); return; }
      const form = event.currentTarget;
      if (!form.reportValidity()) return;
      email = form.elements.email?.value.trim() || email;
      const password = form.elements.password?.value || '', repeat = form.elements['password-repeat']?.value;
      const currentPassword = form.elements['current-password']?.value || '';
      if ((registering || updating) && password !== repeat) { flash('Hesla se neshodují. Zadej obě stejně.', true); form.elements['password-repeat'].focus(); return; }
      run(async () => {
        if (updating) {
          if (currentMode === 'password') {
            const verification = await Account.client.auth.signInWithPassword({ email: Account.user.email, password: currentPassword });
            if (verification.error) throw verification.error;
          }
          const result = await Account.client.auth.updateUser({ password }); if (result.error) throw result.error;
          Account.recovery = false; currentMode = 'login'; notice = 'Nové heslo je uložené.'; renderAfterAuth();
        } else if (reset) {
          const result = await Account.client.auth.resetPasswordForEmail(email, { redirectTo: accountRedirect('recovery') }); if (result.error) throw result.error;
          currentMode = 'reset-sent'; render();
        } else if (registering) {
          const result = await Account.client.auth.signUp({ email, password, options: { emailRedirectTo: accountRedirect('confirm') } }); if (result.error) throw result.error;
          if (result.data?.session) { await Account.acceptSession(result.data.session); notice = 'Účet je připravený.'; }
          else currentMode = 'confirm';
          renderAfterAuth();
        } else {
          const result = await Account.client.auth.signInWithPassword({ email, password }); if (result.error) throw result.error;
          if (!result.data?.session) throw new Error('Missing session');
          await Account.acceptSession(result.data.session); notice = ''; renderAfterAuth();
        }
      });
    });
  }
  function renderConfirmation() {
    if (!accountEmailEnabled()) { renderOAuthOnly(); return; }
    const reset = currentMode === 'reset-sent'; setTitle(reset ? 'Zkontroluj e-mail' : 'Potvrzení e-mailu');
    body.innerHTML = `<div class="account-intro"><div class="account-emblem">✉</div><h2>${reset ? 'Odkaz je na cestě' : 'Ještě potvrď svůj e-mail'}</h2><p>${reset ? 'Pokud pro tento e-mail existuje účet, dostaneš zprávu s odkazem pro obnovu hesla.' : 'Otevři potvrzovací zprávu a dokonči registraci. Zkontroluj i nevyžádanou poštu.'}</p></div>
      <p class="account-note">Odkaz otevři v tomto prohlížeči, ve kterém jsi o něj požádal.</p>
      ${!reset ? `<form class="account-form"><label class="account-field" for="account-confirm-email">E-mail<input id="account-confirm-email" name="email" type="email" autocomplete="username" inputmode="email" maxlength="254" value="${escHtml(email)}" required></label>${feedback()}<button type="submit" class="btn btn--primary account-submit">Poslat potvrzení znovu</button></form>` : feedback()}
      <button type="button" class="btn btn--ghost account-guest" data-account-mode="login">Zpět na přihlášení</button>${footer()}`;
    bindCommon();
    body.querySelector('form')?.addEventListener('submit', event => {
      event.preventDefault(); if (!accountEmailEnabled()) { currentMode = 'login'; render(); return; }
      const form = event.currentTarget; if (!form.reportValidity()) return;
      email = form.elements.email.value.trim();
      run(async () => { const result = await Account.client.auth.resend({ type: 'signup', email, options: { emailRedirectTo: accountRedirect('confirm') } }); if (result.error) throw result.error; flash('Pokud účet čeká na potvrzení, dorazí ti nová zpráva.'); });
    });
  }
  function renderSignedIn() {
    setTitle('Tvůj účet');
    const status = ACCOUNT_STATUS[Account.status] || ACCOUNT_STATUS.error;
    const identities = accountIdentityProviders();
    const canLinkGoogle = Account.googleEnabled === true && Account.manualLinkingEnabled === true && !identities.includes('google');
    body.innerHTML = `<div class="account-intro account-intro--member"><div class="account-emblem">${ACCOUNT_USER_ICON}</div><h2>Všechno na svém místě</h2><p class="account-email">${escHtml(Account.user.email || '')}</p></div>
      <div class="account-sync-status" data-account-state="${escHtml(Account.status)}"><span class="account-status-dot" aria-hidden="true"></span><div><strong data-account-status-label>${escHtml(status)}</strong><p data-account-status-message>${escHtml(Account.message || 'Změny se průběžně ukládají do tvého účtu.')}</p></div></div>${feedback()}
      ${Account.conflict ? `<section class="account-conflict"><h3>Vyber, jak spojit změny</h3><p>Tady i na jiném zařízení se změnila data. Než bude ukládání pokračovat, vyber další postup.</p>${accountComparison(Account.getLocalSnapshot(), Account.conflict, 'Tady', 'V účtu')}<div class="account-choices"><button type="button" class="account-choice" data-conflict="merge"><strong>Doplnit obě verze</strong><span>Spojí tituly a viděné epizody. Může vrátit dříve odebrané položky; místní poznámky a hodnocení mají přednost.</span></button><button type="button" class="account-choice" data-conflict="remote"><strong>Použít data z účtu</strong><span>Nahradí současná místní data verzí z druhého zařízení.</span></button><button type="button" class="account-choice" data-conflict="local"><strong>Ponechat tuto verzi</strong><span>Nahradí data v účtu současným obsahem tohoto prohlížeče.</span></button></div></section>` : '<button type="button" class="btn btn--primary account-submit" data-account-sync>Uložit a načíst změny</button>'}
      ${Account.hasGuest() ? '<button type="button" class="account-choice account-import" data-account-import-guest><strong>Převzít Šuplík bez účtu</strong><span>Porovnej dřívější místní sbírku a doplň ji do tohoto účtu.</span></button>' : ''}
      ${identities.length ? `<p class="account-connected">Připojené přihlášení: <strong>${identities.map(provider => ({ google: 'Google', github: 'GitHub', email: 'E-mail' }[provider])).join(', ')}</strong></p>` : ''}
      ${canLinkGoogle ? `<button type="button" class="account-choice account-link-google" data-account-link-google><strong>Připojit Google k tomuto účtu</strong><span>Ke stejné sbírce se pak přihlásíš i přes Google. Dosavadní přihlášení zůstane funkční.</span></button>` : ''}
      <div class="account-settings-list"><button type="button" data-account-transfer><span>Záloha a ruční přenos</span><span aria-hidden="true">↗</span></button>${accountEmailEnabled() ? '<button type="button" data-account-mode="password"><span>Změnit heslo</span><span aria-hidden="true">›</span></button>' : ''}<button type="button" data-account-info><span>Soukromí a ukládání</span><span aria-hidden="true">›</span></button><button type="button" data-account-signout><span>Odhlásit se na tomto zařízení</span><span aria-hidden="true">→</span></button></div>`;
    bindCommon();
    body.querySelector('[data-account-sync]')?.addEventListener('click', () => run(async () => { await Account.sync(); notice = ''; render(); }));
    body.querySelector('[data-account-link-google]')?.addEventListener('click', () => run(async () => { flash('Ukládám sbírku a otevírám Google…'); await Account.linkGoogle(); }));
    body.querySelector('[data-account-signout]').onclick = () => run(async () => { await Account.signOut(); currentMode = 'login'; notice = 'Jsi odhlášený. Tvoje data v účtu zůstávají uložená.'; renderAfterAuth(); });
    body.querySelector('[data-account-import-guest]')?.addEventListener('click', () => {
      const preview = showModal(`<p>Doplň starší sbírku uloženou bez účtu do účtu <strong>${escHtml(Account.user.email || '')}</strong>.</p>${accountComparison(Account.getLocalSnapshot(), Account.getGuestSnapshot(), 'Účet tady', 'Bez účtu')}<p class="muted">Sloučení může vrátit dříve odebrané tituly. Současné poznámky a hodnocení v účtu mají přednost.</p><div class="account-preview-actions"><button type="button" class="btn btn--ghost" data-guest-cancel>Zrušit</button><button type="button" class="btn btn--primary" data-guest-merge>Doplnit do účtu</button></div><p role="status" data-guest-status></p>`, { title: 'Převzít místní Šuplík' });
      preview.classList.add('account-overlay'); preview.querySelector('[data-guest-cancel]').onclick = () => preview.remove();
      preview.querySelector('[data-guest-merge]').onclick = async event => {
        const button = event.currentTarget; button.disabled = true;
        try { await Account.importGuest(); preview.remove(); notice = 'Místní sbírka byla doplněná do účtu.'; if (overlay.isConnected) render(); }
        catch (error) { preview.querySelector('[data-guest-status]').textContent = accountError(error); }
        finally { if (preview.isConnected) button.disabled = false; }
      };
    });
    body.querySelectorAll('[data-conflict]').forEach(button => button.onclick = async () => {
      const choice = button.dataset.conflict;
      if (choice !== 'merge') {
        const confirmed = await confirmDialog(choice === 'remote' ? 'Použít data z účtu a nahradit současná místní data? Zálohu si můžeš předem stáhnout přes Záloha a ruční přenos.' : 'Použít tuto místní verzi a nahradit jí data v účtu, včetně změn z ostatních zařízení?');
        if (!confirmed || !overlay.isConnected) return;
      }
      run(async () => { await Account.resolveConflict(choice); notice = ''; render(); });
    });
  }
  function render() {
    if (!overlay.isConnected) return;
    if (!accountEmailEnabled()) currentMode = 'login';
    if (!Account.configured || !Account.client) {
      setTitle('Tvůj účet');
      body.innerHTML = `<div class="account-intro"><div class="account-emblem">${ACCOUNT_USER_ICON}</div><h2>Šuplík máš pořád po ruce</h2><p>Přihlášení na této verzi webu zatím není dostupné. Provozovatel ho musí nejprve zapnout.</p></div><p class="account-note">Bez účtu se všechno ukládá v tomto prohlížeči. Na jiné zařízení si sbírku přeneseš zálohou nebo odkazem.</p><button type="button" class="btn btn--primary account-submit" data-account-close>Pokračovat bez účtu</button><button type="button" class="btn btn--ghost account-guest" data-account-transfer>Přenést nebo zálohovat Šuplík</button>${footer()}`;
      bindCommon(); return;
    }
    if (Account.user && !['recovery', 'password'].includes(currentMode)) renderSignedIn();
    else if (!accountEmailEnabled()) renderOAuthOnly();
    else if (['confirm', 'reset-sent'].includes(currentMode)) renderConfirmation();
    else renderForm();
  }
  const accountChanged = () => {
    bindAccountButtons();
    if (!overlay.isConnected || busy) return;
    const userChanged = previousUser !== (Account.user?.id || null); previousUser = Account.user?.id || null;
    if (userChanged && !Account.user) currentMode = 'login';
    if (Account.recovery && accountEmailEnabled()) currentMode = 'recovery';
    if (userChanged || (Account.user && !['password', 'recovery'].includes(currentMode))) render();
  };
  document.addEventListener('accountchange', accountChanged);
  overlay.addEventListener('modal-closed', () => {
    // Session switches deliberately close dialogs; a manual close during a request stays closed.
    closedForSession = busy && !Account.ready;
    document.removeEventListener('accountchange', accountChanged);
    if (accountOverlay === overlay) accountOverlay = null;
  }, { once: true });
  render(); return overlay;
}

function showAccountPrivacy() {
  const providers = [Account.googleEnabled === true ? 'Google' : '', Account.githubEnabled === true ? 'GitHub' : ''].filter(Boolean).join(' nebo ');
  const methods = (providers ? `Přihlášení potvrzuješ přímo u ${providers}. Identita a e-mail z profilu rozpoznají tvůj účet; heslo poskytovatele Sledovátku nesděluješ. ` : '') + (accountEmailEnabled() ? 'E-mail slouží také k přihlášení, potvrzení registrace a obnově přístupu.' : !providers ? 'Přihlášení na této verzi webu zatím není dostupné.' : '');
  const overlay = showModal(`<div class="account-privacy"><h2>Tvoje sbírka, tvoje volba</h2><h3>Bez účtu</h3><p>Šuplík, poznámky a průběh sledování zůstávají v úložišti tohoto prohlížeče. Vymazáním dat webu je můžeš ztratit, proto si občas stáhni zálohu.</p><h3>S účtem</h3><p>Přihlašování a uložení sbírky mezi zařízeními zajišťuje Supabase. ${methods} Do účtu se ukládají i poznámky a hodnocení, které si zadáš.</p><h3>Ruční přenos</h3><p>Kdo má přenosový odkaz nebo soubor, může převzít jeho obsah. Sdílej ho jen s tím, komu chceš svoji sbírku předat.</p><h3>Filmy a seriály</h3><p>Katalog a obrázky se načítají z TMDB. Stopáže na kartách se doplňují postupně jen pro viditelné tituly; délka dílu seriálu s ≈ je orientační.</p><button type="button" class="btn btn--primary account-submit" data-privacy-backup>Vytvořit zálohu</button></div>`, { title: 'Soukromí a ukládání' });
  overlay.classList.add('account-overlay'); overlay.querySelector('[data-privacy-backup]').onclick = () => showSyncModal(); return overlay;
}
document.addEventListener('accountchange', () => bindAccountButtons());
