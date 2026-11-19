# Buna and Cake - Coffee and Cake Shop

Complete responsive coffee and cake shop website with public menu and secure Firebase admin.

Warm cream, brown and orange editorial design. Public menu reads live from Firestore, so edits in admin appear instantly without reuploading files.

## Features
- Public menu at index.html: hero, filter by category, search, responsive grid
- Admin at admin.html: email/password login, add, edit, delete products (name, price, image, description, category)
- Firebase Auth + Firestore, placeholder config, sample products
- Firestore rules: public read, signed-in write only
- Runs as static site, deploy to Firebase Hosting, Netlify, Vercel or GitHub Pages

## Project structure
- index.html - public site
- admin.html - admin login and product CRUD
- style.css - warm cream/brown/orange responsive styling
- js/app.js - public menu, loads products from Firestore, falls back to samples
- js/admin.js - auth and CRUD
- js/firebase-config.js - your Firebase config (placeholder)
- firestore.rules - security rules
- scripts/seed.js - seed sample products with Admin SDK
- samples/products.json - sample data

## Firebase setup (10 minutes)

1. Go to https://console.firebase.google.com and create a project, e.g. coffee-cake-shop
2. In the project, enable Authentication: Build > Authentication > Get started > Sign-in method > Email/Password > Enable
3. Enable Firestore: Build > Firestore Database > Create database > Production mode, choose region
4. Create a Web App: Project settings > Your apps > Web app (</>) > name it "shop-web" > Register
5. Copy the firebaseConfig values into js/firebase-config.js (replace placeholders)
6. Deploy rules: Firebase CLI > firebase login, then firebase deploy --only firestore:rules
   Or paste firestore.rules into Firestore > Rules in the console and Publish
7. Create admin user: Authentication > Users > Add user with email and password
8. Optional: set ADMIN_EMAILS in js/firebase-config.js to your admin email for extra UI allowlist (rules still enforce signed-in)
9. Seed samples: npm i firebase-admin, download service account key, set GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json, run node scripts/seed.js
   Or manually add documents to Firestore > products collection with fields name, price, category, image, description

Product document shape in Firestore collection "products":
- name: string (required)
- price: number (required, in Birr)
- category: string (Coffee, Cake, etc)
- image: string (URL)
- description: string
- createdAt, updatedAt: timestamp (auto)

## Run locally
Option A: open index.html directly (samples show until Firebase is configured)
Option B: npx serve . then open http://localhost:3000
Admin: http://localhost:3000/admin.html

## Deploy (easy options)

Firebase Hosting (recommended, keeps everything together):
  npm i -g firebase-tools
  firebase login
  firebase init hosting (or use included firebase.json)
  firebase deploy

Netlify: drag the project folder onto Netlify Drop, or connect the repo. No build command needed. Publish directory is the project root.

Vercel: vercel deploy, or import repo. No build command needed.

GitHub Pages: push to a repo, Settings > Pages > Deploy from branch, root folder.

After deploy, update js/firebase-config.js if your Firebase project changes, no other code changes needed.

## Test
npm test
npm run build

## Notes
- No real Firebase credentials are included. Replace placeholders before going live.
- Image field is a URL. For uploads, add Firebase Storage later and use the download URL as the image value.
- Prices are shown in Ethiopian Birr (Br). Change formatPrice in js/app.js if you use another currency.
