import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {firstFivePeriodTarget,higherRankRotationTarget,riskLeverage,leveragePlan} from './strategy.mjs';

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

test('a higher-ranked five-period target replaces a lower-ranked position without skipping the first target',()=>{
 const signal={above:true,close:101,line:100,atr:1};
 const ranking=[
  {rank:1,symbol:'FIRSTUSDT',eligible:false,signals:{'5m':signal}},
  {rank:3,symbol:'MAGMAUSDT',eligible:true,signals:{'5m':signal}},
  {rank:6,symbol:'OTHERUSDT',eligible:true,signals:{'5m':signal}},
  {rank:10,symbol:'LIGHTUSDT',eligible:true,signals:{'5m':signal}},
 ];
 assert.equal(firstFivePeriodTarget(ranking)?.symbol,'MAGMAUSDT');
 assert.equal(higherRankRotationTarget({symbol:'LIGHTUSDT',rank:10},ranking)?.symbol,'MAGMAUSDT');
 assert.equal(higherRankRotationTarget({symbol:'MAGMAUSDT',rank:3},ranking),null);
 assert.equal(higherRankRotationTarget({symbol:'HELDUSDT',rank:2},ranking),null);
});

test('dashboard write actions always use POST',async()=>{
 const source=await readFile('app/page.tsx','utf8');
 assert.match(source,/fetch\(`\/api\/\$\{channel\}\$\{path\}`/);
 assert.doesNotMatch(source,/localhost:3001\/api/);
 assert.match(source,/method:'POST'/);
 assert.match(source,/纸面与实盘可同时启动/);
 assert.match(source,/\/api\/paper\/snapshot/);
 assert.match(source,/\/api\/live\/snapshot/);
 assert.match(source,/\/api\/live\/auth/);
 assert.match(source,/实盘余额、持仓、日志和所有操作均受访问密码保护/);
 assert.match(source,/实盘策略运行中/);
 assert.match(source,/实盘未运行原因/);
 assert.match(source,/if\(data\.snapshot\)setSnapshot\(channel,data\.snapshot\);if\(!r\.ok\)/);
 assert.doesNotMatch(source,/LIVE_ACCESS_PASSWORD\s*=\s*['"][^'"]+['"]/);
 assert.match(source,/等待5m站上趋势线/);
 assert.match(source,/首位目标合格 ·/);
 assert.match(source,/更高排名换仓目标/);
 assert.match(source,/自动换仓/);
});

test('entry accepts an already-established 5m uptrend',async()=>{
 const source=await readFile('engine/server.mjs','utf8');
 assert.match(source,/if\(!sig\?\.above\|\|sig\.close<=sig\.line\)return false/);
 assert.doesNotMatch(source,/sig\.previous\.close>sig\.previous\.line/);
 assert.match(source,/state\.last5mCloseTime=null;startClock\(\)/);
});

test('failed account safety checks cannot report a successful strategy start',async()=>{
 const source=await readFile('engine/server.mjs','utf8');
 assert.match(source,/if\(\/多个合约持仓\|空头持仓\/\.test\(e\.message\)\)\{state\.running=false;stopClock\(\)/);
 assert.match(source,/await tick\(\);if\(!state\.running\)throw new Error\(state\.error\|\|'启动后账户安全检查未通过'\)/);
 assert.match(source,/账户安全检查未通过，已停止新开仓/);
});

test('dashboard polls paper and live independently',async()=>{
 const source=await readFile('app/page.tsx','utf8');
 assert.match(source,/Promise\.all\(\[fetch\('\/api\/paper\/snapshot'\),fetch\('\/api\/live\/auth\/status'\)\]\)/);
 assert.match(source,/if\(auth\.authenticated\)/);
 assert.match(source,/setLive\(await liveResponse\.json\(\)\)/);
 assert.match(source,/纸面与实盘统计完全隔离/);
});

test('locked engines reject cross-mode connections and gateway keeps channels separate',async()=>{
 const lockedPort=31992,locked=spawn(process.execPath,['engine/server.mjs'],{cwd:process.cwd(),env:{...process.env,ENGINE_PORT:String(lockedPort),ENGINE_MODE:'live',LIVE_ACCESS_PASSWORD:'test-access-password'},stdio:'ignore'});
 try{for(let i=0;i<40;i++){try{const r=await fetch(`http://127.0.0.1:${lockedPort}/api/auth/status`);if(r.ok)break}catch{}await new Promise(r=>setTimeout(r,100))}const status=await fetch(`http://127.0.0.1:${lockedPort}/api/auth/status`).then(r=>r.json());assert.equal(status.configured,true);assert.equal(status.authenticated,false);const denied=await fetch(`http://127.0.0.1:${lockedPort}/api/snapshot`);assert.equal(denied.status,401);const badLogin=await fetch(`http://127.0.0.1:${lockedPort}/api/auth`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:'wrong'})});assert.equal(badLogin.status,401);const login=await fetch(`http://127.0.0.1:${lockedPort}/api/auth`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:'test-access-password'})});assert.equal(login.status,200);const cookie=login.headers.get('set-cookie');assert.match(cookie,/live_session=/);assert.match(cookie,/HttpOnly/);assert.match(cookie,/SameSite=Strict/);const snapshotResponse=await fetch(`http://127.0.0.1:${lockedPort}/api/snapshot`,{headers:{Cookie:cookie}});assert.equal(snapshotResponse.status,200);const snapshot=await snapshotResponse.json();assert.equal(snapshot.mode,'live');assert.equal(snapshot.lockedMode,'live');const wrong=await fetch(`http://127.0.0.1:${lockedPort}/api/connect`,{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify({mode:'paper'})});assert.equal(wrong.status,400);assert.match((await wrong.json()).error,/锁定为实盘/);const logout=await fetch(`http://127.0.0.1:${lockedPort}/api/auth/logout`,{method:'POST',headers:{Cookie:cookie}});assert.equal(logout.status,200);assert.equal((await fetch(`http://127.0.0.1:${lockedPort}/api/snapshot`,{headers:{Cookie:cookie}})).status,401)}finally{locked.kill('SIGINT')}
 const gateway=await readFile('engine/gateway.mjs','utf8');assert.match(gateway,/PAPER_ENGINE_PORT/);assert.match(gateway,/LIVE_ENGINE_PORT/);assert.match(gateway,/\/api\/paper\//);assert.match(gateway,/\/api\/live\//);
});

