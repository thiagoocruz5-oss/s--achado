import {authorized} from './catalog-service.mjs';
export function createCloudHandler(cloud,{adminAuth,verifyGitHub,getEnv=()=>process.env}){
  return async(req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
    const env=getEnv(),same=req.headers.origin==='https://'+req.headers.host;
    try{
      if(env.VERCEL_ENV!=='production')return res.status(403).json({error:'Envio em nuvem disponível somente em produção.'});
      if(req.method==='GET'&&req.query?.health==='1'){
        if(/^chrome-extension:\/\/[a-p]{32}$/.test(req.headers.origin||''))res.setHeader('Access-Control-Allow-Origin',req.headers.origin);
        return res.status(200).json({cloudEnabled:await cloud.active()});
      }
      if(req.method!=='POST')return res.status(405).json({error:'Método não permitido.'});
      if(req.headers.origin&&!same)return res.status(403).json({error:'Origem não permitida.'});
      if(!req.headers.origin&&await verifyGitHub(req.headers.authorization))return res.status(200).json(await cloud.run());
      if(!same||!authorized(req.headers.authorization,env.RADAR_WRITE_KEY_HASH)&&!await adminAuth.authorize(req))
        return res.status(401).json({error:'Entre no editor com sua senha.'});
      const raw=typeof req.body==='string'?req.body:JSON.stringify(req.body||{});
      if(Buffer.byteLength(raw)>4096)return res.status(413).json({error:'Solicitação muito grande.'});
      const body=JSON.parse(raw);let result;
      if(body.action==='status')result=await cloud.status();
      else if(body.action==='configure')result=await cloud.configure(String(body.token||'').trim());
      else if(body.action==='enable')result=await cloud.enable(body.enabled===true);
      else if(body.action==='run'){await cloud.run();result=await cloud.status();}
      else if(body.action==='resolve')result=await cloud.resolve();
      else return res.status(400).json({error:'Comando inválido.'});
      return res.status(200).json(result);
    }catch{return res.status(503).json({error:'Não foi possível concluir. Confira o estado do envio e tente novamente. O envio pendente precisa ser conferido no grupo.'});}
  };
}
