/* ============================================================
   ঘরের রং (Ghorer Rong) — Data Layer  (data.js)
   Backend: Supabase   |   Google Sheet-এর বদলে এটাই সব চালায়
   ============================================================
   ▶ পণ্য/সেটিংস/কুপন বদলাতে: এই ফাইল নয় — manage.html (admin) ব্যবহার করুন।
   ▶ index.html এই ফাইলের ফাংশনগুলো ডাকে; রিটার্ন শেপ পুরনো Sheet-এর মতোই,
     তাই UI-তে হাত দিতে হয় না।
   ============================================================ */


/* ━━━━━━━━ SUPABASE CONNECTION ━━━━━━━━ */
const SUPABASE_URL      = 'https://ndiiywsmqubuiqesjktx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5kaWl5d3NtcXVidWlxZXNqa3R4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1MDg2NDgsImV4cCI6MjA5OTA4NDY0OH0.2f2-oC3dUCFZFFRKNJ1baTnGkwi-jTH6ZVT58eUwxh4';


/* ━━━━━━━━ CLIENT-SIDE CONFIG (Supabase-এ নেই এমন সামান্য জিনিস) ━━━━━━━━ */
const GR = {
  imageBucket: 'product-images',   // Supabase Storage bucket
  // ── অর্ডার এলে ইমেইল নোটিফিকেশন (EmailJS) — ঐচ্ছিক ──
  // তিনটি খালি থাকলে ইমেইল বন্ধ থাকবে (অর্ডার তবুও সেভ হবে)।
  emailjsPublicKey : '',
  emailjsServiceId : '',
  emailjsTemplateId: '',
  ownerEmail       : ''
};


/* ━━━━━━━━ SUPABASE CLIENT (একবার তৈরি) ━━━━━━━━ */
let _db = null;
function getDB() {
  if (_db) return _db;
  if (window.supabase && window.supabase.createClient) {
    _db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } else {
    console.error('supabase-js লোড হয়নি — <script src="...supabase-js@2"> আগে দিন।');
  }
  return _db;
}


/* ━━━━━━━━ ছোট হেল্পার ━━━━━━━━ */
function _toArr(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string' && v.trim()) {
    try { const a = JSON.parse(v); return Array.isArray(a) ? a : [v]; }
    catch (e) { return v.split(/\s*[|,\n]\s*/).filter(Boolean); }
  }
  return [];
}
const _SOLDOUT = ['soldout','sold out','stockout','stock out','out','out of stock','no stock','nostock'];

/* সাজানোর নিয়ম: ক্রম দেওয়া পণ্য (১,২,৩…) আগে — ছোট থেকে বড়;
   ক্রম 0/খালি মানে সাধারণ — এগুলো সবার শেষে (আগের ক্রম বজায় থাকে)। */
function _sortProducts(arr) {
  return arr
    .map((p, i) => [p, i])
    .sort((A, B) => {
      const a = A[0].sort_order > 0 ? A[0].sort_order : Infinity;
      const b = B[0].sort_order > 0 ? B[0].sort_order : Infinity;
      if (a !== b) return a - b;
      return A[1] - B[1];   // সমান হলে আগের ক্রম রাখো (স্থিতিশীল)
    })
    .map(x => x[0]);
}


/* ============================================================
   ১) SETTINGS  — পুরনো "Settings শিট" (key=value) → object S
   ============================================================ */
async function grLoadSettings() {
  const db = getDB(); if (!db) return {};
  const { data, error } = await db.from('store_config').select('key, value');
  if (error) { console.error('grLoadSettings:', error.message); return {}; }
  const S = {};
  (data || []).forEach(r => { S[r.key] = r.value == null ? '' : String(r.value); });
  return S;
}


/* ============================================================
   ২) COUPONS  — [{code,type,value,min}]
   ============================================================ */
async function grLoadCoupons() {
  const db = getDB(); if (!db) return [];
  const { data, error } = await db.from('coupons').select('code,type,value,min,active');
  if (error) { console.error('grLoadCoupons:', error.message); return []; }
  return (data || [])
    .filter(c => c.active !== false)
    .map(c => ({ code: c.code, type: c.type || 'percent',
                 value: Number(c.value) || 0, min: Number(c.min) || 0 }));
}


/* ============================================================
   ৩) PRODUCTS  — পুরনো loadProducts()-এর হুবহু একই শেপ
   ============================================================ */
