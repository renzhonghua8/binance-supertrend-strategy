export function baseLeverage(distancePct){
 if(distancePct<0||distancePct>=10)return 0;
 if(distancePct<2)return 5;
 if(distancePct<2.5)return 4;
 if(distancePct<5)return 2;
 return 1;
}

export function leveragePlan(sig,{maxRiskPct=10,hardStopAtr=1}={}){
 if(!sig||![sig.close,sig.line,sig.atr].every(Number.isFinite)||sig.close<=0||sig.atr<=0)return{valid:false,reason:'5m风险数据无效'};
 const distancePct=(sig.close-sig.line)/sig.close*100;
 const base=baseLeverage(distancePct);
 const hardStop=sig.line-hardStopAtr*sig.atr;
 const hardStopDistancePct=(sig.close-hardStop)/sig.close*100;
 const riskLeverage=hardStopDistancePct>0?Math.floor(maxRiskPct/hardStopDistancePct):0;
 const finalLeverage=Math.min(base,riskLeverage,5);
 const riskPct=hardStopDistancePct*finalLeverage;
 const details={distancePct,baseLeverage:base,hardStop,hardStopDistancePct,riskLeverage,finalLeverage,riskPct};
 if(base===0)return{valid:false,reason:distancePct<0?'5m尚未站上线':'从5m收盘回落至趋势线的跌幅不小于10%',...details,finalLeverage:0,riskPct:0};
 if(riskLeverage<1)return{valid:false,reason:'1倍杠杆风险仍超过上限',...details,finalLeverage:0,riskPct:0};
 return{valid:true,reason:'风险合格',...details};
}
