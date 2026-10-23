# Integração protegida do radar

O catálogo público mantém os mesmos campos e o editor manual continua disponível. O Radar usa a chave forte cujo SHA-256 fica em `RADAR_WRITE_KEY_HASH`. O editor também aceita senha com sessão protegida por até 7 dias. A chave original deve ficar com o administrador, nunca no repositório ou catálogo.

O projeto precisa de um Blob privado vinculado. O SDK usa `BLOB_STORE_ID` com a identidade gerenciada da Vercel ou um token privado já configurado. Nenhum segredo está neste repositório.

Prévia e produção gravam em caminhos separados no armazenamento. A prévia é isolada também por commit. Sem catálogo privado inicializado, a leitura usa `data/products.json`, capturado do catálogo público antes da migração. Revalidar esse arquivo contra o site principal antes da promoção para preservar alterações recentes.

`GET /api/products` mantém o formato do site e acrescenta `revision`. O editor envia essa revisão com autenticação, evitando sobrescrever mudanças de outra sessão. Toda gravação guarda uma cópia anterior. `/api/radar` oferece prévia, publicação de um produto e restauração da última publicação. Sem chave configurada, nenhuma escrita é autorizada.

O radar só troca o mesmo produto por preço menor, sem frete. Variações ambíguas pedem revisão. A primeira publicação deve ser conferida manualmente; este código não ativa publicação automática remota por conta própria.

## Validação

Executar `node --test tests/publisher.test.mjs`. Conferir na prévia: catálogo, busca, categorias, favoritos, links dos grupos, extração por link, cadastro, edição, exclusão e configurações. Validar publicação/backup/restauração apenas no catálogo isolado da prévia antes de promover.

O servidor Python e o modo local existentes permanecem disponíveis. A senha antiga que era conferida no navegador não é reutilizada automaticamente.

## Senha do editor

No ícone de administrador, escolha Cadastrar minha senha. Informe sua chave atual uma única vez e escolha uma senha de 10 a 128 caracteres. Os dados ficam no Blob privado, separados do catálogo: hash salgado por scrypt e chave aleatória de assinatura da sessão. Nenhuma senha em texto puro é gravada. O cadastro não depende de novas variáveis na Vercel e não altera a chave do Radar.

A sessão usa cookie HttpOnly, Secure, SameSite=Strict e exige mesma origem e proteção CSRF nas gravações. Cinco tentativas incorretas pausam o login por cinco minutos. Trocar a senha invalida sessões anteriores; Ver como visitante encerra o acesso neste navegador. A chave continua disponível como alternativa e para recuperação.

Produtos publicados pelo Radar que ficaram em Variedades têm a categoria inferida pelo título quando há correspondência nas categorias já existentes do site. A leitura corrige sua exibição sem reescrever preços, imagens ou links. A classificação acompanha a próxima gravação normal; produtos manuais sem verificação e categorias específicas já escolhidas são preservados.
