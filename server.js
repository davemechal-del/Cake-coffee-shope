import crypto from 'crypto';
import express from 'express';
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'admin@example.com').trim().toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  crypto.createHash('sha256').update(`${ADMIN_EMAIL}:${ADMIN_PASSWORD}:buna-cake`).digest('hex');

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, 'data');
const PRODUCTS_FILE = path.join(DATA_DIR, 'products.json');
const SAMPLES_FILE = path.join(__dirname, 'samples', 'products.json');

function ensureProductsFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, {recursive: true});
  }
  if (!fs.existsSync(PRODUCTS_FILE)) {
    let initial = [];
    if (fs.existsSync(SAMPLES_FILE)) {
      const raw = JSON.parse(fs.readFileSync(SAMPLES_FILE, 'utf8'));
      const now = Date.now();
      initial = raw.map((item, idx) => ({
        id: crypto.randomUUID(),
        name: String(item.name || ''),
        price: Number(item.price || 0),
        category: String(item.category || 'Menu'),
        image: String(item.image || ''),
        description: String(item.description || ''),
        createdAt: new Date(now - idx * 1000).toISOString(),
        updatedAt: new Date(now - idx * 1000).toISOString(),
      }));
    }
    fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(initial, null, 2), 'utf8');
  }
}

function readProducts() {
  ensureProductsFile();
  const raw = fs.readFileSync(PRODUCTS_FILE, 'utf8');
  const items = JSON.parse(raw);
  return Array.isArray(items) ? items : [];
}

function writeProducts(products) {
  ensureProductsFile();
  fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(products, null, 2), 'utf8');
}

function signToken(email) {
  const payload = Buffer.from(
    JSON.stringify({
      email,
      exp: Date.now() + 1000 * 60 * 60 * 24 * 7,
    }),
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expectedSig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(payload)
    .digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data?.email || typeof data.exp !== 'number' || data.exp < Date.now()) {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const session = verifyToken(token);
  if (!session) {
    return res.status(401).json({error: 'Unauthorized. Please sign in.'});
  }
  req.user = session;
  next();
}

app.use(express.json());

// Block direct HTTP access to server/project internals and storage
app.use(
  ['/server.js', '/package.json', '/package-lock.json', '/.env', '/.env.example', '/data'],
  (_req, res) => {
    res.status(404).end();
  },
);

// Public health check for Render
app.get('/health', (_req, res) => {
  res.json({ok: true});
});

// Auth endpoints
app.post('/api/login', (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');

  const emailBuf = Buffer.from(email);
  const expectedEmailBuf = Buffer.from(ADMIN_EMAIL);
  const passBuf = Buffer.from(password);
  const expectedPassBuf = Buffer.from(ADMIN_PASSWORD);

  const emailOk =
    emailBuf.length === expectedEmailBuf.length &&
    crypto.timingSafeEqual(emailBuf, expectedEmailBuf);
  const passOk =
    passBuf.length === expectedPassBuf.length &&
    crypto.timingSafeEqual(passBuf, expectedPassBuf);

  if (!emailOk || !passOk) {
    return res.status(401).json({error: 'Invalid email or password.'});
  }

  const token = signToken(email);
  res.json({token, email});
});

app.get('/api/me', requireAuth, (req, res) => {
  res.json({email: req.user.email});
});

// Products API
app.get('/api/products', (_req, res) => {
  try {
    const products = readProducts().sort(
      (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime(),
    );
    res.json({products});
  } catch (err) {
    console.error('Failed to read products:', err);
    res.status(500).json({error: 'Failed to load products.'});
  }
});

app.post('/api/products', requireAuth, (req, res) => {
  const name = String(req.body?.name || '').trim();
  const price = Number(req.body?.price);
  const category = String(req.body?.category || '').trim() || 'Menu';
  const image = String(req.body?.image || '').trim();
  const description = String(req.body?.description || '').trim();

  if (!name || Number.isNaN(price) || price < 0) {
    return res.status(400).json({error: 'Valid product name and price are required.'});
  }

  const now = new Date().toISOString();
  const product = {
    id: crypto.randomUUID(),
    name,
    price,
    category,
    image,
    description,
    createdAt: now,
    updatedAt: now,
  };

  const products = readProducts();
  products.unshift(product);
  writeProducts(products);
  res.status(201).json({product});
});

app.put('/api/products/:id', requireAuth, (req, res) => {
  const {id} = req.params;
  const products = readProducts();
  const index = products.findIndex((p) => p.id === id);
  if (index === -1) {
    return res.status(404).json({error: 'Product not found.'});
  }

  const name = String(req.body?.name || '').trim();
  const price = Number(req.body?.price);
  const category = String(req.body?.category || '').trim() || 'Menu';
  const image = String(req.body?.image || '').trim();
  const description = String(req.body?.description || '').trim();

  if (!name || Number.isNaN(price) || price < 0) {
    return res.status(400).json({error: 'Valid product name and price are required.'});
  }

  const updated = {
    ...products[index],
    name,
    price,
    category,
    image,
    description,
    updatedAt: new Date().toISOString(),
  };

  products[index] = updated;
  writeProducts(products);
  res.json({product: updated});
});

app.delete('/api/products/:id', requireAuth, (req, res) => {
  const {id} = req.params;
  const products = readProducts();
  const next = products.filter((p) => p.id !== id);
  if (next.length === products.length) {
    return res.status(404).json({error: 'Product not found.'});
  }
  writeProducts(next);
  res.json({ok: true});
});

const DIST_DIR = path.join(__dirname, 'dist');
const STATIC_DIR = fs.existsSync(path.join(DIST_DIR, 'index.html')) ? DIST_DIR : __dirname;

app.use(express.static(STATIC_DIR, {dotfiles: 'ignore'}));

app.get('/admin', (_req, res) => {
  res.sendFile(path.join(STATIC_DIR, 'admin.html'));
});

app.use((_req, res) => {
  res.sendFile(path.join(STATIC_DIR, 'index.html'));
});

ensureProductsFile();

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Buna & Cake server running at http://0.0.0.0:${PORT}`);
});
