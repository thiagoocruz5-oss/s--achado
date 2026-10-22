(function () {
  const STORAGE_KEY = 'so_achado_data_v1';
  const FAV_KEY = 'so_achado_favs_v1';

  let catalogRevision = '';
  let state = {
    products: [],
    settings: {
      whatsappUrl: 'https://chat.whatsapp.com/',
      telegramUrl: 'https://t.me/',
      showFloatingCard: true
    },
    favorites: [],
    activeCategory: 'todos',
    onlyFavorites: false,
    searchQuery: ''
  };

  // DOM Elements
  const productsGrid = document.getElementById('productsGrid');
  const productCountText = document.getElementById('productCountText');
  const sectionTitle = document.getElementById('sectionTitle');
  const searchInput = document.getElementById('searchInput');
  const categoryList = document.getElementById('categoryList');
  const favFilterBtn = document.getElementById('favFilterBtn');
  const favCountBadge = document.getElementById('favCountBadge');
  const logoResetBtn = document.getElementById('logoResetBtn');

  // Floating Widget
  const floatingPromoCard = document.getElementById('floatingPromoCard');
  const closeFloatingBtn = document.getElementById('closeFloatingBtn');
  const floatingWaLink = document.getElementById('floatingWaLink');
  const floatingTgLink = document.getElementById('floatingTgLink');

  // Modal Elements
  const adminModal = document.getElementById('adminModal');
  const openAddModalBtn = document.getElementById('openAddModalBtn');
  const adminToggleBtn = document.getElementById('adminToggleBtn');
  const closeModalBtn = document.getElementById('closeModalBtn');
  const modalTabs = document.querySelectorAll('.modal-tab');
  const tabPanels = document.querySelectorAll('.tab-panel');

  // Product Form Elements
  const magicUrlInput = document.getElementById('magicUrlInput');
  const extractBtn = document.getElementById('extractBtn');
  const extractStatus = document.getElementById('extractStatus');
  const productForm = document.getElementById('productForm');
  const prodIdInput = document.getElementById('prodId');
  const prodTitleInput = document.getElementById('prodTitle');
  const prodPriceInput = document.getElementById('prodPrice');
  const prodOldPriceInput = document.getElementById('prodOldPrice');
  const prodBadgeSelect = document.getElementById('prodBadge');
  const prodCategorySelect = document.getElementById('prodCategory');
  const prodButtonStyleSelect = document.getElementById('prodButtonStyle');
  const prodRatingInput = document.getElementById('prodRating');
  const prodImageInput = document.getElementById('prodImage');
  const prodAffiliateUrlInput = document.getElementById('prodAffiliateUrl');
  const previewImg = document.getElementById('previewImg');
  const clearFormBtn = document.getElementById('clearFormBtn');

  // Settings Elements
  const setWhatsappUrl = document.getElementById('setWhatsappUrl');
  const setTelegramUrl = document.getElementById('setTelegramUrl');
  const setAdminPassword = document.getElementById('setAdminPassword');
  const setShowFloating = document.getElementById('setShowFloating');
  const saveSettingsBtn = document.getElementById('saveSettingsBtn');
  const lockAdminBtn = document.getElementById('lockAdminBtn');
  const cloudSyncBtn = document.getElementById('cloudSyncBtn');
  const exportJsonBtn = document.getElementById('exportJsonBtn');
  const resetDefaultBtn = document.getElementById('resetDefaultBtn');
  const bookmarkletLink = document.getElementById('bookmarkletLink');
  const toastMsg = document.getElementById('toastMsg');

  function isLocalEnvironment() {
    const h = window.location.hostname;
    return window.location.protocol === 'file:' || h === 'localhost' || h === '127.0.0.1';
  }

  function initAdminMode() {
    if (isLocalEnvironment() || sessionStorage.getItem('so_achado_admin') === '1') {
      document.body.classList.add('is-admin');
    } else {
      document.body.classList.remove('is-admin');
    }
  }

  // ==================== INITIALIZATION ====================
  async function init() {
    initAdminMode();
    loadFavorites();
    await loadData();
    applySettingsToUI();
    renderProducts();
    setupEventListeners();
    setupBookmarklet();
    checkUrlParamsForBookmarklet();
  }

  function loadFavorites() {
    try {
      const saved = localStorage.getItem(FAV_KEY);
      if (saved) state.favorites = JSON.parse(saved);
    } catch (e) {
      state.favorites = [];
    }
    updateFavBadge();
  }

  function saveFavorites() {
    try {
      localStorage.setItem(FAV_KEY, JSON.stringify(state.favorites));
    } catch (e) {}
    updateFavBadge();
  }

  function updateFavBadge() {
    const count = state.favorites.length;
    if (count > 0) {
      favCountBadge.style.display = 'flex';
      favCountBadge.textContent = count;
    } else {
      favCountBadge.style.display = 'none';
    }
  }

  const LOCAL_API_BASE = 'http://127.0.0.1:3000';

  function getApiEndpoints(path) {
    if (!isLocalEnvironment()) return [path];
    const list = [`${LOCAL_API_BASE}${path}`];
    if (window.location.protocol.startsWith('http') && window.location.origin !== LOCAL_API_BASE) {
      list.unshift(path);
    }
    return list;
  }

  async function loadData() {
    // 1. Try local server API first (works both on http://127.0.0.1:3000 and file://)
    for (const ep of getApiEndpoints('/api/products')) {
      try {
        const res = await fetch(ep, { cache: 'no-store' });
        if (res.ok) {
          const serverData = await res.json();
          if (serverData && Array.isArray(serverData.products)) {
            catalogRevision = serverData.revision || "";
            state.products = serverData.products;
            if (serverData.settings) state.settings = { ...state.settings, ...serverData.settings };
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ products: state.products, settings: state.settings }));
            return;
          }
        }
      } catch (err) {
        // Fallback to next endpoint or localStorage
      }
    }

    // 2. Try localStorage
    try {
      const localRaw = localStorage.getItem(STORAGE_KEY);
      if (localRaw) {
        const parsed = JSON.parse(localRaw);
        if (parsed && Array.isArray(parsed.products) && parsed.products.length > 0) {
          state.products = parsed.products;
          if (parsed.settings) state.settings = { ...state.settings, ...parsed.settings };
          return;
        }
      }
    } catch (e) {}

    // 3. Fallback to initial seed data
    if (window.SO_ACHADO_INITIAL_DATA) {
      state.products = JSON.parse(JSON.stringify(window.SO_ACHADO_INITIAL_DATA.products || []));
      if (window.SO_ACHADO_INITIAL_DATA.settings) {
        state.settings = { ...state.settings, ...window.SO_ACHADO_INITIAL_DATA.settings };
      }
    }
  }

  async function persistData() {
    // Mantém o editor do servidor Python e o modo offline existentes.
    if (isLocalEnvironment() && !catalogRevision) {
      const payload={settings:state.settings,products:state.products};
      localStorage.setItem(STORAGE_KEY,JSON.stringify(payload));
      for(const ep of getApiEndpoints('/api/products')) {
        try {const r=await fetch(ep,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});if(r.ok)break;}catch{}
      }
      return true;
    }
    try {
      const key = await window.SO_ACHADO_AUTH.askKey();
      if (!key) {await loadData();applySettingsToUI();renderProducts();return false;}
      if (!catalogRevision) throw new Error('O catálogo não foi carregado da API protegida. Recarregue o site antes de editar.');
      const {adminPassword, ...settings} = state.settings;
      const response = await fetch('/api/products', {method: 'POST', headers: {
        'Content-Type':'application/json', Authorization:'Bearer ' + key, 'If-Match':catalogRevision,
        'X-Operation-Id':crypto.randomUUID()
      }, body:JSON.stringify({settings,products:state.products})});
      const result = await response.json();
      if (response.status === 401) sessionStorage.removeItem('so_achado_write_key');
      if (!response.ok || !result.ok) throw new Error(result.error || 'Gravação não confirmada.');
      catalogRevision=result.revision;
      state.products=result.catalog.products;state.settings=result.catalog.settings;
      sessionStorage.setItem('so_achado_write_key',key);
      localStorage.setItem(STORAGE_KEY,JSON.stringify({products:state.products,settings:state.settings}));
      return true;
    } catch (error) {
      showToast('Não foi possível salvar: ' + error.message);
      await loadData();applySettingsToUI();renderProducts();
      return false;
    }
  }

  // ==================== RENDERING ====================
  function formatBRL(value) {
    const num = Number(value);
    if (isNaN(num) || num <= 0) return '';
    return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function parsePriceInput(str) {
    if (typeof str === 'number') return str;
    if (!str) return 0;
    let cleaned = String(str).replace(/[^\d.,]/g, '').trim();
    if (!cleaned) return 0;
    // If both dot and comma exist (e.g. 1.299,90)
    if (cleaned.includes('.') && cleaned.includes(',')) {
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else if (cleaned.includes(',')) {
      cleaned = cleaned.replace(',', '.');
    }
    const val = parseFloat(cleaned);
    return isNaN(val) ? 0 : val;
  }

  function renderProducts() {
    const query = state.searchQuery.trim().toLowerCase();
    const filtered = state.products.filter((prod) => {
      if (state.onlyFavorites && !state.favorites.includes(prod.id)) return false;
      if (state.activeCategory !== 'todos' && prod.category !== state.activeCategory) return false;
      if (query && !prod.title.toLowerCase().includes(query) && !(prod.badge || '').toLowerCase().includes(query)) {
        return false;
      }
      return true;
    });

    productCountText.textContent =
      filtered.length === 1 ? '1 oferta encontrada' : `${filtered.length} ofertas selecionadas`;

    if (filtered.length === 0) {
      productsGrid.innerHTML = `
        <div class="empty-state">
          <h3>Nenhum achado encontrado neste filtro</h3>
          <p>Tente buscar outro termo ou clique em "+ Novo Achado" no topo para cadastrar um produto.</p>
        </div>
      `;
      return;
    }

    productsGrid.innerHTML = filtered
      .map((prod) => {
        const isFav = state.favorites.includes(prod.id);
        const badgeColorClass = `badge-${prod.badgeColor || 'purple'}`;
        const btnStyleClass = prod.buttonStyle === 'teal' ? 'btn-teal' : 'btn-coral';
        const priceColorClass = prod.buttonStyle === 'teal' ? 'price-teal' : '';
        const oldPriceHtml =
          prod.oldPrice && Number(prod.oldPrice) > Number(prod.price)
            ? `<span class="old-price">${formatBRL(prod.oldPrice)}</span>`
            : '';

        return `
        <article class="product-card" data-id="${escapeHtml(prod.id)}">
          <div class="card-top-bar">
            <span class="product-badge ${badgeColorClass}">${escapeHtml(prod.badge || 'OFERTA')}</span>
            <div class="card-icon-actions">
              <button class="card-action-btn ${isFav ? 'fav-active' : ''}" data-action="fav" data-id="${escapeHtml(prod.id)}" title="Favoritar oferta">
                ${isFav ? '♥' : '♡'}
              </button>
              <button class="card-action-btn admin-only-btn" data-action="edit" data-id="${escapeHtml(prod.id)}" title="Editar este produto">
                ✎
              </button>
              <button class="card-action-btn delete-btn admin-only-btn" data-action="delete" data-id="${escapeHtml(prod.id)}" title="Remover este produto">
                ×
              </button>
            </div>
          </div>

          <a href="${escapeHtml(prod.affiliateUrl)}" target="_blank" rel="noopener sponsored" class="card-image-link">
            <img src="${escapeHtml(prod.image)}" alt="${escapeHtml(prod.title)}" class="card-image" loading="lazy" onerror="this.src='assets/airfryer.svg'" />
          </a>

          <div class="card-title-row">
            <a href="${escapeHtml(prod.affiliateUrl)}" target="_blank" rel="noopener sponsored" class="card-title" title="${escapeHtml(prod.title)}">
              ${escapeHtml(prod.title)}
            </a>
            <span class="card-rating">
              <span class="star-icon">★</span> ${escapeHtml(String(prod.rating || '4.8'))}
            </span>
          </div>

          <div class="card-price-row">
            <span class="current-price ${priceColorClass}">${formatBRL(prod.price)}</span>
            ${oldPriceHtml}
          </div>

          <a href="${escapeHtml(prod.affiliateUrl)}" target="_blank" rel="noopener sponsored" class="card-cta-btn ${btnStyleClass}">
            <span>${escapeHtml(prod.buttonText || 'Ir para o parceiro')}</span>
            <span>↗</span>
          </a>
        </article>
      `;
      })
      .join('');
  }

  function applySettingsToUI() {
    floatingWaLink.href = state.settings.whatsappUrl || 'https://chat.whatsapp.com/';
    floatingTgLink.href = state.settings.telegramUrl || 'https://t.me/';
    if (state.settings.showFloatingCard) {
      floatingPromoCard.classList.remove('hidden');
    } else {
      floatingPromoCard.classList.add('hidden');
    }
    setWhatsappUrl.value = state.settings.whatsappUrl || '';
    setTelegramUrl.value = state.settings.telegramUrl || '';
    if (setAdminPassword) setAdminPassword.value = "";
    setShowFloating.checked = Boolean(state.settings.showFloatingCard);
  }

  // ==================== AUTOMATIC MERCADO LIVRE EXTRACTOR ====================
  function guessCategoryFromTitle(title) {
    const t = (title || '').toLowerCase();
    if (/(fone|bluetooth|celular|iphone|samsung|notebook|tv|smart|aspirador|robô|alexa|echo|câmera|mouse|teclado|gamer|carregador|caixa de som)/.test(t)) {
      return 'tecnologia';
    }
    if (/(perfume|maquiagem|secador|chapinha|escova|creme|shampoo|hidratante|beleza|barbeador|relógio|óculos|bolsa|tenis|tênis|camisa|vestido)/.test(t)) {
      return 'beleza';
    }
    if (/(panela|fritadeira|air fryer|airfryer|cozinha|liquidificador|batedeira|cafeteira|copo|jogo de|toalha|lençol|travesseiro|organizador|casa|ferramenta|furadeira)/.test(t)) {
      return 'casa';
    }
    return 'variedades';
  }

  function parseSmartText(rawText) {
    // Extracts URL and possible title/price if user pasted full share message from Mercado Livre app
    const urlMatch = rawText.match(/https?:\/\/[^\s"'<>]+/i);
    const url = urlMatch ? urlMatch[0] : rawText.trim();

    let textWithoutUrl = rawText.replace(/https?:\/\/[^\s"'<>]+/gi, ' ').trim();
    let detectedPrice = 0;

    const priceMatches = textWithoutUrl.match(/R\$\s*(\d{1,3}(?:\.\d{3})*(?:,\d{2})?|\d+(?:[.,]\d{2})?)/i);
    if (priceMatches && priceMatches[1]) {
      detectedPrice = parsePriceInput(priceMatches[1]);
      textWithoutUrl = textWithoutUrl.replace(priceMatches[0], ' ').trim();
    }

    // Clean common share phrases
    textWithoutUrl = textWithoutUrl
      .replace(/^(confira|olha só|achei no mercado livre|oferta|promoção)[\s:!-]*/i, '')
      .replace(/\s+/g, ' ')
      .trim();

    return {
      url,
      hintTitle: textWithoutUrl.length > 4 ? textWithoutUrl : '',
      hintPrice: detectedPrice
    };
  }

  async function extractProductData(rawInput) {
    if (!rawInput || !rawInput.trim()) {
      setStatus('Cole um link do Mercado Livre primeiro.', 'warn');
      return;
    }

    const { url, hintTitle, hintPrice } = parseSmartText(rawInput);
    if (!url.startsWith('http')) {
      setStatus('Link inválido. Certifique-se de colar um link começando com https://', 'error');
      return;
    }

    prodAffiliateUrlInput.value = url;
    if (hintTitle && !prodTitleInput.value) prodTitleInput.value = hintTitle;
    if (hintPrice > 0 && !prodPriceInput.value) prodPriceInput.value = hintPrice.toFixed(2).replace('.', ',');

    extractBtn.disabled = true;
    extractBtn.innerHTML = '<span>⏳ Buscando...</span>';
    setStatus('Conectando ao Mercado Livre para buscar foto, título e preço (leva ~5 segundos)...', 'warn');

    try {
      let data = null;

      // 1. Try local Python / Vercel Serverless API (/api/extract) - works on http://127.0.0.1:3000 AND file://
      for (const ep of getApiEndpoints(`/api/extract?url=${encodeURIComponent(url)}`)) {
        try {
          const resp = await fetch(ep);
          if (resp.ok) {
            const json = await resp.json();
            if (json && (json.title || json.image || json.price)) {
              data = json;
              if (Number(json.price) > 0) break;
            }
          }
        } catch (e) {}
      }

      // 2. Fallback: Client-side extraction if server wasn't reachable
      if (!data || (!data.title && !data.image)) {
        data = await extractClientSideFallback(url);
      }

      if (data && (data.title || data.image || data.price)) {
        if (data.title) {
          const cleanTitle = data.title
            .replace(/\s*\|\s*Mercado\s*Livre.*$/i, '')
            .replace(/\s*-\s*R\$\s*[\d.,]+.*$/i, '')
            .trim();
          prodTitleInput.value = cleanTitle;
          prodCategorySelect.value = guessCategoryFromTitle(cleanTitle);
        }
        if (data.price && Number(data.price) > 0) {
          prodPriceInput.value = Number(data.price).toFixed(2).replace('.', ',');
        }
        if (data.oldPrice && Number(data.oldPrice) > Number(data.price || 0)) {
          prodOldPriceInput.value = Number(data.oldPrice).toFixed(2).replace('.', ',');
        }
        if (data.image) {
          prodImageInput.value = data.image;
          previewImg.src = data.image;
        }
        if (data.rating) {
          prodRatingInput.value = data.rating;
        }

        if (data.title && data.price && data.image) {
          setStatus('✨ Dados extraídos automaticamente com sucesso! Confira e clique em Publicar.', 'success');
        } else {
          setStatus('✅ Link vinculado! Complete o que faltar abaixo e clique em Publicar.', 'warn');
        }
      } else {
        setStatus(
          '⚠️ O Mercado Livre protegeu alguns dados deste link curto. Preencha o preço/foto abaixo ou use a aba "Botão 1-Clique"!',
          'warn'
        );
      }
    } catch (err) {
      setStatus('Não foi possível ler todos os dados automaticamente. Preencha os campos abaixo.', 'warn');
    } finally {
      extractBtn.disabled = false;
      extractBtn.innerHTML = '<span>🔍 Puxar Dados</span>';
    }
  }

  async function extractClientSideFallback(url) {
    const result = { title: '', price: 0, oldPrice: 0, image: '', rating: '4.8' };

    // Try Microlink public metadata API
    try {
      const mlResp = await fetch(`https://api.microlink.io/?url=${encodeURIComponent(url)}`);
      if (mlResp.ok) {
        const mlJson = await mlResp.json();
        if (mlJson && mlJson.data) {
          const d = mlJson.data;
          if (d.title) result.title = d.title;
          if (d.image && d.image.url) result.image = d.image.url;
          // Check if price is in title or description (Mercado Livre often puts "R$ 129,90" in title/description)
          const combined = `${d.title || ''} ${d.description || ''}`;
          const mPrice = combined.match(/R\$\s*(\d{1,3}(?:\.\d{3})*(?:,\d{2})?|\d+(?:,\d{2})?)/i);
          if (mPrice && mPrice[1]) {
            result.price = parsePriceInput(mPrice[1]);
          }
        }
      }
    } catch (e) {}

    // Also check if URL contains MLB ID (e.g. MLB-12345678 or MLB12345678)
    const mlbMatch = url.match(/MLB-?(\d{7,12})/i);
    if (mlbMatch && mlbMatch[1]) {
      try {
        const itemId = `MLB${mlbMatch[1]}`;
        const itemResp = await fetch(`https://api.mercadolibre.com/items/${itemId}`);
        if (itemResp.ok) {
          const item = await itemResp.json();
          if (item.title) result.title = item.title;
          if (item.price) result.price = item.price;
          if (item.original_price) result.oldPrice = item.original_price;
          if (item.pictures && item.pictures.length > 0) {
            result.image = item.pictures[0].secure_url || item.pictures[0].url;
          } else if (item.thumbnail) {
            result.image = item.thumbnail.replace(/-I\.jpg$/i, '-O.jpg');
          }
        }
      } catch (e) {}
    }

    return result;
  }

  function setStatus(msg, type) {
    extractStatus.textContent = msg;
    extractStatus.className = `extract-status ${type || ''}`;
  }

  // ==================== BOOKMARKLET 1-CLIQUE ====================
  function setupBookmarklet() {
    const baseUrl = window.location.href.split('?')[0].split('#')[0];
    const bookmarkletCode = `javascript:(function(){try{var t=document.querySelector('h1.ui-pdp-title')?document.querySelector('h1.ui-pdp-title').innerText:document.title;var pEl=document.querySelector('.ui-pdp-price__second-line .andes-money-amount__fraction')||document.querySelector('.andes-money-amount__fraction');var cEl=document.querySelector('.ui-pdp-price__second-line .andes-money-amount__cents');var p=pEl?(pEl.innerText.replace(/\\./g,'')+(cEl?','+cEl.innerText:'')):'';var oEl=document.querySelector('.ui-pdp-price__original-value .andes-money-amount__fraction');var oCents=document.querySelector('.ui-pdp-price__original-value .andes-money-amount__cents');var op=oEl?(oEl.innerText.replace(/\\./g,'')+(oCents?','+oCents.innerText:'')):'';var imgEl=document.querySelector('figure.ui-pdp-gallery__figure img.ui-pdp-image')||document.querySelector('meta[property="og:image"]');var img=imgEl?(imgEl.getAttribute('data-zoom')||imgEl.src||imgEl.content):'';var aff=prompt('Cole seu Link de Afiliado do Mercado Livre (ou deixe como está para usar o link atual):',location.href);if(!aff)return;var target='${baseUrl}?novo_achado=1&title='+encodeURIComponent(t)+'&price='+encodeURIComponent(p)+'&oldPrice='+encodeURIComponent(op)+'&image='+encodeURIComponent(img)+'&url='+encodeURIComponent(aff);window.open(target,'_blank');}catch(e){alert('Erro ao capturar: '+e.message);}})();`;
    bookmarkletLink.setAttribute('href', bookmarkletCode);
    bookmarkletLink.addEventListener('click', (e) => {
      e.preventDefault();
      showToast('Arraste este botão laranja para a barra de favoritos do seu navegador!');
    });
  }

  function checkUrlParamsForBookmarklet() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('novo_achado') === '1') {
      resetForm();
      const title = (params.get('title') || '').replace(/\s*\|\s*Mercado\s*Livre.*$/i, '').trim();
      const price = params.get('price') || '';
      const oldPrice = params.get('oldPrice') || '';
      const image = params.get('image') || '';
      const url = params.get('url') || '';

      if (title) {
        prodTitleInput.value = title;
        prodCategorySelect.value = guessCategoryFromTitle(title);
      }
      if (price) prodPriceInput.value = price;
      if (oldPrice) prodOldPriceInput.value = oldPrice;
      if (image) {
        prodImageInput.value = image;
        previewImg.src = image;
      }
      if (url) {
        prodAffiliateUrlInput.value = url;
        magicUrlInput.value = url;
      }

      setStatus('✨ Produto capturado direto do Mercado Livre! Clique em Publicar no Site.', 'success');
      openModal('tab-add');
      // Clean URL bar without reloading
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }

  // ==================== EVENT LISTENERS ====================
  function setupEventListeners() {
    // Search
    searchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value;
      renderProducts();
    });

    // Logo reset
    logoResetBtn.addEventListener('click', () => {
      state.activeCategory = 'todos';
      state.onlyFavorites = false;
      state.searchQuery = '';
      searchInput.value = '';
      favFilterBtn.classList.remove('active');
      updateCategoryButtons();
      sectionTitle.textContent = 'Garimpos Imperdíveis da Semana';
      renderProducts();
    });

    // Categories
    categoryList.addEventListener('click', (e) => {
      const btn = e.target.closest('.category-btn');
      if (!btn) return;
      const cat = btn.dataset.category;
      if (cat === 'grupo') {
        floatingPromoCard.classList.remove('hidden');
        window.open(state.settings.whatsappUrl || 'https://chat.whatsapp.com/', '_blank');
        return;
      }
      state.activeCategory = cat;
      state.onlyFavorites = false;
      favFilterBtn.classList.remove('active');
      updateCategoryButtons();

      const titles = {
        todos: 'Garimpos Imperdíveis da Semana',
        casa: 'Casa & Praticidade',
        tecnologia: 'Tecnologia & Eletrônicos',
        beleza: 'Beleza & Estilo',
        variedades: 'Variedades & Utilidades'
      };
      sectionTitle.textContent = titles[cat] || 'Garimpos Imperdíveis da Semana';
      renderProducts();
    });

    // Favorites filter
    favFilterBtn.addEventListener('click', () => {
      state.onlyFavorites = !state.onlyFavorites;
      favFilterBtn.classList.toggle('active', state.onlyFavorites);
      sectionTitle.textContent = state.onlyFavorites ? 'Meus Achados Favoritos ❤️' : 'Garimpos Imperdíveis da Semana';
      renderProducts();
    });

    // Card actions (Fav, Edit, Delete)
    productsGrid.addEventListener('click', async (e) => {
      const btn = e.target.closest('.card-action-btn');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();

      const id = btn.dataset.id;
      const action = btn.dataset.action;

      if (action === 'fav') {
        const idx = state.favorites.indexOf(id);
        if (idx >= 0) {
          state.favorites.splice(idx, 1);
          showToast('Removido dos favoritos');
        } else {
          state.favorites.push(id);
          showToast('Salvo nos seus favoritos ❤️');
        }
        saveFavorites();
        renderProducts();
      } else if (action === 'edit') {
        const prod = state.products.find((p) => p.id === id);
        if (prod) populateFormForEdit(prod);
      } else if (action === 'delete') {
        if (confirm('Deseja remover este anúncio do site?')) {
          state.products = state.products.filter((p) => p.id !== id);
          if (!await persistData()) return;
          renderProducts();
          showToast('Anúncio removido!');
        }
      }
    });

    // Floating promo card close
    closeFloatingBtn.addEventListener('click', () => {
      floatingPromoCard.classList.add('hidden');
    });

    // Open / Close Modal
    openAddModalBtn.addEventListener('click', () => {
      resetForm();
      openModal('tab-add');
    });

    adminToggleBtn.addEventListener('click', async () => {
      if (document.body.classList.contains('is-admin')) { openModal('tab-add'); return; }
      const key=await window.SO_ACHADO_AUTH.askKey();if(!key)return;
      try {
        const response=await fetch('/api/radar',{headers:{Authorization:'Bearer '+key}});
        const result=await response.json();
        if(!response.ok||!result.ready)throw new Error(result.error||'Acesso não confirmado.');
        sessionStorage.setItem('so_achado_write_key',key);sessionStorage.setItem('so_achado_admin','1');
        document.body.classList.add('is-admin');openModal('tab-add');
      }catch(error){sessionStorage.removeItem('so_achado_write_key');showToast(error.message);}
    });

    if (lockAdminBtn) {
      lockAdminBtn.addEventListener('click', () => {
        sessionStorage.removeItem('so_achado_admin');
        sessionStorage.removeItem('so_achado_write_key');
        document.body.classList.remove('is-admin');
        closeModal();
        showToast('👁️ Visualizando como visitante (clique no ícone 👤 para voltar ao Admin)');
      });
    }

    if (cloudSyncBtn) {
      cloudSyncBtn.addEventListener('click', async () => {
        cloudSyncBtn.disabled = true;
        const origText = cloudSyncBtn.innerHTML;
        cloudSyncBtn.innerHTML = '<span>⏳ Sincronizando...</span>';
        try {
          if (!await persistData()) return;
          if (!isLocalEnvironment()) {
            showToast('🚀 Site online atualizado em tempo real!');
            return;
          }
          for (const ep of getApiEndpoints('/api/publish')) {
            try {
              const resp = await fetch(ep, { method: 'POST' });
              const data = await resp.json();
              if (resp.ok && data.ok) {
                showToast('🚀 Site online atualizado com sucesso!');
                break;
              }
            } catch (err) {}
          }
        } finally {
          cloudSyncBtn.disabled = false;
          cloudSyncBtn.innerHTML = origText;
        }
      });
    }

    closeModalBtn.addEventListener('click', closeModal);
    adminModal.addEventListener('click', (e) => {
      if (e.target === adminModal) closeModal();
    });

    // Modal Tabs
    modalTabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        const target = tab.dataset.tab;
        switchTab(target);
      });
    });

    // Magic Paste & Extract
    extractBtn.addEventListener('click', () => {
      extractProductData(magicUrlInput.value);
    });

    magicUrlInput.addEventListener('paste', (e) => {
      setTimeout(() => {
        extractProductData(magicUrlInput.value);
      }, 80);
    });

    // Live image preview
    prodImageInput.addEventListener('input', () => {
      const val = prodImageInput.value.trim();
      if (val) previewImg.src = val;
    });

    // Clear form
    clearFormBtn.addEventListener('click', resetForm);

    // Save Product Form
    productForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = prodIdInput.value || 'prod-' + Date.now();
      const [badge, badgeColor] = (prodBadgeSelect.value || 'MAIS VENDIDO|purple').split('|');
      const [buttonText, buttonStyle] = (prodButtonStyleSelect.value || 'Ir para o parceiro|coral').split('|');

      const price = parsePriceInput(prodPriceInput.value);
      const oldPrice = parsePriceInput(prodOldPriceInput.value);

      const newProduct = {
        id,
        title: prodTitleInput.value.trim(),
        price: price > 0 ? price : 0,
        oldPrice: oldPrice > price ? oldPrice : 0,
        rating: prodRatingInput.value.trim() || '4.8',
        badge,
        badgeColor,
        category: prodCategorySelect.value || 'casa',
        buttonText,
        buttonStyle,
        image: prodImageInput.value.trim() || 'assets/airfryer.svg',
        affiliateUrl: prodAffiliateUrlInput.value.trim()
      };

      const existingIdx = state.products.findIndex((p) => p.id === id);
      if (existingIdx >= 0) {
        state.products[existingIdx] = newProduct;

      } else {
        // Add to the beginning so the newest deal appears first!
        state.products.unshift(newProduct);

      }

      if (!await persistData()) return;
      showToast(existingIdx>=0?'✅ Anúncio atualizado com sucesso!':'🎉 Novo achado publicado no site!');
      renderProducts();
      closeModal();
      resetForm();
    });

    // Save Settings
    saveSettingsBtn.addEventListener('click', async () => {
      state.settings.whatsappUrl = setWhatsappUrl.value.trim() || 'https://chat.whatsapp.com/';
      state.settings.telegramUrl = setTelegramUrl.value.trim() || 'https://t.me/';

      state.settings.showFloatingCard = setShowFloating.checked;

      applySettingsToUI();
      if (!await persistData()) return;
      showToast('⚙️ Configurações salvas com sucesso!');
      closeModal();
    });

    // Export JSON / Seed for Static Hosting
    exportJsonBtn.addEventListener('click', () => {
      const exportObj = {
        settings: state.settings,
        products: state.products
      };
      const jsContent = `window.SO_ACHADO_INITIAL_DATA = ${JSON.stringify(exportObj, null, 2)};\n`;
      const blob = new Blob([jsContent], { type: 'application/javascript;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'products-seed.js';
      a.click();
      URL.revokeObjectURL(url);
      showToast('Arquivo products-seed.js baixado!');
    });

    // Reset Default Products
    resetDefaultBtn.addEventListener('click', async () => {
      if (confirm('Deseja restaurar os 4 produtos originais de exemplo da imagem?')) {
        if (window.SO_ACHADO_INITIAL_DATA) {
          state.products = JSON.parse(JSON.stringify(window.SO_ACHADO_INITIAL_DATA.products));
          if (!await persistData()) return;
          renderProducts();
          showToast('Produtos de exemplo restaurados!');
          closeModal();
        }
      }
    });
  }

  function updateCategoryButtons() {
    document.querySelectorAll('.category-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.category === state.activeCategory);
    });
  }

  function openModal(tabId) {
    if (tabId) switchTab(tabId);
    adminModal.classList.add('open');
  }

  function closeModal() {
    adminModal.classList.remove('open');
  }

  function switchTab(tabId) {
    modalTabs.forEach((t) => t.classList.toggle('active', t.dataset.tab === tabId));
    tabPanels.forEach((p) => p.classList.toggle('active', p.id === tabId));
  }

  function resetForm() {
    prodIdInput.value = '';
    magicUrlInput.value = '';
    prodTitleInput.value = '';
    prodPriceInput.value = '';
    prodOldPriceInput.value = '';
    prodBadgeSelect.value = 'MAIS VENDIDO|purple';
    prodCategorySelect.value = 'casa';
    prodButtonStyleSelect.value = 'Ir para o parceiro|coral';
    prodRatingInput.value = '4.8';
    prodImageInput.value = '';
    prodAffiliateUrlInput.value = '';
    previewImg.src = 'assets/airfryer.svg';
    setStatus('', '');
    document.getElementById('saveProdBtn').textContent = '✅ Publicar no Site';
  }

  function populateFormForEdit(prod) {
    resetForm();
    prodIdInput.value = prod.id;
    prodTitleInput.value = prod.title || '';
    prodPriceInput.value = prod.price ? Number(prod.price).toFixed(2).replace('.', ',') : '';
    prodOldPriceInput.value = prod.oldPrice ? Number(prod.oldPrice).toFixed(2).replace('.', ',') : '';
    prodBadgeSelect.value = `${prod.badge || 'MAIS VENDIDO'}|${prod.badgeColor || 'purple'}`;
    prodCategorySelect.value = prod.category || 'casa';
    prodButtonStyleSelect.value = `${prod.buttonText || 'Ir para o parceiro'}|${prod.buttonStyle || 'coral'}`;
    prodRatingInput.value = prod.rating || '4.8';
    prodImageInput.value = prod.image || '';
    prodAffiliateUrlInput.value = prod.affiliateUrl || '';
    magicUrlInput.value = prod.affiliateUrl || '';
    previewImg.src = prod.image || 'assets/airfryer.svg';
    document.getElementById('saveProdBtn').textContent = '💾 Salvar Alterações';
    openModal('tab-add');
  }

  function showToast(text) {
    toastMsg.textContent = text;
    toastMsg.classList.add('show');
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => {
      toastMsg.classList.remove('show');
    }, 3200);
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  init();
})();
