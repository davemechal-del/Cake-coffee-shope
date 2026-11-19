const TOKEN_KEY = 'buna_admin_token';

const loginBox = document.getElementById('loginBox');
const adminPanel = document.getElementById('adminPanel');
const form = document.getElementById('productForm');
const list = document.getElementById('adminList');
const msg = document.getElementById('msg');
const imageFileInput = document.getElementById('imageFile');
const imagePreviewWrap = document.getElementById('imagePreviewWrap');
const imagePreview = document.getElementById('imagePreview');
const clearImageBtn = document.getElementById('clearImageBtn');

let editingId = null;
let currentImageUrl = '';
let selectedFile = null;
let previewObjectUrl = '';

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

function setImagePreview(src) {
  if (previewObjectUrl) {
    URL.revokeObjectURL(previewObjectUrl);
    previewObjectUrl = '';
  }
  if (src) {
    imagePreview.src = src;
    imagePreviewWrap.style.display = 'flex';
  } else {
    imagePreview.removeAttribute('src');
    imagePreviewWrap.style.display = 'none';
  }
}

function resetFormState() {
  form.reset();
  editingId = null;
  currentImageUrl = '';
  selectedFile = null;
  setImagePreview('');
  document.getElementById('formTitle').textContent = 'Add product';
  document.getElementById('submitBtn').textContent = 'Add Product';
}

imageFileInput.addEventListener('change', () => {
  const file = imageFileInput.files?.[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) {
    msg.textContent = 'Image file is too large (max 5 MB).';
    imageFileInput.value = '';
    return;
  }
  selectedFile = file;
  if (previewObjectUrl) {
    URL.revokeObjectURL(previewObjectUrl);
  }
  previewObjectUrl = URL.createObjectURL(file);
  imagePreview.src = previewObjectUrl;
  imagePreviewWrap.style.display = 'flex';
  msg.textContent = '';
});

clearImageBtn.addEventListener('click', () => {
  selectedFile = null;
  currentImageUrl = '';
  imageFileInput.value = '';
  setImagePreview('');
});

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
  resetFormState();
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
        <img src="${escapeHtml(p.image || 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=600&q=80')}" alt="">
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
  selectedFile = null;
  imageFileInput.value = '';
  currentImageUrl = p.image || '';
  document.getElementById('name').value = p.name || '';
  document.getElementById('price').value = p.price ?? '';
  document.getElementById('category').value = p.category || '';
  document.getElementById('description').value = p.description || '';
  setImagePreview(currentImageUrl);
  document.getElementById('formTitle').textContent = 'Edit product';
  document.getElementById('submitBtn').textContent = 'Update Product';
  window.scrollTo({top: 0, behavior: 'smooth'});
}

async function uploadSelectedImage(file) {
  const res = await fetch('/api/upload', {
    method: 'POST',
    headers: {
      'Content-Type': file.type || 'image/jpeg',
      Authorization: `Bearer ${getToken()}`,
    },
    body: file,
  });
  if (res.status === 401) {
    setToken('');
    show(false);
    throw new Error('Session expired. Please sign in again.');
  }
  const data = await readJsonSafe(res);
  if (!res.ok || !data.url) {
    throw new Error(data.error || `Image upload failed (HTTP ${res.status})`);
  }
  return data.url;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const submitBtn = document.getElementById('submitBtn');
  const name = document.getElementById('name').value.trim();
  const price = Number(document.getElementById('price').value);
  const category = document.getElementById('category').value.trim() || 'Menu';
  const description = document.getElementById('description').value.trim();

  if (!name || Number.isNaN(price)) {
    msg.textContent = 'Name and price required';
    return;
  }

  submitBtn.disabled = true;
  try {
    let image = currentImageUrl;
    if (selectedFile) {
      msg.textContent = 'Uploading image...';
      image = await uploadSelectedImage(selectedFile);
    }

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
      body: JSON.stringify({name, price, category, image, description}),
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
    resetFormState();
    loadProducts();
  } catch (err) {
    msg.textContent = err.message;
  } finally {
    submitBtn.disabled = false;
  }
});

document.getElementById('cancelBtn').onclick = () => {
  resetFormState();
  msg.textContent = '';
};

checkSession();