test('live access protection is server-side, expiring and rate limited',async()=>{
 const source=await readFile('engine/server.mjs','utf8');assert.match(source,/LIVE_SESSION_TTL_MS=8\*60\*60\*1000/);assert.match(source,/LIVE_FAILURE_LIMIT=5/);assert.match(source,/timingSafeEqual/);assert.match(source,/HttpOnly; SameSite=Strict/);assert.match(source,/liveAuthRequired\(\)&&!liveSession\(req\)/);assert.doesNotMatch(source,/LIVE_ACCESS_PASSWORD\s*=\s*['"][^'"]+['"]/);
});

test('market reads retry safely and entry locks the first five-period target',async()=>{
 const source=await readFile('engine/server.mjs','utf8');
 assert.match(source,/maxAttempts=method==='GET'&&!signed\?3:1/);
 assert.match(source,/final\.code=lastError\?\.code/);
 assert.match(source,/if\(e\.code!==-4046\)throw e/);
 assert.match(source,/if\(e\.code!==-2011\)/);
 assert.match(source,/validCloseTimes=state\.ranking\.map/);
 assert.match(source,/const target=firstFivePeriodTarget\(state\.ranking\)/);
 assert.match(source,/锁定目标 .* 执行失败，保持空仓/);
 assert.doesNotMatch(source,/执行失败，继续检查下一名/);
 assert.match(source,/state\.exchangeInfo=tradingInfo/);
 assert.match(source,/Math\.max\(\.\.\.validCloseTimes\)/);
 assert.match(source,/higherRankRotationTarget\(state\.position,state\.ranking\)/);
 assert.match(source,/if\(await maybeRotate\(\)\)return/);
 assert.match(source,/await syncAccount\(\);if\(state\.position\)\{log\('error',`\$\{previous\} 平仓后交易所仍报告持仓/);
 assert.match(source,/自动换仓完成/);
 assert.match(source,/async function exitAndRescan\(reason\)\{await closePosition\(reason\);if\(state\.running&&!state\.position\)/);
 assert.match(source,/if\(!rank\)\{await exitAndRescan\('跌出涨幅榜前10'\);return\}/);
 assert.match(source,/退出后立即重新扫描首位目标/);
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
