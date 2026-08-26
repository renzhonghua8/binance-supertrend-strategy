import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {baseLeverage,leveragePlan} from './strategy.mjs';

const port=31991;
let child;
async function waitForServer(){for(let i=0;i<40;i++){try{const r=await fetch(`http://127.0.0.1:${port}/api/snapshot`);if(r.ok)return}catch{}await new Promise(r=>setTimeout(r,100))}throw new Error('engine did not start')}

test('engine exposes safe default state and validates config',async()=>{
 child=spawn(process.execPath,['engine/server.mjs'],{cwd:process.cwd(),env:{...process.env,ENGINE_PORT:String(port)},stdio:'ignore'});
 try{await waitForServer();const snapshot=await fetch(`http://127.0.0.1:${port}/api/snapshot`).then(r=>r.json());assert.equal(snapshot.connected,false);assert.equal(snapshot.running,false);assert.equal(snapshot.mode,'paper');assert.equal(snapshot.config.maxRiskPct,10);assert.equal('leverage'in snapshot.config,false);assert.equal('exposure'in snapshot.config,false);
 const bad=await fetch(`http://127.0.0.1:${port}/api/config`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({maxRiskPct:11})});assert.equal(bad.status,400);
 const good=await fetch(`http://127.0.0.1:${port}/api/config`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({maxRiskPct:9,hardStopAtr:1.2})});assert.equal(good.status,200);const result=await good.json();assert.equal(result.snapshot.config.maxRiskPct,9);assert.equal(result.snapshot.config.hardStopAtr,1.2)}finally{child?.kill('SIGINT')}});

test('dynamic leverage tiers and hard-stop risk cap match strategy v2',()=>{
 assert.equal(baseLeverage(0),5);assert.equal(baseLeverage(1.999),5);assert.equal(baseLeverage(2),4);assert.equal(baseLeverage(2.5),2);assert.equal(baseLeverage(5),1);assert.equal(baseLeverage(9.999),1);assert.equal(baseLeverage(10),0);
 const reduced=leveragePlan({close:100,line:98.5,atr:1},{maxRiskPct:10,hardStopAtr:1});assert.equal(reduced.valid,true);assert.equal(reduced.baseLeverage,5);assert.equal(reduced.finalLeverage,4);assert.equal(reduced.riskPct,10);
 const skipped=leveragePlan({close:100,line:95,atr:6},{maxRiskPct:10,hardStopAtr:1});assert.equal(skipped.valid,false);assert.equal(skipped.finalLeverage,0);assert.match(skipped.reason,/1倍杠杆/);
});

test('dashboard write actions always use POST',async()=>{
 const source=await readFile('app/page.tsx','utf8');
 assert.match(source,/method:'POST'/);
 assert.doesNotMatch(source,/method:body\?'POST':'GET'/);
 assert.match(source,/高周期合格 · 等待5m突破/);
 assert.match(source,/入场信号 ·/);
});

test('background polling does not overwrite a newly selected account mode',async()=>{
 const source=await readFile('app/page.tsx','utf8');
 assert.match(source,/if\(!initialized\.current\)/);
 assert.doesNotMatch(source,/setS\(d\);setMode\(d\.mode\);setParams/);
});

test('market reads retry safely and one failed rank does not block entry scanning',async()=>{
 const source=await readFile('engine/server.mjs','utf8');
 assert.match(source,/maxAttempts=method==='GET'&&!signed\?3:1/);
 assert.match(source,/validCloseTimes=state\.ranking\.map/);
 assert.match(source,/Math\.max\(\.\.\.validCloseTimes\)/);
});

test('ranking always comes from production futures while testnet support only controls tradability',async()=>{
 const source=await readFile('engine/server.mjs','utf8');
 assert.match(source,/productionLive=new Set\(productionInfo\.symbols/);
 assert.match(source,/top=tickers\.filter\(t=>productionLive\.has\(t\.symbol\)\)/);
 assert.match(source,/eligible:tradable&&directionQualified/);
});

test('latest prices refresh between completed-candle indicator updates',async()=>{
 const source=await readFile('engine/server.mjs','utf8');
 assert.match(source,/async function refreshPrices\(\)/);
 assert.match(source,/const MARKET_STREAM='wss:\/\/fstream\.binance\.com\/market\/ws\/!ticker@arr'/);
 assert.match(source,/if\(streamStale\)await refreshPrices\(\)/);
 assert.match(source,/setTimeout\(startMarketStream,delay\)/);
});
