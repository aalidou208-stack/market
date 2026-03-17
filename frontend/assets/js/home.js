/* frontend/assets/js/home.js */

let currentPage   = 1;
let currentCat    = '';
let currentSort   = 'newest';
let hasMore       = false;

/* ── Chargement initial ───────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  AM.stats.render('heroStats');
  await loadProducts();
  AM.stores.render('storesGrid', { limit: 4, status: 'active', sort: 'rating' });
  AM.startCountdown();
});

/* ── Produits ─────────────────────────────────────────────── */
async function loadProducts(reset = true) {
  if (reset) { currentPage = 1; }
  const el = document.getElementById('productsGrid');
  if (!el) return;
  if (reset) el.innerHTML = renderSkeletons(5);

  try {
    const params = { page: currentPage, limit: 10, sort: currentSort };
    if (currentCat) params.category = currentCat;

    const { data, total, pages } = await AM.products.list(params);

    if (!data || data.length === 0) {
      el.innerHTML = `<div class="empty" style="grid-column:1/-1">
        <div class="empty-icon">📦</div>
        <h3>Aucun produit disponible</h3>
        <p>Soyez le premier à publier dans cette catégorie.<br>
           <a href="pages/seller-register.html" style="color:var(--green)">Devenir vendeur →</a></p>
      </div>`;
      document.getElementById('productCount').textContent = '';
      document.getElementById('loadMoreWrap').style.display = 'none';
      return;
    }

    const cards = data.map(AM.renderProductCard).join('');
    if (reset) el.innerHTML = cards;
    else el.insertAdjacentHTML('beforeend', cards);

    document.getElementById('productCount').textContent =
      total + ' produit' + (total > 1 ? 's' : '') + ' trouvé' + (total > 1 ? 's' : '');

    hasMore = currentPage < pages;
    const lm = document.getElementById('loadMoreWrap');
    if (lm) lm.style.display = hasMore ? 'block' : 'none';

  } catch (err) {
    el.innerHTML = `<div class="empty" style="grid-column:1/-1">
      <div class="empty-icon">⚠️</div>
      <h3>Erreur de chargement</h3>
      <p>${err.message || 'Vérifiez votre connexion au serveur.'}</p>
      <button class="btn btn-secondary btn-sm" onclick="loadProducts()">Réessayer</button>
    </div>`;
  }
}

function renderSkeletons(n) {
  return Array(n).fill(`
    <div style="background:var(--white);border-radius:var(--r-lg);border:1px solid var(--border);overflow:hidden">
      <div class="skeleton" style="height:180px"></div>
      <div style="padding:12px;display:flex;flex-direction:column;gap:8px">
        <div class="skeleton" style="height:11px;width:55%;border-radius:4px"></div>
        <div class="skeleton" style="height:14px;width:88%;border-radius:4px"></div>
        <div class="skeleton" style="height:18px;width:38%;border-radius:4px"></div>
        <div class="skeleton" style="height:32px;border-radius:var(--r)"></div>
      </div>
    </div>`).join('');
}

function filterProducts(cat, btn) {
  currentCat = cat;
  document.querySelectorAll('.ftab').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  loadProducts(true);
}

function sortProducts(sort) {
  currentSort = sort;
  loadProducts(true);
}

function loadMoreProducts() {
  if (!hasMore) return;
  currentPage++;
  loadProducts(false);
}

/* ── Recherche ────────────────────────────────────────────── */
function doSearch() {
  const q   = document.getElementById('searchQ')?.value.trim();
  const cat = document.getElementById('searchCat')?.value;
  if (!q && !cat) return;
  const params = new URLSearchParams();
  if (q)   params.set('q', q);
  if (cat) params.set('cat', cat);
  location.href = 'pages/category.html?' + params.toString();
}

document.getElementById('searchQ')?.addEventListener('keydown', e => {
  if (e.key === 'Enter') doSearch();
});

/* ── Auth Modal ───────────────────────────────────────────── */
function switchTab(tab, btn) {
  document.querySelectorAll('#authModal .tab-btn').forEach(b => b.classList.remove('active'));
  btn?.classList.add('active');
  document.getElementById('tab-login').style.display    = tab === 'login'    ? 'block' : 'none';
  document.getElementById('tab-register').style.display = tab === 'register' ? 'block' : 'none';
}

async function doLogin() {
  const id  = document.getElementById('loginId')?.value.trim();
  const pwd = document.getElementById('loginPwd')?.value;
  const err = document.getElementById('loginError');
  if (!id || !pwd) { showError(err, 'Veuillez remplir tous les champs.'); return; }
  try {
    await AM.auth.login(id, pwd);
    AM.closeModal('authModal');
    AM.toast('✓ Connecté avec succès', 'success');
  } catch (e) {
    showError(err, e.message || 'Identifiants incorrects.');
  }
}

async function doRegister() {
  const first   = document.getElementById('regFirst')?.value.trim();
  const last    = document.getElementById('regLast')?.value.trim();
  const email   = document.getElementById('regEmail')?.value.trim();
  const phone   = document.getElementById('regPhone')?.value.trim();
  const country = document.getElementById('regCountry')?.value;
  const pwd     = document.getElementById('regPwd')?.value;
  const err     = document.getElementById('regError');
  if (!first || !last || !email || !phone || !pwd) {
    showError(err, 'Veuillez remplir tous les champs obligatoires.'); return;
  }
  if (pwd.length < 8) { showError(err, 'Mot de passe : 8 caractères minimum.'); return; }
  try {
    await AM.auth.register({ firstName: first, lastName: last, email, phone, country, password: pwd });
    AM.closeModal('authModal');
    AM.toast('✓ Compte créé ! Vérifiez votre email.', 'success');
  } catch (e) {
    showError(err, e.message || 'Erreur lors de l\'inscription.');
  }
}

function showError(el, msg) {
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 5000);
}

/* ── Paiement sélection ───────────────────────────────────── */
function selectPay(el) {
  document.querySelectorAll('.pay-m').forEach(m => m.classList.remove('active'));
  el.classList.add('active');
}
