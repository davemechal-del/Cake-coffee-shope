import {readFile} from 'fs/promises';
import assert from 'assert';

const app = await readFile('js/app.js', 'utf8');
assert(app.includes('SAMPLE'), 'sample products missing');
assert(app.includes('/api/products'), 'products API fetch missing');
assert(!app.includes('firebase'), 'unexpected firebase reference in app.js');

const admin = await readFile('js/admin.js', 'utf8');
assert(admin.includes('/api/login'), 'admin login API missing');
assert(admin.includes('/api/products'), 'admin products API missing');
assert(!admin.includes('firebase'), 'unexpected firebase reference in admin.js');

const server = await readFile('server.js', 'utf8');
assert(server.includes('/api/products'), 'server products endpoint missing');
assert(server.includes('/api/login'), 'server login endpoint missing');
assert(server.includes('/api/upload'), 'server upload endpoint missing');
assert(server.includes('/api/images/:id'), 'server image serving endpoint missing');

const db = await readFile('db.js', 'utf8');
assert(db.includes('CREATE TABLE IF NOT EXISTS products'), 'products table DDL missing');
assert(db.includes('CREATE TABLE IF NOT EXISTS admins'), 'admins table DDL missing');
assert(db.includes('CREATE TABLE IF NOT EXISTS images'), 'images table DDL missing');

const adminHtml = await readFile('admin.html', 'utf8');
assert(adminHtml.includes('id="imageFile"') && adminHtml.includes('type="file"'), 'image file input missing');

const html = await readFile('index.html', 'utf8');
assert(html.includes('menuGrid') && html.includes('filterBar'), 'menu hooks missing');

console.log('All smoke tests passed');
