/* Offline app shell, accessible status and transparent data controls. */
function openHelp() {
  const modal=showModal(`<div class="help-copy">
    <h4>Tvoje knihovna</h4><p>Plakát nebo název otevře detail. Plus uloží titul do Šuplíku, tři tečky nabídnou další možnosti. U seriálu označuj jednotlivé epizody.</p>
    <h4>Délka sledování</h4><p>Časy se doplňují u viditelných karet a ukládají do mezipaměti. Značka ≈ u seriálu znamená odhad délky jednoho dílu. Přesný součet známých sezón se počítá až v detailu.</p>
    <h4>Ukládání a soukromí</h4><p>Bez přihlášení zůstává knihovna v tomto prohlížeči. Vymazáním dat webu nebo anonymního okna ji můžeš ztratit; pravidelně exportuj zálohu.</p>
    <p>Po přihlášení se e-mail a relace zpracovávají u Supabase. K účtu se synchronizují tituly, hodnocení, poznámky, štítky a epizody. Místní knihovna se do účtu přidá až po tvém výběru. Heslo se do knihovny ani záloh neukládá.</p>
    <p>Metadata a obrázky poskytuje TMDB. Při hledání se dotaz posílá TMDB. Videa a soundtracky se otevírají u jejich poskytovatelů. Web nepoužívá reklamní měření.</p>
    <h4>Přenos na další zařízení</h4><p>Účet nabízí synchronizaci. Ruční přenos souborem nebo QR funguje i bez něj. Odkaz nebo soubor zálohy obsahuje tvoji knihovnu; sdílej ho jen s lidmi, kterým ji chceš předat.</p>
    <div class="action-list"><button id="help-backup">Exportovat nebo obnovit zálohu</button><button id="help-account">Otevřít účet a synchronizaci</button></div>
    <p class="muted">Sledovátko používá TMDB API, ale TMDB tento produkt nepodporuje ani necertifikuje.</p>
    <a href="https://www.themoviedb.org/" target="_blank" rel="noopener noreferrer">The Movie Database ↗</a>
  </div>`,{title:'Nápověda a soukromí'});
  modal.querySelector('#help-backup').onclick=()=>showSyncModal();
  modal.querySelector('#help-account').onclick=()=>openAccount();
}
(async()=>{
  const banner=document.getElementById('connection-status');
  function connection(){banner.hidden=navigator.onLine!==false;banner.textContent='Jsi offline · knihovna zůstává v zařízení';}
  window.addEventListener('online',connection);window.addEventListener('offline',connection);connection();
  Storage.migrateMediaKeys?.();
  await Account.init();
  await App.init();
  if(Account.recovery)openAccount('recovery');
  else if(Account.status==='error')showToast(Account.message,7000);
  if('serviceWorker' in navigator && location.protocol!=='file:'){
    try{
      const registration=await navigator.serviceWorker.register('./sw.js');
      let reloading=false,reloadRequested=false,hadController=!!navigator.serviceWorker.controller;
      function reloadOnce(){if(!reloading){reloading=true;location.reload();}}
      function updateReady(worker,active=false){
        if(!worker||worker.state==='redundant'||!navigator.serviceWorker.controller)return;
        document.querySelectorAll('.update-notice').forEach(notice=>notice.remove());
        const notice=document.createElement('div');notice.className='update-notice';notice.setAttribute('role','status');
        notice.innerHTML='<span>Je připravená nová verze.</span><button type="button" class="btn btn--ghost">Načíst</button>';
        document.body.appendChild(notice);
        notice.querySelector('button').onclick=async()=>{
          if(Account.user && !(await Account.sync())){showToast('Nejprve dokonči synchronizaci nebo vyřeš konflikt.');return;}
          if(worker.state==='redundant'){
            updateReady(registration.waiting);
            if(!registration.waiting)notice.remove();
            showToast('Aktualizace se změnila. Zkus znovu načíst novou verzi.');return;
          }
          // A different app window may have activated this worker meanwhile.
          if(active||worker.state==='activated'){reloadOnce();return;}
          reloadRequested=true;
          worker.postMessage({type:'ACTIVATE'});
        };
      }
      updateReady(registration.waiting);
      registration.addEventListener('updatefound',()=>{
        const worker=registration.installing;
        worker?.addEventListener('statechange',()=>{if(worker.state==='installed')updateReady(registration.waiting);});
      });
      navigator.serviceWorker.addEventListener('controllerchange',()=>{
        if(!hadController){hadController=true;return;}
        if(reloadRequested){reloadOnce();return;}
        // Another client updating must not interrupt a gesture or an edit here.
        updateReady(navigator.serviceWorker.controller,true);
      });
    }catch{/* App remains fully usable when installation is unavailable. */}
  }
})().catch(()=>{
  document.getElementById('screen').innerHTML='<div class="empty-state"><h1>Načtení se nezdařilo</h1><p>Obnov stránku. Tvoje uložená knihovna zůstává zachovaná.</p><button class="btn btn--primary" onclick="location.reload()">Zkusit znovu</button></div>';
});
