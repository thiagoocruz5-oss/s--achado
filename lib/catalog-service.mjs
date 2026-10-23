import {createHash,randomUUID,timingSafeEqual} from 'node:crypto';
import {applyOffer,decision,validateOffer,exportCatalog,cents} from './radar-core.mjs';
import {automaticCategory} from './categories.mjs';
export const PROTOCOL='so-achado-radar-v1';
export class ApiError extends Error {constructor(status,message){super(message);this.status=status;}}
export function authorized(header,hash) {
  if(!/^[a-f0-9]{64}$/i.test(hash||''))return false;
  const token=String(header||'').match(/^Bearer ([A-Za-z0-9_-]{43,128})$/)?.[1];
  return Boolean(token&&timingSafeEqual(createHash('sha256').update(token).digest(),Buffer.from(hash,'hex')));
}
export function safeSettings(settings={}) {
  const safeLink=(value,host,fallback)=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:fallback;}catch{return fallback;}};
  return {whatsappUrl:safeLink(settings.whatsappUrl,'chat.whatsapp.com','https://chat.whatsapp.com/'),
    telegramUrl:safeLink(settings.telegramUrl,'t.me','https://t.me/'),showFloatingCard:settings.showFloatingCard!==false};
}
// O formulário manual aceita imagens externas e imagens locais já usadas pelo site.
// As ofertas automáticas continuam sujeitas à validação mais estrita do radar.
export function cleanCatalog(input) {
  if(!Array.isArray(input?.products)||input.products.length>2000)throw new ApiError(400,'Catálogo inválido.');
  const ids=new Set();
  const products=input.products.map(p=>{
    const id=String(p?.id||'');
    let link,image;
    try {link=new URL(p.affiliateUrl);image=new URL(p.image,'https://so-achado.vercel.app/');}catch {throw new ApiError(400,'Endereço do produto inválido.');}
    const ml=link.hostname==='meli.la'||link.hostname==='mercadolivre.com.br'||link.hostname.endsWith('.mercadolivre.com.br');
    if(!id||ids.has(id)||typeof p.title!=='string'||!p.title.trim()||p.title.length>1000||!cents(p.price)||!ml||
       link.protocol!=='https:'||image.protocol!=='https:'||link.username||link.password||image.username||image.password)
      throw new ApiError(400,'Um produto está incompleto, repetido ou tem endereço inválido.');
    ids.add(id);
    return {id,title:p.title,price:p.price,oldPrice:Math.max(0,Number(p.oldPrice)||0),image:p.image,affiliateUrl:p.affiliateUrl,
      rating:String(p.rating||''),category:['casa','tecnologia','beleza','variedades'].includes(p.category)?p.category:'variedades',
      badge:String(p.badge||'ACHADO ÚTIL'),badgeColor:['orange','coral','purple','green','teal'].includes(p.badgeColor)?p.badgeColor:'coral',
      buttonText:String(p.buttonText||'Ir para o parceiro'),buttonStyle:['coral','teal'].includes(p.buttonStyle)?p.buttonStyle:'coral'};
  });
  return {settings:safeSettings(input.settings),products};
}
function classifiedRecord(record){
  return {...record,catalog:{...record.catalog,products:record.catalog.products.map(p=>p.identityVerified&&p.url&&p.category==='variedades'?{...p,category:automaticCategory(p)}:p)}};
}
export function publicView(record) {const view=classifiedRecord(record);return {...exportCatalog({catalog:view.catalog.products,siteSettings:safeSettings(view.catalog.settings)}),revision:view.revision};}
export function createService(store,seed) {
  const fallback=cleanCatalog(seed),fallbackRevision='seed-'+createHash('sha256').update(JSON.stringify(fallback)).digest('hex');
  async function read() {return classifiedRecord(await store.read()||{revision:fallbackRevision,catalog:structuredClone(fallback),updatedAt:null});}
  async function commit(current,catalog,options) {
    if(!/^[a-f0-9-]{36}$/i.test(options.operationId||''))throw new ApiError(400,'Identificador de publicação inválido.');
    if(current.operationId===options.operationId)return current;
    if(options.expectedRevision!==current.revision)throw new ApiError(409,'O catálogo mudou. Confira uma nova prévia antes de publicar.');
    const next={revision:randomUUID(),operationId:options.operationId,updatedAt:new Date().toISOString(),catalog};
    const backup={id:next.revision,previous:{revision:current.revision,catalog:current.catalog,updatedAt:current.updatedAt}};
    try {await store.writeBackup(backup);await store.compareAndSwap(current,next);}
    catch(e){if(e.status===409||e.name==='BlobPreconditionFailedError'||e.name==='BlobAlreadyExistsError')throw new ApiError(409,'Outra atualização ocorreu. Nenhum catálogo foi sobrescrito; confira novamente.');throw e;}
    return next;
  }
  async function preview(product) {
    const error=validateOffer(product);if(error)throw new ApiError(400,error);
    const current=await read(),plan=decision(current.catalog.products,product);
    return {revision:current.revision,plan,before:current.catalog.products.find(p=>p.id===plan.targetId)||null,
      after:{title:product.title,price:product.price,affiliateUrl:product.affiliateUrl},verifiedAt:product.verifiedAt};
  }
  async function publish(product,options) {
    const current=await read();
    if(current.operationId===options.operationId)return {record:current,replayed:true};
    if(current.revision!==options.expectedRevision)throw new ApiError(409,'O catálogo mudou. Confira uma nova prévia antes de publicar.');
    const plan=decision(current.catalog.products,product);
    if(plan.type==='review'||plan.needsReview&&!options.confirmedIdentity)throw new ApiError(409,'Confirme o modelo e a versão antes de substituir o produto importado.');
    let applied;try{applied=applyOffer(current.catalog.products,product,{allowPix:Boolean(options.allowPix)});}catch(e){throw new ApiError(400,e.message);}
    if(applied.action.type==='keep')return {record:current,kept:true};
    const record=await commit(current,{settings:current.catalog.settings,products:applied.catalog},options);
    return {record,backupId:record.revision,action:applied.action};
  }
  async function replace(payload,options) {
    const current=await read();const catalog=cleanCatalog(payload);
    catalog.products=catalog.products.map(p=>{
      const previous=current.catalog.products.find(old=>old.id===p.id);
      return previous&&['title','price','image','affiliateUrl'].every(key=>previous[key]===p[key])?{...previous,...p}:p;
    });
    return {record:await commit(current,catalog,options)};
  }
  async function restore(backupId,options) {
    if(!/^[a-f0-9-]{36}$/i.test(backupId||''))throw new ApiError(400,'Cópia de segurança inválida.');
    const current=await read(),backup=await store.readBackup(backupId);
    if(!backup?.previous?.catalog)throw new ApiError(404,'Cópia de segurança não encontrada.');
    if(current.revision!==backupId)throw new ApiError(409,'Há alterações posteriores a esta publicação. A restauração automática foi bloqueada.');
    return {record:await commit(current,backup.previous.catalog,options)};
  }
  return {read,preview,publish,replace,restore};
}
