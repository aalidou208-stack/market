/* ============================================================
   AfriMarket — Application principale
   frontend/assets/js/app.js
   PRINCIPE : aucune donnée fictive. Tout vient de l'API.
   ============================================================ */

const AM = (() => {

  /* ── CONFIG ──────────────────────────────────────────────
   * En développement : http://localhost:3000/api
   * En production    : https://api.afrimarket.com/api
   * Modifier dans .env.frontend ou via window.AM_API_URL
   */
  const API = window.AM_API_URL || 'http://localhost:3000/api';

  /* ── STATE LOCAL ─────────────────────────────────────────
   * Panier et session stockés dans localStorage
   * Toutes les données affichées viennent du serveur
   */
  const local = {
    cart:    JSON.parse(localStorage.getItem('am_cart')    || '[]'),
    token:   localStorage.getItem('am_token')              || null,
    user:    JSON.parse(localStorage.getItem('am_user')    || 'null'),
  };

  /* ── HTTP CLIENT ─────────────────────────────────────────*/
  async function http(method, path, body = null, auth = false) {
    const headers = { 'Content-Type': 'application/json' };
    if (auth && local.token) headers['Authorization'] = `Bearer ${local.token}`;
    try {
      const res = await fetch(API + path, {
        method,
        headers,
        body: body ? JSON.stringify(body) : null,
      });
      const data = await res.json();
      if (!res.ok) throw { status: res.status, message: data.message || 'Erreur serveur' };
      return data;
    } catch (err) {
      if (err.status) throw err;
      throw { status: 0, message: 'Impossible de joindre le serveur. Vérifiez votre connexion.' };
    }
  }

  const get    = (path, auth)       => http('GET',    path, null, auth);
  const post   = (path, body, auth) => http('POST',   path, body, auth);
  const put    = (path, body, auth) => http('PUT',    path, body, auth);
  const patch  = (path, body, auth) => http('PATCH',  path, body, auth);
  const del    = (path, auth)       => http('DELETE', path, null, auth);

  /* ── AUTH ────────────────────────────────────────────────*/
  const auth = {
    async login(identifier, password) {
      const data = await post('/auth/login', { identifier, password });
      local.token = data.token;
      local.user  = data.user;
      localStorage.setItem('am_token', data.token);
      localStorage.setItem('am_user',  JSON.stringify(data.user));
      return data;
    },
    async register(payload) {
      const data = await post('/auth/register', payload);
      return data;
    },
    async sendOTP(phone) {
      return post('/auth/otp/send', { phone });
    },
    async verifyOTP(phone, code) {
      return post('/auth/otp/verify', { phone, code });
    },
    logout() {
      local.token = null;
      local.user  = null;
      localStorage.removeItem('am_token');
      localStorage.removeItem('am_user');
      updateUserUI();
    },
    isLogged() { return !!local.token; },
    getUser()  { return local.user; },
  };

  /* ── PRODUCTS ────────────────────────────────────────────*/
  const products = {
    list(params = {}) {
      const qs = new URLSearchParams(params).toString();
      return get('/products?' + qs);
    },
    get(id)     { return get('/products/' + id); },
    featured()  { return get('/products/featured'); },
    reviews(id) { return get(`/products/${id}/reviews`); },
    related(id) { return get(`/products/${id}/related`); },

    /* Affiche les produits dans un container.
     * Si l'API ne répond pas ou retourne 0 résultats → état vide affiché */
    async render(containerId, params = {}) {
      const el = document.getElementById(containerId);
      if (!el) return;
      el.innerHTML = renderSkeleton(5);
      try {
        const { data, total } = await products.list(params);
        if (!data || data.length === 0) {
          el.innerHTML = emptyState('🔍', 'Aucun produit', 'Soyez le premier à publier dans cette catégorie.');
          return;
        }
        el.innerHTML = data.map(renderProductCard).join('');
      } catch (e) {
        el.innerHTML = errorState('Impossible de charger les produits.', () => products.render(containerId, params));
      }
    },
  };

  /* ── STORES ──────────────────────────────────────────────*/
  const stores = {
    list(params = {}) {
      const qs = new URLSearchParams(params).toString();
      return get('/stores?' + qs);
    },
    get(slug) { return get('/stores/' + slug); },

    async render(containerId, params = {}) {
      const el = document.getElementById(containerId);
      if (!el) return;
      el.innerHTML = renderSkeleton(4);
      try {
        const { data } = await stores.list(params);
        if (!data || data.length === 0) {
          el.innerHTML = emptyState('🏪', 'Aucune boutique', 'Les premières boutiques approuvées apparaîtront ici.');
          return;
        }
        el.innerHTML = data.map(renderStoreCard).join('');
      } catch (e) {
        el.innerHTML = errorState('Impossible de charger les boutiques.', () => stores.render(containerId, params));
      }
    },
  };

  /* ── STATS PLATEFORME ────────────────────────────────────
   * Affiche les vrais chiffres depuis l'API.
   * Si l'API renvoie 0 ou null → le widget est masqué.
   * Jamais de chiffre inventé.
   */
  const stats = {
    async render(containerId) {
      const el = document.getElementById(containerId);
      if (!el) return;
      try {
        const data = await get('/stats/public');
        // Afficher uniquement les métriques > 0
        const metrics = [
          { key: 'totalSellers',  label: 'Vendeurs actifs',   icon: '🏪' },
          { key: 'totalProducts', label: 'Produits en ligne',  icon: '📦' },
          { key: 'totalOrders',   label: 'Commandes traitées', icon: '✅' },
          { key: 'countriesCovered', label: 'Pays desservis',  icon: '🌍' },
        ].filter(m => data[m.key] > 0);

        if (metrics.length === 0) {
          el.style.display = 'none';
          return;
        }
        el.innerHTML = `
          <div style="display:grid;grid-template-columns:repeat(${metrics.length},1fr);gap:16px">
            ${metrics.map(m => `
              <div style="text-align:center;padding:24px 16px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:var(--r-lg)">
                <div style="font-size:28px;margin-bottom:8px">${m.icon}</div>
                <div style="font-family:var(--font-h);font-size:26px;font-weight:800;color:#fff">${fmt.number(data[m.key])}</div>
                <div style="font-size:12px;color:rgba(255,255,255,.5);margin-top:3px">${m.label}</div>
              </div>`).join('')}
          </div>`;
      } catch {
        // API indisponible → on masque discrètement la section stats
        el.style.display = 'none';
      }
    },
  };

  /* ── PANIER ──────────────────────────────────────────────*/
  const cart = {
    add(productId, qty = 1, variantId = null) {
      const idx = local.cart.findIndex(i => i.id === productId && i.variantId === variantId);
      if (idx >= 0) local.cart[idx].qty += qty;
      else local.cart.push({ id: productId, qty, variantId, addedAt: Date.now() });
      saveCart();
      updateCartUI();
      toast('✓ Ajouté au panier', 'success');
    },
    remove(productId, variantId = null) {
      local.cart = local.cart.filter(i => !(i.id === productId && i.variantId === variantId));
      saveCart();
      updateCartUI();
    },
    updateQty(productId, qty, variantId = null) {
      if (qty <= 0) { cart.remove(productId, variantId); return; }
      const item = local.cart.find(i => i.id === productId && i.variantId === variantId);
      if (item) { item.qty = qty; saveCart(); updateCartUI(); }
    },
    count() { return local.cart.reduce((s, i) => s + i.qty, 0); },
    items() { return local.cart; },
    clear() { local.cart = []; saveCart(); updateCartUI(); },
  };

  function saveCart() { localStorage.setItem('am_cart', JSON.stringify(local.cart)); }

  function updateCartUI() {
    const n = cart.count();
    document.querySelectorAll('.cart-count').forEach(el => {
      el.textContent = n;
      el.style.display = n > 0 ? 'flex' : 'none';
    });
    document.querySelectorAll('.cart-label-count').forEach(el => {
      el.textContent = n + (n > 1 ? ' articles' : ' article');
    });
  }

  function updateUserUI() {
    const u = local.user;
    document.querySelectorAll('.user-name').forEach(el => el.textContent = u ? u.firstName : 'Connexion');
    document.querySelectorAll('.user-role').forEach(el => el.textContent = u ? u.role : '');
    document.querySelectorAll('[data-auth-show]').forEach(el => {
      el.style.display = (u && el.dataset.authShow === u.role) ? 'block' : 'none';
    });
  }

  /* ── RENDER HELPERS ──────────────────────────────────────*/
  function renderProductCard(p) {
    const discount = p.comparePrice > p.price
      ? Math.round((1 - p.price / p.comparePrice) * 100) : 0;
    return `
    <div class="product-card" data-id="${p.id}" onclick="AM.openProduct('${p.id}')">
      <div class="pc-img">
        ${p.primaryImage
          ? `<img src="${p.primaryImage}" alt="${p.name}" loading="lazy">`
          : `<div class="pc-img-placeholder">${p.categoryEmoji || '📦'}</div>`}
        <div class="pc-overlay">
          <button onclick="event.stopPropagation();AM.cart.add('${p.id}')" title="Ajouter au panier">🛒</button>
          <button onclick="event.stopPropagation();AM.shareWA('${p.id}')" title="Partager WhatsApp">💬</button>
        </div>
        ${discount ? `<span class="pc-discount">-${discount}%</span>` : ''}
        ${p.storeVerified ? `<span class="pc-verified">✓</span>` : ''}
      </div>
      <div class="pc-body">
        <div class="pc-store">🏪 ${p.storeName}</div>
        <div class="pc-name">${p.name}</div>
        <div class="pc-rating">
          ${p.totalReviews > 0
            ? `<span class="stars">${renderStars(p.rating)}</span>
               <span class="pc-rc">${p.rating.toFixed(1)} (${p.totalReviews})</span>`
            : `<span style="font-size:11px;color:var(--muted)">Pas encore d'avis</span>`}
        </div>
        <div class="pc-price">
          <span class="pc-price-main">${fmt.price(p.price)}</span>
          ${p.comparePrice > p.price ? `<span class="pc-price-old">${fmt.price(p.comparePrice)}</span>` : ''}
        </div>
        <div class="pc-actions">
          <button class="btn-cart" onclick="event.stopPropagation();AM.cart.add('${p.id}')">
            + Ajouter
          </button>
          <button class="btn-wa" onclick="event.stopPropagation();AM.shareWA('${p.id}')" title="Partager">💬</button>
        </div>
        <div class="pc-delivery">🚚 ${p.deliveryInfo || 'Livraison disponible'}</div>
        ${p.stock > 0 && p.stock <= 10
          ? `<div class="pc-stock">⚠ Plus que ${p.stock} en stock</div>` : ''}
      </div>
    </div>`;
  }

  function renderStoreCard(s) {
    return `
    <div class="store-card" onclick="location.href='pages/store.html?slug=${s.slug}'">
      <div class="sc-banner" style="background:${s.bannerColor || 'var(--dark-2)'}">
        <div class="sc-logo">${s.logo
          ? `<img src="${s.logo}" alt="${s.name}">`
          : `<span>${s.emoji || '🏪'}</span>`}</div>
      </div>
      <div class="sc-body">
        <div class="sc-name">${s.name} ${s.verified ? '<span class="sc-check">✓</span>' : ''}</div>
        <div class="sc-tag">${s.tagline || ''}</div>
        <div class="sc-meta">
          <span><strong>${s.totalProducts}</strong> Produits</span>
          ${s.totalSales > 0 ? `<span>·</span><span><strong>${s.totalSales}</strong> Ventes</span>` : ''}
          ${s.totalReviews > 0 ? `<span>·</span><span>⭐ <strong>${s.rating.toFixed(1)}</strong></span>` : ''}
        </div>
      </div>
      <div class="sc-footer">
        <a href="pages/store.html?slug=${s.slug}" onclick="event.stopPropagation()">Visiter →</a>
        <button class="btn-follow" onclick="event.stopPropagation();AM.followStore('${s.id}',this)">Suivre</button>
      </div>
    </div>`;
  }

  function renderStars(r) {
    return [1,2,3,4,5].map(i =>
      `<span style="color:${i <= Math.round(r) ? 'var(--gold-light)' : '#DDD'}">★</span>`
    ).join('');
  }

  function renderSkeleton(n) {
    return Array(n).fill(`
      <div class="skeleton-card">
        <div class="skeleton" style="height:180px;border-radius:var(--r) var(--r) 0 0"></div>
        <div style="padding:12px;display:flex;flex-direction:column;gap:8px">
          <div class="skeleton" style="height:12px;width:60%;border-radius:4px"></div>
          <div class="skeleton" style="height:14px;width:90%;border-radius:4px"></div>
          <div class="skeleton" style="height:18px;width:40%;border-radius:4px"></div>
        </div>
      </div>`).join('');
  }

  function emptyState(icon, title, desc) {
    return `<div class="empty" style="grid-column:1/-1">
      <div class="empty-icon">${icon}</div>
      <h3>${title}</h3><p>${desc}</p>
    </div>`;
  }

  function errorState(msg, retry) {
    const id = 'err_' + Date.now();
    window['_retry_' + id] = retry;
    return `<div class="empty" style="grid-column:1/-1">
      <div class="empty-icon">⚠️</div>
      <h3>Erreur de chargement</h3>
      <p>${msg}</p>
      <button class="btn btn-secondary btn-sm" onclick="window['_retry_${id}']()">Réessayer</button>
    </div>`;
  }

  /* ── FORMAT ──────────────────────────────────────────────*/
  const fmt = {
    price:  n => '₣\u202F' + Math.round(n).toLocaleString('fr-FR'),
    number: n => n >= 1000000 ? (n/1000000).toFixed(1)+'M'
                : n >= 1000 ? (n/1000).toFixed(1)+'k'
                : n.toString(),
    pad:    n => String(n).padStart(2,'0'),
    slug:   s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''),
  };

  /* ── TOAST ───────────────────────────────────────────────*/
  function toast(msg, type = '', duration = 2400) {
    let el = document.getElementById('am-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'am-toast'; el.className = 'toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.className = 'toast ' + type;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('show'), duration);
  }

  /* ── MODALS ──────────────────────────────────────────────*/
  function openModal(id)  { document.getElementById(id)?.classList.add('open'); }
  function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }
  function closeOnBg(e, id) { if (e.target.id === id) closeModal(id); }

  /* ── CART SIDEBAR ────────────────────────────────────────*/
  function toggleCart() { document.getElementById('cartOverlay')?.classList.toggle('open'); }

  /* ── WHATSAPP SHARE ──────────────────────────────────────*/
  function shareWA(productId) {
    const item = local.cart.find(i => i.id === productId);
    const name = item?.name || 'ce produit';
    const text = encodeURIComponent(
      `🛒 Découvrez ${name} sur AfriMarket !\n🔗 ${location.origin}/pages/product.html?id=${productId}\n\n🌍 La marketplace panafricaine`
    );
    window.open('https://wa.me/?text=' + text, '_blank');
  }

  /* ── FOLLOW STORE ────────────────────────────────────────*/
  function followStore(storeId, btn) {
    if (!auth.isLogged()) { openModal('authModal'); return; }
    btn.classList.toggle('following');
    btn.textContent = btn.classList.contains('following') ? 'Suivi ✓' : 'Suivre';
    const action = btn.classList.contains('following') ? 'follow' : 'unfollow';
    post(`/stores/${storeId}/${action}`, {}, true).catch(() => {});
  }

  /* ── OPEN PRODUCT ────────────────────────────────────────*/
  function openProduct(id) { location.href = 'pages/product.html?id=' + id; }

  /* ── COUNTDOWN ───────────────────────────────────────────*/
  function startCountdown(targetH = 23, targetM = 59, targetS = 59) {
    function tick() {
      const now = new Date();
      const end = new Date(); end.setHours(targetH, targetM, targetS, 0);
      const d = Math.max(0, end - now);
      const h = Math.floor(d / 3600000);
      const m = Math.floor((d % 3600000) / 60000);
      const s = Math.floor((d % 60000) / 1000);
      const fh = document.getElementById('cd-h');
      const fm = document.getElementById('cd-m');
      const fs = document.getElementById('cd-s');
      if (fh) fh.textContent = fmt.pad(h);
      if (fm) fm.textContent = fmt.pad(m);
      if (fs) fs.textContent = fmt.pad(s);
    }
    tick(); return setInterval(tick, 1000);
  }

  /* ── SKELETON CSS (injecté une fois) ─────────────────────*/
  function injectSkeletonCSS() {
    if (document.getElementById('am-skeleton-css')) return;
    const s = document.createElement('style');
    s.id = 'am-skeleton-css';
    s.textContent = `
      .skeleton {
        background: linear-gradient(90deg, var(--light) 0%, var(--border) 50%, var(--light) 100%);
        background-size: 200% 100%; animation: skAnim 1.4s ease infinite;
      }
      @keyframes skAnim { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
    `;
    document.head.appendChild(s);
  }

  /* ── INIT ────────────────────────────────────────────────*/
  function init() {
    injectSkeletonCSS();
    updateCartUI();
    updateUserUI();
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
        document.getElementById('cartOverlay')?.classList.remove('open');
      }
    });
  }

  /* ── PUBLIC API ──────────────────────────────────────────*/
  return {
    API, http, get, post, put, patch, del,
    auth, products, stores, stats, cart,
    fmt, toast, openModal, closeModal, closeOnBg,
    toggleCart, shareWA, followStore, openProduct,
    startCountdown, renderStars, renderProductCard, renderStoreCard,
    init,
  };

})();

document.readyState === 'loading'
  ? document.addEventListener('DOMContentLoaded', AM.init)
  : AM.init();
