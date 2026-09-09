'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),vm=require('node:vm');
const {build,createServiceWorker}=require('./build-cache.cjs');
const ownedRoot=path.resolve(__dirname),fixture=fs.mkdtempSync(path.join(ownedRoot,'.cache-test-'));
try {
  for(const folder of ['js/vendor','css','icons','backend','scripts','.github'])fs.mkdirSync(path.join(fixture,folder),{recursive:true});
  for(const [file,body] of Object.entries({'index.html':'<!doctype html>','manifest.webmanifest':'{}','js/auth-config.js':'window.CONFIG={};','js/app.js':'void 0;','js/vendor/LICENSE.txt':'license','css/app.css':'body{}','icons/icon.svg':'<svg/>','LICENSE':'license','backend/private.sql':'not public','scripts/private.cjs':'not public','.github/private.yml':'not public','README.md':'not public'}))fs.writeFileSync(path.join(fixture,file),body);
  const existing=fs.readFileSync(path.join(ownedRoot,'../sw.js'),'utf8').replace(/\r\n/g,'\n');
  const stripVariables=text=>text.split('\n').filter(line=>!/^const (CACHE|ASSETS)=/.test(line)).join('\n');
  assert.equal(stripVariables(createServiceWorker('',[])),stripVariables(existing));
  console.log('PASS 1: service-worker event and fetch behavior is unchanged');
  const first=build(fixture),again=build(fixture);assert.equal(first.version,again.version);
  new vm.Script(fs.readFileSync(path.join(fixture,'sw.js'),'utf8'));
  console.log('PASS 2: deterministic cache and valid generated JavaScript');
  let previous=first.version;
  for(const file of ['js/auth-config.js','css/app.css','js/app.js']){
    fs.appendFileSync(path.join(fixture,file),'\n/*changed*/');const next=build(fixture);assert.notEqual(next.version,previous);previous=next.version;
  }
  console.log('PASS 3: config, style and JavaScript edits invalidate cache');
  const staged=build(fixture,{stage:true});const out=path.join(fixture,'_site');
  for(const file of [...staged.assets,'sw.js','LICENSE','js/vendor/LICENSE.txt','.nojekyll'])assert.ok(fs.existsSync(path.join(out,file)),file);
  for(const file of ['backend','scripts','.github','README.md'])assert.equal(fs.existsSync(path.join(out,file)),false,file);
  console.log('PASS 4: staging includes public assets and licenses, excludes project internals');
  assert.throws(()=>build(fixture,{stage:true}),/_site already exists/);
  console.log('PASS 5: refuses a dirty staging directory');
} finally {
  const resolved=path.resolve(fixture);
  if(path.dirname(resolved)!==ownedRoot||!path.basename(resolved).startsWith('.cache-test-'))throw Error('Unsafe fixture cleanup');
  fs.rmSync(resolved,{recursive:true,force:true});
}
