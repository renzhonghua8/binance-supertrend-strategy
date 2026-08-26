'use client';
import {useEffect,useMemo,useState} from 'react';

type Mode='paper'|'testnet'|'live';
type Signal={above:boolean,line:number|null,close:number|null,atr:number|null};
type Row={rank:number,symbol:string,change:number,price:number,quoteVolume:number,signals:Record<string,Signal|null>,eligible:boolean,reason:string};
type Snapshot={connected:boolean,running:boolean,mode:Mode,lastTick:string|null,lastRankingUpdate:string|null,nextRankingUpdate:string|null,account:{equity:number|null,available:number|null}|null,position:{symbol:string;qty:number;entryPrice:number;markPrice:number;unrealizedPnl:number;hardStop:number|null;rank:number|null}|null,ranking:Row[],logs:Array<{at:string,level:string,message:string}>,config:{leverage:number;exposure:number;rankingSize:number;rankingRefreshSec:number;hardStopAtr:number;hardStopStepAtr:number;cooldownBars:number},error:string|null};
const EMPTY:Snapshot={connected:false,running:false,mode:'paper',lastTick:null,lastRankingUpdate:null,nextRankingUpdate:null,account:null,position:null,ranking:[],logs:[],config:{leverage:5,exposure:2,rankingSize:10,rankingRefreshSec:60,hardStopAtr:1,hardStopStepAtr:.5,cooldownBars:3},error:null};
const API='http://localhost:3001/api';
const periods=[['15m','15分钟'],['1h','1小时'],['4h','4小时'],['1d','1日']];
const num=(v:number|null,d=2)=>v==null?'—':v.toLocaleString('en-US',{maximumFractionDigits:d});
const time=(v:string|null)=>v?new Date(v).toLocaleTimeString('zh-CN',{hour12:false}):'—';

