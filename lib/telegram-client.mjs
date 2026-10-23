export function createTelegram(fetcher=fetch){
  async function call(token,method,payload={}){
    if(!/^\d{5,15}:[A-Za-z0-9_-]{30,80}$/.test(token||''))throw new Error('Token do bot inválido.');
    let response,body;
    try{response=await fetcher(`https://api.telegram.org/bot${token}/${method}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),credentials:'omit',redirect:'error',signal:AbortSignal.timeout(15000)});body=await response.json();}
    catch{throw new Error('O Telegram não confirmou a resposta. Confira o canal antes de tentar reenviar.');}
    if(!response.ok||!body.ok)throw new Error(body.error_code===429?'O Telegram pediu uma pausa. Aguarde antes de continuar.':'O Telegram recusou a solicitação. Confira o bot e as permissões do canal.');
    return body.result;
  }
  return {async connect(token,name){
    if(!/^@[A-Za-z][A-Za-z0-9_]{4,31}$/.test(name||''))throw new Error('Informe o @nome do canal público do Telegram.');
    const me=await call(token,'getMe');
    if(!Number.isSafeInteger(me.id)||me.is_bot!==true)throw new Error('O Telegram não confirmou a identidade do bot.');
    const chat=await call(token,'getChat',{chat_id:name});
    if(!['channel','supergroup'].includes(chat.type)||!chat.username||!Number.isSafeInteger(chat.id))throw new Error('Use um canal ou grupo público do Telegram.');
    const member=await call(token,'getChatMember',{chat_id:chat.id,user_id:me.id});
    if(!['administrator','creator'].includes(member.status)||(chat.type==='channel'&&member.status!=='creator'&&member.can_post_messages!==true))throw new Error('Adicione o bot como administrador com permissão para publicar.');
    return {id:chat.id,title:chat.title,username:chat.username,bot:me.username};
  },sendPhoto:(token,destination,photo,caption)=>{
    let u;try{u=new URL(photo);}catch{throw new Error('Imagem da oferta inválida.');}
    if(!Number.isSafeInteger(destination)||u.protocol!=='https:'||u.hostname!=='http2.mlstatic.com'||u.username||u.password||u.port||
      typeof caption!=='string'||!caption.trim()||[...caption].length>1024)throw new Error('Imagem, destino ou legenda inválidos.');
    return call(token,'sendPhoto',{chat_id:destination,photo,caption,disable_notification:true}).then(result=>{
      if(!Number.isSafeInteger(result?.message_id)||result.message_id<=0)throw new Error('O Telegram não confirmou a foto. Confira o grupo antes de reenviar.');
      return result;
    });
  },send:(token,destination,text)=>{
    if(!Number.isSafeInteger(destination)||typeof text!=='string'||!text.trim()||[...text].length>4096)throw new Error('Destino ou tamanho da mensagem inválido.');
    return call(token,'sendMessage',{chat_id:destination,text,link_preview_options:{is_disabled:true},disable_notification:true}).then(result=>{
      if(!Number.isSafeInteger(result?.message_id)||result.message_id<=0)throw new Error('O Telegram não confirmou o identificador da mensagem. Confira o canal antes de reenviar.');
      return result;
    });
  }};
}
