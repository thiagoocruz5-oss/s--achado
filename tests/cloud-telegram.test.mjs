import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign,randomUUID} from 'node:crypto';
import {createCloudTelegram,cloudCaption,GROUP_ID} from '../lib/cloud-telegram.mjs';
import {createCloudHandler} from '../lib/cloud-telegram-http.mjs';
import {createGitHubVerifier,CLOUD_AUDIENCE} from '../lib/github-oidc.mjs';
function memory(initial=null){let record=initial;return {read:async()=>structuredClone(record),compareAndSwap:async(previous,next)=>{
  if((record?.revision||null)!==(previous?.revision||null)){const e=new Error('conflict');e.status=409;throw e;}record=structuredClone(next);
}};}
const product=id=>({id:String(id),title:'Produto '+id,price:49.9,image:'https://http2.mlstatic.com/foto.webp',affiliateUrl:'https://meli.la/Oferta'+id});
function setup(){
  let clock=1800000000000,feed=Array.from({length:7},(_,i)=>product(i+1)),fail=false;
  const store=memory(),credentials=memory(),sent=[];
  const cloud=createCloudTelegram({store,credentials,now:()=>clock,catalog:{read:async()=>({catalog:{products:feed}})},
    telegram:{connect:async()=>({id:GROUP_ID}),sendPhoto:async(token,id,photo,caption)=>{
      assert.ok((await store.read()).pending);sent.push({id,photo,caption});if(fail)throw new Error('erro '+token);return {message_id:sent.length};
    }}});
  return {cloud,store,credentials,sent,advance:(minutes=60)=>clock+=minutes*60000,fail:()=>fail=true,feed:v=>feed=v};
}
test('envio em nuvem usa catálogo publicado, cinco por lote, intervalo de uma hora e reinício do ciclo',async()=>{
  const h=setup();assert.equal((await h.cloud.run()).status,'disabled');
  await h.cloud.configure('private-token');await h.cloud.enable(true);await h.cloud.run();assert.equal(h.sent.length,5);
  assert.equal((await h.cloud.run()).status,'waiting');h.advance(59);assert.equal((await h.cloud.run()).status,'waiting');
  assert.equal(h.sent.length,5);h.advance(1);await h.cloud.run();assert.equal(h.sent.length,7);
  h.advance();await h.cloud.run();assert.equal(h.sent.length,12);assert.equal((await h.cloud.status()).cycle,2);
  assert.ok(h.sent[0].caption.includes('https://so-achado.vercel.app/'));assert.ok(h.sent[0].caption.includes('https://meli.la/Oferta1'));
  assert.ok(!h.sent[0].caption.includes('comissão'));assert.ok(!JSON.stringify(await h.cloud.status()).includes('private-token'));
  assert.ok(!JSON.stringify(await h.store.read()).includes('private-token'));
});
test('dois agendadores concorrentes não duplicam o lote; remoções e adições são lidas novamente',async()=>{
  const h=setup();await h.cloud.configure('private-token');await h.cloud.enable(true);
  await Promise.all([h.cloud.run(),h.cloud.run()]);assert.equal(h.sent.length,5);
  h.feed([product(9)]);h.advance();await h.cloud.run();assert.equal(h.sent.length,6);assert.match(h.sent.at(-1).caption,/Oferta9/);
});
test('resultado incerto pausa e mantém pendência para conferência sem repetir automaticamente',async()=>{
  const h=setup();await h.cloud.configure('private-token');await h.cloud.enable(true);h.fail();
  await assert.rejects(h.cloud.run(),e=>!e.message.includes('private-token'));
  assert.equal(h.sent.length,1);assert.equal((await h.cloud.status()).enabled,false);assert.ok((await h.cloud.status()).pending);
  await assert.rejects(h.cloud.enable(true),/Confira/);await h.cloud.run();assert.equal(h.sent.length,1);
  await h.cloud.resolve();assert.equal((await h.cloud.status()).pending,null);assert.deepEqual((await h.store.read()).sentIds,['1']);
});
test('catálogo vazio não envia; mensagens longas continuam dentro do limite',async()=>{
  const h=setup();await h.cloud.configure('private-token');await h.cloud.enable(true);h.feed([]);await h.cloud.run();assert.equal(h.sent.length,0);
  assert.ok([...cloudCaption({...product(1),title:'🛍️'.repeat(1000)})].length<=1024);
});
test('identidade do agendador exige assinatura GitHub, repositório, workflow, audience e validade corretos',async()=>{
  const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});const key={...publicKey.export({format:'jwk'}),kid:'test-key',alg:'RS256'};
  const clock=1800000000000,time=clock/1000,repo='thiagoocruz5-oss/s--achado';
  const claims={iss:'https://token.actions.githubusercontent.com',aud:CLOUD_AUDIENCE,sub:`repo:${repo}:ref:refs/heads/main`,repository:repo,repository_id:'1430008690',repository_owner_id:'329791131',ref:'refs/heads/main',workflow_ref:`${repo}/.github/workflows/telegram-offers.yml@refs/heads/main`,event_name:'schedule',iat:time,exp:time+300};
  const jwt=patch=>{const parts=[{alg:'RS256',kid:'test-key'},{...claims,...patch}].map(p=>Buffer.from(JSON.stringify(p)).toString('base64url'));return 'Bearer '+parts.join('.')+'.'+sign('RSA-SHA256',Buffer.from(parts.join('.')),privateKey).toString('base64url');};
  const verifier=createGitHubVerifier({now:()=>clock,fetcher:async()=>({ok:true,json:async()=>({keys:[key]})})});
  assert.equal(await verifier(jwt({})),true);
  assert.equal(await verifier(jwt({sub:'repo:thiagoocruz5-oss@329791131/s--achado@1430008690:ref:refs/heads/main'})),true);
  assert.equal(await verifier(jwt({repository_id:'999'})),false);
  assert.equal(await verifier(jwt({sub:'repo:thiagoocruz5-oss@999/s--achado@1430008690:ref:refs/heads/main'})),false);
  for(const patch of [{aud:'other'},{repository:'attacker/repo'},{workflow_ref:'other'},{exp:time-1},{event_name:'pull_request'},{iat:time-1000}])assert.equal(await verifier(jwt(patch)),false);
  assert.equal(await verifier(jwt({}).slice(0,-10)+'AAAAAAAAAA'),false);assert.equal(await verifier(''),false);
});
test('API de nuvem protege status e configuração, rejeita prévia e nunca devolve segredo em erro',async()=>{
  const response=()=>({code:200,setHeader(){},status(c){this.code=c;return this;},json(body){this.body=body;return this;}});
  let calls=0;const h=setup(),handler=createCloudHandler(h.cloud,{getEnv:()=>({VERCEL_ENV:'production'}),adminAuth:{authorize:async()=>false},verifyGitHub:async()=>false});
  let res=response();await handler({method:'POST',headers:{host:'so-achado.vercel.app',origin:'https://attacker.test'},body:{action:'status'}},res);assert.equal(res.code,403);
  res=response();await handler({method:'POST',headers:{host:'so-achado.vercel.app',origin:'https://so-achado.vercel.app'},body:{action:'status'}},res);assert.equal(res.code,401);
  const cron=createCloudHandler({run:async()=>{calls++;return {sent:0,status:'disabled'};}},{getEnv:()=>({VERCEL_ENV:'production'}),verifyGitHub:async()=>true,adminAuth:{authorize:async()=>false}});
  res=response();await cron({method:'POST',headers:{}},res);assert.equal(res.code,200);assert.equal(calls,1);
  const preview=createCloudHandler(h.cloud,{getEnv:()=>({VERCEL_ENV:'preview'}),verifyGitHub:async()=>true});res=response();await preview({method:'POST',headers:{}},res);assert.equal(res.code,403);
});
