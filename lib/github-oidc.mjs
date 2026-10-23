import {createPublicKey,verify} from 'node:crypto';
export const CLOUD_AUDIENCE='https://so-achado.vercel.app/api/telegram';
const REPO='thiagoocruz5-oss/s--achado';
const SUBJECTS=new Set([`repo:${REPO}:ref:refs/heads/main`,
  'repo:thiagoocruz5-oss@329791131/s--achado@1430008690:ref:refs/heads/main']);
export function createGitHubVerifier({fetcher=fetch,now=Date.now}={}) {
  let cache,until=0;
  return async header=>{
    try {
      if(typeof header!=='string'||!header.startsWith('Bearer ')||header.length>20000)return false;
      const parts=header.slice(7).split('.');if(parts.length!==3)return false;
      const [h,p]=parts.slice(0,2).map(x=>JSON.parse(Buffer.from(x,'base64url').toString()));
      const time=Math.floor(now()/1000);
      if(h.alg!=='RS256'||typeof h.kid!=='string'||p.iss!=='https://token.actions.githubusercontent.com'||p.aud!==CLOUD_AUDIENCE||
        !SUBJECTS.has(p.sub)||p.repository!==REPO||p.repository_id!=='1430008690'||p.repository_owner_id!=='329791131'||p.ref!=='refs/heads/main'||
        p.workflow_ref!==`${REPO}/.github/workflows/telegram-offers.yml@refs/heads/main`||
        !['schedule','workflow_dispatch'].includes(p.event_name)||!Number.isFinite(p.exp)||p.exp<=time||
        !Number.isFinite(p.iat)||p.iat>time+30||time-p.iat>600||p.exp-p.iat>900||
        (p.nbf!==undefined&&p.nbf>time+30))return false;
      if(!cache||until<now()||!cache.keys.some(k=>k.kid===h.kid)){
        const response=await fetcher('https://token.actions.githubusercontent.com/.well-known/jwks',{redirect:'error',signal:AbortSignal.timeout(10000)});
        if(!response.ok)return false;cache=await response.json();until=now()+300000;
      }
      const key=cache.keys.find(k=>k.kid===h.kid&&k.kty==='RSA'&&(!k.alg||k.alg==='RS256'));
      if(!key)return false;
      return verify('RSA-SHA256',Buffer.from(parts[0]+'.'+parts[1]),createPublicKey({key,format:'jwk'}),Buffer.from(parts[2],'base64url'));
    } catch {return false;}
  };
}
