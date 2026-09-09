// Node built-ins only. Run from any directory: node scripts/build-cache.cjs
// Add --stage to prepare the explicit GitHub Pages artifact in _site/.
'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const appRoot = path.resolve(__dirname, '..');
const assetFolders = ['js', 'css', 'icons'];

function walk(root, folder) {
  const result = [];
  for (const entry of fs.readdirSync(path.join(root, folder), { withFileTypes: true }).sort((a,b)=>a.name.localeCompare(b.name, 'en'))) {
    const relative = folder + '/' + entry.name;
    if (entry.isSymbolicLink()) throw Error('Symbolic links are not supported: ' + relative);
    if (entry.isDirectory()) result.push(...walk(root, relative));
    else if (entry.isFile()) result.push(relative);
  }
  return result;
}

function createServiceWorker(version, files) {
  return `// Versioned public assets only. Auth/API responses and user snapshots are never cached here.
const CACHE=${JSON.stringify(version)};
const ASSETS=${JSON.stringify(files.map(p=>'./'+p))};
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS.map(url=>new Request(url,{cache:'reload'}))))));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith('sledovatko-shell-')&&key!==CACHE)await caches.delete(key);await self.clients.claim();})()));
self.addEventListener('message',event=>{if(event.data?.type==='ACTIVATE')self.skipWaiting();});
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==self.location.origin)return;
  const base=new URL('./',self.location.href);
  if(request.mode==='navigate'){
    event.respondWith(fetch(request).catch(async()=>await caches.match(new URL('index.html',base).href)||Response.error()));
    return;
  }
  if(!ASSETS.some(asset=>new URL(asset,base).href===url.href))return;
  event.respondWith(caches.open(CACHE).then(async cache=>await cache.match(request)||fetch(request)));
});
`;
}

function build(root = appRoot, { stage = false } = {}) {
  root = path.resolve(root);
  const staticFiles = ['index.html', 'manifest.webmanifest', ...assetFolders.flatMap(folder => walk(root, folder))];
  const assets = staticFiles.filter(file => /\.(?:html|webmanifest|js|css|svg|png)$/.test(file));
  const hash = crypto.createHash('sha256');
  // Include names and the worker template so renamed files or worker changes
  // invalidate the shell even when the concatenated asset bytes are unchanged.
  hash.update(createServiceWorker('', assets));
  for (const file of assets) hash.update(file + '\0').update(fs.readFileSync(path.join(root, file))).update('\0');
  const version = 'sledovatko-shell-' + hash.digest('hex').slice(0, 12);
  fs.writeFileSync(path.join(root, 'sw.js'), createServiceWorker(version, assets));
  if (stage) {
    const destination = path.resolve(root, '_site');
    if (path.dirname(destination) !== root) throw Error('Invalid staging directory');
    // A dirty artifact could accidentally publish unrelated files. Refuse it;
    // GitHub Actions uses a fresh checkout and therefore an absent directory.
    if (fs.existsSync(destination)) throw Error('_site already exists; use a clean checkout or move the old staging directory first.');
    fs.mkdirSync(destination);
    for (const file of [...staticFiles, 'sw.js', 'LICENSE']) {
      const source = path.join(root, file), target = path.join(destination, file);
      if (fs.lstatSync(source).isSymbolicLink()) throw Error('Symbolic links are not supported: ' + file);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(source, target);
    }
    fs.writeFileSync(path.join(destination, '.nojekyll'), '');
  }
  return { version, assets };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== '--stage')) throw Error('Usage: node scripts/build-cache.cjs [--stage]');
  const result = build(appRoot, { stage: args.includes('--stage') });
  console.log(result.version + ': ' + result.assets.length + ' public static assets' + (args.includes('--stage') ? '; artifact in _site/' : ''));
}
module.exports = { build, createServiceWorker };
