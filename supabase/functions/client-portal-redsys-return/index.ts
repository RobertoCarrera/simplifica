// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
const ALLOWED_ORIGINS = ['https://portal.simplificacrm.es'];
const SH = { 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'X-XSS-Protection': '1; mode=block', 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'none'" };
function withH(h={}){return{...SH,...h};}
function cors(req){const o=req.headers.get('Origin')??'';const ok=ALLOWED_ORIGINS.includes(o)||/^http:\/\/localhost(:\d+)?$/.test(o);return{'Access-Control-Allow-Origin':ok?o:'null',Vary:'Origin'};}

serve(async(req)=>{
  const h=cors(req);
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:h});
  const url=new URL(req.url);
  const status=url.searchParams.get('status')==='ok'?'ok':'ko';
  const contract=url.searchParams.get('contract')??'';
  const target=`${ALLOWED_ORIGINS[0]}/portal/redsys-return?status=${status}&contract=${encodeURIComponent(contract)}`;
  return new Response(null,{status:302,headers:withH({...h,'Location':target})});
});