export const MAX_AGE = 15 * 60 * 1000;
export const DEFAULTS = {
  terms: ['creatina growth', 'notebook acer', 'cadeira escritorio'],
  minDiscount: 15, maxPrice: 5000, minRating: 4.5, maxItems: 5,
  intervalMinutes: 120, scheduled: false, automatic: false, allowPix: true
};
export function normalize(text) {
  return String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/(\d)\s+(gb|tb|kg|g|ml|v|w)\b/g, '$1$2')
    .replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}
export function validUrl(value, kind = 'product') {
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:' || u.username || u.password || u.port) return false;
    if (kind === 'image') return u.hostname === 'http2.mlstatic.com';
    if (kind === 'affiliate') return (u.hostname === 'meli.la' && /^\/[a-zA-Z0-9]+\/?$/.test(u.pathname)) ||
      (u.hostname === 'www.mercadolivre.com.br' && /^\/sec\/[a-zA-Z0-9]+\/?$/.test(u.pathname));
    return ['www.mercadolivre.com.br','produto.mercadolivre.com.br'].includes(u.hostname) &&
      (/\/(?:p|up)\/MLB[U]?\d+/i.test(u.pathname) || /MLB-?\d{6,}/i.test(u.pathname));
  } catch { return false; }
}
export function productId(url) {
  if (!validUrl(url)) return '';
  const u = new URL(url);
  return (u.pathname.match(/\/(?:p|up)\/(MLBU?\d+)/i)?.[1] ||
    u.pathname.match(/(MLB)-?(\d{6,})/i)?.slice(1).join('') || '').toUpperCase();
}
export function cents(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value * 100) : 0;
}
export function sameProduct(a, b) {
  // Conservador: o título completo protege capacidade, cor, kit e voltagem.
  // Um ID de catálogo sozinho não garante a mesma variação selecionada.
  const ai = a.productId || productId(a.url), bi = b.productId || productId(b.url);
  if (a.identityVerified && b.identityVerified && normalize(a.selectedVariant) !== normalize(b.selectedVariant)) return false;
  return Boolean(normalize(a.title) && normalize(a.title) === normalize(b.title) &&
    !(ai && bi && ai !== bi));
}
export function discount(p) {
  return cents(p.oldPrice) > cents(p.price) ? Math.round((1 - p.price / p.oldPrice) * 100) : 0;
}
export function passesFilters(p, config = DEFAULTS) {
  return cents(p.price) > 0 && p.price <= config.maxPrice &&
    Number(p.rating || 0) >= config.minRating && discount(p) >= config.minDiscount &&
    (config.allowPix || p.condition !== 'pix') && p.condition !== 'restricted';
}
export function eligibleOffer(p, config, catalog) {
  // Um preço comprovadamente menor para um produto existente não precisa de selo de desconto.
  return passesFilters(p, decision(catalog,p).type==='replace' ? {...config,minDiscount:0} : config);
}
export function validateOffer(p, now = Date.now()) {
  if (!p.title || !validUrl(p.url)) return 'Produto ou endereço inválido.';
  if (!cents(p.price)) return 'Preço inválido.';
  if (!validUrl(p.image, 'image')) return 'Imagem do produto não confirmada.';
  if (!validUrl(p.affiliateUrl, 'affiliate')) return 'Link de afiliado ainda não confirmado.';
  if (!p.verifiedAt || now - p.verifiedAt > MAX_AGE || p.verifiedAt > now + 60000) return 'A oferta precisa ser verificada novamente (validade de 15 minutos).';
  if (p.available !== true || p.newCondition !== true) return 'Estoque ou condição de produto novo não confirmados.';
  if (normalize(p.detailTitle) !== normalize(p.title)) return 'A página do produto mostra outra descrição. Confira a variação.';
  if (p.condition === 'restricted') return 'Preço condicionado a cupom ou benefício: revisar manualmente.';
  return '';
}
export function decision(catalog, p) {
  const exact = catalog.find(old => sameProduct(old, p));
  if (exact) return cents(p.price) < cents(exact.price)
    ? {type: 'replace', targetId: exact.id, saving: (cents(exact.price) - cents(p.price)) / 100,
      needsReview: !exact.identityVerified || !p.identityVerified}
    : {type: 'keep', targetId: exact.id, saving: 0};
  const id = p.productId || productId(p.url);
  if (catalog.some(old => (id && (old.productId || productId(old.url)) === id) ||
    normalize(old.title) === normalize(p.title))) return {type: 'review', saving: 0};
  return {type: 'add', saving: 0};
}
export function applyOffer(catalog, offer, config, now = Date.now()) {
  const error = validateOffer(offer, now);
  if (error) throw new Error(error);
  if (offer.condition === 'pix' && !config.allowPix) throw new Error('Ofertas no Pix estão desativadas.');
  const action = decision(catalog, offer);
  if (action.type === 'keep') return {catalog, action, history: null};
  if (action.type === 'review') throw new Error('Mesmo catálogo com descrição diferente: revisão necessária.');
  const before = catalog.find(p => p.id === action.targetId) || null;
  const product = {...(before || {}), ...offer, id: before?.id || 'radar-' + crypto.randomUUID(),
    category: before?.category || offer.category || 'variedades', badge: 'ACHADO ÚTIL', badgeColor: 'orange',
    buttonText: 'Ir para o parceiro', buttonStyle: 'coral', updatedAt: now};
  const updated = before ? catalog.map(p => p.id === before.id ? product : p) : [product, ...catalog];
  return {catalog: updated, action, history: {id: crypto.randomUUID(), at: now, type: action.type,
    before, after: product, saving: action.saving, source: 'catalogo-local'}};
}
export function exportCatalog(state) {
  return {settings: state.siteSettings || {}, products: state.catalog.map(p => ({
    id: p.id, title: p.title, price: p.price, oldPrice: p.oldPrice || 0, rating: String(p.rating || ''),
    badge: p.badge || 'ACHADO ÚTIL', badgeColor: p.badgeColor || 'orange', category: p.category || 'variedades',
    buttonText: p.buttonText || 'Ir para o parceiro', buttonStyle: p.buttonStyle || 'coral', image: p.image,
    affiliateUrl: p.affiliateUrl
  }))};
}
export function restoreChange(state, id) {
  const h=state.history.find(item=>item.id===id);
  if(!h || h.restored || !h.before) throw new Error('Esta alteração não pode ser restaurada.');
  const current=state.catalog.find(p=>p.id===h.after.id);
  if(JSON.stringify(current)!==JSON.stringify(h.after)) throw new Error('O produto mudou depois desta troca. Confira o catálogo antes de restaurar.');
  return {...state,catalog:state.catalog.map(p=>p.id===h.after.id?structuredClone(h.before):p),
    history:state.history.map(item=>item.id===id?{...item,restored:true}:item)};
}
export function validateCatalog(payload) {
  if (!payload || !Array.isArray(payload.products) || payload.products.length > 2000) throw new Error('Catálogo inválido (máximo de 2.000 produtos).');
  const ids = new Set();
  return payload.products.map(p => {
    if (!p || !p.id || ids.has(p.id) || typeof p.title !== 'string' || p.title.length > 1000 || !cents(p.price) ||
      !validUrl(p.affiliateUrl, 'affiliate') || !validUrl(p.image, 'image')) throw new Error('Um produto do catálogo está incompleto, repetido ou contém um endereço inválido.');
    ids.add(p.id);
    return {id: String(p.id), title: p.title, price: p.price, oldPrice: Number(p.oldPrice) || 0,
      image: p.image, affiliateUrl: p.affiliateUrl, rating: String(p.rating || ''),
      category: ['casa','tecnologia','beleza','variedades'].includes(p.category) ? p.category : 'variedades',
      badge: String(p.badge || 'ACHADO ÚTIL'), badgeColor: String(p.badgeColor || 'orange'),
      buttonStyle: String(p.buttonStyle || 'coral'), buttonText: String(p.buttonText || 'Ir para o parceiro'),
      productId: productId(p.url), url: validUrl(p.url) ? p.url : ''};
  });
}
