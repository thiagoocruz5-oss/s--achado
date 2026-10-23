import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createAdminAuth} from '../lib/admin-auth.mjs';
import {createHandler} from '../lib/http-handler.mjs';
const key='test-only-strong-publishing-key-01234567890123456789',hash=createHash('sha256').update(key).digest('hex');
const password='Test-only-password-9385';
const res=()=>({code:200,headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(body){this.body=body;return this;}});
function setup(){
  let record=null,time=Date.now();const store={read:async()=>structuredClone(record),compareAndSwap:async(prev,next)=>{
    if(record&&record.revision!==prev.revision)throw Object.assign(new Error('Conflict'),{status:409});record=structuredClone(next);
  }},auth=createAdminAuth(store,{now:()=>time});
  const request=(body,headers={})=>({method:body?'POST':'GET',headers:{host:'so-achado.test',origin:'https://so-achado.test','content-type':'application/json',...headers},body});
  return {auth,request,get record(){return record;},advance:ms=>time+=ms,
    async call(body,headers={}){const r=res();await auth.handler(request(body,headers),r,()=>({RADAR_WRITE_KEY_HASH:hash}));return r;},
    async register(){return this.call({action:'set-password',password},{authorization:'Bearer '+key});}};
}
test('cadastrar senha exige chave e guarda somente hash salgado em armazenamento privado',async()=>{
  const h=setup();assert.equal((await h.call({action:'set-password',password})).code,401);
  assert.equal((await h.call({action:'set-password',password:'short'},{authorization:'Bearer '+key})).code,400);
  const registered=await h.register();assert.equal(registered.code,200);assert.equal(registered.body.authenticated,true);
  assert.equal(JSON.stringify(h.record).includes(password),false);assert.ok(h.record.passwordHash);assert.ok(h.record.salt);
  const status=await h.call();assert.deepEqual(status.body,{configured:true,authenticated:false});
  const cookie=registered.headers['Set-Cookie'];for(const flag of ['HttpOnly','Secure','SameSite=Strict','Path=/','Max-Age=604800'])assert.ok(cookie.includes(flag));
});
test('senha emite sessão persistente; escrita exige cookie, mesma origem e proteção CSRF',async()=>{
  const h=setup();await h.register();const login=await h.call({action:'login',password});assert.equal(login.code,200);
  const cookie=login.headers['Set-Cookie'].split(';')[0],headers={cookie,'x-csrf-token':login.body.csrf};
  assert.equal(await h.auth.authorize(h.request({},headers)),true);
  assert.equal(await h.auth.authorize(h.request({},{cookie})),false);
  assert.equal(await h.auth.authorize(h.request({},{...headers,origin:'https://evil.test'})),false);
  assert.equal(await h.auth.authorize(h.request({},{...headers,cookie:cookie+'wrong'})),false);
  const status=await h.call(undefined,{cookie});assert.equal(status.body.authenticated,true);assert.equal(status.body.csrf,login.body.csrf);
  h.advance(8*86400000);assert.equal((await h.call(undefined,{cookie})).body.authenticated,false);
});
test('trocar senha invalida cookies antigos; origem externa não cadastra nem entra',async()=>{
  const h=setup(),first=await h.register(),cookie=first.headers['Set-Cookie'].split(';')[0];
  assert.equal((await h.call({action:'login',password},{origin:'https://evil.test'})).code,403);
  const next=await h.call({action:'set-password',password:'Another-test-password-235'},{authorization:'Bearer '+key});assert.equal(next.code,200);
  assert.equal((await h.call(undefined,{cookie})).body.authenticated,false);
  assert.equal((await h.call({action:'login',password})).code,401);
  const logout=await h.call({action:'logout'});assert.ok(logout.headers['Set-Cookie'].includes('Max-Age=0'));
});
test('cinco senhas erradas limitam novas tentativas sem afetar a chave do Radar',async()=>{
  const h=setup();await h.register();for(let i=0;i<5;i++)assert.equal((await h.call({action:'login',password:'Wrong-password-123'})).code,401);
  assert.equal((await h.call({action:'login',password})).code,429);
  h.advance(5*60000+1);assert.equal((await h.call({action:'login',password})).code,200);
});
test('API existente aceita sessão do editor e continua aceitando chave da extensão',async()=>{
  const h=setup(),login=await h.register();let writes=0;
  const service={replace:async()=>{writes++;return {record:{revision:'new',catalog:{settings:{},products:[]}}};}};
  const handler=createHandler(service,{productsOnly:true,adminAuth:h.auth,getEnv:()=>({RADAR_WRITE_KEY_HASH:hash,BLOB_READ_WRITE_TOKEN:'test'})});
  const base={cookie:login.headers['Set-Cookie'].split(';')[0],'x-csrf-token':login.body.csrf};
  const request=h.request({products:[]},base),r=res();await handler(request,r);assert.equal(r.code,200);assert.equal(writes,1);
  const denied=res();await handler(h.request({products:[]},{cookie:base.cookie}),denied);assert.equal(denied.code,401);assert.equal(writes,1);
  const radar=res();await handler({method:'POST',headers:{authorization:'Bearer '+key},body:{products:[]}},radar);assert.equal(radar.code,200);assert.equal(writes,2);
});
