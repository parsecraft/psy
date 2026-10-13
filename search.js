(() => {
  'use strict';

  // ---------- Normalisation: Arabic (diacritics, alef/ya/ta-marbuta variants, digits) + Latin (accents, case) ----------
  const SKIP = /[\u0300-\u036f\u0610-\u061a\u064b-\u065f\u0670\u0640\u200b-\u200f\u202a-\u202e\u0621]/;
  const MAP = { 'أ': 'ا', 'إ': 'ا', 'آ': 'ا', 'ٱ': 'ا', 'ى': 'ي', 'ی': 'ي', 'ئ': 'ي', 'ة': 'ه', 'ؤ': 'و', 'ک': 'ك', 'ڭ': 'ك', 'گ': 'ك', 'ݣ': 'ك', 'پ': 'ب', 'چ': 'ج', 'ڤ': 'ف' };
  function normMap(s) {
    let n = ''; const map = [];
    for (let i = 0; i < s.length; i++) {
      for (let c of s[i].normalize('NFKD')) {
        if (SKIP.test(c)) continue;
        const d = '٠١٢٣٤٥٦٧٨٩'.indexOf(c); const p = '۰۱۲۳۴۵۶۷۸۹'.indexOf(c);
        c = d >= 0 ? String(d) : p >= 0 ? String(p) : (MAP[c] || c.toLowerCase());
        if (!/[\p{L}\p{N}]/u.test(c)) c = ' ';
        n += c; map.push(i);
      }
    }
    return { n, map };
  }
  const norm = s => normMap(s).n.replace(/\s+/g, ' ').trim();
  const esc = s => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const isAr = s => /[\u0600-\u06ff]/.test(s);
  const AR_PREFIX = /^(?:وال|بال|كال|فال|لل|ال)(?=.{2,})/;

  // ---------- Bilingual synonyms: an English query finds Arabic titles and vice-versa ----------
  const SYN = [
    ['عنب', 'grape', 'grapes', 'raisin', 'muscat', 'موسكا'], ['برتقال', 'orange', 'navel', 'نافيل'],
    ['كليمنتين', 'clementine', 'mandarin', 'مندرين', 'ماندرين'], ['حامض', 'ليمون', 'lemon', 'citrus', 'agrumes'],
    ['دلاح', 'بطيخ', 'watermelon', 'melon', 'شمام'], ['تفاح', 'apple', 'apples'], ['خوخ', 'peach', 'نكتارين', 'nectarine'],
    ['مشماش', 'مشمش', 'apricot'], ['برقوق', 'plum'], ['زيتون', 'olive', 'olives'], ['زيت', 'oil'],
    ['بصل', 'بصله', 'onion', 'onions'], ['بطاطس', 'بطاطا', 'potato', 'potatoes', 'batata'], ['طماطم', 'مطيشه', 'tomato', 'tomatoes'],
    ['خضر', 'خضره', 'خضروات', 'vegetable', 'vegetables', 'legumes'], ['فواكه', 'فاكهه', 'fruit', 'fruits'],
    ['اسعار', 'اثمنه', 'ثمن', 'سعر', 'price', 'prices', 'prix'], ['سوق', 'market', 'marche'], ['جمله', 'wholesale', 'gros'],
    ['حصاد', 'harvest', 'moisson'], ['قمح', 'wheat', 'ble'], ['شعير', 'barley'], ['حمص', 'chickpea', 'chickpeas'],
    ['فول', 'fava', 'beans'], ['خروف', 'sheep', 'lamb', 'mouton', 'كبش'], ['ابقار', 'بقره', 'cow', 'cows', 'cattle'],
    ['دجاج', 'chicken', 'poultry'], ['معرض', 'exhibition', 'fair', 'salon'], ['مكناس', 'meknes'], ['فاس', 'fes', 'fez'],
    ['الرباط', 'rabat'], ['مراكش', 'marrakech', 'marrakesh'], ['اكادير', 'agadir'], ['الدار البيضاء', 'casablanca', 'casa'],
    ['مطر', 'امطار', 'rain', 'rains'], ['سقي', 'ري', 'irrigation'], ['سد', 'سدود', 'dam', 'dams'], ['تمر', 'تمور', 'dates', 'date'],
    ['رمان', 'pomegranate'], ['موز', 'banana'], ['افوكا', 'avocado', 'افوكادو'], ['فراوله', 'strawberry'], ['جزر', 'carrot'],
  ].map(g => g.map(norm));
  const SYN_OF = new Map();
  for (const g of SYN) for (const w of g) { if (!SYN_OF.has(w)) SYN_OF.set(w, new Set()); g.forEach(x => SYN_OF.get(w).add(x)); }

  // ---------- State ----------
  const $ = id => document.getElementById(id);
  const els = { nall: $('nall'), nfav: $('nfav'), q: $('q'), clear: $('clear'), count: $('count'), grid: $('grid'), empty: $('empty'), sentinel: $('sentinel') };
  const FIRST = 16, BATCH = 40, EAGER = 8;
  let videos = [], results = [], shown = 0, instance = '', hl = [];
  const store = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { } } };

  // Favourites: ordered array of ids (newest first), persisted in localStorage
  const J = (k, d) => { try { const x = JSON.parse(store.get(k)); return x ?? d; } catch { return d; } };
  let cur = null, lists = J('lists', null), notes = J('notes', {}), hist = J('hist', {}), active = store.get('active') || '';
  let newest = store.get('sort') !== 'old', newSet = new Set(), nwTs = 0, onlyNew = false, favs = [], favSet = new Set();
  const uid = () => 'l' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const defList = () => [{ id: 'l1', name: 'Favorites', ids: [] }];
  if (!Array.isArray(lists) || !lists.length) { lists = defList(); const old = J('favs', []); if (Array.isArray(old)) lists[0].ids = old; }
  const curList = () => lists.find(l => l.id === active) || lists[0];
  const refreshFavs = () => { favs = curList().ids; favSet = new Set(lists.flatMap(l => l.ids)); };
  const saveAll = () => { refreshFavs(); store.set('lists', JSON.stringify(lists)); store.set('notes', JSON.stringify(notes)); store.set('active', curList().id); };
  const saveNew = () => store.set('newids', JSON.stringify({ ids: [...newSet], ts: nwTs }));
  refreshFavs();
  let tab = 'all', pool = [], byId = new Map();
  
  const cleanBase = u => { try { const x = new URL(u); return x.origin + x.pathname.replace(/\/+$/, ''); } catch { return ''; } };
  const YT = 'youtube';
  const INSTANCES = [
    ['https://inv.nadeko.net', '🇨🇱'], ['https://invidious.nerdvpn.de', '🇨🇦'], ['https://yt.chocolatemoo53.com', '🇺🇸'],
    ['https://invidious.tiekoetter.com', '🇩🇪'], ['https://invidious.f5.si', '🇯🇵'], [YT, '▶️'],
  ];
  const label = u => u === YT ? 'YouTube' : u.replace(/^https?:\/\//, '');
  function setInstance(b, save) {
    instance = b;
    if (!INSTANCES.some(i => i[0] === b)) INSTANCES.splice(INSTANCES.length - 1, 0, [b, '🌐']);
    if (save) store.set('instance', b);
    if (tab === 'settings') showSettings();
    document.querySelectorAll('a.card').forEach(a => a.href = watchUrl(a.dataset.id));
    if (cur && !$('player').hidden) loadPlayer();
  }
  // Fastest first: YouTube CDN (WebP is ~40% smaller), then JPG, then the instance.
  let thumbTpl = ['https://i.ytimg.com/vi_webp/{id}/mqdefault.webp', 'https://i.ytimg.com/vi/{id}/mqdefault.jpg', '{instance}/vi/{id}/mqdefault.jpg'];
  thumbTpl = thumbTpl; // instance thumbnails are only used as a last resort
  const thumbUrl = (id, k) => thumbTpl[k] && !(instance === YT && thumbTpl[k].includes('{instance}')) && thumbTpl[k].replace('{instance}', instance).replace('{id}', id);
  const watchUrl = id => instance === YT ? `https://www.youtube.com/watch?v=${id}` : `${instance}/watch?v=${id}`;
  const embedUrl = id => (instance === YT ? `https://www.youtube-nocookie.com/embed/${id}?autoplay=${store.get('autoplay') === '0' ? 0 : 1}&rel=0` : `${instance}/embed/${id}?autoplay=${store.get('autoplay') === '0' ? 0 : 1}`);

  async function init() {
    const data = window.__VIDEOS__ || await (await fetch('videos.json')).json(); // __VIDEOS__ is set by the single-file build
    const p = new URLSearchParams(location.search);
    setInstance(cleanBase(p.get('instance') || '') || store.get('instance') || cleanBase(data.instance) || INSTANCES[0][0], false);
    if (Array.isArray(data.thumbnails) && data.thumbnails.length) thumbTpl = data.thumbnails;
    const seen = new Set();
    videos = (data.videos || []).filter(v => v && v.id && !seen.has(v.id) && seen.add(v.id)).map((v, i) => ({
      ...v, order: i, n: normMap(v.title || ''), secs: (v.duration || '0:0').split(':').map(Number).reduce((a, x) => a * 60 + x, 0),
    }));
    byId = new Map(videos.map(v => [v.id, v]));
    const sv = J('state', null), noUrl = !p.has('q') && !p.has('tab');
    const st = sv && (noUrl || ((p.get('q') || '') === sv.q && (p.get('tab') || 'all') === sv.tab)) ? sv : null; // resume last session
    const tb = p.get('tab') || (st && st.tab);
    tab = ['fav', 'stats', 'settings'].includes(tb) ? tb : 'all';
    { // "New" = ids not seen on the previous visit; kept for 3 days
      const ids = videos.map(v => v.id), known = J('known', null), DAY3 = 3 * 864e5;
      let nw = J('newids', { ids: [], ts: 0 }); nwTs = nw.ts || 0;
      if (Array.isArray(known)) {
        const ks = new Set(known), fresh = ids.filter(i => !ks.has(i));
        if (fresh.length) { nw = { ids: [...new Set([...fresh, ...(Date.now() - nwTs < DAY3 ? nw.ids : [])])] }; nwTs = Date.now(); }
      }
      if (!nwTs || Date.now() - nwTs >= DAY3) nw.ids = [];
      newSet = new Set((nw.ids || []).filter(i => byId.has(i)));
      store.set('known', JSON.stringify(ids)); saveNew();
    }
    videos.forEach(v => { v.words = v.n.n.replace(/ +/g, ' ').split(' '); });
    $('subtitle').textContent = `${videos.length} videos`;
    els.q.value = p.get('q') || (st && typeof st.q === 'string' ? st.q : '');
    run(st && tab !== 'stats' && tab !== 'settings' && st.y > 0 ? st.y : 0);
  }

  // ---------- Search ----------
  function variants(tok) {
    const out = new Set([tok]);
    if (isAr(tok)) { const s = tok.replace(AR_PREFIX, ''); if (s.length >= 2) out.add(s); if (tok.length > 3 && tok.endsWith('ات')) out.add(tok.slice(0, -2)); }
    else { if (tok.length > 3 && tok.endsWith('es')) out.add(tok.slice(0, -2)); if (tok.length > 2 && tok.endsWith('s')) out.add(tok.slice(0, -1)); }
    for (const v of [...out]) { const g = SYN_OF.get(v); if (g) g.forEach(x => out.add(x)); }
    return [...out];
  }
  function lev1(a, b) { // true if edit distance <= 1
    if (Math.abs(a.length - b.length) > 1) return false;
    let i = 0, j = 0, e = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) { i++; j++; continue; }
      if (++e > 1) return false;
      if (a.length > b.length) i++; else if (a.length < b.length) j++; else { i++; j++; }
    }
    return e + (a.length - i) + (b.length - j) <= 1;
  }
  function scoreVideo(v, groups, fuzzy) {
    const s = v.n.n; let total = 0;
    for (const g of groups) { // every query word must match (via any variant)
      let best = 0;
      for (const [k, w] of g) {
        const idx = s.indexOf(k);
        if (idx >= 0) {
          let sc = (idx === 0 || s[idx - 1] === ' ') ? 3 : (k.length >= 2 ? 1 : 0);
          if (sc && v.words.includes(k)) sc += 1;
          if (sc && idx < 25) sc += 1;
          best = Math.max(best, sc * w);
        } else if (fuzzy && k.length >= 4 && v.words.some(x => lev1(k, x))) best = Math.max(best, 1);
      }
      if (!best) return 0; total += best;
    }
    return total;
  }
  function search(tokens) {
    // variants[0] (what the user typed) weighs more than stems / synonyms.
    const groups = tokens.map(tk => variants(tk).map((x, i) => [x, x === tk ? 1 : .7]));
    hl = [...new Set(groups.flat().map(g => g[0]))];
    const phrase = tokens.join(' ');
    for (const fuzzy of [false, true]) {
      const r = pool.map(v => { const sc = scoreVideo(v, groups, fuzzy); return sc ? { v, sc: sc + (v.n.n.includes(phrase) ? 4 : 0) } : null; })
        .filter(Boolean).sort((a, b) => b.sc - a.sc || (newest && tab === 'all' ? b.v.order - a.v.order : a.v.order - b.v.order)).map(x => x.v);
      if (r.length || tokens.join('').length < 4) return r;
    }
    return [];
  }

  function run(keepY) {
    const raw = els.q.value, tokens = norm(raw).split(' ').filter(Boolean);
    ranQ = raw;
    els.clear.hidden = !raw;
    if (tab === 'stats') return showStats();
    if (tab === 'settings') return showSettings();
    els.grid.hidden = false; $('stats').hidden = true; $('settings').hidden = true;
    pool = tab === 'fav' ? curList().ids.map(id => byId.get(id)).filter(Boolean) : newest ? videos.slice().reverse() : videos;
    if (onlyNew) pool = pool.filter(v => newSet.has(v.id));
    results = tokens.length ? search(tokens) : (hl = [], pool);
    syncTabs();
    renderSub(); shown = 0; els.grid.innerHTML = '';
    els.count.textContent = tokens.length ? `${results.length} of ${pool.length} videos` : `${pool.length} videos`;
    els.empty.hidden = results.length > 0;
    $('emsg').textContent = tab === 'fav' && !curList().ids.length ? 'This playlist is empty — tap the ☆ on any video to add it.' : 'No videos match your search.';
    $('reset').hidden = tab === 'fav' && !curList().ids.length;
    const p = new URLSearchParams(location.search);
    raw ? p.set('q', raw) : p.delete('q');
    tab !== 'all' ? p.set('tab', tab) : p.delete('tab');
    const q = p.toString(); history.replaceState(null, '', q ? '?' + q : location.pathname);
    saveState(); more(); if (keepY) restoreY(keepY);
  }

  function highlight(v) {
    if (!hl.length) return esc(v.title);
    const ranges = [];
    for (const k of hl) { let i = -1; while ((i = v.n.n.indexOf(k, i + 1)) >= 0) ranges.push([v.n.map[i], v.n.map[i + k.length - 1] + 1]); }
    ranges.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
    let out = '', pos = 0;
    for (const [s, e] of ranges) {
      if (e <= pos) continue;
      const st = Math.max(s, pos);
      out += esc(v.title.slice(pos, st)) + '<mark>' + esc(v.title.slice(st, e)) + '</mark>'; pos = e;
    }
    return out + esc(v.title.slice(pos));
  }

  // ---------- Rendering: one insert per batch, images start loading immediately ----------
  function more() {
    const n = shown === 0 ? FIRST : BATCH;
    const html = results.slice(shown, shown + n).map((v, i) => {
      const hot = shown + i < EAGER;
      return `<a class="card${hist[v.id] ? ' seen' : ''}" data-id="${v.id}" href="${watchUrl(v.id)}" target="_blank" rel="noopener"><div class="thumb"><img src="${thumbUrl(v.id, 0)}" data-id="${v.id}" data-k="0" width="320" height="180" alt="" decoding="async" referrerpolicy="no-referrer" ${hot ? 'fetchpriority="high"' : 'loading="lazy"'}><button type="button" class="star${favSet.has(v.id) ? ' on' : ''}" data-id="${v.id}" aria-label="Favorite" aria-pressed="${favSet.has(v.id)}"></button><span class="dur">${esc(v.duration || '')}</span>${newSet.has(v.id) ? '<span class="new">NEW</span>' : ''}${hist[v.id] ? '<span class="wm" title="Watched">✓</span>' : ''}</div><div class="title" dir="auto">${highlight(v)}${notes[v.id] ? `<small class="note">📝 ${esc(notes[v.id])}</small>` : ''}</div></a>`;
    }).join('');
    shown += n;
    els.grid.insertAdjacentHTML('beforeend', html);
    // The observer only fires when visibility CHANGES, so re-check after every batch
    // (this was why the list stopped after the first screens).
    requestAnimationFrame(fill);
  }
  function fill() {
    if (shown < results.length && els.sentinel.getBoundingClientRect().top < innerHeight + 900) more();
  }
  els.grid.addEventListener('load', e => { if (e.target.tagName === 'IMG') e.target.parentNode.classList.add('done'); }, true);
  els.grid.addEventListener('error', e => {
    const img = e.target; if (img.tagName !== 'IMG') return;
    const u = instance === YT && img.dataset.k >= 1 ? '' : thumbUrl(img.dataset.id, ++img.dataset.k);
    u ? img.src = u : img.parentNode.classList.add('noimg');
  }, true);
  new IntersectionObserver(fill, { rootMargin: '900px' }).observe(els.sentinel);
  addEventListener('scroll', fill, { passive: true });
  addEventListener('resize', fill);

  // ---------- Favourites ----------
  function syncTabs() {
    document.body.dataset.tab = tab; els.nall.textContent = videos.length; els.nfav.textContent = favSet.size;
    document.querySelectorAll('.tab').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  }
  function paintStar(id) {
    const on = favSet.has(id);
    document.querySelectorAll(`.star[data-id="${id}"]`).forEach(b => { b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
    if (cur && cur.id === id) { $('pstar').textContent = on ? '★ Saved' : '☆ Save'; $('pstar').classList.toggle('on', on); }
  }
  // ---------- Playlists, notes, backup (one shared modal sheet) ----------
  const sheet = $('sheet'), sbox = $('sbox'); let sheetId = null;
  const openBox = h => { if (sheet.hidden) pushOv(); sbox.innerHTML = '<button class="x" data-a="done" type="button" aria-label="Close">✕</button>' + h; sheet.hidden = false; };
  function doCloseSheet() { sheet.hidden = true; if (sheetId && tab === 'fav') run(scrollY); sheetId = null; }
  function openSheet(id) {
    const v = byId.get(id); if (!v) return; sheetId = id;
    openBox(`<h3 dir="auto">${esc(v.title)}</h3><div class="sl">${lists.map(l => `<label><input type="checkbox" data-l="${l.id}"${l.ids.includes(id) ? ' checked' : ''}> ${esc(l.name)} <small>${l.ids.length}</small></label>`).join('')}</div><div class="srow"><input id="nl" maxlength="40" placeholder="New playlist, e.g. Citrus"><button data-a="mk" type="button">Add</button></div><textarea id="nt" maxlength="200" dir="auto" placeholder="Private note, e.g. check prices Friday…">${esc(notes[id] || '')}</textarea><button class="done" data-a="done" type="button">Done</button>`);
  }
  function openData() {
    sheetId = null;
    openBox(`<h3>💾 Backup / Restore</h3><p class="sp">Playlists, notes and watch history live only in this browser. Save them to a small file and load it on another device. Restoring merges with what is already here.</p><div class="srow2"><button data-a="bk" type="button">⬇ Backup</button><button data-a="rs" type="button">⬆ Restore</button></div><button class="done" data-a="done" type="button">Close</button>`);
  }
  sheet.addEventListener('click', e => {
    if (e.target === sheet) return closeSheet();
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'done') closeSheet();
    else if (a === 'bk') backup();
    else if (a === 'rs') $('file').click();
    else if (a === 'mk') {
      const n = $('nl').value.trim().slice(0, 40); if (!n || !sheetId) return;
      lists.push({ id: uid(), name: n, ids: [sheetId] }); saveAll(); paintStar(sheetId); syncTabs(); openSheet(sheetId);
    }
  });
  sheet.addEventListener('change', e => {
    const c = e.target.closest('[data-l]'); const l = c && lists.find(x => x.id === c.dataset.l); if (!l || !sheetId) return;
    l.ids = c.checked ? [sheetId, ...l.ids.filter(x => x !== sheetId)] : l.ids.filter(x => x !== sheetId);
    saveAll(); paintStar(sheetId); syncTabs();
  });
  sheet.addEventListener('input', e => {
    if (e.target.id !== 'nt' || !sheetId) return;
    const t = e.target.value.trim().slice(0, 200); t ? notes[sheetId] = t : delete notes[sheetId]; saveAll();
  });
  $('file').addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; if (f) restore(f); });
  function backup() {
    const blob = new Blob([JSON.stringify({ app: 'agro', v: 2, saved: new Date().toISOString(), lists, notes, hist }, null, 1)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `agro-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  const okId = x => typeof x === 'string' && /^[A-Za-z0-9_-]{11}$/.test(x);
  async function restore(file) {
    try {
      const d = JSON.parse(await file.text()); if (!d || d.app !== 'agro') throw 0;
      let nl = 0, nv = 0;
      for (const l of Array.isArray(d.lists) ? d.lists : []) {
        const name = l && typeof l.name === 'string' ? l.name.trim().slice(0, 40) : ''; if (!name) continue;
        let t = lists.find(x => x.name.toLowerCase() === name.toLowerCase());
        if (!t) { t = { id: uid(), name, ids: [] }; lists.push(t); nl++; }
        for (const id of (Array.isArray(l.ids) ? l.ids : []).filter(okId)) if (!t.ids.includes(id)) { t.ids.push(id); nv++; }
      }
      if (d.notes && typeof d.notes === 'object') for (const [id, t] of Object.entries(d.notes)) if (okId(id) && typeof t === 'string' && t.trim() && !notes[id]) notes[id] = t.trim().slice(0, 200);
      if (d.hist && typeof d.hist === 'object') for (const [id, h] of Object.entries(d.hist)) if (okId(id) && h && Number.isFinite(h.n)) { const o = hist[id]; hist[id] = { n: Math.max(o ? o.n : 0, Math.floor(h.n)), t: Math.max(o ? o.t : 0, Number(h.t) || 0) }; }
      store.set('hist', JSON.stringify(hist)); saveAll(); closeSheet(); run();
      alert(`Restored: ${nl} new playlists, ${nv} videos added to playlists.`);
    } catch { alert('That file is not a valid backup.'); }
  }
  function renderSub() {
    if (!newSet.size) onlyNew = false;
    let h = '';
    if (tab === 'all') h += `<button class="chip" data-a="sort" type="button">${newest ? '↓ Newest first' : '↑ Oldest first'}</button>`;
    if ((tab === 'all' || tab === 'fav') && newSet.size) h += `<button class="chip nw${onlyNew ? ' on' : ''}" data-a="new" type="button">🆕 ${newSet.size} new</button>`;
    if (tab === 'fav') {
      const c = curList();
      h += lists.map(l => `<button class="chip${l.id === c.id ? ' on' : ''}" data-l="${l.id}" type="button">${esc(l.name)} <small>${l.ids.length}</small></button>`).join('')
        + '<button class="chip" data-a="add" type="button">＋ New</button><button class="chip" data-a="ren" type="button" aria-label="Rename">✎</button>'
        + (lists.length > 1 ? '<button class="chip" data-a="del" type="button" aria-label="Delete">🗑</button>' : '');
    }
    $('lists').innerHTML = h; $('lists').hidden = !h;
  }
  $('lists').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return; const a = b.dataset.a, l = curList();
    const ask = (m, d) => (prompt(m, d || '') || '').trim().slice(0, 40);
    if (a === 'sort') { newest = !newest; store.set('sort', newest ? 'new' : 'old'); run(); }
    else if (a === 'new') { onlyNew = !onlyNew; run(); }
    else if (b.dataset.l) { active = b.dataset.l; saveAll(); run(); }
    else if (a === 'add') { const n = ask('Playlist name'); if (n) { const x = { id: uid(), name: n, ids: [] }; lists.push(x); active = x.id; saveAll(); run(); } }
    else if (a === 'ren') { const n = ask('Rename playlist', l.name); if (n) { l.name = n; saveAll(); run(); } }
    else if (a === 'del' && lists.length > 1 && confirm(`Delete "${l.name}"? The videos stay in the library.`)) { lists = lists.filter(x => x !== l); active = lists[0].id; saveAll(); run(); }
  });
  function markPlayed(v) {
    document.querySelectorAll(`.card[data-id="${v.id}"]`).forEach(c => { if (!c.classList.contains('seen')) { c.classList.add('seen'); c.querySelector('.thumb').insertAdjacentHTML('beforeend', '<span class="wm" title="Watched">✓</span>'); } });
    const h = hist[v.id]; hist[v.id] = { n: (h ? h.n : 0) + 1, t: Date.now() }; store.set('hist', JSON.stringify(hist));
    if (newSet.delete(v.id)) { saveNew(); document.querySelectorAll(`.card[data-id="${v.id}"] .new`).forEach(x => x.remove()); renderSub(); }
  }
  // ---------- Stats ----------
  function showStats() {
    tab = 'stats'; saveState(); syncTabs(); renderSub();
    els.grid.hidden = true; els.empty.hidden = true; $('settings').hidden = true; els.count.textContent = '';
    const p = new URLSearchParams(location.search); p.delete('q'); p.set('tab', 'stats'); history.replaceState(null, '', '?' + p);
    const ids = Object.keys(hist).filter(id => byId.has(id)).sort((a, b) => hist[b].t - hist[a].t);
    const plays = ids.reduce((a, id) => a + hist[id].n, 0), secs = ids.reduce((a, id) => a + byId.get(id).secs, 0);
    const topics = [];
    for (const g of SYN) {
      let c = 0;
      for (const id of ids) { const v = byId.get(id); if (v.words.some(x => g.includes(x) || g.includes(x.replace(AR_PREFIX, ''))) || g.some(w => w.includes(' ') && v.n.n.includes(w))) c += hist[id].n; }
      if (c) { const w = g.find(x => /^[a-z]/.test(x)) || g[0]; topics.push([w[0].toUpperCase() + w.slice(1), c]); }
    }
    topics.sort((a, b) => b[1] - a[1]); const top = topics.slice(0, 8), max = top.length ? top[0][1] : 1;
    const kp = [[ids.length, 'Videos watched'], [Math.round(ids.length / videos.length * 100) + '%', 'of the library'], [plays, 'Total plays'], [`${Math.floor(secs / 3600)}h ${Math.floor(secs % 3600 / 60)}m`, 'Watch time (est.)']];
    $('stats').innerHTML = !ids.length ? '<div class="empty"><div>📊</div><p>Nothing watched yet — open a video and your stats show up here.</p></div>'
      : `<div class="kpis">${kp.map(([n, l]) => `<div class="kpi"><b>${n}</b><span>${l}</span></div>`).join('')}</div>
<h2>Most-played topics</h2>${top.map(([n, c]) => `<div class="bar2"><span>${esc(n)}</span><i style="width:${Math.max(6, c / max * 100)}%"></i><small>${c}</small></div>`).join('')}
<h2>Recently watched</h2>${ids.slice(0, 6).map(id => `<button class="rec" type="button" data-id="${id}" dir="auto">${esc(byId.get(id).title)}</button>`).join('')}
<p><button class="rec" type="button" data-a="rh">Clear watch history</button></p>`;
    $('stats').hidden = false;
  }
  $('stats').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.id) openPlayer(byId.get(b.dataset.id));
    else if (b.dataset.a === 'rh' && confirm('Clear watch history?')) { hist = {}; store.set('hist', '{}'); showStats(); }
  });
  // (tab switching below)
  document.querySelector('.tabs').addEventListener('click', e => {
    const b = e.target.closest('.tab'); if (!b || b.dataset.tab === tab) return;
    tab = b.dataset.tab; scrollTo(0, 0); run();
  });
  $('pstar').addEventListener('click', () => cur && openSheet(cur.id));
  addEventListener('storage', e => {
    if (!['lists', 'notes', 'hist'].includes(e.key)) return;
    lists = J('lists', defList()); notes = J('notes', {}); hist = J('hist', {}); if (!lists.length) lists = defList();
    refreshFavs(); run();
  });

  // ---------- Player (modal, grows from the centre) ----------
  const pl = $('player'), frame = $('frame');
  let lastFocus = null, lockY = 0;
  function loadPlayer() { pl.classList.remove('ready'); frame.src = embedUrl(cur.id); }
  function openPlayer(v) {
    cur = v; lastFocus = document.activeElement; lockY = scrollY; if (pl.hidden) pushOv(); markPlayed(v); remember(els.q.value);
    $('ptitle').textContent = v.title; $('ptitle').dir = 'auto';
    pl.hidden = false; document.body.classList.add('lock');
    requestAnimationFrame(() => pl.classList.add('open'));
    paintStar(v.id); loadPlayer(); $('px').focus();
  }
  function doClosePlayer() {
    if (pl.hidden) return;
    pl.classList.remove('open'); frame.src = 'about:blank';
    setTimeout(() => { pl.hidden = true; document.body.classList.remove('lock'); scrollTo(0, lockY); }, 200);
    lastFocus && lastFocus.focus && lastFocus.focus();
  }
  frame.addEventListener('load', () => { if (frame.src !== 'about:blank') pl.classList.add('ready'); });
  els.grid.addEventListener('click', e => {
    const st = e.target.closest('.star');
    if (st) { e.preventDefault(); e.stopPropagation(); openSheet(st.dataset.id); return; }
    const a = e.target.closest('a.card');
    if (!a || e.button || e.ctrlKey || e.metaKey || e.shiftKey) return; // keep new-tab clicks working
    e.preventDefault();
    const v = videos.find(x => x.id === a.dataset.id); if (v) openPlayer(v);
  });
  $('pclose').addEventListener('click', closePlayer);
  pl.addEventListener('click', e => { if (e.target === pl) closePlayer(); });
  $('pnext').addEventListener('click', () => { const i = INSTANCES.findIndex(x => x[0] === instance); setInstance(INSTANCES[(i + 1) % INSTANCES.length][0], true); });
  // "Open" button: NewPipe on Android (intent link, falls back to the video server if the app is missing), server page on desktop
  const isAndroid = /Android/i.test(navigator.userAgent);
  const useNP = () => isAndroid && store.get('newpipe') !== '0';
  // NewPipe always recognises youtube.com links. Invidious hosts only work if they are in the list built into your NewPipe version (older lists are mostly dead servers)
  const NP_HOSTS = ['inv.nadeko.net', 'yewtu.be', 'invidious.kavin.rocks', 'vid.mint.lgbt'];
  const hostOf = u => { try { return new URL(u).hostname; } catch { return ''; } };
  const npBase = () => { const v = store.get('npbase') || 'auto'; if (v !== 'auto') return v; return 'https://www.youtube.com'; }; // automatic = youtube.com, the only address NewPipe is guaranteed to recognise
  const npLink = id => `${npBase()}/watch?v=${id}`;
  const newPipeUrl = id => { const u = new URL(npLink(id)); return `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=${u.protocol.slice(0, -1)};package=org.schabi.newpipe;S.browser_fallback_url=${encodeURIComponent(watchUrl(id))};end`; };
  const syncExt = () => { $('pext').textContent = useNP() ? '▶ NewPipe' : '↗ Open'; };
  syncExt();
  // Default method = Android share sheet (works in Brave/Chrome); optional method = direct intent link
  const npMode = () => { const m = store.get('npmode'); return m === 'intent' || m === 'link' ? m : 'share'; };
  function openExt(id) {
    const server = () => window.open(watchUrl(id), '_blank', 'noopener');
    if (!useNP()) return void server();
    if (npMode() === 'link') { const a = document.createElement('a'); a.href = npLink(id); a.target = '_blank'; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove(); return; }
    if (npMode() === 'intent') { const a = document.createElement('a'); a.href = newPipeUrl(id); document.body.appendChild(a); a.click(); a.remove(); return; }
    if (!navigator.share) { toast('Sharing is not available in this browser'); return void server(); }
    (toast('Sending a ' + hostOf(npLink(id)) + ' link to NewPipe'), navigator.share({ url: npLink(id) })).catch(e => { if (e && e.name !== 'AbortError') { toast('Could not open the share menu'); server(); } });
  }
  $('pext').addEventListener('click', () => { if (cur) openExt(cur.id); });
  // ---------- Events ----------
  let timer;
  const later = () => { clearTimeout(timer); timer = setTimeout(run, 80); };
  els.q.addEventListener('input', later); // no isComposing check: Android keyboards keep a word 'composing' until Enter/space
  els.q.addEventListener('compositionend', later);
  els.clear.addEventListener('click', () => { els.q.value = ''; els.q.focus(); run(); });
  $('reset').addEventListener('click', () => { els.q.value = ''; run(); });
  document.addEventListener('keydown', e => {
    if (e.key === '/' && document.activeElement !== els.q) { e.preventDefault(); els.q.focus(); }
    if (e.key === 'Escape') { if (!$('sheet').hidden) closeSheet(); else if (!pl.hidden) closePlayer(); else if (document.activeElement === els.q) { els.q.value = ''; run(); } }
  });
  // ---------- Live search safety net for mobile keyboards ----------
  // Some Android IMEs (Gboard, Samsung, Arabic layouts) hold a word in "composition" and fire no usable
  // events until the keyboard closes, so also watch the field's value while it has focus.
  let ranQ = els.q.value;
  setInterval(() => { if (document.activeElement === els.q && els.q.value !== ranQ) run(); }, 120);
  els.q.addEventListener('keyup', later);
  // ---------- Resume + search history ----------
  history.scrollRestoration = 'manual';
  function saveState() { store.set('state', JSON.stringify({ q: els.q.value, tab, y: Math.round(scrollY) })); }
  let stT; addEventListener('scroll', () => { clearTimeout(stT); stT = setTimeout(saveState, 250); }, { passive: true });
  function restoreY(y) { while (shown < results.length && document.documentElement.scrollHeight < y + innerHeight + 200) more(); scrollTo(0, y); }
  let qh = J('qhist', []); if (!Array.isArray(qh)) qh = [];
  const sh = document.createElement('div'); sh.className = 'sh'; sh.hidden = true; sh.setAttribute('role', 'listbox');
  document.querySelector('.searchbox').appendChild(sh);
  const saveQh = () => store.set('qhist', JSON.stringify(qh));
  function remember(q) { q = (q || '').trim().slice(0, 80); if (q.length < 2) return; qh = [q, ...qh.filter(x => x !== q)].slice(0, 8); saveQh(); }
  function hideHist() { sh.hidden = true; }
  function showHist() {
    if (els.q.value || !qh.length) return hideHist();
    sh.innerHTML = '<div class="shl">Recent searches</div>' + qh.map(q => `<div class="shi" role="option" data-q="${esc(q)}"><span>🕘</span><b dir="auto">${esc(q)}</b><button type="button" data-d aria-label="Remove">✕</button></div>`).join('') + '<button type="button" class="shc" data-clear>🗑 Clear history</button>';
    sh.hidden = false;
  }
  sh.addEventListener('mousedown', e => e.preventDefault()); // keep the input focused
  sh.addEventListener('click', e => {
    if (e.target.closest('[data-clear]')) { if (confirm('Clear all recent searches? Your playlists are not affected.')) { qh = []; saveQh(); toast('Search history cleared'); } return hideHist(); }
    const row = e.target.closest('.shi'); if (!row) return;
    if (e.target.closest('[data-d]')) { qh = qh.filter(x => x !== row.dataset.q); saveQh(); return showHist(); }
    els.q.value = row.dataset.q; hideHist(); remember(row.dataset.q); run();
  });
  let hT; els.q.addEventListener('input', () => { clearTimeout(hT); hT = setTimeout(() => remember(els.q.value), 1500); showHist(); });
  els.q.addEventListener('focus', showHist); els.q.addEventListener('click', showHist); els.q.addEventListener('blur', hideHist);
  els.q.addEventListener('keydown', e => { if (e.key === 'Enter') { remember(els.q.value); hideHist(); } else if (e.key === 'Escape') hideHist(); });
  els.clear.addEventListener('click', showHist);
  // ---------- Android back button closes popups ----------
  let ovDepth = 0;
  function pushOv() { history.pushState({ ov: 1 }, ''); ovDepth++; }
  function closeSheet() { if (sheet.hidden) return; ovDepth > 0 ? history.back() : doCloseSheet(); }
  function closePlayer() { if (pl.hidden) return; ovDepth > 0 ? history.back() : doClosePlayer(); }
  addEventListener('popstate', () => { if (ovDepth <= 0) return; ovDepth--; if (!sheet.hidden) doCloseSheet(); else if (!pl.hidden) doClosePlayer(); });
  // ---------- Settings tab ----------
  let toastT;
  function toast(m) {
    let t = $('toast'); if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = m; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2400);
  }
  let deferred = null;
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; if (tab === 'settings') showSettings(); });
  addEventListener('appinstalled', () => { deferred = null; toast('App installed ✓'); if (tab === 'settings') showSettings(); });
  if ('serviceWorker' in navigator) { const had = !!navigator.serviceWorker.controller; navigator.serviceWorker.addEventListener('controllerchange', () => { if (had) toast('App updated — reload for the latest version'); }); }
  const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const row = (act, ic, t, sub, end, cls) => `<button type="button" class="row${cls || ''}" data-act="${act}"><span class="ri">${ic}</span><span class="rt">${t}${sub ? `<small>${sub}</small>` : ''}</span>${end || ''}</button>`;
  const sw = on => `<span class="sw${on ? ' on' : ''}"></span>`;
  function showSettings() {
    tab = 'settings'; saveState(); syncTabs(); renderSub();
    els.grid.hidden = true; els.empty.hidden = true; $('stats').hidden = true; els.count.textContent = '';
    const p = new URLSearchParams(location.search); p.delete('q'); p.set('tab', 'settings'); history.replaceState(null, '', '?' + p);
    const ctl = 'serviceWorker' in navigator && navigator.serviceWorker.controller;
    $('settings').innerHTML = `<div class="sg"><h2>🌐 Video server</h2>${INSTANCES.map(([u, f]) => `<button type="button" class="row" role="radio" aria-checked="${u === instance}" data-act="srv" data-u="${esc(u)}"><span class="ri">${f}</span><span class="rt">${esc(label(u))}${isAndroid ? `<small>${u === YT ? 'NewPipe can open its links' : 'NewPipe may not recognise its links'}</small>` : ''}</span><i class="rd"></i></button>`).join('')}<div class="crow"><input id="cs" type="url" inputmode="url" autocapitalize="off" spellcheck="false" placeholder="Custom server, e.g. https://invidious.example.org"><button type="button" data-act="addsrv">Add</button></div></div>
<div class="sg"><h2>⚙ Preferences</h2>${row('sort', '↕', 'Newest videos first', 'Order of the All tab', sw(newest))}${row('auto', '▶️', 'Autoplay in the player', '', sw(store.get('autoplay') !== '0'))}${isAndroid ? row('np', '📲', 'Open button sends videos to NewPipe', 'Android only', sw(useNP())) : ''}${isAndroid && useNP() ? row('npm', '🔀', 'NewPipe launch method', { share: 'Share menu — pick NewPipe each time (works everywhere)', link: 'Android link — no menu once NewPipe is set as default for YouTube links', intent: 'Direct intent — skips the menu (needs browser support)' }[npMode()]) : ''}</div>
${npSection()}
<div class="sg"><h2>💾 Backup &amp; restore</h2>${row('bk', '⬇', 'Backup to file', 'Playlists, notes and watch history')}${row('rs', '⬆', 'Restore from file', 'Merges with what is on this device')}</div>
<div class="sg"><h2>🧹 Clean up</h2>${row('hist', '👁', 'Clear watch history', Object.keys(hist).length + ' videos watched')}${row('qh', '🕘', 'Clear search history', qh.length + ' recent searches')}${row('seen', '🆕', 'Mark all as seen', newSet.size + ' new videos')}</div>
<div class="sg"><h2>📲 App</h2>${standalone() ? row('', '✅', 'Installed', 'Running as an app') : deferred ? row('install', '📲', 'Install app', 'Add to your home screen') : row('', '📲', 'Install app', 'Chrome menu ⋮ → Install app. iPhone: Share → Add to Home Screen')}${row('', ctl ? '✅' : '⏳', 'Offline mode', ctl ? 'Ready — works without internet' : 'Reload the page once to enable')}${row('upd', '🔄', 'Update / refresh app', 'Clears the offline copy and reloads')}</div>
<div class="sg"><h2>ℹ About</h2><p class="ab">${videos.length} videos · ${lists.length} playlists · ${Object.keys(notes).length} notes<br>Your data is stored only on this device.</p>${row('reset', '⚠️', 'Reset everything', 'Delete playlists, notes, history and settings', '', ' danger')}</div>`;
    $('settings').hidden = false;
  }
  function npSection() {
    if (!isAndroid) return '';
    const cur = store.get('npbase') || 'auto';
    const rows = [['auto', '🤖', 'Automatic (recommended)', 'Sends a youtube.com link. NewPipe always recognises it'],
      ['https://www.youtube.com', '▶️', 'youtube.com', 'Always supported by NewPipe'],
      ...NP_HOSTS.map(h => [`https://${h}`, '🌐', h, 'May say "Could not recognize the URL", depends on your NewPipe version'])];
    if (!rows.some(r => r[0] === cur)) rows.push([cur, '✏️', hostOf(cur) || cur, 'Custom']);
    return `<div class="sg"><h2>📲 Links supported by NewPipe</h2><p class="ab">NewPipe always understands youtube.com links. Invidious servers only work if your NewPipe version has them in its built-in list. Choose the address the ▶ NewPipe button sends.</p>${rows.map(([u, i, t, sub]) => `<button type="button" class="row" role="radio" aria-checked="${u === cur}" data-act="npb" data-u="${esc(u)}"><span class="ri">${i}</span><span class="rt">${esc(t)}<small>${esc(sub)}</small></span><i class="rd"></i></button>`).join('')}<div class="crow"><input id="cnp" type="url" inputmode="url" autocapitalize="off" spellcheck="false" placeholder="Another server NewPipe supports, https://…"><button type="button" data-act="addnp">Add</button></div></div>`;
  }
  async function refreshApp() {
    try { for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister(); for (const k of await caches.keys()) await caches.delete(k); } catch { }
    location.reload();
  }
  $('settings').addEventListener('click', async e => {
    const b = e.target.closest('[data-act]'); if (!b) return; const a = b.dataset.act;
    if (a === 'srv') { setInstance(b.dataset.u, true); toast('Server: ' + label(b.dataset.u)); }
    else if (a === 'addsrv') { const u = cleanBase($('cs').value.trim()); if (!/^https?:/.test(u)) return toast('Enter a valid address starting with https://'); setInstance(u, true); toast('Server added'); }
    else if (a === 'sort') { newest = !newest; store.set('sort', newest ? 'new' : 'old'); showSettings(); }
    else if (a === 'npb') { store.set('npbase', b.dataset.u); toast('NewPipe links: ' + (hostOf(npBase()) || 'auto')); showSettings(); }
    else if (a === 'addnp') { const u = cleanBase($('cnp').value.trim()); if (!/^https?:/.test(u)) return toast('Enter a valid address starting with https://'); store.set('npbase', u); toast('NewPipe links: ' + hostOf(u)); showSettings(); }
    else if (a === 'npm') { store.set('npmode', { share: 'link', link: 'intent', intent: 'share' }[npMode()]); showSettings(); }
    else if (a === 'np') { store.set('newpipe', useNP() ? '0' : '1'); syncExt(); showSettings(); }
    else if (a === 'auto') { store.set('autoplay', store.get('autoplay') === '0' ? '1' : '0'); showSettings(); }
    else if (a === 'bk') backup();
    else if (a === 'rs') $('file').click();
    else if (a === 'hist') { if (Object.keys(hist).length && confirm('Clear your watch history?')) { hist = {}; store.set('hist', '{}'); toast('Watch history cleared'); showSettings(); } }
    else if (a === 'qh') { if (qh.length && confirm('Clear all recent searches?')) { qh = []; saveQh(); toast('Search history cleared'); showSettings(); } }
    else if (a === 'seen') { if (newSet.size) { newSet.clear(); saveNew(); toast('All videos marked as seen'); showSettings(); } }
    else if (a === 'install' && deferred) { deferred.prompt(); await deferred.userChoice.catch(() => { }); deferred = null; showSettings(); }
    else if (a === 'upd') refreshApp();
    else if (a === 'reset' && confirm('Delete ALL playlists, notes, history and settings on this device?')) {
      ['lists', 'notes', 'hist', 'active', 'known', 'newids', 'state', 'qhist', 'sort', 'instance', 'autoplay', 'newpipe', 'npmode', 'npbase', 'favs'].forEach(k => store.set(k, null)); location.reload();
    }
  });
  // ---------- Player: tiny X at the top right ----------
  document.querySelector('.pbox').insertAdjacentHTML('afterbegin', '<button id="px" class="x" type="button" aria-label="Close (Esc)" title="Close (Esc)">✕</button>');
  $('px').addEventListener('click', closePlayer);
  // ---------- Back to top ----------
  const topBtn = document.createElement('button');
  topBtn.id = 'totop'; topBtn.type = 'button'; topBtn.setAttribute('aria-label', 'Back to top');
  topBtn.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" d="m6 15 6-6 6 6"/></svg>';
  document.body.appendChild(topBtn);
  const syncTop = () => topBtn.classList.toggle('show', scrollY > 600);
  addEventListener('scroll', syncTop, { passive: true });
  topBtn.addEventListener('click', () => scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion:reduce)').matches ? 'auto' : 'smooth' }));
  syncTop();
  if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => { }));
  init().catch(err => { els.count.textContent = 'Failed to load videos.json'; console.error(err); });
})();
