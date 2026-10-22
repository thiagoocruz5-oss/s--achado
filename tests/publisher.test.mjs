import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createService,publicView,authorized,PROTOCOL} from '../lib/catalog-service.mjs';
import {createHandler} from '../lib/http-handler.mjs';
import {createBlobStore} from '../lib/blob-store.mjs';
const seed=JSON.parse(await readFile(new URL('../data/products.json',import.meta.url),'utf8'));
const token='test-only-credential-0123456789-ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const hash=createHash('sha256').update(token).digest('hex');
function setup() {
  let record=null;const backups=new Map();
  const store={read:async()=>structuredClone(record),writeBackup:async backup=>backups.set(backup.id,structuredClone(backup)),readBackup:async id=>structuredClone(backups.get(id)),
    compareAndSwap:async(previous,next)=>{if(record&&record.revision!==previous.revision){const e=new Error('conflict');e.status=409;throw e;}record=structuredClone(next);}};
  return {service:createService(store,seed),backups};
}
function offer() {const p=seed.products[2];return {...p,price:p.price-1,detailTitle:p.title,available:true,newCondition:true,verifiedAt:Date.now(),
  identityVerified:true,selectedVariant:'250 g',condition:'regular',url:'https://www.mercadolivre.com.br/creatina/p/MLB19603205'};}
