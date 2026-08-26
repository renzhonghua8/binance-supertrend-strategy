export const LEVERAGE_LEVELS=[10,5,3,1];

export function riskLeverage(stopDropPct,maxRiskPct=20){
 if(!Number.isFinite(stopDropPct)||stopDropPct<=0)return 0;
 return LEVERAGE_LEVELS.find(level=>stopDropPct*level<=maxRiskPct+1e-9)||0;
}

export function leveragePlan(sig,livePrice=sig?.close,{maxRiskPct=20,maxStopDropPct=10,hardStopAtr=1}={}){
 if(!sig||![livePrice,sig.close,sig.line,sig.atr].every(Number.isFinite)||livePrice<=0||sig.atr<=0)return{valid:false,reason:'实时风险数据无效'};
 const distancePct=(sig.close-sig.line)/sig.close*100;
 const liveLineDistancePct=(livePrice-sig.line)/livePrice*100;
 const hardStop=sig.line-hardStopAtr*sig.atr;
 const hardStopDistancePct=(livePrice-hardStop)/livePrice*100;
 const finalLeverage=hardStopDistancePct<=maxStopDropPct?riskLeverage(hardStopDistancePct,maxRiskPct):0;
 const riskPct=hardStopDistancePct*Math.max(finalLeverage,0);
 const details={referencePrice:livePrice,distancePct,liveLineDistancePct,hardStop,hardStopDistancePct,riskLeverage:finalLeverage,finalLeverage,riskPct};
 if(livePrice<=sig.line)return{valid:false,reason:'实时价格尚未站上5m趋势线',...details,finalLeverage:0,riskPct:0};
 if(hardStopDistancePct>maxStopDropPct)return{valid:false,reason:`实时止损跌幅超过${maxStopDropPct}%`,...details,finalLeverage:0,riskPct:0};
 if(finalLeverage<1)return{valid:false,reason:'1倍杠杆风险仍超过上限',...details,finalLeverage:0,riskPct:0};
 return{valid:true,reason:'实时风险合格',...details};
}
