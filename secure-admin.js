(function(){
  window.SO_ACHADO_AUTH={askKey:()=>new Promise(resolve=>{
    const cached=sessionStorage.getItem('so_achado_write_key');if(cached){resolve(cached);return;}
    const dialog=document.createElement('dialog');dialog.style.cssText='border:0;border-radius:16px;padding:28px;max-width:420px;width:90%;box-shadow:0 20px 80px #0004;color:#351147;font-family:Arial,sans-serif';
    dialog.innerHTML='<form method="dialog"><h2 style="margin-top:0">Acesso para publicação</h2><p>A chave autoriza alterações no catálogo. Ela fica somente nesta sessão do navegador.</p><label for="secure-write-key">Chave de publicação</label><input id="secure-write-key" type="password" autocomplete="off" required minlength="43" style="width:100%;box-sizing:border-box;padding:12px;margin:10px 0 20px;border:1px solid #ddd;border-radius:6px"><div style="display:flex;justify-content:flex-end;gap:10px"><button type="button" data-cancel>Cancelar</button><button type="submit">Conectar</button></div></form>';
    const finish=value=>{dialog.close();dialog.remove();resolve(value);};
    dialog.querySelector('form').addEventListener('submit',e=>{e.preventDefault();finish(dialog.querySelector('input').value.trim());});
    dialog.querySelector('[data-cancel]').addEventListener('click',()=>finish(null));
    dialog.addEventListener('cancel',e=>{e.preventDefault();finish(null);});document.body.append(dialog);dialog.showModal();dialog.querySelector('input').focus();
  })};
})();
