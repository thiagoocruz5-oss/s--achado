(function(){
  let csrf='',key='';
  const HINT='so_achado_admin_session';
  const legacy=()=>sessionStorage.getItem('so_achado_write_key')||'';
  async function json(body,headers={}){
    const r=await fetch('/api/admin',{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:body?{'Content-Type':'application/json',...headers}:headers,...(body?{body:JSON.stringify(body)}:{})});
    const data=await r.json();if(!r.ok)throw new Error(data.error||'Acesso não confirmado.');return data;
  }
  function remember(result){csrf=result.csrf||'';key='';sessionStorage.removeItem('so_achado_write_key');localStorage.setItem(HINT,'1');sessionStorage.setItem('so_achado_admin','1');}
  function dialog(html,submit){return new Promise(resolve=>{
    const node=document.createElement('dialog');node.className='secure-access';node.innerHTML=html;
    const finish=value=>{node.close();node.remove();resolve(value);};
    node.querySelector('[data-cancel]').onclick=()=>finish(false);
    node.addEventListener('cancel',e=>{e.preventDefault();finish(false);});
    node.querySelector('form').onsubmit=async e=>{
      e.preventDefault();const button=node.querySelector('[type="submit"]');button.disabled=true;
      try{if(await submit(node))finish(true);}catch(error){node.querySelector('[role="alert"]').textContent=error.message;}
      finally{button.disabled=false;}
    };
    node.querySelector('[data-setup]')?.addEventListener('click',async()=>{finish(await configure());});
    document.body.append(node);node.showModal();node.querySelector('input:not([type="hidden"])')?.focus();
  });}
  async function configure(){return dialog(`<form><h2>Cadastrar ou recuperar senha</h2><p>Use a chave do Radar uma única vez para autorizar este cadastro. Depois, entre com a sua senha. Não compartilhe os dados abaixo.</p><label>Chave atual de publicação<input name="key" type="password" autocomplete="off" minlength="43" required></label><label>Nova senha<input name="password" type="password" autocomplete="new-password" minlength="10" maxlength="128" required></label><label>Repita a nova senha<input name="confirm" type="password" autocomplete="new-password" minlength="10" maxlength="128" required></label><p role="alert"></p><div class="secure-access-actions"><button type="button" data-cancel>Cancelar</button><button type="submit">Salvar senha e entrar</button></div></form>`,async node=>{
    const fields=node.querySelector('form').elements;
    if(fields.password.value!==fields.confirm.value)throw new Error('As duas senhas precisam ser iguais.');
    const result=await json({action:'set-password',password:fields.password.value},{Authorization:'Bearer '+fields.key.value.trim()});remember(result);return true;
  });}
  async function ensure({silent=false}={}){
    const status=await json();if(status.authenticated){remember(status);return true;}
    csrf='';key=legacy();
    if(key){const r=await fetch('/api/radar',{headers:{Authorization:'Bearer '+key},cache:'no-store'});if(r.ok)return true;key='';sessionStorage.removeItem('so_achado_write_key');}
    if(silent)return false;
    return dialog(`<form><h2>Entrar no editor</h2><p>${status.configured?'Use sua senha. O acesso fica conectado por até 7 dias neste navegador.':'Cadastre sua senha para editar o site sem precisar da chave a cada acesso.'}</p><input type="hidden" name="username" value="admin" autocomplete="username"><label>Senha<input name="password" type="password" autocomplete="current-password" minlength="10" maxlength="128"></label><button type="button" data-setup>${status.configured?'Esqueci a senha / cadastrar outra':'Cadastrar minha senha'}</button><details><summary>Entrar com a chave do Radar</summary><label>Chave de publicação<input name="key" type="password" autocomplete="off" minlength="43"></label></details><p role="alert"></p><div class="secure-access-actions"><button type="button" data-cancel>Cancelar</button><button type="submit">Entrar</button></div></form>`,async node=>{
      const fields=node.querySelector('form').elements,k=fields.key.value.trim();
      if(k){const r=await fetch('/api/radar',{headers:{Authorization:'Bearer '+k},cache:'no-store'});const data=await r.json();if(!r.ok||!data.ready)throw new Error(data.error||'Chave não confirmada.');key=k;sessionStorage.setItem('so_achado_write_key',k);return true;}
      const result=await json({action:'login',password:fields.password.value});remember(result);return true;
    });
  }
  window.SO_ACHADO_AUTH={ensure,configure,
    restore:async()=>{if(!localStorage.getItem(HINT)&&!legacy())return false;try{return await ensure({silent:true});}catch{return false;}},
    headers:async()=>await ensure()?csrf?{'X-CSRF-Token':csrf}:{Authorization:'Bearer '+key}:null,
    clear:()=>{csrf='';key='';localStorage.removeItem(HINT);sessionStorage.removeItem('so_achado_write_key');sessionStorage.removeItem('so_achado_admin');},
    logout:async()=>{try{await json({action:'logout'});}finally{window.SO_ACHADO_AUTH.clear();}}
  };
})();