function grNormalizeProduct(d) {
  const imgs = _toArr(d.images);
  const image_url = d.image_url || imgs[0] || '';
  const st = String(d.status || 'active').toLowerCase().trim();
  const catArr = _toArr(d.categories);
  return {
    id: String(d.id),
    name: d.name || '',
    category: d.category || catArr[0] || '',
    categories: catArr.length ? catArr : (d.category ? [d.category] : []),
    price: Number(d.price) || 0,
    old_price: Number(d.old_price) || 0,
    images: imgs.length ? imgs : (image_url ? [image_url] : []),
    image_url: image_url,
    videos: _toArr(d.videos),
    description: d.description || '',
    age: (d.age || '').toString().trim(),
    likes: Number(d.likes) || 0,
    battery: (d.battery || '').toString().toLowerCase().trim(),
    battery_size: (d.battery_size || '').toString().trim(),
    status: st,
    sort_order: Number(d.sort_order) || 0,
    bestseller: (d.is_bestseller === true || d.is_bestseller === 'true' || d.is_bestseller === 1),
    soldout: _SOLDOUT.includes(st)
  };
}

async function grLoadProducts() {
  const db = getDB(); if (!db) return [];
  const { data, error } = await db.from('products')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) { console.error('grLoadProducts:', error.message); return []; }
  const list = (data || [])
    .map(grNormalizeProduct)
    .filter(p => p.name && p.status !== 'hidden');
  return _sortProducts(list);
}


/* ============================================================
   ৪) REVIEWS  — অ্যাপ্রুভ করা রিভিউ (নাম, পেশা, পণ্য, রেটিং, লেখা)
   ============================================================ */
async function grLoadReviews() {
  const db = getDB(); if (!db) return [];
  const { data, error } = await db.from('reviews')
    .select('customer_name, profession, product_name, rating, review_text, created_at')
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .limit(60);
  if (error) { console.error('grLoadReviews:', error.message); return []; }
  return (data || []).map(r => ({
    name: r.customer_name || '',
    profession: r.profession || '',
    product: r.product_name || '',
    rating: Number(r.rating) || 5,
    text: r.review_text || '',
    review: r.review_text || '',
    time: r.created_at || ''
  }));
}

/* রিভিউ জমা — সবসময় status='pending' (admin অ্যাপ্রুভ করলে দেখাবে) */
async function grSubmitReview({ name, profession, product, rating, text }) {
  const db = getDB(); if (!db) return 'error';
  const { data, error } = await db.rpc('submit_review', {
    cname: name, prof: profession || '', pname: product || '',
    prating: Number(rating) || 0, ptext: text
  });
  if (error) { console.error('grSubmitReview:', error.message); return 'error'; }
  return data;   // 'ok' | 'bad_rating' | 'missing'
}


/* ============================================================
   ৫) ORDER  — জমা দেওয়া (পড়ার অনুমতি নেই, তাই .select() নয়)
   ============================================================ */
async function grSubmitOrder(orderRow) {
  const db = getDB(); if (!db) throw new Error('Database not connected');
  const { error } = await db.from('orders').insert([orderRow]);
  if (error) throw error;
  return true;
}

/* ট্র্যাকিং — ফোন দিয়ে (নিরাপদ RPC; সীমিত তথ্য) */
async function grTrackByPhone(phone) {
  const db = getDB(); if (!db) return [];
  const { data, error } = await db.rpc('track_by_phone', { pphone: String(phone || '') });
  if (error) { console.error('grTrackByPhone:', error.message); return []; }
  // পুরনো ট্র্যাকিং কোড যেসব key চায় সেভাবে ম্যাপ
  return (data || []).map(o => ({
    order_id: o.order_code || '',
    status: o.status || 'Pending',
    product: o.product_list || '',
    total: o.grand_total != null ? o.grand_total : '',
    delivery_area: o.delivery_area || '',
    payment_status: o.payment_status || '',
    time: o.created_at ? new Date(o.created_at).toLocaleString('en-GB') : ''
  }));
}


/* ============================================================
   ৬) LIKES  — shared count (সবার জন্য এক)
   ============================================================ */
