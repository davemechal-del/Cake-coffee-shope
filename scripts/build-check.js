import {cp, mkdir, readFile, rm} from 'fs/promises';
import {existsSync} from 'fs';
import path from 'path';

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

// Build publishable dist/ directory for Render
const distDir = path.resolve('dist');
await rm(distDir, {recursive: true, force: true});
await mkdir(path.join(distDir, 'js'), {recursive: true});
await mkdir(path.join(distDir, 'samples'), {recursive: true});

await cp('index.html', path.join(distDir, 'index.html'));
await cp('admin.html', path.join(distDir, 'admin.html'));
await cp('style.css', path.join(distDir, 'style.css'));
await cp(path.join('js', 'app.js'), path.join(distDir, 'js', 'app.js'));
await cp(path.join('js', 'admin.js'), path.join(distDir, 'js', 'admin.js'));
await cp(path.join('samples', 'products.json'), path.join(distDir, 'samples', 'products.json'));

console.log('Built dist/ for Render');
