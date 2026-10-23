(()=>{
  const button=document.getElementById('cloudTelegramBtn');if(!button)return;
  button.addEventListener('click',async()=>{
    const headers=await window.SO_ACHADO_AUTH.headers();if(!headers)return;
    const dialog=document.createElement('dialog');dialog.className='secure-access cloud-telegram-access';
    dialog.innerHTML=`<h2>Ofertas no Telegram, com o PC desligado</h2><p>Grupo: @soachado_ofertas_thiago. Até 5 produtos publicados no site por lote, em intervalos de 3 horas. Ao terminar o catálogo, começa novamente. Foto, preço, link do produto e link do site.</p><p>O agendador pode atrasar alguns minutos. Desligue o envio de produtos na extensão para usar somente este serviço.</p><label>Chave privada do bot<input type="password" autocomplete="off" data-token placeholder="Cole a chave do BotFather"></label><p>A conexão fica no armazenamento privado do servidor e continua funcionando com o navegador fechado.</p><button type="button" data-connect>Salvar conexão do bot</button><p role="status" data-status>Consultando…</p><label><input type="checkbox" data-enabled> Ativar envio em nuvem</label><p data-pending hidden></p><button type="button" data-resolve hidden>Conferi o envio no grupo: marcar no ciclo e pausar</button><div class="secure-access-actions"><button type="button" data-refresh>Atualizar estado</button><button type="button" data-run>Enviar lote agora</button><button type="button" data-close>Fechar</button></div>`;
    document.body.append(dialog);dialog.showModal();let busy=false;
    const node=selector=>dialog.querySelector(selector);
    function render(s){
      node('[data-enabled]').checked=s.enabled;node('[data-enabled]').disabled=!s.configured||Boolean(s.pending);
      node('[data-run]').disabled=!s.enabled||Boolean(s.pending);
      node('[data-status]').textContent=(s.configured?'Bot conectado. ':'Bot ainda não conectado. ')+(s.message||'')+(s.lastBatchAt?' Último lote: '+new Date(s.lastBatchAt).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})+' (Brasília).':'');
      node('[data-pending]').hidden=!s.pending;node('[data-resolve]').hidden=!s.pending;
      node('[data-pending]').textContent=s.pending?'Confira no grupo: '+s.pending.title:'';
    }
    async function action(body){
      if(busy)return;busy=true;
      try{
        const response=await fetch('/api/telegram',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
        const data=await response.json();if(!response.ok)throw new Error(data.error||'Não foi possível concluir.');render(data);
        if(body.action==='configure')node('[data-token]').value='';
      }catch(e){node('[data-status]').textContent=e.message;}
      finally{busy=false;}
    }
    node('[data-connect]').onclick=()=>action({action:'configure',token:node('[data-token]').value});
    node('[data-enabled]').onchange=e=>action({action:'enable',enabled:e.target.checked});
    node('[data-run]').onclick=()=>action({action:'run'});
    node('[data-resolve]').onclick=()=>action({action:'resolve'});
    node('[data-refresh]').onclick=()=>action({action:'status'});
    node('[data-close]').onclick=()=>{dialog.close();dialog.remove();};
    dialog.addEventListener('cancel',()=>dialog.remove());
    await action({action:'status'});
  });
})();