export default function Home(){
 const[s,setS]=useState<Snapshot>(EMPTY),[mode,setMode]=useState<Mode>('paper'),[apiKey,setApiKey]=useState(''),[secret,setSecret]=useState(''),[unlock,setUnlock]=useState(''),[busy,setBusy]=useState(''),[notice,setNotice]=useState('');
 const[params,setParams]=useState(EMPTY.config);
 const call=async(path:string,body?:unknown)=>{setBusy(path);setNotice('');try{const r=await fetch(`${API}${path}`,{method:body?'POST':'GET',headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const data=await r.json();if(!r.ok)throw new Error(data.error||'操作失败');if(data.snapshot)setS(data.snapshot);setNotice(data.message||'已完成')}catch(e){setNotice(e instanceof Error?e.message:'操作失败')}finally{setBusy('')}};
 useEffect(()=>{const poll=async()=>{try{const r=await fetch(`${API}/snapshot`);if(r.ok){const d=await r.json();setS(d);setMode(d.mode);setParams(d.config)}}catch{}};poll();const id=setInterval(poll,3000);return()=>clearInterval(id)},[]);
 const active=useMemo(()=>s.ranking.filter(r=>r.eligible).length,[s.ranking]);
 const connect=()=>call('/connect',{mode,apiKey:apiKey.trim(),secretKey:secret.trim(),liveUnlock:unlock});
 const save=()=>call('/config',params);
 return <main>
  <header><div className="brand"><span>ST</span><div><b>Trend Executor</b><small>BINANCE 自动交易系统</small></div></div><div className="health"><i className={s.running?'pulse':''}/>{s.running?'策略运行中':s.connected?'已连接 · 未启动':'尚未连接'}</div></header>
  <div className="shell">
   <section className="hero"><div><p className="eyebrow">LOCAL CONTROL CENTER</p><h1>趋势执行，<em>规则优先。</em></h1><p>涨幅榜前10 · 多周期方向过滤 · 5分钟收盘突破入场 · 动态软硬止损</p></div><div className="mode-card"><span>当前环境</span><strong>{s.mode==='paper'?'纸面交易':s.mode==='testnet'?'测试网':'实盘'}</strong><small>{s.running?'引擎正在自动执行':'引擎处于安全停止状态'}</small></div></section>
   {notice&&<div className={`notice ${notice.includes('失败')||notice.includes('错误')?'bad':''}`}>{notice}</div>}
   <div className="grid">
    <section className="card connect"><div className="card-title"><div><p>01 · 连接</p><h2>账户与运行环境</h2></div><span className={s.connected?'ok':''}>{s.connected?'已连接':'未连接'}</span></div>
     <label>运行模式<select value={mode} onChange={e=>setMode(e.target.value as Mode)}><option value="paper">纸面交易（推荐）</option><option value="testnet">Binance 测试网</option><option value="live">Binance 实盘</option></select></label>
     {mode!=='paper'&&<><label>API Key<input type="password" value={apiKey} onChange={e=>setApiKey(e.target.value)} placeholder="仅保存在本地后端内存" autoComplete="off"/></label><label>Secret Key<input type="password" value={secret} onChange={e=>setSecret(e.target.value)} placeholder="关闭服务后自动清除" autoComplete="off"/></label></>}
     {mode==='live'&&<label>实盘解锁短语<input value={unlock} onChange={e=>setUnlock(e.target.value)} placeholder="输入：我确认实盘风险" autoComplete="off"/></label>}
     <button className="primary" disabled={!!busy} onClick={connect}>{busy==='/connect'?'正在验证…':mode==='paper'?'启用纸面账户':'验证并连接'}</button><p className="hint">密钥不写入磁盘、浏览器存储或日志。建议API仅开启合约交易权限并绑定本机IP，禁止提现权限。</p>
    </section>
    <section className="card params"><div className="card-title"><div><p>02 · 参数</p><h2>策略配置</h2></div><span>ST 10 / 3</span></div>
     <div className="param-grid"><label>杠杆设置<input type="number" min="1" max="20" value={params.leverage} onChange={e=>setParams({...params,leverage:+e.target.value})}/><small>倍</small></label><label>实际敞口<input type="number" min=".1" max="5" step=".1" value={params.exposure} onChange={e=>setParams({...params,exposure:+e.target.value})}/><small>× 权益</small></label><label>榜单数量<input type="number" min="1" max="20" value={params.rankingSize} onChange={e=>setParams({...params,rankingSize:+e.target.value})}/><small>名</small></label><label>榜单刷新<input type="number" min="15" max="300" value={params.rankingRefreshSec} onChange={e=>setParams({...params,rankingRefreshSec:+e.target.value})}/><small>秒</small></label><label>硬止损缓冲<input type="number" min=".5" max="3" step=".1" value={params.hardStopAtr} onChange={e=>setParams({...params,hardStopAtr:+e.target.value})}/><small>ATR</small></label><label>上移阈值<input type="number" min=".1" max="2" step=".1" value={params.hardStopStepAtr} onChange={e=>setParams({...params,hardStopStepAtr:+e.target.value})}/><small>ATR</small></label></div>
     <button className="secondary" disabled={!!busy||s.running} onClick={save}>保存参数</button><p className="hint">运行中锁定关键参数。默认：全仓、5倍设置、2倍名义敞口、只持有一个币。</p>
    </section>
    <section className="card control"><div className="card-title"><div><p>03 · 执行</p><h2>策略控制</h2></div><span className={s.running?'running':''}>{s.running?'AUTO':'SAFE'}</span></div>
     <div className="account"><div><span>账户权益</span><b>{num(s.account?.equity??null)} <small>USDT</small></b></div><div><span>可用余额</span><b>{num(s.account?.available??null)} <small>USDT</small></b></div></div>
     <div className="actions"><button className="start" disabled={!s.connected||s.running||!!busy} onClick={()=>call('/start')}>启动自动交易</button><button disabled={!s.running||!!busy} onClick={()=>call('/stop')}>停止新开仓</button><button className="danger" disabled={!s.position||!!busy} onClick={()=>confirm('确认市价平掉全部仓位？')&&call('/panic',{confirm:'CLOSE_ALL'})}>紧急平仓</button></div><p className="hint">“停止”不会主动平掉已有仓位，已有仓位仍保留交易所硬止损；“紧急平仓”会撤保护单并市价退出。</p>
    </section>
   </div>

   <section className="position card"><div className="card-title"><div><p>LIVE POSITION</p><h2>当前持仓</h2></div><span>{s.position?'持仓中':'空仓'}</span></div>{s.position?<div className="position-grid"><div><span>合约</span><b>{s.position.symbol}</b></div><div><span>数量</span><b>{num(s.position.qty,6)}</b></div><div><span>入场均价</span><b>{num(s.position.entryPrice,6)}</b></div><div><span>标记价格</span><b>{num(s.position.markPrice,6)}</b></div><div><span>未实现盈亏</span><b className={s.position.unrealizedPnl>=0?'green':'red'}>{num(s.position.unrealizedPnl)} USDT</b></div><div><span>硬止损</span><b>{num(s.position.hardStop,6)}</b></div></div>:<div className="empty">暂无持仓。引擎会从榜单第1名向下选择第一个满足完整规则的币种。</div>}</section>

   <section className="ranking card"><div className="card-title"><div><p>MARKET SCANNER</p><h2>涨幅榜前 {params.rankingSize}</h2></div><div className="scan-meta"><span>{active} 个方向合格</span><span>{time(s.lastRankingUpdate)} 更新</span></div></div><div className="table-wrap"><table><thead><tr><th>#</th><th>合约</th><th>最新价</th><th>24H</th><th>成交额</th>{periods.map(p=><th key={p[0]}>{p[1]}</th>)}<th>5m状态</th><th>判断</th></tr></thead><tbody>{s.ranking.length?s.ranking.map(r=><tr key={r.symbol}><td className="rank">{String(r.rank).padStart(2,'0')}</td><td><b>{r.symbol.replace('USDT','')}</b><small>/USDT</small></td><td>{num(r.price,6)}</td><td><span className="gain">+{r.change.toFixed(2)}%</span></td><td>{num(r.quoteVolume/1e6,1)}M</td>{periods.map(p=><td key={p[0]}><span className={`sig ${r.signals[p[0]]?.above?'up':'down'}`}>{r.signals[p[0]]?.above?'上方':'下方'}</span></td>)}<td><span className={`sig ${r.signals['5m']?.above?'up':'down'}`}>{r.signals['5m']?.above?'上方':'下方'}</span></td><td><span className={r.eligible?'eligible':'muted'}>{r.eligible?'方向合格':r.reason}</span></td></tr>):<tr><td colSpan={10}><div className="empty">连接并启动后加载实时榜单</div></td></tr>}</tbody></table></div></section>

   <section className="logs card"><div className="card-title"><div><p>SYSTEM EVENTS</p><h2>运行日志</h2></div><span>最近 {s.logs.length} 条</span></div><div className="log-list">{s.logs.length?s.logs.map((l,i)=><div key={`${l.at}-${i}`}><time>{time(l.at)}</time><span className={l.level}>{l.level.toUpperCase()}</span><p>{l.message}</p></div>):<div className="empty">暂无事件</div>}</div></section>
  </div>
 </main>
}
