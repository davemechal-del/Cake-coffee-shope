import crypto from 'crypto';
import express from 'express';
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';
import {
  createProduct,
  deleteProduct,
  getDatabaseType,
  initDb,
  listProducts,
  updateProduct,
  verifyAdminCredentials,
} from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'admin@example.com').trim().toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  crypto.createHash('sha256').update(`${ADMIN_EMAIL}:${ADMIN_PASSWORD}:buna-cake`).digest('hex');

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
  ['/server.js', '/db.js', '/package.json', '/package-lock.json', '/.env', '/.env.example', '/data'],
  (_req, res) => {
    res.status(404).end();
  },
);

// Public health check for Render
app.get('/health', (_req, res) => {
  res.json({ok: true, db: getDatabaseType()});
});

// Auth endpoints
app.post('/api/login', async (req, res, next) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    const valid = await verifyAdminCredentials(email, password);
    if (!valid) {
      return res.status(401).json({error: 'Invalid email or password.'});
    }

    const token = signToken(email);
    res.json({token, email});
  } catch (err) {
    next(err);
  }
});

app.get('/api/me', requireAuth, (req, res) => {
  res.json({email: req.user.email});
});

// Products API
app.get('/api/products', async (_req, res, next) => {
  try {
    const products = await listProducts();
    res.json({products});
  } catch (err) {
    next(err);
  }
});

app.post('/api/products', requireAuth, async (req, res, next) => {
  try {
    const name = String(req.body?.name || '').trim();
    const price = Number(req.body?.price);
    const category = String(req.body?.category || '').trim() || 'Menu';
    const image = String(req.body?.image || '').trim();
    const description = String(req.body?.description || '').trim();

    if (!name || Number.isNaN(price) || price < 0) {
      return res.status(400).json({error: 'Valid product name and price are required.'});
    }

    const product = await createProduct({name, price, category, image, description});
    res.status(201).json({product});
  } catch (err) {
    next(err);
  }
});

app.put('/api/products/:id', requireAuth, async (req, res, next) => {
  try {
    const {id} = req.params;
    const name = String(req.body?.name || '').trim();
    const price = Number(req.body?.price);
    const category = String(req.body?.category || '').trim() || 'Menu';
    const image = String(req.body?.image || '').trim();
    const description = String(req.body?.description || '').trim();

    if (!name || Number.isNaN(price) || price < 0) {
      return res.status(400).json({error: 'Valid product name and price are required.'});
    }

    const updated = await updateProduct(id, {name, price, category, image, description});
    if (!updated) {
      return res.status(404).json({error: 'Product not found.'});
    }
    res.json({product: updated});
  } catch (err) {
    next(err);
  }
});

app.delete('/api/products/:id', requireAuth, async (req, res, next) => {
  try {
    const deleted = await deleteProduct(req.params.id);
    if (!deleted) {
      return res.status(404).json({error: 'Product not found.'});
    }
    res.json({ok: true});
  } catch (err) {
    next(err);
  }
});

const DIST_DIR = path.join(__dirname, 'dist');
const STATIC_DIR = fs.existsSync(path.join(DIST_DIR, 'index.html')) ? DIST_DIR : __dirname;

app.use(
  express.static(STATIC_DIR, {
    dotfiles: 'ignore',
    setHeaders: (res) => {
      res.setHeader('Cache-Control', 'no-cache');
    },
  }),
);

app.get('/admin', (_req, res) => {
  res.sendFile(path.join(STATIC_DIR, 'admin.html'));
});

app.use('/api', (err, _req, res, _next) => {
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({error: 'Invalid JSON request body.'});
  }
  console.error('API error:', err);
  res.status(500).json({error: 'Internal server error.'});
});

app.use((_req, res) => {
  res.sendFile(path.join(STATIC_DIR, 'index.html'));
});

await initDb();

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Buna & Cake server running at http://0.0.0.0:${PORT} (db: ${getDatabaseType()})`);
});
