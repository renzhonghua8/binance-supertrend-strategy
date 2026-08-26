import http from 'node:http';

const HOST=process.env.GATEWAY_HOST||'127.0.0.1';
const PORT=Number(process.env.GATEWAY_PORT||3109);
const UI_PORT=Number(process.env.UI_PORT||3110);
const ENGINE_PORT=Number(process.env.ENGINE_PORT||3111);

const server=http.createServer((req,res)=>{
 const targetPort=req.url?.startsWith('/api/')?ENGINE_PORT:UI_PORT;
 const upstream=http.request({hostname:'127.0.0.1',port:targetPort,path:req.url,method:req.method,headers:{...req.headers,host:`127.0.0.1:${targetPort}`}},upstreamRes=>{
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
