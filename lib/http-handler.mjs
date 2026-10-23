import {randomUUID} from 'node:crypto';
import {PROTOCOL,ApiError,authorized,publicView} from './catalog-service.mjs';
export function createHandler(service,{getEnv=()=>process.env,productsOnly=false,adminAuth=null}={}) {
  return async function handler(req,res) {
    const env=getEnv();const origin=req.headers.origin;
    const sameOrigin=req.headers.host&&origin==='https://'+req.headers.host;
    const permitted=!origin||sameOrigin||origin==='https://so-achado.vercel.app'||/^chrome-extension:\/\/[a-p]{32}$/.test(origin);
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-So-Achado-API',PROTOCOL);res.setHeader('Vary','Origin');
    res.setHeader('Access-Control-Expose-Headers','ETag, X-So-Achado-API');
    if(origin&&permitted)res.setHeader('Access-Control-Allow-Origin',origin);
    if(req.method==='OPTIONS'){
      res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization, If-Match, X-Operation-Id, X-CSRF-Token');
      return res.status(permitted?204:403).end();
    }
    // Nas Functions a Vercel injeta OIDC no contexto da requisição, não só no env.
    const configured=Boolean(env.BLOB_READ_WRITE_TOKEN||env.BLOB_STORE_ID&&(env.VERCEL_OIDC_TOKEN||req.headers['x-vercel-oidc-token']));
    const writeKeyHash=String(env.RADAR_WRITE_KEY_HASH||'').trim();
    const protectedMode=/^[a-f0-9]{64}$/i.test(writeKeyHash);
    if(!productsOnly&&req.method==='GET'&&req.query?.health==='1')return res.status(200).json({protocol:PROTOCOL,protected:protectedMode,storageConfigured:configured,
      keyConfiguration:protectedMode?'ready':writeKeyHash?'invalid-format':'missing'});
    try {
      if(!permitted&&req.method!=='GET')throw new ApiError(403,'Origem não permitida.');
      if(productsOnly&&req.method==='GET'){const record=await service.read();res.setHeader('ETag','"'+record.revision+'"');return res.status(200).json(publicView(record));}
      if(!['GET','POST'].includes(req.method))throw new ApiError(405,'Método não permitido.');
      if(!protectedMode)throw new ApiError(503,'Publicação não configurada.');
      if(!authorized(req.headers.authorization,writeKeyHash)&&!await adminAuth?.authorize(req))throw new ApiError(401,'Entre com sua senha no editor ou conecte uma chave de publicação válida.');
      if(!configured)throw new ApiError(503,'Armazenamento privado ainda não configurado.');
      if(req.method==='GET'){const record=await service.read();return res.status(200).json({protocol:PROTOCOL,ready:true,revision:record.revision});}
      const raw=typeof req.body==='string'?req.body:JSON.stringify(req.body||{});
      if(Buffer.byteLength(raw)>1024*1024)throw new ApiError(413,'Solicitação muito grande.');
      let body;try{body=JSON.parse(raw);}catch{throw new ApiError(400,'JSON inválido.');}
      const options={expectedRevision:body.expectedRevision||String(req.headers['if-match']||'').replace(/^"|"$/g,''),
        operationId:body.operationId||req.headers['x-operation-id']||randomUUID(),confirmedIdentity:body.confirmedIdentity===true,allowPix:body.allowPix===true};
      let result;
      if(productsOnly)result=await service.replace(body,options);
      else if(body.action==='preview')return res.status(200).json({protocol:PROTOCOL,...await service.preview(body.product)});
      else if(body.action==='publish')result=await service.publish(body.product,options);
      else if(body.action==='restore')result=await service.restore(body.backupId,options);
      else throw new ApiError(400,'Ação não reconhecida.');
      return res.status(200).json({protocol:PROTOCOL,ok:true,revision:result.record.revision,backupId:result.backupId||result.record.revision,
        catalog:publicView(result.record),kept:Boolean(result.kept),replayed:Boolean(result.replayed)});
    }catch(e){
      if(!e.status)console.error('catalog-storage-error',e.name,String(e.message||'').replace(/Bearer\s+\S+|vercel_blob_rw_\S+|eyJ[a-zA-Z0-9_.-]+/g,'[redacted]').slice(0,500));
      return res.status(e.status||503).json({error:e.status?e.message:'O armazenamento não respondeu. A gravação não foi confirmada.'});
    }
  };
}
