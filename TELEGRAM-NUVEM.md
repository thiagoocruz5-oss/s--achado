# Produtos no Telegram com o PC desligado

O catálogo publicado no site é a fonte. A função de envio e o progresso ficam na Vercel, separados do catálogo, em armazenamento privado. O bot é configurado no editor autenticado do site; seu token nunca aparece na leitura pública nem nos logs do agendador.

No site, entre com sua senha, abra Configurações e escolha **Envio ao Telegram com PC desligado**. Cole o token do BotFather e salve a conexão. O servidor confirma a identidade do bot e sua permissão no grupo @soachado_ofertas_thiago. Ative o envio em nuvem e use **Enviar lote agora** para conferir o primeiro lote.

Desligue o envio local dos produtos na extensão. Na versão 0.6.0, o envio local também consulta a ativação em nuvem antes de mandar um lote e pausa para evitar duas fontes publicando juntas. Recarregar a extensão desativa a automação local.

Até cinco produtos são enviados por lote. O próximo só é liberado três horas depois. O agendador GitHub Actions consulta a função a cada quinze minutos: pode haver atraso de alguns minutos, e o GitHub não garante pontualidade. Depois de percorrer todo o catálogo, o lote seguinte começa novamente. Os produtos são lidos novamente a cada lote. Há foto, título, preço anunciado, link com afiliado e link do site.

Um resultado incerto pausa o envio. Confira o grupo e marque a pendência no painel antes de reativar. O produto fica marcado como percorrido neste ciclo para evitar repetição imediata. Escrita condicional e um bloqueio por lote impedem execuções concorrentes. Não há repetição automática de uma requisição de envio sem confirmação.

O workflow aceita somente a branch main e se autentica com identidade temporária GitHub OIDC. A função valida assinatura, emissor, repositório, caminho do workflow, audience, evento e validade. Não é necessário colocar o token do bot nos arquivos do GitHub.

Limite operacional do GitHub: workflows agendados em repositórios públicos são desativados após 60 dias sem atividade no repositório. Reative o workflow se isso ocorrer. Falhas ou pendências aparecem nas execuções do workflow e no painel do site.

Essa integração envia produtos já publicados. Buscar novas ofertas, gerar links pela Central e consultar novos cupons continuam sendo tarefas da extensão com navegador aberto. O envio ao WhatsApp ainda não está integrado.

Referências: https://docs.github.com/en/actions/reference/security/oidc e https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule
