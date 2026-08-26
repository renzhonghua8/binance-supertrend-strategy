import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {riskLeverage,leveragePlan} from './strategy.mjs';

const port=31991;
let child;
async function waitForServer(){for(let i=0;i<40;i++){try{const r=await fetch(`http://127.0.0.1:${port}/api/snapshot`);if(r.ok)return}catch{}await new Promise(r=>setTimeout(r,100))}throw new Error('engine did not start')}

test('engine exposes safe default state and validates config',async()=>{
 child=spawn(process.execPath,['engine/server.mjs'],{cwd:process.cwd(),env:{...process.env,ENGINE_PORT:String(port)},stdio:'ignore'});
 try{await waitForServer();const snapshot=await fetch(`http://127.0.0.1:${port}/api/snapshot`).then(r=>r.json());assert.equal(snapshot.connected,false);assert.equal(snapshot.running,false);assert.equal(snapshot.mode,'paper');assert.equal(snapshot.config.maxRiskPct,20);assert.equal(snapshot.config.maxTrendDropPct,10);assert.equal('leverage'in snapshot.config,false);assert.equal('exposure'in snapshot.config,false);
 const bad=await fetch(`http://127.0.0.1:${port}/api/config`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({maxRiskPct:21})});assert.equal(bad.status,400);
 const good=await fetch(`http://127.0.0.1:${port}/api/config`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({maxRiskPct:18,maxTrendDropPct:9,hardStopAtr:1.2})});assert.equal(good.status,200);const result=await good.json();assert.equal(result.snapshot.config.maxRiskPct,18);assert.equal(result.snapshot.config.maxTrendDropPct,9);assert.equal(result.snapshot.config.hardStopAtr,1.2)}finally{child?.kill('SIGINT')}});

test('real-time trend-line risk selects only 10x 8x 6x 4x 2x and caps trend drop at 10%',()=>{
 assert.equal(riskLeverage(2,20),10);assert.equal(riskLeverage(2.01,20),8);assert.equal(riskLeverage(2.5,20),8);assert.equal(riskLeverage(2.51,20),6);assert.equal(riskLeverage(10/3,20),6);assert.equal(riskLeverage(3.34,20),4);assert.equal(riskLeverage(5,20),4);assert.equal(riskLeverage(5.01,20),2);assert.equal(riskLeverage(10,20),2);
 const ten=leveragePlan({close:100,line:98,atr:4},100,{maxRiskPct:20,maxTrendDropPct:10,hardStopAtr:1});assert.equal(ten.valid,true);assert.equal(ten.finalLeverage,10);assert.equal(ten.riskPct,20);assert.equal(ten.hardStopDistancePct,6);
 const eight=leveragePlan({close:100,line:97.5,atr:4},100,{maxRiskPct:20,maxTrendDropPct:10,hardStopAtr:1});assert.equal(eight.finalLeverage,8);assert.equal(eight.riskPct,20);assert.equal(eight.hardStopDistancePct,6.5);
 const skipped=leveragePlan({close:100,line:89,atr:1},100,{maxRiskPct:20,maxTrendDropPct:10,hardStopAtr:1});assert.equal(skipped.valid,false);assert.equal(skipped.finalLeverage,0);assert.match(skipped.reason,/趋势线跌幅超过10%/);
});

test('dashboard write actions always use POST',async()=>{
 const source=await readFile('app/page.tsx','utf8');
 assert.match(source,/const API='\/api'/);
 assert.doesNotMatch(source,/localhost:3001\/api/);
 assert.match(source,/method:'POST'/);
 assert.doesNotMatch(source,/method:body\?'POST':'GET'/);
 assert.match(source,/等待5m站上趋势线/);
 assert.match(source,/首位目标合格 ·/);
});

test('entry accepts an already-established 5m uptrend',async()=>{
 const source=await readFile('engine/server.mjs','utf8');
 assert.match(source,/if\(!sig\?\.above\|\|sig\.close<=sig\.line\)return false/);
 assert.doesNotMatch(source,/sig\.previous\.close>sig\.previous\.line/);
 assert.match(source,/state\.last5mCloseTime=null;startClock\(\)/);
});

test('background polling does not overwrite a newly selected account mode',async()=>{
 const source=await readFile('app/page.tsx','utf8');
 assert.match(source,/if\(!initialized\.current\)/);
 assert.doesNotMatch(source,/setS\(d\);setMode\(d\.mode\);setParams/);
});

test('market reads retry safely and entry locks the first five-period target',async()=>{
 const source=await readFile('engine/server.mjs','utf8');
 assert.match(source,/maxAttempts=method==='GET'&&!signed\?3:1/);
 assert.match(source,/validCloseTimes=state\.ranking\.map/);
 assert.match(source,/const target=state\.ranking\.find/);
 assert.match(source,/锁定目标 .* 执行失败，保持空仓/);
 assert.doesNotMatch(source,/执行失败，继续检查下一名/);
 assert.match(source,/state\.exchangeInfo=tradingInfo/);
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
