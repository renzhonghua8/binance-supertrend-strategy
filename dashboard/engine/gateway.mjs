import http from 'node:http';

const HOST=process.env.GATEWAY_HOST||'127.0.0.1';
const PORT=Number(process.env.GATEWAY_PORT||3109);
const UI_PORT=Number(process.env.UI_PORT||3110);
const PAPER_ENGINE_PORT=Number(process.env.PAPER_ENGINE_PORT||process.env.ENGINE_PORT||3111);
const LIVE_ENGINE_PORT=Number(process.env.LIVE_ENGINE_PORT||3112);

const server=http.createServer((req,res)=>{
 const original=req.url||'/';let targetPort=UI_PORT,path=original;
 if(original.startsWith('/api/paper/')){targetPort=PAPER_ENGINE_PORT;path=original.replace('/api/paper/','/api/')}
 else if(original.startsWith('/api/live/')){targetPort=LIVE_ENGINE_PORT;path=original.replace('/api/live/','/api/')}
 else if(original.startsWith('/api/'))targetPort=PAPER_ENGINE_PORT;
 const upstream=http.request({hostname:'127.0.0.1',port:targetPort,path,method:req.method,headers:{...req.headers,host:`127.0.0.1:${targetPort}`,'x-forwarded-for':req.socket.remoteAddress||''}},upstreamRes=>{
  res.writeHead(upstreamRes.statusCode||502,upstreamRes.headers);
  upstreamRes.pipe(res);
 });
 upstream.setTimeout(65000,()=>upstream.destroy(new Error('upstream timeout')));
 upstream.on('error',error=>{if(!res.headersSent)res.writeHead(502,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify({error:`服务暂不可用：${error.message}`}))});
 req.pipe(upstream);
});

server.listen(PORT,HOST,()=>console.log(`Trend gateway: http://${HOST}:${PORT}`));
process.on('SIGINT',()=>server.close(()=>process.exit(0)));
process.on('SIGTERM',()=>server.close(()=>process.exit(0)));
