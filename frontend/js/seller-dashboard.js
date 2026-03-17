/**
 * AFRIMARKET — Seller Dashboard
 */

// ─── Auth check ───
if (!API.isAuthenticated()) {
  window.location.href = 'seller-register.html';
}

// ─── Tab Navigation ───
function switchTab(tabName) {
  document.querySelectorAll('[id^="tab-"]').forEach(t => t.classList.add('hidden'));
  const target = document.getElementById(`tab-${tabName}`);
  if (target) target.classList.remove('hidden');

  document.querySelectorAll('.sidebar-nav a').forEach(a => {
    a.classList.toggle('active', a.dataset.tab === tabName);
  });

  // Load data for tab
  switch (tabName) {
    case 'orders': loadOrders(); break;
    case 'products': loadProducts(); break;
    case 'payments': loadPayments(); break;
  }
}

document.querySelectorAll('.sidebar-nav a').forEach(a => {
  a.addEventListener('click', (e) => {
    e.preventDefault();
    switchTab(a.dataset.tab);
  });
});

// ─── Dashboard date ───
document.getElementById('dashboardDate').textContent = new Date().toLocaleDateString('fr-FR', {
  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
});

// ─── Load Dashboard Data ───
(async function loadDashboard() {
  try {
    const data = await API.getSellerDashboard();

    // Seller info
    document.getElementById('sellerName').textContent = data.shop_name || data.full_name || '—';

    // Status alert
    const alertEl = document.getElementById('statusAlert');
    if (data.status === 'pending') {
      alertEl.className = 'alert alert-warning mb-3';
      alertEl.innerHTML = '<span>⏳</span><div><strong>Votre boutique est en cours de vérification</strong><br>Délai estimé : 24–48h. Vous recevrez un SMS de confirmation.</div>';
    } else if (data.status === 'approved') {
      alertEl.className = 'alert alert-success mb-3';
      alertEl.innerHTML = '<span>✅</span><div><strong>Boutique approuvée</strong> — Vous pouvez commencer à ajouter vos produits !</div>';
    } else if (data.status === 'rejected') {
      alertEl.className = 'alert alert-danger mb-3';
      alertEl.innerHTML = `<span>❌</span><div><strong>Demande refusée</strong><br>${data.rejection_reason || 'Contactez le support pour plus d\'informations.'}</div>`;
    }

    // Stats
    document.getElementById('statRevenue').textContent = formatCFA(data.total_revenue || 0);
    document.getElementById('statOrderCount').textContent = (data.order_count || 0).toString();
    document.getElementById('statProductCount').textContent = (data.product_count || 0).toString();
    document.getElementById('statBalance').textContent = formatCFA(data.available_balance || 0);

    // Recent orders
    if (data.recent_orders && data.recent_orders.length > 0) {
      document.getElementById('recentOrdersContent').innerHTML = `
        <table>
          <thead>
            <tr><th>N°</th><th>Client</th><th>Montant</th><th>Statut</th><th>Date</th></tr>
          </thead>
          <tbody>
            ${data.recent_orders.map(o => `
              <tr>
                <td><strong>#${o.order_number}</strong></td>
                <td>${o.customer_name}</td>
                <td>${formatCFA(o.amount)}</td>
                <td>${statusBadge(o.status)}</td>
                <td>${formatDate(o.created_at)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }
    // If no orders → empty state stays visible (default HTML)

    // Settings
    if (data.shop_name) document.getElementById('settShopName').value = data.shop_name;
    if (data.shop_description) document.getElementById('settShopDesc').value = data.shop_description;
    if (data.momo_provider) document.getElementById('settMomoProvider').value = data.momo_provider;
    if (data.momo_number) document.getElementById('settMomoNumber').value = data.momo_number;

  } catch (err) {
    console.error('Dashboard load error:', err);
    if (err.status === 401) {
      window.location.href = 'seller-register.html';
    }
  }
})();

// ─── Orders ───
async function loadOrders() {
  const filter = document.getElementById('orderFilter')?.value;
  const params = filter ? `?status=${filter}` : '';

  try {
    const res = await API.getSellerOrders(params);
    const orders = res.orders || res || [];
    const tbody = document.getElementById('ordersTableBody');
    const empty = document.getElementById('ordersEmpty');

    if (orders.length === 0) {
      tbody.innerHTML = '';
      empty.classList.remove('hidden');
      return;
    }

    empty.classList.add('hidden');
    tbody.innerHTML = orders.map(o => `
      <tr>
        <td><strong>#${o.order_number}</strong></td>
        <td>${o.customer_name}<br><span class="text-xs text-muted">${o.customer_phone || ''}</span></td>
        <td>${o.product_name || '—'}</td>
        <td>${formatCFA(o.amount)}</td>
        <td>${statusBadge(o.status)}</td>
        <td>${formatDate(o.created_at)}</td>
        <td>
          ${o.status === 'pending' ? `<button class="btn btn-sm btn-success" onclick="updateOrder('${o.id}','confirmed')">Confirmer</button>` : ''}
          ${o.status === 'confirmed' ? `<button class="btn btn-sm btn-primary" onclick="updateOrder('${o.id}','shipped')">Expédier</button>` : ''}
        </td>
      </tr>
    `).join('');
  } catch (err) {
    Toast.error('Erreur lors du chargement des commandes');
  }
}

// ─── Products ───
async function loadProducts() {
  try {
    const res = await API.getSellerProducts();
    const products = res.products || res || [];
    const grid = document.getElementById('myProductsGrid');
    const empty = document.getElementById('productsEmpty');

    if (products.length === 0) {
      grid.innerHTML = '';
      empty.classList.remove('hidden');
      return;
    }

    empty.classList.add('hidden');
    grid.innerHTML = products.map(p => `
      <div class="card product-card">
        <div class="product-image">
          <img src="${p.images?.[0] || 'https://via.placeholder.com/300?text=Produit'}" alt="${p.name}">
          ${!p.is_active ? '<span class="product-badge" style="background:var(--gray-500)">Inactif</span>' : ''}
        </div>
        <div class="card-body">
          <div class="product-name">${p.name}</div>
          <div class="product-price">
            <span class="current">${formatCFA(p.price)}</span>
          </div>
          <div class="flex gap-1 mt-2">
            <button class="btn btn-sm btn-outline" onclick="editProduct('${p.id}')">Modifier</button>
            <button class="btn btn-sm btn-ghost text-danger" onclick="deleteProduct('${p.id}')">Supprimer</button>
          </div>
        </div>
      </div>
    `).join('');
  } catch (err) {
    Toast.error('Erreur lors du chargement des produits');
  }
}

// ─── Payments ───
async function loadPayments() {
  try {
    const res = await API.getSellerPayments();
    const payments = res.transactions || res || [];

    document.getElementById('payBalance').textContent = formatCFA(res.available_balance || 0);
    document.getElementById('payPending').textContent = formatCFA(res.pending_amount || 0);
    document.getElementById('payWithdrawn').textContent = formatCFA(res.total_withdrawn || 0);

    const tbody = document.getElementById('paymentsTableBody');
    const empty = document.getElementById('paymentsEmpty');

    if (!payments || payments.length === 0) {
      tbody.innerHTML = '';
      empty.classList.remove('hidden');
      return;
    }

    empty.classList.add('hidden');
    tbody.innerHTML = payments.map(t => `
      <tr>
        <td>${formatDateTime(t.created_at)}</td>
        <td>${t.type === 'credit' ? '💰 Vente' : '📤 Retrait'}</td>
        <td class="${t.type === 'credit' ? 'text-success' : ''} font-bold">
          ${t.type === 'credit' ? '+' : '-'}${formatCFA(t.amount)}
        </td>
        <td>${statusBadge(t.status)}</td>
        <td class="text-muted text-sm">${t.reference || '—'}</td>
      </tr>
    `).join('');
  } catch (err) {
    Toast.error('Erreur lors du chargement des paiements');
  }
}

// ─── Helpers ───
function statusBadge(status) {
  const map = {
    pending: ['badge-warning', 'En attente'],
    confirmed: ['badge-info', 'Confirmée'],
    shipped: ['badge-info', 'Expédiée'],
    delivered: ['badge-success', 'Livrée'],
    cancelled: ['badge-danger', 'Annulée'],
    completed: ['badge-success', 'Complété'],
    paid: ['badge-success', 'Payé'],
    processing: ['badge-warning', 'En cours'],
  };
  const [cls, label] = map[status] || ['badge-gray', status];
  return `<span class="badge ${cls}">${label}</span>`;
}

function openAddProduct() {
  Toast.info('Fonctionnalité à venir — formulaire d\'ajout de produit');
}

function editProduct(id) {
  Toast.info('Modification du produit ' + id);
}

async function deleteProduct(id) {
  if (!confirm('Supprimer ce produit ?')) return;
  try {
    await API.deleteProduct(id);
    Toast.success('Produit supprimé');
    loadProducts();
  } catch (err) {
    Toast.error('Erreur lors de la suppression');
  }
}

async function updateOrder(id, status) {
  try {
    await API.put(`/sellers/orders/${id}`, { status });
    Toast.success('Commande mise à jour');
    loadOrders();
  } catch (err) {
    Toast.error('Erreur lors de la mise à jour');
  }
}

async function saveSettings() {
  try {
    await API.updateSellerProfile({
      shop_name: document.getElementById('settShopName').value,
      shop_description: document.getElementById('settShopDesc').value,
      momo_provider: document.getElementById('settMomoProvider').value,
      momo_number: document.getElementById('settMomoNumber').value,
    });
    Toast.success('Paramètres enregistrés');
  } catch (err) {
    Toast.error('Erreur lors de la sauvegarde');
  }
}

function requestWithdrawal() {
  Toast.info('Fonctionnalité de retrait à venir');
}

function logout() {
  API.clearToken();
  window.location.href = '../index.html';
}