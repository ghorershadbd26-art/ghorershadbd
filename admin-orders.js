/* ============================================================
   ঘরের রং — অ্যাডমিন অর্ডার প্যানেল (ধাপ ১)
   ------------------------------------------------------------
   নতুন ফাইল। manage.html-এ data.js-এর ঠিক পরে যোগ করুন:
     <script src="admin-orders.js"></script>
   ------------------------------------------------------------
   যা যোগ হলো: ঠিকানা/নোট/TrxID দেখা, পেমেন্ট ভেরিফাই,
   স্ট্যাটাস ট্যাব, সার্চ, ইনভয়েস প্রিন্ট, CSV এক্সপোর্ট।
   ============================================================ */
(function () {
  'use strict';

  /* ── নিজস্ব হেল্পার (manage.html-এর উপর নির্ভর না করে) ── */
  const q  = s => document.querySelector(s);
  const ec = s => String(s == null ? '' : s)
    .replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const money = v => '৳' + (Number(v) || 0).toLocaleString('en-BD');
  const when  = v => v ? new Date(v).toLocaleString('en-GB', {
    day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit'
  }) : '';

  const STATUSES = (typeof GR_ORDER_STATUSES !== 'undefined') ? GR_ORDER_STATUSES
    : ['Pending','Confirmed','Processing','Shipped','In Courier','Delivered','Cancelled','Returned'];

  const BN = {
    'Pending':'অপেক্ষমাণ', 'Confirmed':'কনফার্ম', 'Processing':'প্রস্তুত হচ্ছে',
    'Shipped':'পাঠানো হয়েছে', 'In Courier':'কুরিয়ারে', 'Delivered':'ডেলিভারি হয়েছে',
    'Cancelled':'বাতিল', 'Returned':'ফেরত'
  };

  /* স্ট্যাটাস → রঙ (index.html-এর trkCls-এর সাথে মিল রেখে) */
  function tone(s) {
    s = String(s || '').toLowerCase();
    if (/deliver/.test(s))               return ['#DCFCE7', '#15803D'];
    if (/ship|courier|way/.test(s))      return ['#DBEAFE', '#1D4ED8'];
    if (/confirm|process/.test(s))       return ['#FEF3C7', '#B45309'];
    if (/cancel|return|fail/.test(s))    return ['#FEE2E2', '#B91C1C'];
    return ['#F1F5F9', '#475569'];
  }

  let STATE = { tab: 'all', search: '', rows: [], counts: {}, offset: 0, openId: null };
  const PAGE = 100;

  /* ══════════ স্টাইল (manage.html-এর CSS-এ হাত না দিয়ে) ══════════ */
  function injectCSS() {
    if (q('#ordCSS')) return;
    const st = document.createElement('style');
    st.id = 'ordCSS';
    st.textContent = `
      .ord-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:14px}
      .ord-tab{padding:7px 13px;border:1px solid var(--line);background:#fff;border-radius:999px;
        cursor:pointer;font-size:13px;font-family:inherit;color:var(--muted);white-space:nowrap}
      .ord-tab.on{background:var(--accent);border-color:var(--accent);color:#fff;font-weight:600}
      .ord-tab b{font-weight:700;margin-right:4px}
      .ord-search{flex:1;min-width:180px;padding:8px 12px;border:1px solid var(--line);
        border-radius:10px;font-family:inherit;font-size:14px}
      .ord-row{cursor:pointer}
      .ord-row:hover{background:var(--bg)}
      .pill{display:inline-block;padding:3px 10px;border-radius:999px;font-size:12px;font-weight:600}
      .paypill{display:inline-block;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:600}
      .ord-ov{position:fixed;inset:0;background:rgba(30,20,10,.45);z-index:200;display:none}
      .ord-ov.on{display:block}
      .ord-dr{position:absolute;top:0;right:0;height:100%;width:min(560px,100%);background:#fff;
        overflow-y:auto;padding:22px;box-shadow:-8px 0 30px rgba(0,0,0,.15)}
      .ord-dr h3{margin:0 0 4px}
      .kv{display:grid;grid-template-columns:110px 1fr;gap:6px 12px;font-size:14px;margin:14px 0}
      .kv dt{color:var(--muted)}
      .kv dd{margin:0;word-break:break-word}
      .ord-sec{border-top:1px solid var(--line);padding-top:14px;margin-top:16px}
      .ord-acts{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
      @media print{body *{visibility:hidden}#invBox,#invBox *{visibility:visible}
        #invBox{position:absolute;left:0;top:0;width:100%}}
    `;
    document.head.appendChild(st);
  }

  /* ══════════ কাঠামো ══════════ */
  function shell() {
    const root = q('#ordersRoot');
    if (!root || root.dataset.ready) return;
    root.dataset.ready = '1';
    root.innerHTML = `
      <div class="card">
        <div class="ord-bar" id="ordTabs"></div>
        <div class="ord-bar">
          <input class="ord-search" id="ordSearch" placeholder="🔍 অর্ডার কোড / ফোন / নাম">
          <button class="btn btn-ghost" id="ordRefresh">↻ রিফ্রেশ</button>
          <button class="btn btn-ghost" id="ordCsv">⬇ CSV</button>
        </div>
        <table>
          <thead><tr>
            <th>কোড / সময়</th><th>গ্রাহক</th><th>এলাকা</th>
            <th>মোট</th><th>পেমেন্ট</th><th>স্ট্যাটাস</th>
          </tr></thead>
          <tbody id="oList"></tbody>
        </table>
        <div style="text-align:center;margin-top:12px">
          <button class="btn btn-ghost" id="ordMore" style="display:none">আরও দেখুন</button>
        </div>
      </div>
      <div class="ord-ov" id="ordOv"><div class="ord-dr" id="ordDr"></div></div>
      <div id="invBox" style="display:none"></div>`;

    q('#ordRefresh').onclick = () => reload(true);
    q('#ordCsv').onclick = exportCSV;
    q('#ordMore').onclick = () => { STATE.offset += PAGE; reload(false); };
    q('#ordOv').onclick = e => { if (e.target.id === 'ordOv') closeDrawer(); };

    let timer = null;
    q('#ordSearch').oninput = e => {
      clearTimeout(timer);
      const v = e.target.value;
      timer = setTimeout(() => { STATE.search = v; reload(true); }, 350);
    };
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawer(); });
  }

  function drawTabs() {
    const c = STATE.counts, all = ['all'].concat(STATUSES);
    q('#ordTabs').innerHTML = all.map(s => {
      const n = s === 'all' ? (c.all || 0) : (c[s] || 0);
      const label = s === 'all' ? 'সব' : (BN[s] || s);
      return `<button class="ord-tab ${STATE.tab === s ? 'on' : ''}" data-s="${ec(s)}">
                <b>${n}</b>${ec(label)}</button>`;
    }).join('');
    q('#ordTabs').querySelectorAll('.ord-tab').forEach(b => {
      b.onclick = () => { STATE.tab = b.dataset.s; reload(true); };
    });
  }

  /* ══════════ তালিকা ══════════ */
  async function reload(fresh) {
    if (fresh) { STATE.offset = 0; STATE.rows = []; }
    const list = await grAdminOrders({
      status: STATE.tab, search: STATE.search, limit: PAGE, offset: STATE.offset
    });
    STATE.rows = STATE.offset === 0 ? list : STATE.rows.concat(list);
    STATE.counts = await grOrderCounts();
    drawTabs();
    drawList();
    q('#ordMore').style.display = list.length === PAGE ? '' : 'none';
  }

  function drawList() {
    const body = q('#oList');
    if (!STATE.rows.length) {
      body.innerHTML = '<tr><td colspan="6" class="mini">কোনো অর্ডার নেই।</td></tr>';
      return;
    }
    body.innerHTML = STATE.rows.map(o => {
      const [bg, fg] = tone(o.status);
      const ps = o.payment_status || '';
      const payCol = ps === 'Verified' ? '#15803D' : ps === 'Rejected' ? '#B91C1C' : '#B45309';
      const pay = ps
        ? `<span class="paypill" style="background:${payCol}18;color:${payCol}">${ec(ps)}</span>`
        : '<span class="mini">COD</span>';
      return `<tr class="ord-row" data-id="${ec(o.id)}">
        <td><b>${ec(o.order_code)}</b><br><span class="mini">${ec(when(o.created_at))}</span></td>
        <td>${ec(o.customer_name)}<br><span class="mini">${ec(o.phone)}</span></td>
        <td><span class="mini">${ec(o.delivery_area || '')}</span></td>
        <td><b>${money(o.grand_total)}</b></td>
        <td>${pay}</td>
        <td><span class="pill" style="background:${bg};color:${fg}">${ec(BN[o.status] || o.status || 'Pending')}</span></td>
      </tr>`;
    }).join('');
    body.querySelectorAll('.ord-row').forEach(tr => {
      tr.onclick = () => openDrawer(tr.dataset.id);
    });
  }

  /* ══════════ বিস্তারিত ══════════ */
  function findRow(id) { return STATE.rows.find(r => String(r.id) === String(id)); }

  function itemsOf(o) {
    let it = o.items;
    if (typeof it === 'string') { try { it = JSON.parse(it); } catch (e) { it = null; } }
    return Array.isArray(it) ? it : [];
  }

  function openDrawer(id) {
    const o = findRow(id); if (!o) return;
    STATE.openId = id;
    const items = itemsOf(o);
    const online = /online/i.test(o.payment_method || '');

    const lines = items.length
      ? items.map(x => `<tr><td>${ec(x.name)}</td><td style="text-align:center">${ec(x.qty)}</td>
          <td style="text-align:right">${money((Number(x.price)||0) * (Number(x.qty)||0))}</td></tr>`).join('')
      : `<tr><td colspan="3">${ec(o.product_list || '')}</td></tr>`;

    q('#ordDr').innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:start;gap:10px">
        <div>
          <h3>${ec(o.order_code)}</h3>
          <span class="mini">${ec(when(o.created_at))}</span>
        </div>
        <button class="btn btn-ghost" id="drX" style="padding:6px 12px">✕</button>
      </div>

      <dl class="kv">
        <dt>নাম</dt><dd>${ec(o.customer_name)}</dd>
        <dt>মোবাইল</dt><dd><a href="tel:${ec(o.phone)}">${ec(o.phone)}</a></dd>
        <dt>ঠিকানা</dt><dd>${ec(o.address)}</dd>
        ${o.note ? `<dt>গ্রাহকের নোট</dt><dd>${ec(o.note)}</dd>` : ''}
        <dt>এলাকা</dt><dd>${ec(o.delivery_area || '')}</dd>
      </dl>

      <div class="ord-sec">
        <table style="font-size:14px">
          <thead><tr><th>পণ্য</th><th style="text-align:center">পিস</th><th style="text-align:right">দাম</th></tr></thead>
          <tbody>${lines}</tbody>
        </table>
        <dl class="kv" style="grid-template-columns:1fr auto">
          <dt>সাবটোটাল</dt><dd style="text-align:right">${money(o.subtotal)}</dd>
          ${Number(o.discount) ? `<dt>ছাড় ${o.coupon ? '(' + ec(o.coupon) + ')' : ''}</dt>
            <dd style="text-align:right;color:var(--green)">− ${money(o.discount)}</dd>` : ''}
          <dt>ডেলিভারি</dt><dd style="text-align:right">${money(o.delivery_charge)}</dd>
          <dt><b>সর্বমোট</b></dt><dd style="text-align:right"><b>${money(o.grand_total)}</b></dd>
        </dl>
      </div>

      <div class="ord-sec">
        <b>পেমেন্ট</b>
        <dl class="kv">
          <dt>মাধ্যম</dt><dd>${ec(o.payment_method || 'Cash on Delivery')}</dd>
          ${o.trx_id ? `<dt>TrxID</dt><dd><b>${ec(o.trx_id)}</b></dd>` : ''}
          ${o.sender_number ? `<dt>প্রেরক</dt><dd>${ec(o.sender_number)}</dd>` : ''}
          <dt>অবস্থা</dt><dd>${ec(o.payment_status || '—')}</dd>
        </dl>
        ${online ? `<div class="ord-acts">
          <button class="btn btn-primary" id="payOk">✅ পেমেন্ট ভেরিফাই</button>
          <button class="btn btn-danger"  id="payNo">✕ বাতিল</button>
        </div>` : ''}
      </div>

      <div class="ord-sec">
        <b>স্ট্যাটাস</b>
        <select id="drStatus" style="margin-top:8px">
          ${STATUSES.map(s => `<option ${o.status === s ? 'selected' : ''} value="${ec(s)}">${ec(BN[s] || s)}</option>`).join('')}
        </select>
        <div class="ord-acts">
          <button class="btn btn-ghost" id="drPrint">🖨 ইনভয়েস</button>
          <button class="btn btn-ghost" id="drWa">💬 WhatsApp</button>
          <button class="btn btn-ghost" id="drCopy">📋 ঠিকানা কপি</button>
        </div>
      </div>`;

    q('#ordOv').classList.add('on');
    q('#drX').onclick = closeDrawer;

    q('#drStatus').onchange = async e => {
      try {
        await grSetOrderStatus(o.id, e.target.value);
        o.status = e.target.value;
        drawList(); STATE.counts = await grOrderCounts(); drawTabs();
        toast('স্ট্যাটাস আপডেট হয়েছে ✅', true);
      } catch (err) { toast('ব্যর্থ: ' + err.message, false); }
    };

    if (online) {
      q('#payOk').onclick = () => setPay(o, 'Verified');
      q('#payNo').onclick = () => setPay(o, 'Rejected');
    }
    q('#drPrint').onclick = () => printInvoice(o);
    q('#drCopy').onclick  = () => {
      const txt = o.customer_name + '\n' + o.phone + '\n' + o.address;
      navigator.clipboard.writeText(txt).then(() => toast('ঠিকানা কপি হয়েছে', true));
    };
    q('#drWa').onclick = () => {
      const ph = String(o.phone || '').replace(/\D/g, '').replace(/^0/, '88');
      const msg = 'আসসালামু আলাইকুম ' + (o.customer_name || '') +
        ',\nআপনার অর্ডার ' + o.order_code + ' (' + money(o.grand_total) + ') প্রসঙ্গে।';
      window.open('https://wa.me/' + ph + '?text=' + encodeURIComponent(msg), '_blank');
    };
  }

  function closeDrawer() { q('#ordOv') && q('#ordOv').classList.remove('on'); STATE.openId = null; }

  async function setPay(o, st) {
    try {
      await grSetPaymentStatus(o.id, st);
      o.payment_status = st;
      drawList(); openDrawer(o.id);
      toast('পেমেন্ট ' + st, true);
    } catch (e) { toast('ব্যর্থ: ' + e.message, false); }
  }

  function toast(msg, ok) {
    if (typeof showBanner === 'function') showBanner(msg, ok); else alert(msg);
  }

  /* ══════════ ইনভয়েস প্রিন্ট ══════════ */
  function printInvoice(o) {
    const S = (typeof SETTINGS !== 'undefined' && SETTINGS) ? SETTINGS : {};
    const items = itemsOf(o);
    const lines = items.length
      ? items.map(x => `<tr><td>${ec(x.name)}</td><td align="center">${ec(x.qty)}</td>
          <td align="right">${money(x.price)}</td>
          <td align="right">${money((Number(x.price)||0)*(Number(x.qty)||0))}</td></tr>`).join('')
      : `<tr><td colspan="4">${ec(o.product_list || '')}</td></tr>`;

    const html = `
      <div style="font-family:system-ui,'Noto Sans Bengali',sans-serif;max-width:700px;margin:0 auto;padding:24px;color:#222">
        <div style="display:flex;justify-content:space-between;border-bottom:2px solid #333;padding-bottom:12px">
          <div>
            <h2 style="margin:0">${ec(S.store_name || 'ঘরের রং')}</h2>
            <div style="font-size:13px;color:#666">
              ${ec(S.phone || '')}${S.address ? ' · ' + ec(S.address) : ''}
            </div>
          </div>
          <div style="text-align:right">
            <b>ইনভয়েস</b><br>
            <span style="font-size:13px">${ec(o.order_code)}<br>${ec(when(o.created_at))}</span>
          </div>
        </div>
        <div style="margin:16px 0;font-size:14px">
          <b>গ্রাহক:</b> ${ec(o.customer_name)} · ${ec(o.phone)}<br>
          <b>ঠিকানা:</b> ${ec(o.address)}<br>
          <b>এলাকা:</b> ${ec(o.delivery_area || '')}
          ${o.note ? '<br><b>নোট:</b> ' + ec(o.note) : ''}
        </div>
        <table width="100%" style="border-collapse:collapse;font-size:14px" border="1" cellpadding="7">
          <thead style="background:#f2f2f2">
            <tr><th align="left">পণ্য</th><th>পিস</th><th align="right">দর</th><th align="right">মোট</th></tr>
          </thead>
          <tbody>${lines}</tbody>
        </table>
        <table width="100%" style="margin-top:12px;font-size:14px">
          <tr><td align="right">সাবটোটাল</td><td align="right" width="120">${money(o.subtotal)}</td></tr>
          ${Number(o.discount) ? `<tr><td align="right">ছাড়</td><td align="right">− ${money(o.discount)}</td></tr>` : ''}
          <tr><td align="right">ডেলিভারি</td><td align="right">${money(o.delivery_charge)}</td></tr>
          <tr style="font-size:17px"><td align="right"><b>সর্বমোট</b></td>
              <td align="right"><b>${money(o.grand_total)}</b></td></tr>
        </table>
        <div style="margin-top:10px;font-size:13px">
          <b>পেমেন্ট:</b> ${ec(o.payment_method || 'Cash on Delivery')}
          ${o.trx_id ? ' · TrxID: ' + ec(o.trx_id) : ''}
        </div>
        <p style="text-align:center;margin-top:28px;font-size:13px;color:#666">
          ${ec(S.store_name || 'ঘরের রং')} থেকে কেনাকাটার জন্য ধন্যবাদ 🌸
        </p>
      </div>`;

    const w = window.open('', '_blank', 'width=800,height=900');
    w.document.write('<!DOCTYPE html><html lang="bn"><head><meta charset="utf-8"><title>' +
      ec(o.order_code) + '</title></head><body>' + html + '</body></html>');
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 400);
  }

  /* ══════════ CSV ══════════ */
  function exportCSV() {
    if (!STATE.rows.length) { toast('রপ্তানি করার মতো অর্ডার নেই।', false); return; }
    const cols = ['order_code','created_at','customer_name','phone','address','delivery_area',
                  'product_list','quantity','subtotal','discount','coupon','delivery_charge',
                  'grand_total','payment_method','trx_id','sender_number','payment_status','status','note'];
    const cell = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const csv = '\uFEFF' + cols.join(',') + '\n' +
      STATE.rows.map(r => cols.map(c => cell(r[c])).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'orders-' + new Date().toISOString().slice(0, 10) + '.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  /* ══════════ manage.html যেটা ডাকে ══════════ */
  window.refreshOrders = async function () {
    injectCSS();
    shell();
    await reload(true);
  };
})();
