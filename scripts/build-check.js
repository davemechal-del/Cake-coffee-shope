import {readFile} from 'fs/promises';
import {existsSync} from 'fs';

const required = [
  'index.html',
  'admin.html',
  'style.css',
  'server.js',
  'js/app.js',
  'js/admin.js',
  'samples/products.json',
];
let ok = true;
for (const f of required) {
  const e = existsSync(f);
  console.log((e ? 'OK ' : 'MISSING ') + f);
  if (!e) ok = false;
}
const html = await readFile('index.html', 'utf8');
console.log(html.includes('menuGrid') ? 'OK index contains menuGrid' : 'MISSING menuGrid');
const admin = await readFile('js/admin.js', 'utf8');
console.log(/\/api\/products/.test(admin) ? 'OK admin uses API CRUD' : 'MISSING API CRUD');
const app = await readFile('js/app.js', 'utf8');
console.log(/\/api\/products/.test(app) ? 'OK app reads API' : 'MISSING API read');
const server = await readFile('server.js', 'utf8');
console.log(/\/api\/products/.test(server) && /\/api\/login/.test(server) ? 'OK server exposes API' : 'MISSING server API');
if (!ok) process.exit(1);
console.log('Build check passed');
