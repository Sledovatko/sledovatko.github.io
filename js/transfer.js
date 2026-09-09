// Transfer is a manual snapshot, not an account or automatic cloud sync.
function makeSyncLink(code){return location.origin+location.pathname+'#sync='+encodeURIComponent(code);}
function clearSyncHash(){if(location.hash.startsWith('#sync='))history.replaceState(history.state,'','#'+(App.currentScreen||'home'));}
function downloadTransfer(code,prefix='sledovatko'){
  const url=URL.createObjectURL(new Blob([code],{type:'text/plain;charset=utf-8'})),a=document.createElement('a');
  a.href=url;a.download=prefix+'-'+new Date().toISOString().slice(0,10)+'.sledovatko';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function packTransfer(code){
  if(!window.CompressionStream)return code;
  const bytes=new Uint8Array(await new Response(new Blob([code]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
  let binary='';for(const b of bytes)binary+=String.fromCharCode(b);
  return 'S2.'+btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
async function unpackTransfer(input){
  let text=input.trim();
  if(/^https?:\/\//i.test(text)){const hash=new URL(text).hash;if(!hash.startsWith('#sync='))throw Error('Odkaz neobsahuje přenos.');text=decodeURIComponent(hash.slice(6));}
  if(!text.startsWith('S2.'))return text;
  if(!window.DecompressionStream)throw Error('Tento prohlížeč neumí načíst zkrácený odkaz. Použij původní kód nebo soubor.');
  if(text.length>8*1024*1024)throw Error('Přenos je příliš velký.');
  const binary=atob(text.slice(3).replace(/-/g,'+').replace(/_/g,'/')),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
  const reader=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader(),chunks=[];let size=0;
  while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>8*1024*1024){await reader.cancel();throw Error('Přenos je příliš velký.');}chunks.push(value);}
  return await new Blob(chunks).text();
}
async function copyTransfer(field){
  try{if(!navigator.clipboard)throw Error('Clipboard unavailable');await navigator.clipboard.writeText(field.value);showToast('Zkopírováno');}
  catch{field.focus();field.select();if(document.execCommand('copy'))showToast('Zkopírováno');else showToast('Text je označený. Zkopíruj jej ručně.');}
}
async function previewTransfer(input){
  const code=await unpackTransfer(input),preview=Storage.previewImport(code);if(!preview)throw Error('Neplatný kód nebo soubor Sledovátka.');
  const rows=[['Tituly ve Šuplíku','favorites'],['Viděné tituly','watched'],['Viděné epizody','episodes'],['Hodnocení','ratings'],['Poznámky','comments']];
  const modal=showModal(`<p>Porovnej obsah před přenesením.</p><div class="sync-compare"><div class="sync-compare__row sync-compare__row--head"><span>Obsah</span><span>Tady</span><span>Přenos</span></div>${rows.map(([label,key])=>`<div class="sync-compare__row"><span>${label}</span><span>${preview.current[key]}</span><span>${preview.incoming[key]}</span></div>`).join('')}</div>
    <p><strong>${preview.newTitles}</strong> nových titulů · <strong>${preview.commonTitles}</strong> společných</p><p class="muted">Doplnit přidá nové tituly a spojí viděné epizody. Tvoje současné poznámky a hodnocení mají při konfliktu přednost.</p>
    <div class="sheet-actions"><button class="btn btn--ghost" id="transfer-replace">Nahradit</button><button class="btn btn--primary" id="transfer-merge">Doplnit</button></div><p id="transfer-status" role="status"></p>`,{title:'Převzít data'});
  modal.classList.add('sheet-overlay');
  const apply=mode=>{
    if(!Storage.importAllData(code,mode)){modal.querySelector('#transfer-status').textContent='Data se nepodařilo uložit. Zkontroluj volné místo v prohlížeči.';return;}
    App._searchState.loaded=false;
    document.dispatchEvent(new CustomEvent('favorites-changed'));
    modal.querySelector('.modal-body').innerHTML='<div class="transfer-success">'+icon('check')+'<h2>Data jsou přenesená</h2><p>Šuplík a průběh sledování byly aktualizovány.</p></div>';
  };
  modal.querySelector('#transfer-merge').onclick=()=>apply('merge');
  modal.querySelector('#transfer-replace').onclick=()=>{
    const confirm=showModal('<p>Nahradit smaže současný Šuplík, poznámky a průběh a použije přenášená data. Nejdřív si můžeš stáhnout zálohu.</p><div class="action-list"><button id="before-replace-backup">Stáhnout současnou zálohu</button><button id="replace-confirm" class="danger-text">Nahradit místní data</button></div>',{title:'Nahradit místní data?'});
    confirm.querySelector('#before-replace-backup').onclick=()=>downloadTransfer(Storage.exportAllData(),'sledovatko-pred-nahrazenim');
    confirm.querySelector('#replace-confirm').onclick=()=>{apply('replace');confirm.remove();};
  };
}
async function handleSyncLinkFromUrl(){
  if(!location.hash.startsWith('#sync='))return;
  let code;try{code=decodeURIComponent(location.hash.slice(6));}catch{clearSyncHash();showToast('Neplatný přenosový odkaz');return;}
  clearSyncHash();try{await previewTransfer(code);}catch(error){showToast(error.message);}
}
function showSyncModal(){
  const modal=showModal(`<p class="muted">Šuplík se ukládá v tomto prohlížeči. Na jiné zařízení ho přeneseš odkazem, kódem nebo souborem.</p>
    <div class="segmented transfer-tabs"><button id="transfer-export-tab" class="active" aria-pressed="true">Odeslat</button><button id="transfer-import-tab" aria-pressed="false">Přijmout</button></div>
    <section id="transfer-export"><button class="btn btn--primary" id="generate-transfer">Vytvořit odkaz</button><button class="btn btn--ghost" id="download-transfer">Stáhnout zálohu</button>
    <div id="transfer-output" hidden><label>Odkaz<input id="transfer-link" readonly></label><div class="sheet-actions"><button class="btn btn--primary" id="copy-transfer-link">Kopírovat odkaz</button><button class="btn btn--ghost" id="transfer-qr">QR kód</button></div><div id="qr-output"></div><p id="qr-status" class="muted" role="status"></p><details><summary>Původní kód</summary><textarea id="transfer-code" readonly aria-label="Původní přenosový kód"></textarea><button class="btn btn--ghost" id="copy-transfer-code">Kopírovat kód</button></details><p class="muted">Přenos obsahuje i tvoje poznámky a hodnocení. API token se nepřenáší.</p></div></section>
    <section id="transfer-import" hidden><label>Odkaz nebo kód<textarea id="transfer-input" placeholder="Vlož odkaz nebo kód"></textarea></label><div class="sheet-actions"><button class="btn btn--primary" id="preview-transfer">Porovnat data</button><label class="btn btn--ghost">Vybrat soubor<input class="sr-only" type="file" id="transfer-file" accept=".sledovatko,.txt,.json"></label></div><p id="transfer-error" role="alert"></p></section>`,{title:'Přenést na jiné zařízení'});
  modal.classList.add('transfer-overlay');
  const setTab=importing=>{
    modal.querySelector('#transfer-export').hidden=importing;modal.querySelector('#transfer-import').hidden=!importing;
    for(const [id,active]of [['export',!importing],['import',importing]]){const b=modal.querySelector('#transfer-'+id+'-tab');b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));}
  };
  modal.querySelector('#transfer-import-tab').onclick=()=>setTab(true);modal.querySelector('#transfer-export-tab').onclick=()=>setTab(false);
  modal.querySelector('#download-transfer').onclick=()=>downloadTransfer(Storage.exportAllData());
  modal.querySelector('#generate-transfer').onclick=async e=>{
    const b=e.currentTarget;b.disabled=true;
    try{const code=Storage.exportAllData(),packed=await packTransfer(code);modal.querySelector('#transfer-code').value=code;modal.querySelector('#transfer-link').value=makeSyncLink(packed);modal.querySelector('#transfer-output').hidden=false;modal.querySelector('#qr-output').innerHTML='';modal.querySelector('#qr-status').textContent='';localStorage.setItem('wm_last_export',new Date().toISOString());}
    catch{showToast('Odkaz se nepodařilo vytvořit. Zkus stáhnout zálohu.');}finally{b.disabled=false;}
  };
  modal.querySelector('#copy-transfer-link').onclick=()=>copyTransfer(modal.querySelector('#transfer-link'));
  modal.querySelector('#copy-transfer-code').onclick=()=>copyTransfer(modal.querySelector('#transfer-code'));
  modal.querySelector('#transfer-qr').onclick=()=>{
    const link=modal.querySelector('#transfer-link').value,note=modal.querySelector('#qr-status'),output=modal.querySelector('#qr-output');output.innerHTML='';
    if(link.length>1600){note.textContent='Tato sbírka je pro dobře čitelný QR příliš velká. Použij odkaz nebo stáhni zálohu.';return;}
    if(location.hostname==='127.0.0.1'||location.hostname==='localhost'){note.textContent='Toto je místní náhled. Odkaz na druhém zařízení začne fungovat až po zveřejnění webu.';}
    else note.textContent='Naskenuj kamerou telefonu. QR vzniká přímo v prohlížeči.';
    try{const qr=qrcode(0,'M');qr.addData(link);qr.make();const img=document.createElement('img');img.src=qr.createDataURL(4,16);img.alt='QR kód s odkazem pro přenos';output.appendChild(img);}catch{note.textContent='QR se nepodařilo vytvořit. Použij odkaz nebo zálohu.';}
  };
  const preview=async value=>{try{await previewTransfer(value);modal.querySelector('#transfer-error').textContent='';}catch(error){modal.querySelector('#transfer-error').textContent=error.message;}};
  modal.querySelector('#preview-transfer').onclick=()=>preview(modal.querySelector('#transfer-input').value);
  modal.querySelector('#transfer-file').onchange=async e=>{const file=e.target.files[0];if(!file)return;if(file.size>8*1024*1024){modal.querySelector('#transfer-error').textContent='Soubor je příliš velký.';return;}await preview(await file.text());e.target.value='';};
}
