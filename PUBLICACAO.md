# Integração protegida do radar

O catálogo público mantém os mesmos campos e o editor manual continua disponível. Escritas online exigem uma chave forte: configurar somente seu SHA-256 em `RADAR_WRITE_KEY_HASH` na Vercel. A chave original deve ficar com o administrador, nunca no repositório ou catálogo.

O projeto precisa de um Blob privado vinculado. O SDK usa `BLOB_STORE_ID` com a identidade gerenciada da Vercel ou um token privado já configurado. Nenhum segredo está neste repositório.

Prévia e produção gravam em caminhos separados no armazenamento. A prévia é isolada também por commit. Sem catálogo privado inicializado, a leitura usa `data/products.json`, capturado do catálogo público antes da migração. Revalidar esse arquivo contra o site principal antes da promoção para preservar alterações recentes.

`GET /api/products` mantém o formato do site e acrescenta `revision`. O editor envia essa revisão com autenticação, evitando sobrescrever mudanças de outra sessão. Toda gravação guarda uma cópia anterior. `/api/radar` oferece prévia, publicação de um produto e restauração da última publicação. Sem chave configurada, nenhuma escrita é autorizada.

O radar só troca o mesmo produto por preço menor, sem frete. Variações ambíguas pedem revisão. A primeira publicação deve ser conferida manualmente; este código não ativa publicação automática remota por conta própria.

## Validação

Executar `node --test tests/publisher.test.mjs`. Conferir na prévia: catálogo, busca, categorias, favoritos, links dos grupos, extração por link, cadastro, edição, exclusão e configurações. Validar publicação/backup/restauração apenas no catálogo isolado da prévia antes de promover.

O servidor Python e o modo local existentes permanecem disponíveis. O acesso online do administrador passa a usar a chave protegida em vez da senha antiga gravada no catálogo público.
