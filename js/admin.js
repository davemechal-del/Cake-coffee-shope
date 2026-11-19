const TOKEN_KEY = 'buna_admin_token';

const loginBox = document.getElementById('loginBox');
const adminPanel = document.getElementById('adminPanel');
const form = document.getElementById('productForm');
const list = document.getElementById('adminList');
const msg = document.getElementById('msg');
let editingId = null;

function getToken() {
  return sessionStorage.getItem(TOKEN_KEY) || '';
}

function setToken(token) {
  if (token) sessionStorage.setItem(TOKEN_KEY, token);
  else sessionStorage.removeItem(TOKEN_KEY);
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function readJsonSafe(res) {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {error: `Server returned a non-JSON response (HTTP ${res.status}).`};
  }
}

function show(authenticated) {
  loginBox.style.display = authenticated ? 'none' : 'block';
  adminPanel.style.display = authenticated ? 'block' : 'none';
  if (authenticated) {
    loadProducts();
  }
}

async function checkSession() {
  const token = getToken();
  if (!token) {
    show(false);
    return;
  }
  try {
    const res = await fetch('/api/me', {
      headers: {Authorization: `Bearer ${token}`},
    });
    if (!res.ok) {
      setToken('');
      show(false);
      return;
    }
    show(true);
  } catch {
    show(false);
  }
}

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  msg.textContent = '';
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({email, password}),
    });
    const data = await readJsonSafe(res);
    if (!res.ok) {
      if (res.status === 404 || res.status === 405) {
        throw new Error(
          `Admin API unavailable (HTTP ${res.status}). On Render, deploy as a Web Service (Start Command: npm start) instead of a Static Site.`,
        );
      }
      throw new Error(data.error || `Login failed (HTTP ${res.status})`);
    }
    if (data.error) {
      throw new Error(
        `${data.error} On Render, make sure this is deployed as a Web Service running "npm start" (not a Static Site).`,
      );
    }
    if (!data.token) {
      throw new Error('Server did not return a session token. Make sure server.js is running.');
    }
    setToken(data.token);
    msg.textContent = 'Logged in';
    show(true);
  } catch (err) {
    msg.textContent = err.message;
  }
});

document.getElementById('logoutBtn').onclick = () => {
  setToken('');
  msg.textContent = 'Logged out';
  show(false);
};

async function loadProducts() {
  try {
    const res = await fetch('/api/products');
    const data = await readJsonSafe(res);
    if (!res.ok) {
      throw new Error(data.error || `Failed to load products (HTTP ${res.status}).`);
    }
    const rows = Array.isArray(data.products) ? data.products : [];
    list.innerHTML =
      rows
        .map(
          (p) => `
      <div class="admin-row">
        <img src="${escapeHtml(p.image || '')}" alt="">
        <div><strong>${escapeHtml(p.name)}</strong><span>${escapeHtml(p.price)} Br - ${escapeHtml(p.category || '')}</span><small>${escapeHtml(p.description || '')}</small></div>
        <div class="actions"><button data-edit="${escapeHtml(p.id)}">Edit</button><button data-del="${escapeHtml(p.id)}" class="danger">Delete</button></div>
      </div>`,
        )
        .join('') || '<p>No products yet.</p>';

    list.querySelectorAll('[data-edit]').forEach((b) => {
      b.onclick = () => edit(rows.find((r) => r.id === b.dataset.edit));
    });
    list.querySelectorAll('[data-del]').forEach((b) => {
      b.onclick = async () => {
        if (b.dataset.confirm !== '1') {
          b.dataset.confirm = '1';
          b.textContent = 'Confirm?';
          setTimeout(() => {
            if (b.isConnected) {
              b.dataset.confirm = '';
              b.textContent = 'Delete';
            }
          }, 3000);
          return;
        }
        const delRes = await fetch(`/api/products/${encodeURIComponent(b.dataset.del)}`, {
          method: 'DELETE',
          headers: {Authorization: `Bearer ${getToken()}`},
        });
        if (delRes.status === 401) {
          setToken('');
          show(false);
          msg.textContent = 'Session expired. Please sign in again.';
          return;
        }
        loadProducts();
      };
    });
  } catch (err) {
    msg.textContent = err.message || 'Could not load products.';
  }
}

function edit(p) {
  if (!p) return;
  editingId = p.id;
  document.getElementById('name').value = p.name || '';
  document.getElementById('price').value = p.price ?? '';
  document.getElementById('category').value = p.category || '';
  document.getElementById('image').value = p.image || '';
  document.getElementById('description').value = p.description || '';
  document.getElementById('submitBtn').textContent = 'Update Product';
  window.scrollTo({top: 0, behavior: 'smooth'});
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = {
    name: document.getElementById('name').value.trim(),
    price: Number(document.getElementById('price').value),
    category: document.getElementById('category').value.trim() || 'Menu',
    image: document.getElementById('image').value.trim(),
    description: document.getElementById('description').value.trim(),
  };
  if (!data.name || Number.isNaN(data.price)) {
    msg.textContent = 'Name and price required';
    return;
  }
  try {
    const url = editingId
      ? `/api/products/${encodeURIComponent(editingId)}`
      : '/api/products';
    const method = editingId ? 'PUT' : 'POST';
    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getToken()}`,
      },
      body: JSON.stringify(data),
    });
    if (res.status === 401) {
      setToken('');
      show(false);
      msg.textContent = 'Session expired. Please sign in again.';
      return;
    }
    const body = await readJsonSafe(res);
    if (!res.ok) {
      throw new Error(body.error || `Request failed (HTTP ${res.status})`);
    }
    msg.textContent = editingId ? 'Updated' : 'Added';
    form.reset();
    editingId = null;
    document.getElementById('submitBtn').textContent = 'Add Product';
    loadProducts();
  } catch (err) {
    msg.textContent = err.message;
  }
});

document.getElementById('cancelBtn').onclick = () => {
  form.reset();
  editingId = null;
  document.getElementById('submitBtn').textContent = 'Add Product';
};

checkSession();
