const SAMPLE = [
  {name:"Espresso", category:"Coffee", price:45, description:"Bold single-origin shot with dark chocolate notes.", image:"https://images.unsplash.com/photo-1510591509098-f4fdc6d0ff04?w=600&q=80"},
  {name:"Caffe Latte", category:"Coffee", price:85, description:"Smooth steamed milk over double espresso, dusted with cocoa.", image:"https://images.unsplash.com/photo-1541167760496-1628856ab772?w=600&q=80"},
  {name:"Cappuccino", category:"Coffee", price:80, description:"Airy foam, balanced roast, warm cinnamon finish.", image:"https://images.unsplash.com/photo-1572442388796-11668a67e53d?w=600&q=80"},
  {name:"Classic Cheesecake", category:"Cake", price:180, description:"Creamy baked cheesecake with vanilla and biscuit base.", image:"https://images.unsplash.com/photo-1533134242443-d4fd215305ad?w=600&q=80"},
  {name:"Chocolate Fudge Cake", category:"Cake", price:220, description:"Rich dark chocolate layers with fudge ganache.", image:"https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=600&q=80"},
  {name:"Carrot Cake", category:"Cake", price:160, description:"Spiced carrot, walnuts, cream cheese frosting.", image:"https://images.unsplash.com/photo-1602351447937-745cb720612f?w=600&q=80"}
];

const grid = document.getElementById('menuGrid');
const filterBar = document.getElementById('filterBar');
const searchInput = document.getElementById('searchInput');
const countEl = document.getElementById('count');
const statusEl = document.getElementById('status');
let products = SAMPLE.slice();
let activeFilter = "All";

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatPrice(p){ return `${Number(p).toLocaleString()} Br`; }

function render(){
  const q = (searchInput?.value || "").toLowerCase().trim();
  const filtered = products.filter(p=>{
    const catOk = activeFilter==="All" || (p.category||"").toLowerCase()===activeFilter.toLowerCase() || (activeFilter==="Coffee" && /coffee|latte|espresso|cappuccino/i.test(p.name)) || (activeFilter==="Cake" && /cake|cheesecake/i.test(p.name));
    const qOk = !q || p.name.toLowerCase().includes(q) || (p.description||"").toLowerCase().includes(q);
    return catOk && qOk;
  });
  countEl.textContent = `${filtered.length} item${filtered.length!==1?'s':''}`;
  grid.innerHTML = filtered.map(p=>`
    <article class="card">
      <div class="thumb"><img src="${escapeHtml(p.image||'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=600&q=80')}" alt="${escapeHtml(p.name)}" loading="lazy"></div>
      <div class="card-body">
        <div class="card-top"><h3>${escapeHtml(p.name)}</h3><span class="price">${formatPrice(p.price)}</span></div>
        <p class="desc">${escapeHtml(p.description||'')}</p>
        <span class="tag">${escapeHtml(p.category||'Menu')}</span>
      </div>
    </article>`).join('') || `<p class="empty">No items found. Try another search.</p>`;
}

function buildFilters(){
  const cats = ["All", ...new Set(products.map(p=>p.category).filter(Boolean))];
  filterBar.innerHTML = cats.map(c=>`<button class="${c===activeFilter?'active':''}" data-filter="${escapeHtml(c)}">${escapeHtml(c)}</button>`).join('');
  filterBar.querySelectorAll('button').forEach(b=>b.onclick=()=>{activeFilter=b.dataset.filter; render(); buildFilters();});
}

async function load(){
  statusEl.textContent = "Loading menu...";
  render(); buildFilters();
  try{
    const res = await fetch('/api/products');
    if(!res.ok) throw new Error('Failed to load menu');
    const text = await res.text();
    const data = text ? JSON.parse(text) : {};
    if(Array.isArray(data.products) && data.products.length){
      products = data.products;
      statusEl.textContent = "Live menu";
    } else {
      products = [];
      statusEl.textContent = "No products yet - add some in Admin";
    }
    render(); buildFilters();
  }catch(err){
    console.error(err);
    statusEl.textContent = "Could not load live menu, showing samples.";
  }
}
searchInput?.addEventListener('input', render);
load();