async function grIncLike(id) {
  const db = getDB(); if (!db) return;
  const { error } = await db.rpc('increment_likes', { pid: String(id) });
  if (error) console.error('grIncLike:', error.message);
}
async function grDecLike(id) {
  const db = getDB(); if (!db) return;
  const { error } = await db.rpc('decrement_likes', { pid: String(id) });
  if (error) console.error('grDecLike:', error.message);
}


/* ============================================================
   ৭) EMAIL (ঐচ্ছিক, best-effort) — অর্ডার এলে মালিককে নোটিফিকেশন
   ============================================================ */
function grSendOrderEmail(params) {
  try {
    if (!GR.emailjsPublicKey || !GR.emailjsServiceId || !GR.emailjsTemplateId) return;
    if (!window.emailjs) return;
    window.emailjs.send(GR.emailjsServiceId, GR.emailjsTemplateId, params,
      { publicKey: GR.emailjsPublicKey })
      .catch(e => console.warn('Order email failed (order still saved):', e));
  } catch (e) { console.warn('Order email error:', e); }
}


/* ============================================================
   ৮) ADMIN  — শুধু manage.html ব্যবহার করে (Supabase Auth লগইন লাগে)
   ============================================================ */
async function grAdminLogin(email, password) {
  const db = getDB(); if (!db) throw new Error('DB not ready');
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}
async function grAdminLogout() { const db = getDB(); if (db) await db.auth.signOut(); }
async function grGetSession() {
  const db = getDB(); if (!db) return null;
  const { data } = await db.auth.getSession();
  return data ? data.session : null;
}

/* — পণ্য — */
async function grSaveProduct(row) {
  const db = getDB(); if (!db) throw new Error('DB not ready');
  const { data, error } = await db.from('products')
    .upsert(row, { onConflict: 'id' }).select().single();
  if (error) throw error;
  return data;
}
async function grDeleteProduct(id) {
  const db = getDB(); if (!db) throw new Error('DB not ready');
  const { error } = await db.from('products').delete().eq('id', String(id));
  if (error) throw error;
}
async function grUploadImage(file, productId) {
  const db = getDB(); if (!db) throw new Error('DB not ready');
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const path = String(productId || 'img') + '-' + Date.now() + '.' + ext;
  const { error } = await db.storage.from(GR.imageBucket)
    .upload(path, file, { upsert: true, cacheControl: '3600' });
  if (error) throw error;
  return db.storage.from(GR.imageBucket).getPublicUrl(path).data.publicUrl;
}

/* — সেটিংস — */
async function grSaveSetting(key, value) {
  const db = getDB(); if (!db) throw new Error('DB not ready');
  const { error } = await db.from('store_config')
    .upsert({ key: key, value: value == null ? '' : String(value) }, { onConflict: 'key' });
  if (error) throw error;
}
async function grSaveSettingsBulk(obj) {
  const rows = Object.keys(obj).map(k => ({ key: k, value: obj[k] == null ? '' : String(obj[k]) }));
  const db = getDB(); if (!db) throw new Error('DB not ready');
  const { error } = await db.from('store_config').upsert(rows, { onConflict: 'key' });
  if (error) throw error;
}

/* — কুপন — */
async function grSaveCoupon(row) {
  const db = getDB(); if (!db) throw new Error('DB not ready');
  const { error } = await db.from('coupons').upsert(row, { onConflict: 'code' });
  if (error) throw error;
}
async function grDeleteCoupon(code) {
  const db = getDB(); if (!db) throw new Error('DB not ready');
  const { error } = await db.from('coupons').delete().eq('code', code);
  if (error) throw error;
}

/* — অর্ডার তালিকা / স্ট্যাটাস (admin) — */
async function grAdminListOrders(limit) {
  const db = getDB(); if (!db) return [];
  const { data, error } = await db.from('orders').select('*')
    .order('created_at', { ascending: false }).limit(limit || 200);
  if (error) { console.error(error.message); return []; }
  return data || [];
}
async function grSetOrderStatus(id, status, paymentStatus) {
  const db = getDB(); if (!db) throw new Error('DB not ready');
  const patch = { status: status };
  if (paymentStatus !== undefined) patch.payment_status = paymentStatus;
  const { error } = await db.from('orders').update(patch).eq('id', id);
  if (error) throw error;
}

