'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),vm=require('node:vm');
const {build,createServiceWorker}=require('./build-cache.cjs');
const ownedRoot=path.resolve(__dirname),fixture=fs.mkdtempSync(path.join(ownedRoot,'.cache-test-'));
try {
  for(const folder of ['js/vendor','css','icons','backend','scripts','.github'])fs.mkdirSync(path.join(fixture,folder),{recursive:true});
  for(const [file,body] of Object.entries({'index.html':'<!doctype html>','privacy.html':'<!doctype html><title>Privacy</title>','terms.html':'<!doctype html><title>Terms</title>','private.html':'not public','manifest.webmanifest':'{}','js/auth-config.js':'window.CONFIG={};','js/app.js':'void 0;','js/vendor/LICENSE.txt':'license','css/app.css':'body{}','icons/icon.svg':'<svg/>','LICENSE':'license','backend/private.sql':'not public','backend/private.html':'not public','scripts/private.cjs':'not public','.github/private.yml':'not public','README.md':'not public'}))fs.writeFileSync(path.join(fixture,file),body);
  const existing=fs.readFileSync(path.join(ownedRoot,'../sw.js'),'utf8').replace(/\r\n/g,'\n');
  const stripVariables=text=>text.split('\n').filter(line=>!/^const (CACHE|ASSETS)=/.test(line)).join('\n');
  assert.equal(stripVariables(createServiceWorker('',[])),stripVariables(existing));
  console.log('PASS 1: production worker handlers match the generated template');
  const first=build(fixture),again=build(fixture);assert.equal(first.version,again.version);
  new vm.Script(fs.readFileSync(path.join(fixture,'sw.js'),'utf8'));
  console.log('PASS 2: deterministic cache and valid generated JavaScript');
  for(const file of ['privacy.html','terms.html'])assert.ok(first.assets.includes(file),file);
  for(const file of ['private.html','backend/private.html','backend/private.sql','scripts/private.cjs','.github/private.yml','README.md'])assert.equal(first.assets.includes(file),false,file);
  const workerAssets=JSON.parse(fs.readFileSync(path.join(fixture,'sw.js'),'utf8').match(/^const ASSETS=(.*);$/m)[1]);
  for(const file of ['privacy.html','terms.html'])assert.ok(workerAssets.includes('./'+file),file);
  console.log('PASS 3: legal pages are explicitly precached and private documents are excluded');
  let previous=first.version;
  for(const file of ['js/auth-config.js','css/app.css','js/app.js','privacy.html','terms.html']){
    fs.appendFileSync(path.join(fixture,file),'\n/*changed*/');const next=build(fixture);assert.notEqual(next.version,previous);previous=next.version;
  }
  console.log('PASS 4: config, style, JavaScript and each legal page edit invalidate cache');
  for(const file of ['private.html','backend/private.html','README.md'])fs.appendFileSync(path.join(fixture,file),'private change');
  assert.equal(build(fixture).version,previous);
  console.log('PASS 5: excluded private documents do not alter the public cache');
  const staged=build(fixture,{stage:true});const out=path.join(fixture,'_site');
  for(const file of [...staged.assets,'sw.js','LICENSE','js/vendor/LICENSE.txt','.nojekyll'])assert.ok(fs.existsSync(path.join(out,file)),file);
  for(const file of ['privacy.html','terms.html'])assert.deepEqual(fs.readFileSync(path.join(out,file)),fs.readFileSync(path.join(fixture,file)),file);
  for(const file of ['backend','scripts','.github','README.md','private.html'])assert.equal(fs.existsSync(path.join(out,file)),false,file);
  console.log('PASS 6: staging includes exact legal pages, public assets and licenses, excludes project internals');
  assert.throws(()=>build(fixture,{stage:true}),/_site already exists/);
  console.log('PASS 7: refuses a dirty staging directory');
} finally {
  const resolved=path.resolve(fixture);
  if(path.dirname(resolved)!==ownedRoot||!path.basename(resolved).startsWith('.cache-test-'))throw Error('Unsafe fixture cleanup');
  fs.rmSync(resolved,{recursive:true,force:true});
}
