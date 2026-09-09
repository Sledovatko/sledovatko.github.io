// Shared validation boundary for legacy transfers, local migration and cloud data.
// Session data, credentials and arbitrary localStorage keys are never transferred.
(() => {
  const keys=['wm_favorites','wm_watched','wm_ratings','wm_comments','wm_labels','wm_order','wm_saved_searches','wm_watched_episodes','wm_tv_meta','wm_media_meta','wm_custom_labels','wm_hidden_labels'];
  const arrays=new Set(['wm_favorites','wm_watched','wm_order','wm_saved_searches','wm_hidden_labels']);
  const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
  const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
  const invalid=()=>{throw Error('Neplatný nebo příliš velký obsah dat.');};
  const num=(v,min,max)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)invalid();return v;};
  const int=(v,min,max)=>{num(v,min,max);if(!Number.isSafeInteger(v))invalid();return v;};
  const text=(v,max,fallback='')=>{if(v===undefined||v===null)return fallback;if(typeof v!=='string'||v.length>max)invalid();return v.replace(/\u0000/g,'');};
  const list=(v,max=10000)=>{if(!Array.isArray(v)||v.length>max)invalid();return v;};
  const entries=(v,max=10000)=>{if(!object(v))invalid();const e=Object.entries(v);if(e.length>max)invalid();return e;};
  const unique=v=>[...new Set(v)];
  const idNum=v=>{if(!/^[0-9]{1,15}$/.test(String(v)))invalid();return int(Number(v),1,999999999999999);};
  const mediaId=v=>{if(typeof v!=='string'&&typeof v!=='number')invalid();const id=String(v);if(!/^(tv:)?[0-9]{1,15}$/.test(id))invalid();return(id.startsWith('tv:')?'tv:':'')+idNum(id.replace(/^tv:/,''));};
  const tvId=v=>'tv:'+idNum(String(v).replace(/^tv:/,''));
  const labelKey=v=>{if(typeof v!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(v)||['__proto__','constructor','prototype'].includes(v))invalid();return v;};
  const timestamp=v=>v===undefined?0:int(v,0,8640000000000000);
  function imageUrl(value){
    const url=text(value,2048);
    return /^https:\/\/image\.tmdb\.org\/t\/p\/(?:w\d{2,4}|h\d{2,4}|original)\/[a-zA-Z0-9_./-]+\.(?:jpe?g|png|webp)$/i.test(url)?url:'';
  }
  function movie(v){
    if(!object(v)||typeof v.title!=='string')invalid();
    const id=idNum(v.id),mediaType=v.mediaType==='tv'?'tv':'movie';
    if(v.mediaType!==undefined&&!['movie','tv'].includes(v.mediaType))invalid();
    const year=text(v.year===undefined?'':String(v.year),1000),release=text(v.releaseDate,100);
    return {id,imdbId:(mediaType==='tv'?'tv:':'')+id,mediaType,
      title:text(v.title,1000)||'Neznámý název',originalTitle:text(v.originalTitle,1000),
      year:/^\d{4}$/.test(year)?year:'',posterUrl:imageUrl(v.posterUrl),backdropUrl:imageUrl(v.backdropUrl),
      rating:v.rating===undefined?0:Math.round(num(v.rating,0,10)*1000)/1000,vote_count:v.vote_count===undefined?0:int(v.vote_count,0,Number.MAX_SAFE_INTEGER),
      overview:text(v.overview,20000),genreIds:unique(list(v.genreIds===undefined?[]:v.genreIds,100).map(n=>int(n,1,999999))),
      releaseDate:/^\d{4}-\d{2}-\d{2}$/.test(release)&&Number.isFinite(Date.parse(release))?release:''};
  }
  function tvMeta(v){
    if(!object(v))invalid();
    const seasons=list(v.seasons,1000).map(s=>{
      if(!object(s))invalid();
      const row={seasonNumber:int(s.seasonNumber,1,1000),episodeCount:int(s.episodeCount,0,10000)};
      if(s.releasedEpisodeNumbers!==undefined)row.releasedEpisodeNumbers=unique(list(s.releasedEpisodeNumbers,10000).map(n=>int(n,1,10000)));
      return row;
    });
    if(new Set(seasons.map(s=>s.seasonNumber)).size!==seasons.length)invalid();
    const totalEpisodes=seasons.reduce((n,s)=>n+s.episodeCount,0);
    if(totalEpisodes>100000||seasons.reduce((n,s)=>n+(s.releasedEpisodeNumbers?.length||0),0)>100000)invalid();
    const result={seasons,totalEpisodes,updatedAt:timestamp(v.updatedAt)};
    if(seasons.every(s=>Array.isArray(s.releasedEpisodeNumbers)))result.releasedEpisodes=seasons.reduce((n,s)=>n+s.releasedEpisodeNumbers.length,0);
    return result;
  }
  function runtimeMeta(v){if(!object(v))invalid();return{runtime:int(v.runtime,0,100000000),updatedAt:timestamp(v.updatedAt)};}
  const empty=()=>Object.fromEntries(keys.map(k=>[k,arrays.has(k)?[]:{}]));
  function normalize(data){
    if(!object(data))invalid();
    const raw={},result=empty(),mapping=new Map();
    for(const key of keys){if(!own(data,key))continue;const value=typeof data[key]==='string'?JSON.parse(data[key]):data[key];if(arrays.has(key)?!Array.isArray(value):!object(value))invalid();raw[key]=value;}
    result.wm_favorites=[...new Map(list(raw.wm_favorites||[],5000).map(v=>{const clean=movie(v);if(v.imdbId!==undefined)mapping.set(String(v.imdbId),clean.imdbId);return[clean.imdbId,clean];})).values()];
    const mapped=v=>mapping.get(String(v))||mediaId(v);
    for(const key of ['wm_watched','wm_order'])result[key]=unique(list(raw[key]||[]).map(mapped));
    for(const key of ['wm_ratings','wm_comments','wm_labels'])result[key]=Object.fromEntries(entries(raw[key]||{}).map(([id,v])=>[mapped(id),key==='wm_ratings'?int(v,1,10):key==='wm_comments'?text(v,20000):labelKey(v)]));
    let episodeTotal=0;
    for(const[id,v]of entries(raw.wm_watched_episodes||{})){
      const episodes=unique(list(v,100000).map(code=>{if(typeof code!=='string'||!/^s\d{1,4}e\d{1,5}$/.test(code))invalid();const[,s,e]=code.match(/^s(\d+)e(\d+)$/);return's'+int(+s,0,1000)+'e'+int(+e,1,10000);}));
      episodeTotal+=episodes.length;if(episodeTotal>250000)invalid();const canonical=tvId(id);
      result.wm_watched_episodes[canonical]=unique([...(result.wm_watched_episodes[canonical]||[]),...episodes]);
    }
    let metadataEpisodes=0;
    result.wm_tv_meta=Object.fromEntries(entries(raw.wm_tv_meta||{},5000).map(([id,v])=>{const clean=tvMeta(v);metadataEpisodes+=Math.max(clean.totalEpisodes,clean.releasedEpisodes||0);if(metadataEpisodes>500000)invalid();return[tvId(id),clean];}));
    result.wm_media_meta=Object.fromEntries(entries(raw.wm_media_meta||{},10000).map(([id,v])=>{if(!/^(movie|tv):(?:tv:)?\d{1,15}$/.test(id))invalid();return[id.split(':')[0]+':'+idNum(id.replace(/^(movie|tv):(?:tv:)?/,'')),runtimeMeta(v)];}));
    result.wm_custom_labels=Object.fromEntries(entries(raw.wm_custom_labels||{},200).map(([key,v])=>{if(!object(v)||typeof v.color!=='string'||!/^#[\da-f]{6}$/i.test(v.color))invalid();return[labelKey(key),{color:v.color,name:text(v.name??v.label,100),emoji:text(v.emoji,32,'🏷️')}];}));
    result.wm_hidden_labels=unique(list(raw.wm_hidden_labels||[],200).map(labelKey));
    result.wm_saved_searches=unique(list(raw.wm_saved_searches||[],200).map(v=>text(v,500)).filter(Boolean));
    if(JSON.stringify(result).length>8*1024*1024)invalid();
    return result;
  }
  function read(){return Object.fromEntries(keys.filter(k=>localStorage.getItem(k)!==null).map(k=>[k,localStorage.getItem(k)]));}
  function transaction(data){
    const before=read();
    try{for(const k of keys)localStorage.setItem(k,JSON.stringify(data[k]));}
    catch(error){
      // Reclaim all managed keys first. Restoring a larger old value while a
      // later key contains larger new data can otherwise exceed quota again.
      let rollbackError=null;
      for(const k of keys){try{localStorage.removeItem(k);}catch(e){rollbackError=e;}}
      for(const k of keys)if(own(before,k)){try{localStorage.setItem(k,before[k]);}catch(e){rollbackError=e;}}
      if(rollbackError)throw Error('Obnovení dat selhalo. Obnov původní zálohu a zkontroluj úložiště prohlížeče.',{cause:rollbackError});
      throw error;
    }
    if(typeof document!=='undefined'&&typeof document.dispatchEvent==='function'&&typeof CustomEvent==='function')document.dispatchEvent(new CustomEvent('librarychange',{detail:{source:'snapshot'}}));
  }
  function decode(code){
    if(typeof code!=='string'||code.length>8*1024*1024)invalid();
    const data=JSON.parse(decodeURIComponent(escape(atob(code.trim()))));
    if(!object(data)||(data._v!==1&&data._v!==2))throw Error('Nepodporovaná verze dat.');
    if(!keys.some(k=>own(data,k)))throw Error('Prázdný export.');
    return{data:normalize(data),createdAt:typeof data._t==='number'&&Number.isFinite(data._t)?data._t:null};
  }
  function merge(current,incoming){
    const result={...current};
    for(const key of keys){const value=incoming[key];
      if(key==='wm_favorites')result[key]=[...new Map([...value,...current[key]].map(m=>[m.imdbId,m])).values()];
      else if(arrays.has(key))result[key]=unique([...current[key],...value]);
      else if(key==='wm_watched_episodes'){result[key]={...current[key]};for(const[id,eps]of Object.entries(value))result[key][id]=unique([...(current[key][id]||[]),...eps]);}
      else result[key]={...value,...current[key]};
    }
    return normalize(result);
  }
  const counts=d=>({favorites:d.wm_favorites.length,watched:d.wm_watched.length,episodes:Object.values(d.wm_watched_episodes).reduce((n,a)=>n+a.length,0),ratings:Object.keys(d.wm_ratings).length,comments:Object.keys(d.wm_comments).length});
  function asCloud(data){
    const snapshot={_v:2,...data};
    // jsonb::text adds spaces after commas/colons outside strings. Account for
    // UTF-8 bytes and retain 1 KiB of headroom under the backend's 2 MiB limit.
    const wire=JSON.stringify(snapshot).replace(/"(?:\\.|[^"\\])*"|[:,]/g,t=>t[0]==='"'?t:t+' ');
    if(unescape(encodeURIComponent(wire)).length>2*1024*1024-1024)throw Error('Knihovna je pro cloud příliš velká. Místní data zůstávají uložená; použij souborovou zálohu.');
    return snapshot;
  }
  const cloud=s=>{if(!object(s)||s._v!==2||!own(s,'wm_favorites'))invalid();const clean=normalize(s);asCloud(clean);return clean;};
  Storage.emptyCloudSnapshot=()=>({_v:2,...empty()});
  Storage.getCloudSnapshot=()=>asCloud(normalize(read()));
  // Cloud methods throw on failure, so callers must retain their old revision.
  Storage.applyCloudSnapshot=s=>{transaction(cloud(s));return true;};
  Storage.mergeCloudSnapshots=(local,remote)=>asCloud(merge(cloud(local),cloud(remote)));
  Storage.migrateMediaKeys=()=>{
    if(localStorage.getItem('wm_data_validation_version')==='3')return;
    try{const before=read();if(Object.keys(before).length)transaction(normalize(before));localStorage.setItem('wm_schema_version','2');localStorage.setItem('wm_data_validation_version','3');}
    catch{if(typeof showToast==='function')showToast('Místní data se nepodařilo převést. Nejprve vytvoř zálohu.');}
  };
  Storage.exportAllData=()=>{
    // Preserve raw v1/v2 exports for older clients and emergency backups.
    // Every incoming transfer is validated again before it changes local data.
    const data={_v:2,_t:Date.now(),...read()};if(!data.wm_favorites)data.wm_favorites='[]';return btoa(unescape(encodeURIComponent(JSON.stringify(data))));
  };
  Storage.previewImport=code=>{
    try{const imported=decode(code),current=normalize(read()),incoming=imported.data;const a=new Set(current.wm_favorites.map(m=>m.imdbId)),b=new Set(incoming.wm_favorites.map(m=>m.imdbId));return{current:counts(current),incoming:counts(incoming),newTitles:[...b].filter(id=>!a.has(id)).length,commonTitles:[...b].filter(id=>a.has(id)).length,keptOnlyHere:[...a].filter(id=>!b.has(id)).length,createdAt:imported.createdAt};}catch{return null;}
  };
  Storage.importAllData=(code,mode='merge')=>{
    try{if(typeof Account!=='undefined'&&!Account.canEdit())throw Error('Účet není připraven k úpravám');if(!['merge','replace'].includes(mode))invalid();const incoming=decode(code).data,result=mode==='replace'?incoming:merge(normalize(read()),incoming);transaction(result);try{localStorage.setItem('wm_last_import',new Date().toISOString());localStorage.setItem('wm_schema_version','2');localStorage.setItem('wm_data_validation_version','3');}catch{}return true;}catch{return false;}
  };
})();
