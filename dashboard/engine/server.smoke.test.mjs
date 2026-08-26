import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';

const port=31991;
let child;
async function waitForServer(){for(let i=0;i<40;i++){try{const r=await fetch(`http://127.0.0.1:${port}/api/snapshot`);if(r.ok)return}catch{}await new Promise(r=>setTimeout(r,100))}throw new Error('engine did not start')}

test('engine exposes safe default state and validates config',async()=>{
 child=spawn(process.execPath,['engine/server.mjs'],{cwd:process.cwd(),env:{...process.env,ENGINE_PORT:String(port)},stdio:'ignore'});
 try{await waitForServer();const snapshot=await fetch(`http://127.0.0.1:${port}/api/snapshot`).then(r=>r.json());assert.equal(snapshot.connected,false);assert.equal(snapshot.running,false);assert.equal(snapshot.mode,'paper');assert.equal(snapshot.config.leverage,5);
 const bad=await fetch(`http://127.0.0.1:${port}/api/config`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({leverage:99})});assert.equal(bad.status,400);
 const good=await fetch(`http://127.0.0.1:${port}/api/config`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({leverage:3,exposure:1.5})});assert.equal(good.status,200);const result=await good.json();assert.equal(result.snapshot.config.leverage,3);assert.equal(result.snapshot.config.exposure,1.5)}finally{child?.kill('SIGINT')}});

test('dashboard write actions always use POST',async()=>{
 const source=await readFile('app/page.tsx','utf8');
 assert.match(source,/method:'POST'/);
 assert.doesNotMatch(source,/method:body\?'POST':'GET'/);
});
