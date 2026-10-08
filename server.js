require('dotenv').config();
const express=require('express'),bcrypt=require('bcryptjs'),helmet=require('helmet'),rateLimit=require('express-rate-limit'),crypto=require('crypto');
const app=express();

const required=['ADMIN_USERNAME','ADMIN_PASSWORD','SESSION_SECRET','SUPABASE_URL','SUPABASE_SECRET_KEY'];
const missing=()=>required.filter(k=>!process.env[k]);
const ready=()=>missing().length===0 && String(process.env.SESSION_SECRET||'').length>=32;
const problem=()=>missing().length?`Environment belum lengkap: ${missing().join(', ')}`:(String(process.env.SESSION_SECRET||'').length<32?'SESSION_SECRET harus minimal 32 karakter.':null);

app.disable('x-powered-by');
app.set('trust proxy',1);
app.use(helmet({contentSecurityPolicy:false}));
app.use(express.json({limit:'20mb'}));

const COOKIE='gmit_admin_session', MAX=2*60*60*1000;

function sign(user,exp){
  const p=Buffer.from(JSON.stringify({username:user,expiresAt:exp}),'utf8').toString('base64url');
  const s=crypto.createHmac('sha256',process.env.SESSION_SECRET).update(p).digest('base64url');
  return `${p}.${s}`;
}
function verify(token){
  try{
    const [p,s]=String(token||'').split('.');
    if(!p||!s||!ready()) return null;
    const e=crypto.createHmac('sha256',process.env.SESSION_SECRET).update(p).digest('base64url');
    const a=Buffer.from(s),b=Buffer.from(e);
    if(a.length!==b.length||!crypto.timingSafeEqual(a,b)) return null;
    const d=JSON.parse(Buffer.from(p,'base64url').toString('utf8'));
    return d.username===process.env.ADMIN_USERNAME&&Number.isFinite(d.expiresAt)&&d.expiresAt>Date.now()?d:null;
  }catch{return null}
}
function cookie(req){
  for(const part of (req.headers.cookie||'').split(';')){
    const [k,...v]=part.trim().split('=');
    if(k===COOKIE)return decodeURIComponent(v.join('='));
  }
  return null;
}
function setCookie(res,token){
  res.setHeader('Set-Cookie',`${COOKIE}=${encodeURIComponent(token)}; Max-Age=${Math.floor(MAX/1000)}; Path=/; HttpOnly; Secure; SameSite=Lax`);
}
function clearCookie(res){
  res.setHeader('Set-Cookie',`${COOKIE}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`);
}
async function sb(method,endpoint,body){
  if(!ready()) throw new Error(problem());
  const key=process.env.SUPABASE_SECRET_KEY,url=process.env.SUPABASE_URL.replace(/\/$/,'');
  const r=await fetch(`${url}/rest/v1/${endpoint}`,{
    method,
    headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json',
      Prefer:method==='POST'&&endpoint.startsWith('content?on_conflict=')?'resolution=merge-duplicates,return=minimal':'return=minimal'},
    body:body===undefined?undefined:JSON.stringify(body)
  });
  if(!r.ok){console.error('Supabase',r.status,await r.text().catch(()=>''));throw new Error(`Supabase request failed (${r.status})`)}
  return r;
}

const limiter=rateLimit({windowMs:15*60*1000,limit:8,standardHeaders:true,legacyHeaders:false,
  message:{error:'Terlalu banyak percobaan login. Coba lagi 15 menit.'}});

app.get('/api/health',(_q,res)=>{
  const p=problem();res.status(p?503:200).json({ok:!p,environmentReady:!p,error:p||null});
});
app.post('/api/login',limiter,async(req,res)=>{
  if(!ready()) return res.status(503).json({error:'Server login belum siap. '+problem()});
  const u=String(req.body?.username||''),p=String(req.body?.password||''),cu=String(process.env.ADMIN_USERNAME);
  const vu=u.length===cu.length&&crypto.timingSafeEqual(Buffer.from(u),Buffer.from(cu));
  const hash=bcrypt.hashSync(process.env.ADMIN_PASSWORD,12);
  const vp=await bcrypt.compare(p,hash);
  if(!vu||!vp)return res.status(401).json({error:'Username atau password salah.'});
  setCookie(res,sign(u,Date.now()+MAX));res.json({ok:true});
});
app.get('/api/me',(req,res)=>res.json({authenticated:Boolean(verify(cookie(req)))}));
app.post('/api/logout',(_q,res)=>{clearCookie(res);res.json({ok:true})});

function admin(req,res,next){if(verify(cookie(req)))return next();res.status(401).json({error:'Login admin diperlukan.'})}
const reserved=new Set(['gmit_kharisma_admin_session_v1']);

app.get('/api/content',async(_q,res)=>{
  try{const rows=await (await sb('GET','content?select=key,value')).json(),content={};
    rows.forEach(x=>content[x.key]=x.value);res.set('Cache-Control','no-store');res.json({content});
  }catch(e){console.error(e);res.status(500).json({error:'Gagal membaca database.'})}
});
app.put('/api/content/:key',admin,async(req,res)=>{
  const key=String(req.params.key||''),value=req.body?.value;
  if(!/^[a-zA-Z0-9_:-]{1,160}$/.test(key)||reserved.has(key))return res.status(400).json({error:'Kunci data tidak valid.'});
  if(typeof value!=='string'||Buffer.byteLength(value,'utf8')>15*1024*1024)return res.status(413).json({error:'Ukuran data tidak valid atau terlalu besar.'});
  try{await sb('POST','content?on_conflict=key',[{key,value}]);res.json({ok:true})}
  catch(e){console.error(e);res.status(500).json({error:'Gagal menyimpan data.'})}
});
app.delete('/api/content/:key',admin,async(req,res)=>{
  const key=String(req.params.key||'');
  if(!/^[a-zA-Z0-9_:-]{1,160}$/.test(key)||reserved.has(key))return res.status(400).json({error:'Kunci data tidak valid.'});
  try{await sb('DELETE',`content?key=eq.${encodeURIComponent(key)}`);res.json({ok:true})}
  catch(e){console.error(e);res.status(500).json({error:'Gagal menghapus data.'})}
});

app.use(express.static(__dirname,{index:'index.html',extensions:['html']}));
app.use((e,_q,res,_n)=>{console.error(e);res.status(500).json({error:'Terjadi kesalahan pada server.'})});

if(require.main===module)app.listen(Number(process.env.PORT||3000),'0.0.0.0',()=>console.log('Website running'));
module.exports=app;