/* — রিভিউ মডারেশন (admin) — */
async function grAdminListReviews() {
  const db = getDB(); if (!db) return [];
  const { data, error } = await db.from('reviews').select('*')
    .order('created_at', { ascending: false }).limit(200);
  if (error) { console.error(error.message); return []; }
  return data || [];
}
async function grSetReviewStatus(id, status) {
  const db = getDB(); if (!db) throw new Error('DB not ready');
  const { error } = await db.from('reviews').update({ status: status }).eq('id', id);
  if (error) throw error;
}
async function grDeleteReview(id) {
  const db = getDB(); if (!db) throw new Error('DB not ready');
  const { error } = await db.from('reviews').delete().eq('id', id);
  if (error) throw error;
}


/* ============================================================
   ধাপ ১ — অর্ডার প্যানেলের জন্য নতুন ফাংশন
   (উপরের কোনো কিছু বদলানো হয়নি, শুধু নিচে যোগ করা হয়েছে)
   ============================================================ */


/* ── অর্ডারের স্ট্যাটাস তালিকা (এক জায়গায় রাখা) ──
   নাম বদলালে index.html-এর trkCls() যেন রঙ ঠিক দেখায়, সেভাবে বাছা:
   confirm/process → হলুদ | ship/courier/way → নীল
   deliver → সবুজ | cancel/return → লাল                      */
const GR_ORDER_STATUSES = [
  'Pending', 'Confirmed', 'Processing', 'Shipped',
  'In Courier', 'Delivered', 'Cancelled', 'Returned'
];

const GR_PAYMENT_STATUSES = ['', 'Pending', 'Verified', 'Rejected'];


/* ── ফিল্টার + সার্চ সহ অর্ডার তালিকা (admin) ──
   opts = { status, search, limit, offset }
   status খালি বা 'all' হলে সব।
   search: অর্ডার কোড / ফোন / নাম — যেকোনোটার অংশ।              */
async function grAdminOrders(opts) {
  const o = opts || {};
  const db = getDB(); if (!db) return [];
  let q = db.from('orders').select('*');

  if (o.status && o.status !== 'all') q = q.eq('status', o.status);

  const s = (o.search || '').trim();
  if (s) {
    const like = '%' + s.replace(/[%,]/g, '') + '%';
    q = q.or('order_code.ilike.' + like +
             ',phone.ilike.'      + like +
             ',customer_name.ilike.' + like);
  }

  const limit  = o.limit  || 100;
  const offset = o.offset || 0;
  q = q.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

  const { data, error } = await q;
  if (error) { console.error('grAdminOrders:', error.message); return []; }
  return data || [];
}


/* ── প্রতিটি স্ট্যাটাসে কয়টা অর্ডার (ট্যাবের পাশে সংখ্যা দেখাতে) ──
   শুধু status কলামটা আনে, তাই হালকা।                            */
async function grOrderCounts() {
  const db = getDB(); if (!db) return {};
  const { data, error } = await db.from('orders').select('status');
  if (error) { console.error('grOrderCounts:', error.message); return {}; }
  const c = { all: 0 };
  (data || []).forEach(r => {
    const st = r.status || 'Pending';
    c.all++; c[st] = (c[st] || 0) + 1;
  });
  return c;
}


/* ── শুধু পেমেন্ট স্ট্যাটাস বদলানো (Verified / Rejected) ── */
async function grSetPaymentStatus(id, paymentStatus) {
  const db = getDB(); if (!db) throw new Error('DB not ready');
  const { error } = await db.from('orders')
    .update({ payment_status: paymentStatus }).eq('id', id);
  if (error) throw error;
}


/* ── অ্যাডমিনের নোট সেভ (ঐচ্ছিক — কলাম না থাকলে চুপচাপ ব্যর্থ হবে) ──
   কলাম যোগ করতে চাইলে SQL Editor-এ একবার চালান:
   alter table public.orders add column if not exists admin_note text;   */
async function grSetOrderNote(id, note) {
  const db = getDB(); if (!db) throw new Error('DB not ready');
  const { error } = await db.from('orders')
    .update({ admin_note: note || '' }).eq('id', id);
  if (error) throw error;
}


/* ── একটি অর্ডারের পূর্ণ তথ্য ── */
async function grGetOrder(id) {
  const db = getDB(); if (!db) return null;
  const { data, error } = await db.from('orders').select('*').eq('id', id).single();
  if (error) { console.error('grGetOrder:', error.message); return null; }
  return data;
}
