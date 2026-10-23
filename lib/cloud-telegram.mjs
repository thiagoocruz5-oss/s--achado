import {randomUUID} from 'node:crypto';
import {validateCatalog} from './radar-core.mjs';
export const GROUP_USERNAME='@soachado_ofertas_thiago';
export const GROUP_ID=-1004455898703;
const INTERVAL=60*60*1000;
export function cloudCaption(p){
  return `🛍️ ${[...p.title].slice(0,360).join('')}\n\n💰 Preço anunciado no site: ${Number(p.price).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}\n\n👉 Comprar este produto:\n${p.affiliateUrl}\n\n🌐 Veja mais ofertas no SÓ ACHADO:\nhttps://so-achado.vercel.app/\n\nPreço, estoque e condições podem mudar. Confira antes de comprar.`;
}
export function createCloudTelegram({store,credentials,catalog,telegram,now=Date.now,uuid=randomUUID}){
  async function write(current,next){const record={...next,revision:uuid()};delete record._etag;await store.compareAndSwap(current||{},record);return await store.read();}
  async function status(){const state=await store.read()||{},secret=await credentials.read();return {
    configured:Boolean(secret?.token),enabled:Boolean(state.enabled),lastBatchAt:state.lastBatchAt||null,cycle:state.cycle||1,
    sentInCycle:(state.sentIds||[]).length,pending:state.pending?{title:state.pending.title,at:state.pending.at}:null,
    message:state.message||'Configure o bot e ative o envio em nuvem.',destination:GROUP_USERNAME,
    deliveries:(state.deliveries||[]).slice(0,15).map(d=>({title:d.title,at:d.at,status:d.status}))};}
  async function configure(token){
    const destination=await telegram.connect(token,GROUP_USERNAME);
    if(destination.id!==GROUP_ID)throw new Error('O bot não confirmou o grupo SÓ ACHADO esperado.');
    const current=await store.read()||{};
    if(current.lease?.until>now())throw new Error('Aguarde o lote atual terminar.');
    const previous=await credentials.read()||{};
    await credentials.compareAndSwap(previous,{revision:uuid(),token,destination:destination.id});
    await write(current,{...current,enabled:false,message:'Bot conectado no servidor. Ative o envio em nuvem.'});
    return status();
  }
  async function enable(enabled){
    const current=await store.read()||{};
    if(enabled&&!((await credentials.read())?.token))throw new Error('Conecte o bot primeiro.');
    if(enabled&&current.pending)throw new Error('Confira o envio sem confirmação antes de reativar.');
    await write(current,{...current,enabled:Boolean(enabled),message:enabled?'Ativado: até 5 ofertas por hora, mesmo com o PC desligado.':'Envio em nuvem desligado.'});return status();
  }
  async function resolve(){
    const current=await store.read()||{};
    if(current.lease?.until>now())throw new Error('Aguarde o lote terminar.');
    if(!current.pending)throw new Error('Não há envio pendente.');
    await write(current,{...current,enabled:false,lease:null,pending:null,
      sentIds:[...new Set([...(current.sentIds||[]),current.pending.productId])],
      message:'Envio conferido e marcado no ciclo. Reative para continuar.'});return status();
  }
  async function run(){
    let current=await store.read()||{};
    if(!current.enabled)return {sent:0,status:'disabled'};
    if(current.pending)return {sent:0,status:'review'};
    if(current.lease?.until>now())return {sent:0,status:'busy'};
    if(current.lastBatchAt&&now()-current.lastBatchAt<INTERVAL)return {sent:0,status:'waiting'};
    const secret=await credentials.read();if(!secret?.token)throw new Error('Bot não configurado no servidor.');
    const lease={id:uuid(),until:now()+120000};
    try{current=await write(current,{...current,lease});}catch(e){if(e.status===409)return {sent:0,status:'busy'};throw e;}
    async function owned(){const s=await store.read();if(s?.lease?.id!==lease.id)throw new Error('Lote interrompido por outra alteração.');return s;}
    let sent=0;
    try{
      const record=await catalog.read(),products=validateCatalog({products:record.catalog.products});
      const ids=new Set(products.map(p=>p.id));let seen=new Set((current.sentIds||[]).filter(id=>ids.has(id))),cycle=current.cycle||1;
      let remaining=products.filter(p=>!seen.has(p.id));
      if(products.length&&!remaining.length){seen=new Set();cycle++;remaining=products;}
      current=await owned();current=await write(current,{...current,sentIds:[...seen],cycle,lastBatchAt:now()});
      for(const p of remaining.slice(0,5)){
        current=await owned();if(!current.enabled)break;
        if(current.lease.until<=now())throw new Error('O lote demorou além do esperado.');
        const pending={id:uuid(),productId:p.id,title:p.title,at:now()};
        current=await write(current,{...current,pending});
        const result=await telegram.sendPhoto(secret.token,GROUP_ID,p.image,cloudCaption(p));
        current=await owned();
        if(current.pending?.id!==pending.id)throw new Error('Confira o envio no grupo.');
        current=await write(current,{...current,pending:null,sentIds:[...new Set([...(current.sentIds||[]),p.id])],
          deliveries:[{...pending,status:'sent',messageId:result.message_id},...(current.deliveries||[])].slice(0,100)});
        sent++;
      }
      current=await owned();await write(current,{...current,lease:null,message:`${sent} oferta(s) enviada(s). Ciclo ${cycle}.`});
      return {sent,status:'sent'};
    }catch{
      try{current=await owned();await write(current,{...current,enabled:false,lease:null,
        message:current.pending?'Envio sem confirmação. Confira o grupo antes de continuar.':'Falha na leitura ou no armazenamento. Nenhum novo envio será iniciado.'});}catch{}
      throw new Error('O lote foi pausado. Confira o painel e o grupo antes de continuar.');
    }
  }
  return {status,configure,enable,resolve,run,active:async()=>Boolean((await store.read())?.enabled)};
}
