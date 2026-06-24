// @ts-nocheck
// client-portal-redsys-checkout — SINGLE FILE (crypto inlined, no cross-imports)
// Deploy: supabase-public-deps via supabase deploy --import-map
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ════════════════ DES + 3DES-EDE3-CBC (from des.js, MIT) ════════════════
const SBOX=[14,0,4,15,13,7,1,4,2,14,15,2,11,13,8,1,3,10,10,6,6,12,12,11,5,9,9,5,0,3,7,8,4,15,1,12,14,8,8,2,13,4,6,9,2,1,11,7,15,5,12,11,9,3,7,14,3,10,10,0,5,6,0,13,15,3,1,13,8,4,14,7,6,15,11,2,3,8,4,14,9,12,7,0,2,1,13,10,12,6,0,9,5,11,10,5,0,13,14,8,7,10,11,1,10,3,4,15,13,4,1,2,5,11,8,6,12,7,6,12,9,0,3,5,2,14,15,9,10,13,0,7,9,0,14,9,6,3,3,4,15,6,5,10,1,2,13,8,12,5,7,14,11,12,4,11,2,15,8,1,13,1,6,10,4,13,9,0,8,6,15,9,3,8,0,7,11,4,1,15,2,14,12,3,5,11,10,5,14,2,7,12,7,13,13,8,14,11,3,5,0,6,6,15,9,0,10,3,1,4,2,7,8,2,5,12,11,1,12,10,4,14,15,9,10,3,6,15,9,0,0,6,12,10,11,1,7,13,13,8,15,9,1,4,3,5,14,11,5,12,2,7,8,2,4,14,2,14,12,11,4,2,1,12,7,4,10,7,11,13,6,1,8,5,5,0,3,15,15,10,13,3,0,9,14,8,9,6,4,11,2,8,1,12,11,7,10,1,13,14,7,2,8,13,15,6,9,15,12,0,5,9,6,10,3,4,0,5,14,3,12,10,1,15,10,4,15,2,9,7,2,12,6,9,8,5,0,6,13,1,3,13,4,14,14,0,7,11,5,3,11,8,9,4,14,3,15,2,5,12,2,9,8,5,12,15,3,10,7,11,0,14,4,1,10,7,1,6,13,0,11,8,6,13,4,13,11,0,2,11,14,7,15,4,0,9,8,1,13,10,3,14,12,3,9,5,7,12,5,2,10,15,6,8,1,6,1,6,4,11,11,13,13,8,12,1,3,4,7,10,14,7,10,9,15,5,6,0,8,15,0,14,5,2,9,3,2,12,13,1,2,15,8,13,4,8,6,10,15,3,11,7,1,4,10,12,9,5,3,6,14,11,5,0,0,14,12,9,7,2,7,2,11,1,4,14,1,7,9,4,12,10,14,8,2,13,0,15,6,12,10,9,13,0,15,3,3,5,5,6,8,11];
const SHIFT_TABLE=[1,1,2,2,2,2,2,2,1,2,2,2,2,2,2,1];
const PERMUTE_TABLE=[16,25,12,11,3,20,4,15,31,17,9,6,27,14,1,22,30,24,8,18,0,5,29,23,13,19,2,26,10,21,28,7];
const PC2_TABLE=[14,11,17,4,27,23,25,0,13,22,7,18,5,9,16,24,2,20,12,21,1,8,15,26,15,4,25,19,9,1,26,16,5,11,23,8,12,7,17,0,22,3,10,14,6,20,27,24];
function ip(inL,inR,out,off){let oL=0,oR=0;for(let i=6;i>=0;i-=2){for(let j=0;j<=24;j+=8){oL<<=1;oL|=(inR>>>(j+i))&1;}for(let j=0;j<=24;j+=8){oL<<=1;oL|=(inL>>>(j+i))&1;}}for(let i=6;i>=0;i-=2){for(let j=1;j<=25;j+=8){oR<<=1;oR|=(inR>>>(j+i))&1;}for(let j=1;j<=25;j+=8){oR<<=1;oR|=(inL>>>(j+i))&1;}}out[off]=oL>>>0;out[off+1]=oR>>>0;}
function rip(inL,inR,out,off){let oL=0,oR=0;for(let i=0;i<4;i++){for(let j=24;j>=0;j-=8){oL<<=1;oL|=(inR>>>(j+i))&1;oL<<=1;oL|=(inL>>>(j+i))&1;}}for(let i=4;i<8;i++){for(let j=24;j>=0;j-=8){oR<<=1;oR|=(inR>>>(j+i))&1;oR<<=1;oR|=(inL>>>(j+i))&1;}}out[off]=oL>>>0;out[off+1]=oR>>>0;}
function pc1(inL,inR,out,off){let oL=0,oR=0;for(let i=7;i>=5;i--){for(let j=0;j<=24;j+=8){oL<<=1;oL|=(inR>>(j+i))&1;}for(let j=0;j<=24;j+=8){oL<<=1;oL|=(inL>>(j+i))&1;}}for(let j=0;j<=24;j+=8){oL<<=1;oL|=(inR>>(j+4))&1;}for(let i=1;i<=3;i++){for(let j=0;j<=24;j+=8){oR<<=1;oR|=(inR>>(j+i))&1;}for(let j=0;j<=24;j+=8){oR<<=1;oR|=(inL>>(j+i))&1;}}for(let j=0;j<=24;j+=8){oR<<=1;oR|=(inL>>(j+4))&1;}out[off]=oL>>>0;out[off+1]=oR>>>0;}
function r28shl(n,s){return((n<<s)&0xfffffff)|(n>>>(28-s));}
function pc2(inL,inR,out,off){let oL=0,oR=0;const len=PC2_TABLE.length>>>1;for(let i=0;i<len;i++){oL<<=1;oL|=(inL>>>PC2_TABLE[i])&1;}for(let i=len;i<PC2_TABLE.length;i++){oR<<=1;oR|=(inR>>>PC2_TABLE[i])&1;}out[off]=oL>>>0;out[off+1]=oR>>>0;}
function expand(r,out,off){let oL=0,oR=0;oL=((r&1)<<5)|(r>>>27);for(let i=23;i>=15;i-=4){oL<<=6;oL|=(r>>>i)&0x3f;}for(let i=11;i>=3;i-=4){oR|=(r>>>i)&0x3f;oR<<=6;}oR|=((r&0x1f)<<1)|(r>>>31);out[off]=oL>>>0;out[off+1]=oR>>>0;}
function substitute(inL,inR){let out=0;for(let i=0;i<4;i++){const b=(inL>>>(18-i*6))&0x3f;const sb=SBOX[i*0x40+b];out<<=4;out|=sb;}for(let i=0;i<4;i++){const b=(inR>>>(18-i*6))&0x3f;const sb=SBOX[4*0x40+i*0x40+b];out<<=4;out|=sb;}return out>>>0;}
function permute(num){let out=0;for(let i=0;i<PERMUTE_TABLE.length;i++){out<<=1;out|=(num>>>PERMUTE_TABLE[i])&1;}return out>>>0;}
function readUInt32BE(b,o){return((b[o]<<24)|(b[o+1]<<16)|(b[o+2]<<8)|b[o+3])>>>0;}
function writeUInt32BE(b,v,o){b[o]=(v>>>24)&0xff;b[o+1]=(v>>>16)&0xff;b[o+2]=(v>>>8)&0xff;b[o+3]=v&0xff;}
function deriveKeys(key){const out=new Uint32Array(32);let kL=readUInt32BE(key,0),kR=readUInt32BE(key,4);const t=[0,0];pc1(kL,kR,t,0);kL=t[0];kR=t[1];for(let i=0;i<16;i++){const s=SHIFT_TABLE[i];kL=r28shl(kL,s);kR=r28shl(kR,s);pc2(kL,kR,out,i*2);}return out;}
function feistel(l,r,keys,decrypt,eOut){let nL=l,nR=r;for(let i=0;i<16;i++){const ki=decrypt?15-i:i;const kL=keys[ki*2],kR=keys[ki*2+1];expand(nR,eOut,0);const eL=(kL^eOut[0])>>>0,eR=(kR^eOut[1])>>>0;const s=substitute(eL,eR),f=permute(s);const t=nR;nR=(nL^f)>>>0;nL=t;}return{l:nL,r:nR};}
function cryptBlock(input,key,decrypt){const keys=deriveKeys(key);let l=readUInt32BE(input,0),r=readUInt32BE(input,4);const ipO=[0,0];ip(l,r,ipO,0);l=ipO[0];r=ipO[1];const eO=[0,0];const{nL,nR}=feistel(l,r,keys,decrypt,eO);const out=[0,0];rip(nR,nL,out,0);const r2=new Uint8Array(8);writeUInt32BE(r2,out[0],0);writeUInt32BE(r2,out[1],4);return r2;}
function tripleDesEde3CbcEncrypt(pt,k24,iv){const s1=deriveKeys(k24.subarray(0,8)),s2=deriveKeys(k24.subarray(8,16)),s3=deriveKeys(k24.subarray(16,24));const padLen=8-(pt.length%8);const padded=new Uint8Array(pt.length+padLen);padded.set(pt);for(let i=pt.length;i<padded.length;i++)padded[i]=padLen;const out=new Uint8Array(padded.length);let prev=new Uint8Array(iv);for(let off=0;off<padded.length;off+=8){const block=new Uint8Array(8);for(let i=0;i<8;i++)block[i]=padded[off+i]^prev[i];const e1=block.slice();{let l=readUInt32BE(e1,0),r=readUInt32BE(e1,4);const ipO=[0,0];ip(l,r,ipO,0);l=ipO[0];r=ipO[1];const eB=[0,0];const{nL,nR}=feistel(l,r,s1,false,eB);const fpO=[0,0];rip(nR,nL,fpO,0);writeUInt32BE(e1,fpO[0],0);writeUInt32BE(e1,fpO[1],4);}const e2=new Uint8Array(8);{let l=readUInt32BE(e1,0),r=readUInt32BE(e1,4);const ipO=[0,0];ip(l,r,ipO,0);l=ipO[0];r=ipO[1];const eB=[0,0];const{nL,nR}=feistel(l,r,s2,true,eB);const fpO=[0,0];rip(nR,nL,fpO,0);writeUInt32BE(e2,fpO[0],0);writeUInt32BE(e2,fpO[1],4);}const e3=new Uint8Array(8);{let l=readUInt32BE(e2,0),r=readUInt32BE(e2,4);const ipO=[0,0];ip(l,r,ipO,0);l=ipO[0];r=ipO[1];const eB=[0,0];const{nL,nR}=feistel(l,r,s3,false,eB);const fpO=[0,0];rip(nR,nL,fpO,0);writeUInt32BE(e3,fpO[0],0);writeUInt32BE(e3,fpO[1],4);}out.set(e3,off);prev=e3;}return out;}
function b64d(s){const n=s.replace(/-/g,'+').replace(/_/g,'/');const p=n.length%4===0?'':'='.repeat(4-(n.length%4));const b=atob(n+p);const o=new Uint8Array(b.length);for(let i=0;i<b.length;i++)o[i]=b.charCodeAt(i);return o;}
function b64e(b){let s='';for(const x of b)s+=String.fromCharCode(x);return btoa(s);}
function redsys3Des(order,secretB64){const k=b64d(secretB64);let k24;if(k.length===16){k24=new Uint8Array(24);k24.set(k,0);k24.set(k.subarray(0,8),16);}else if(k.length===24){k24=k;}else if(k.length>24){k24=k.subarray(0,24);}else{throw new Error('Redsys secret too short: '+k.length);}return tripleDesEde3CbcEncrypt(new TextEncoder().encode(order),k24,new Uint8Array(8));}
async function redsysSign(paramsB64,secretB64,order){const d=redsys3Des(order,secretB64);const kb=await crypto.subtle.importKey('raw',d,{name:'HMAC',hash:'SHA-256'},false,['sign']);const sig=await crypto.subtle.sign('HMAC',kb,new TextEncoder().encode(paramsB64));return b64e(new Uint8Array(sig));}
function encodeParams(p){return b64e(new TextEncoder().encode(JSON.stringify(p))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}

// ════════════════ HTTP handler ════════════════
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const CRM_SUPABASE_URL = Deno.env.get('CRM_SUPABASE_URL') ?? '';
const CRM_SERVICE_ROLE_KEY = Deno.env.get('CRM_SERVICE_ROLE_KEY') ?? '';
const ALLOWED_ORIGINS = ['https://portal.simplificacrm.es'];
const SH = { 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'X-XSS-Protection': '1; mode=block', 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload', 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'none'" };
function withH(h={}){return{...SH,...h};}
function cors(req){const o=req.headers.get('Origin')??'';const ok=ALLOWED_ORIGINS.includes(o)||/^http:\/\/localhost(:\d+)?$/.test(o);return{'Access-Control-Allow-Origin':ok?o:'null','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'authorization,x-client-info,apikey,content-type','Access-Control-Max-Age':'86400',Vary:'Origin'};}
function jr(b,s,h){return new Response(JSON.stringify(b),{status:s,headers:withH({...h,'Content-Type':'application/json'})});}
async function crmFetch(p){if(!CRM_SUPABASE_URL||!CRM_SERVICE_ROLE_KEY)return{data:null,error:'CRM env vars not configured'};const r=await fetch(`${CRM_SUPABASE_URL}/rest/v1/${p}`,{method:'GET',headers:{apikey:CRM_SERVICE_ROLE_KEY,Authorization:`Bearer ${CRM_SERVICE_ROLE_KEY}`,'Content-Type':'application/json'}});if(!r.ok){const b=await r.text().catch(()=>'');return{data:null,error:`HTTP ${r.status}: ${b.substring(0,200)}`};}return{data:await r.json()};}
async function crmRpc(n,a){if(!CRM_SUPABASE_URL||!CRM_SERVICE_ROLE_KEY)return null;const r=await fetch(`${CRM_SUPABASE_URL}/rest/v1/rpc/${n}`,{method:'POST',headers:{apikey:CRM_SERVICE_ROLE_KEY,Authorization:`Bearer ${CRM_SERVICE_ROLE_KEY}`,'Content-Type':'application/json'},body:JSON.stringify(a)});if(!r.ok){console.error(`[redsys-checkout] CRM RPC ${n} failed: ${r.status}`);return null;}const t=await r.text();return t?JSON.parse(t):null;}

serve(async(req)=>{
  const h=cors(req);
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:h});
  if(req.method!=='POST')return jr({error:'Method not allowed'},405,h);
  if(!SUPABASE_URL||!SERVICE_ROLE_KEY||!CRM_SUPABASE_URL||!CRM_SERVICE_ROLE_KEY)return jr({error:'Server configuration error'},500,h);
  const ah=req.headers.get('Authorization')??'';
  const jwt=ah.startsWith('Bearer ')?ah.slice(7):'';
  if(!jwt)return jr({error:'Missing Bearer token'},401,h);
  const admin=createClient(SUPABASE_URL,SERVICE_ROLE_KEY,{auth:{persistSession:false}});
  const{data:{user},error:ae}=await admin.auth.getUser(jwt);
  if(ae||!user)return jr({error:'Invalid or expired token'},401,h);
  let body;try{body=await req.json();}catch{return jr({error:'Invalid JSON body'},400,h);}
  const contractId=(body?.contract_id??'').toString().trim();
  const frontendOrigin=(req.headers.get('origin')||req.headers.get('referer')||'').toString();
  let portalOrigin='';
  if(frontendOrigin){try{portalOrigin=new URL(frontendOrigin).origin;}catch{}}
  if(!contractId)return jr({error:'contract_id is required'},400,h);
  const cR=await crmFetch(`contracted_services?select=id,company_id,client_id,name,price,currency,status&id=eq.${encodeURIComponent(contractId)}&limit=1`);
  if(cR.error)return jr({error:`Contract lookup: ${cR.error}`},500,h);
  const contract=cR.data?.[0];
  if(!contract)return jr({error:'Contract not found'},404,h);
  if(contract.status!=='pending_payment')return jr({error:`Contract is not awaiting payment (status=${contract.status})`},409,h);
  const cfgR=await crmFetch(`company_payment_config?select=merchant_code,terminal,currency,environment,enabled,notify_url&company_id=eq.${encodeURIComponent(contract.company_id)}&provider=eq.redsys&limit=1`);
  if(cfgR.error)return jr({error:`Redsys config lookup: ${cfgR.error}`},500,h);
  const cfg=cfgR.data?.[0];
  if(!cfg||!cfg.enabled||!cfg.merchant_code)return jr({error:'Redsys is not configured for this company'},402,h);
  const secret=await crmRpc('vault_get_redsys_secret',{p_company_id:contract.company_id});
  if(!secret)return jr({error:'Redsys secret not found in Vault'},402,h);
  const yy=new Date().getFullYear().toString();
  const tail=contract.id.replace(/-/g,'').slice(-8).toUpperCase();
  const order=(yy+tail).slice(0,12);
  const amountCents=Math.round(Number(contract.price||0)*100);
  const isProduction=cfg.environment==='production';
  const baseUrl=isProduction?'https://sis.redsys.es':'https://sis-t.redsys.es';
  const notifyUrl=cfg.notify_url||`${SUPABASE_URL}/functions/v1/client-portal-redsys-notify`;
  const okUrl=`${portalOrigin||ALLOWED_ORIGINS[0]}/portal/redsys-return?status=ok&contract=${contractId}`;
  const koUrl=`${portalOrigin||ALLOWED_ORIGINS[0]}/portal/redsys-return?status=ko&contract=${contractId}`;
  const ds={Ds_Merchant_Amount:amountCents.toString(),Ds_Merchant_Currency:cfg.currency||'978',Ds_Merchant_MerchantCode:cfg.merchant_code,Ds_Merchant_Terminal:cfg.terminal||'1',Ds_Merchant_Order:order,Ds_Merchant_TransactionType:'0',Ds_Merchant_MerchantURL:notifyUrl,Ds_Merchant_UrlOK:okUrl,Ds_Merchant_UrlKO:koUrl,Ds_Merchant_ProductDescription:(contract.name||'Servicio').slice(0,125),Ds_Merchant_Titular:''};
  const paramsB64=encodeParams(ds);
  const signature=await redsysSign(paramsB64,secret,order);
  await crmRpc('insert_pending_payment',{p_company_id:contract.company_id,p_client_id:contract.client_id,p_contract_id:contract.id,p_amount_cents:amountCents,p_currency:cfg.currency||'978',p_provider:'redsys',p_environment:cfg.environment||'test',p_gateway_order:order});
  return jr({redirect_url:`${baseUrl}/sis/realizarPago`,form:{Ds_SignatureVersion:'HMAC_SHA256_V1',Ds_MerchantParameters:paramsB64,Ds_Signature:signature},order,amount_cents:amountCents},200,h);
});