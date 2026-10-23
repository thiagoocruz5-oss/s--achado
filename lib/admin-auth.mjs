import {randomBytes,randomUUID,scrypt as scryptCallback,timingSafeEqual,createHmac} from 'node:crypto';
import {promisify} from 'node:util';
import {ApiError,authorized} from './catalog-service.mjs';
const scrypt=promisify(scryptCallback),COOKIE='__Host-so-achado-admin',TTL=7*86400;
const equal=(a,b)=>{const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&timingSafeEqual(x,y);};
const signature=(secret,value)=>createHmac('sha256',Buffer.from(secret,'base64url')).update(value).digest('base64url');
const cookie=(token,age=TTL)=>`${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${age}`;
const sameOrigin=req=>Boolean(req.headers.host&&req.headers.origin==='https://'+req.headers.host);
async function digest(password,salt){return Buffer.from(await scrypt(password,salt,64,{N:16384,r:8,p:1,maxmem:64*1024*1024})).toString('base64url');}
export function createAdminAuth(store,{now=()=>Date.now()}={}) {
  async function session(req){
    const token=String(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
    if(!token||token.length>1500)return null;
    const record=await store.read();if(!record)return null;
    const [payload,mac,...extra]=token.split('.');if(!payload||!mac||extra.length||!equal(signature(record.secret,payload),mac))return null;
    let data;try{data=JSON.parse(Buffer.from(payload,'base64url').toString());}catch{return null;}
    if(data.generation!==record.generation||data.host!==req.headers.host||!Number.isFinite(data.expires)||data.expires<=now()||data.expires>now()+TTL*1000+60000)return null;
    return {csrf:signature(record.secret,'csrf:'+token),expires:data.expires};
  }
  async function authorize(req){
    if(!sameOrigin(req))return false;
    const current=await session(req);
    return Boolean(current&&equal(current.csrf,req.headers['x-csrf-token']||''));
  }
  function issue(record,req,res){
    const payload=Buffer.from(JSON.stringify({generation:record.generation,host:req.headers.host,expires:now()+TTL*1000})).toString('base64url');
    const token=payload+'.'+signature(record.secret,payload);res.setHeader('Set-Cookie',cookie(token));
    return {authenticated:true,csrf:signature(record.secret,'csrf:'+token)};
  }
  async function failLogin(){
    for(let i=0;i<3;i++){
      const r=await store.read();if(!r)throw new ApiError(401,'Senha não cadastrada.');
      const failed=(r.failed||0)+1,next={...r,revision:randomUUID(),failed:failed>=5?0:failed,lockedUntil:failed>=5?now()+5*60000:r.lockedUntil||0};
      try{await store.compareAndSwap(r,next);return;}catch(e){if(e.status!==409)throw e;}
    }
    throw new ApiError(429,'Muitas tentativas. Aguarde alguns minutos.');
  }
  async function handler(req,res,getEnv=()=>process.env){
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
    try{
      if(req.headers.origin&&!sameOrigin(req))throw new ApiError(403,'Origem não permitida.');
      if(req.method==='GET'){
        const current=await session(req);return res.status(200).json({configured:Boolean(await store.read()),authenticated:Boolean(current),...(current?{csrf:current.csrf}:{})});
      }
      if(req.method!=='POST')throw new ApiError(405,'Método não permitido.');
      if(!sameOrigin(req)||!String(req.headers['content-type']||'').startsWith('application/json'))throw new ApiError(403,'Solicitação de acesso inválida.');
      const raw=typeof req.body==='string'?req.body:JSON.stringify(req.body||{});
      if(Buffer.byteLength(raw)>4096)throw new ApiError(413,'Solicitação muito grande.');
      let body;try{body=JSON.parse(raw);}catch{throw new ApiError(400,'Solicitação inválida.');}
      if(body.action==='logout'){res.setHeader('Set-Cookie',cookie('',0));return res.status(200).json({authenticated:false});}
      const password=body.password;
      if(typeof password!=='string'||password.length<10||password.length>128)throw new ApiError(400,'Use uma senha de 10 a 128 caracteres.');
      if(body.action==='set-password'){
        if(!authorized(req.headers.authorization,String(getEnv().RADAR_WRITE_KEY_HASH||'').trim()))throw new ApiError(401,'A chave de publicação é necessária para cadastrar ou recuperar a senha.');
        const current=await store.read(),salt=randomBytes(24).toString('base64url');
        const next={revision:randomUUID(),generation:randomUUID(),salt,passwordHash:await digest(password,salt),secret:randomBytes(32).toString('base64url'),failed:0,lockedUntil:0};
        await store.compareAndSwap(current||{},next);
        return res.status(200).json(issue(next,req,res));
      }
      if(body.action!=='login')throw new ApiError(400,'Ação de acesso inválida.');
      const current=await store.read();if(!current)throw new ApiError(401,'Cadastre sua senha primeiro.');
      if(current.lockedUntil>now())throw new ApiError(429,'Muitas tentativas. Aguarde cinco minutos antes de tentar novamente.');
      if(!equal(await digest(password,current.salt),current.passwordHash)){
        await failLogin();throw new ApiError(401,'Senha incorreta.');
      }
      const latest=await store.read();if(latest.generation!==current.generation)throw new ApiError(401,'A senha mudou. Entre novamente.');
      // A sessão não depende dos contadores de tentativas; só a troca da senha a invalida.
      if(latest.failed||latest.lockedUntil)try{await store.compareAndSwap(latest,{...latest,revision:randomUUID(),failed:0,lockedUntil:0});}catch(e){if(e.status!==409)throw e;}
      return res.status(200).json(issue(latest,req,res));
    }catch(e){return res.status(e.status||503).json({error:e.status?e.message:'O acesso não respondeu. Tente novamente em instantes.'});}
  }
  return {handler,authorize,session};
}