function response(){return {code:200,headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.code=code;return this;},json(value){this.body=value;return this;},end(){return this;}};}
const request=(body,authorization='Bearer '+token)=>({method:'POST',headers:{authorization},body,query:{}});
const options=revision=>({expectedRevision:revision,operationId:randomUUID(),confirmedIdentity:true,allowPix:true});
test('autenticação exige chave forte correspondente ao resumo, sem aceitar a senha antiga',()=> {
  assert.equal(authorized('Bearer '+token,hash),true);assert.equal(authorized('Bearer admin123',hash),false);assert.equal(authorized('',hash),false);assert.equal(authorized('Bearer '+token,''),false);
});
test('publicação substitui somente um produto, preserva configurações e salva cópia antes',async()=> {
  const {service,backups}=setup(),before=await service.read();const result=await service.publish(offer(),options(before.revision));
  assert.equal(result.record.catalog.products.length,3);assert.equal(result.record.catalog.products[0].price,before.catalog.products[0].price);
  assert.equal(result.record.catalog.products[2].price,38.9);assert.equal(backups.size,1);
  assert.equal(backups.get(result.backupId).previous.catalog.products[2].price,39.9);
  assert.deepEqual(result.record.catalog.settings,before.catalog.settings);
});
test('restaurar a publicação recupera o catálogo completo anterior',async()=> {
  const {service}=setup(),before=await service.read(),changed=await service.publish(offer(),options(before.revision));
  const restored=await service.restore(changed.backupId,options(changed.record.revision));
  assert.deepEqual(restored.record.catalog,before.catalog);
});
test('revisão antiga impede sobrescrever mudanças e repetir operação é idempotente',async()=> {
  const {service}=setup(),before=await service.read(),opts=options(before.revision),changed=await service.publish(offer(),opts);
  const replay=await service.publish(offer(),opts);assert.equal(replay.replayed,true);assert.equal(replay.record.revision,changed.record.revision);
  await assert.rejects(service.publish({...offer(),price:30},options(before.revision)),e=>e.status===409);
});
test('duas publicações concorrentes não apagam o trabalho uma da outra',async()=> {
  const {service}=setup(),before=await service.read();
  const results=await Promise.allSettled([service.publish({...offer(),price:38},options(before.revision)),service.publish({...offer(),price:37},options(before.revision))]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected').length,1);
});
test('primeira troca importada exige confirmação e preço maior não gera gravação',async()=> {
  const {service,backups}=setup(),before=await service.read();
  await assert.rejects(service.publish(offer(),{...options(before.revision),confirmedIdentity:false}),e=>e.status===409);
  const kept=await service.publish({...offer(),price:40},options(before.revision));assert.equal(kept.kept,true);assert.equal(backups.size,0);
});
test('prévia não grava, dados vencidos não são publicados e caminho de backup inválido é recusado',async()=> {
  const {service,backups}=setup();const preview=await service.preview(offer());assert.equal(preview.plan.type,'replace');assert.equal(backups.size,0);
  await assert.rejects(service.publish({...offer(),verifiedAt:Date.now()-16*60000},options(preview.revision)),e=>e.status===400);
  await assert.rejects(service.restore('../current.json',options(preview.revision)),e=>e.status===400);
});
test('leitura pública não expõe senha administrativa nem metadados de verificação',async()=> {
  const {service}=setup(),record=await service.read();record.catalog.settings.adminPassword='sensitive-test';record.catalog.products[0].verifiedAt=123;
  const publicData=publicView(record);assert.equal(JSON.stringify(publicData).includes('sensitive-test'),false);assert.equal(publicData.products[0].verifiedAt,undefined);
});
test('API bloqueia POST sem chave antes de qualquer escrita',async()=> {
  const {service,backups}=setup(),handler=createHandler(service,{getEnv:()=>({RADAR_WRITE_KEY_HASH:hash,BLOB_READ_WRITE_TOKEN:'test-config'})}),res=response();
  await handler(request({action:'publish',product:offer()},''),res);assert.equal(res.code,401);assert.equal(backups.size,0);
});
test('API recusa chaves de páginas de origem externa e permite apenas saúde pública sem chave',async()=> {
  const {service}=setup(),handler=createHandler(service,{getEnv:()=>({RADAR_WRITE_KEY_HASH:hash,BLOB_READ_WRITE_TOKEN:'test-config'})});
  const res=response();await handler({...request({action:'preview',product:offer()}),headers:{authorization:'Bearer '+token,origin:'https://evil.example'}},res);assert.equal(res.code,403);
  const health=response();await handler({method:'GET',headers:{},query:{health:'1'}},health);assert.equal(health.body.protocol,PROTOCOL);assert.equal(health.body.protected,true);
});
test('adaptador privado exige leitura consistente e CAS, gravando primeiro o backup',async()=> {
  const calls=[];const sdk={head:async()=>({etag:'old-etag'}),get:async(path,opts)=>{calls.push(['get',opts]);return {stream:new Blob([JSON.stringify({revision:'old'})]).stream(),blob:{etag:'download-etag'}};},
    put:async(path,body,opts)=>calls.push(['put',path,opts])};
  const store=createBlobStore(sdk),current=await store.read();await store.writeBackup({id:randomUUID()});await store.compareAndSwap(current,{revision:'new'});
  assert.equal(calls[0][1].useCache,false);assert.equal(calls[1][2].access,'private');assert.equal(calls[1][2].allowOverwrite,false);assert.equal(calls[2][2].ifMatch,'old-etag');
});

test('editor manual preserva cadastro, edição, exclusão, imagens locais e links de grupos',async()=>{
  const {service}=setup();let record=await service.read();
  let payload=publicView(record);
  payload.products.unshift({...payload.products[0],id:'manual',image:'assets/airfryer.svg',affiliateUrl:'https://www.mercadolivre.com.br/produto/p/MLB12345678'});
  payload.settings.whatsappUrl='https://www.whatsapp.com/channel/exemplo';
  record=(await service.replace(payload,options(record.revision))).record;
  assert.equal(record.catalog.products.length,4);assert.equal(record.catalog.products[0].image,'assets/airfryer.svg');
  assert.equal(record.catalog.settings.whatsappUrl,payload.settings.whatsappUrl);
  payload=publicView(record);payload.products[0].price=12.34;
  record=(await service.replace(payload,options(record.revision))).record;
  assert.equal(record.catalog.products[0].price,12.34);
  payload=publicView(record);payload.products=payload.products.filter(p=>p.id!=='manual');
  record=(await service.replace(payload,options(record.revision))).record;
  assert.equal(record.catalog.products.length,3);
});

test('alterar configurações no editor preserva a verificação das ofertas inalteradas',async()=>{
  const {service}=setup();const initial=await service.read();
  let record=(await service.publish(offer(),options(initial.revision))).record;
  const payload=publicView(record);payload.settings.showFloatingCard=false;
  record=(await service.replace(payload,options(record.revision))).record;
  assert.equal(record.catalog.products[2].identityVerified,true);
  assert.equal(record.catalog.settings.showFloatingCard,false);
});

test('prévia usa caminhos de armazenamento diferentes de produção',async()=>{
  const paths=[];const sdk={head:async()=>({etag:'test-etag'}),get:async path=>{paths.push(path);return null;},put:async path=>paths.push(path)};
  const preview=createBlobStore(sdk,{prefix:'so-achado-preview/test'}),production=createBlobStore(sdk);
  await preview.read();await preview.writeBackup({id:randomUUID()});await production.read();
  assert.equal(paths[0],'so-achado-preview/test/catalog/current.json');
  assert.ok(paths[1].startsWith('so-achado-preview/test/backups/'));
  assert.equal(paths[2],'so-achado/catalog/current.json');
});

test('saúde reconhece identidade gerenciada no cabeçalho da Function sem expor o token',async()=>{
  const {service}=setup(),handler=createHandler(service,{getEnv:()=>({BLOB_STORE_ID:'test-store'})}),res=response();
  await handler({method:'GET',headers:{'x-vercel-oidc-token':'test-only-runtime-identity'},query:{health:'1'}},res);
  assert.equal(res.body.storageConfigured,true);assert.equal(JSON.stringify(res.body).includes('runtime-identity'),false);
});

test('configuração tolera espaços ao colar o resumo e diagnostica formato sem revelar seu valor',async()=>{
  const {service}=setup();
  for(const [value,expected] of [[' '+hash+'\n','ready'],['','missing'],['not-a-sha256','invalid-format']]) {
    const handler=createHandler(service,{getEnv:()=>({RADAR_WRITE_KEY_HASH:value})}),res=response();
    await handler({method:'GET',headers:{},query:{health:'1'}},res);
    assert.equal(res.body.keyConfiguration,expected);assert.equal(JSON.stringify(res.body).includes(hash),false);
  }
});
