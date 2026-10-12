import {defineConfig} from 'vite';import react from '@vitejs/plugin-react';import path from 'node:path';import {Service} from './hosts/desktop/service';
export default defineConfig({root:'apps/workbench',base:'./',plugins:[react(),{name:'local-workbench-host',configureServer(server){
  const secrets:Record<string,string>={};const service=new Service(path.resolve('.workbench-next'),path.resolve('apps/workbench/public/references'),{durable:false,get:k=>secrets[k]||'',set:(k,v)=>{secrets[k]=v;}});
  server.middlewares.use('/api',async(req,res,next)=>{if(req.method!=='POST'){res.statusCode=405;res.end();return;}
    const origin=req.headers.origin;if(req.headers['x-voyage-client']!=='1'||(origin&&new URL(origin).host!==req.headers.host)){res.statusCode=403;res.end();return;}
    try{let text='';for await(const chunk of req){text+=chunk;if(text.length>128*1024*1024)throw new Error('Request too large.');}const {method,payload}=JSON.parse(text);const result=await service.request(method,payload);res.setHeader('Content-Type','application/json');res.end(JSON.stringify({result}));}
    catch(e){res.statusCode=400;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error:(e as Error).message}));}
  });
}}],build:{outDir:'../../dist',emptyOutDir:true},server:{port:5173,strictPort:true}});
