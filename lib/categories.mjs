const normalized=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export function inferCategory(title) {
  const text=normalized(title);
  // Objetos de casa que mencionam equipamentos (mesa para notebook, por exemplo).
  if(/\b(cadeira|poltrona|sofa|mesa de|mesa para|escrivaninha|estante|sapateira|criado mudo|aromatizador de ambiente|difusor de ambiente)\b/.test(text))return 'casa';
  if(/\b(perfume|perfumes|hidratante|hidratantes|shampoo|condicionador|sabonete|protetor solar|maquiagem|batom|batons|rimel|mascara de cilios|base facial|serum|creme facial|creme corporal|chapinha|barbeador|depilador|secador de cabelo|secador cabelo|escova secadora|escova alisadora|maquina de cortar cabelo|cortador de cabelo|esmalte|esmaltes|manicure|necessaire)\b/.test(text))return 'beleza';
  if(/\b(notebook|notebooks|laptop|computador|computadores|monitor|monitores|smartphone|smartphones|celular|celulares|tablet|tablets|teclado|teclados|mouse|mouses|webcam|microfone|microfones|fone|fones|headset|carregador|carregadores|smartwatch|roteador|impressora|ssd|memoria ram|pendrive|power bank|caixa de som|camera|cameras|televisao|televisor|smart tv|console|playstation|xbox|nintendo|projetor|mesa digitalizadora)\b/.test(text))return 'tecnologia';
  if(/\b(cozinha|cozinhas|banheiro|banheiros|lavanderia|decoracao|organizador|organizadores|panela|panelas|frigideira|frigideiras|assadeira|assadeiras|talher|talheres|prato|pratos|copo|copos|caneca|canecas|pote|potes|escorredor|escorredores|garrafa|garrafas|jarra|jarras|travessa|travessas|saleiro|ralador|espremedor|peneira|tabua|tabuas|lixeira|lixeiras|cabide|cabides|luminaria|abajur|tapete|tapetes|cortina|cortinas|almofada|almofadas|espelho|espelhos|prateleira|prateleiras|vaso|vasos|lencol|lencois|fronha|fronhas|edredom|cobertor|travesseiro|travesseiros|toalha|toalhas|rodo|vassoura|balde|esfregao|liquidificador|batedeira|cafeteira|sanduicheira|torradeira|fritadeira|air fryer|airfryer|aspirador|ventilador|umidificador|purificador|geladeira|microondas|fogao|lavadora)\b/.test(text))return 'casa';
  return 'variedades';
}
export function automaticCategory(product) {
  if(['casa','tecnologia','beleza'].includes(product.category))return product.category;
  return inferCategory(product.title);
}
