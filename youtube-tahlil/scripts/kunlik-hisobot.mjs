// YouTube Tahlil — kunlik ma'lumot yig'uvchi va Telegram hisoboti.
// GitHub Actions har kuni 17:07 (Koreya vaqti) da ishga tushiradi (.github/workflows/kunlik-hisobot.yml).
// Kerakli maxfiy qiymatlar (GitHub → Settings → Secrets → Actions):
//   YT_API_KEY   — YouTube Data API v3 kaliti (majburiy)
//   TG_BOT_TOKEN — Telegram bot tokeni (ixtiyoriy)
//   TG_CHAT_ID   — Telegram chat ID (ixtiyoriy)
// Natija: youtube-tahlil/data/history.json (dastur o'sish grafiklarini shundan oladi) + Telegram xabari.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const CFG_FILE = path.join(DIR, 'kanallar.json');
const HIST_FILE = path.join(DIR, 'history.json');
const KEY = (process.env.YT_API_KEY || '').trim();
const TG = (process.env.TG_BOT_TOKEN || '').trim();
const CHAT = (process.env.TG_CHAT_ID || '').trim();
const YT = process.env.YT_API_BASE || 'https://www.googleapis.com/youtube/v3/';
const TGB = process.env.TG_API_BASE || 'https://api.telegram.org/';
const SITE = 'https://otabek19920722.github.io/youtube-tahlil/';
const TZ = 'Asia/Seoul';
const DAY_MS = 864e5;
let used = 0;

const log = (...a) => console.log(...a);
const today = (d = new Date()) => d.toLocaleDateString('en-CA', { timeZone: TZ });
const addDays = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const median = a => { a = a.filter(x => x != null && Number.isFinite(x)).sort((x, y) => x - y); if (!a.length) return null; const i = a.length >> 1; return a.length % 2 ? a[i] : (a[i - 1] + a[i]) / 2; };
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function compact(n) {
  if (n == null || !Number.isFinite(n)) return '—';
  const a = Math.abs(n), f = (x, d) => x.toFixed(d).replace(/\.0$/, '');
  if (a < 1000) return String(Math.round(n));
  if (a < 1e6) return f(n / 1e3, a < 1e4 ? 1 : 0) + ' ming';
  if (a < 1e9) return f(n / 1e6, a < 1e7 ? 1 : 0) + ' mln';
  return f(n / 1e9, 1) + ' mlrd';
}
const signed = x => x == null || !Number.isFinite(x) ? '—' : (x > 0 ? '+' : x < 0 ? '−' : '') + compact(Math.abs(x));
const full = n => n == null ? '—' : Math.round(n).toLocaleString('ru-RU');
function parseDur(iso) { const m = /P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso || ''); return m ? (+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60 + (+m[4] || 0) : 0; }
function ago(ms) { const h = ms / 36e5; if (h < 1) return 'hozirgina'; if (h < 24) return Math.floor(h) + ' soat oldin'; return Math.floor(h / 24) + ' kun oldin'; }

async function api(p, params, cost = 1) {
  const u = new URL(p, YT);
  for (const [k, v] of Object.entries(params)) if (v != null && v !== '') u.searchParams.set(k, v);
  u.searchParams.set('key', KEY);
  let r, j;
  for (let attempt = 0; attempt < 3; attempt++) {
    try { r = await fetch(u, { headers: { Referer: SITE } }); j = await r.json().catch(() => ({})); }
    catch (e) { if (attempt === 2) throw new Error(`${p}: tarmoq xatosi (${e.message})`); await new Promise(s => setTimeout(s, 1500 * (attempt + 1))); continue; }
    if (r.status >= 500 && attempt < 2) { await new Promise(s => setTimeout(s, 1500 * (attempt + 1))); continue; }
    break;
  }
  used += cost;
  if (!r.ok || j.error) {
    const e = j.error || {}, reason = (e.errors && e.errors[0] && e.errors[0].reason) || e.status || r.status;
    const err = new Error(`${p}: ${e.message || r.status}`); err.reason = String(reason); throw err;
  }
  return j;
}
const fatal = e => /keyInvalid|API key not valid|quotaExceeded|dailyLimitExceeded|accessNotConfigured|forbidden|REFERRER/i.test((e.reason || '') + ' ' + e.message);

function mapVideo(v) {
  const s = v.statistics || {}, sn = v.snippet || {}, cd = v.contentDetails || {};
  const durSec = parseDur(cd.duration), tx = ((sn.title || '') + ' ' + (sn.description || '') + ' ' + (sn.tags || []).join(' ')).toLowerCase();
  return { id: v.id, title: sn.title || '', ch: sn.channelId, chTitle: sn.channelTitle || '', pub: Date.parse(sn.publishedAt), views: +s.viewCount || 0,
    durSec, live: sn.liveBroadcastContent, isShort: durSec > 0 && (durSec <= 60 || (durSec <= 180 && /#shorts?\b|#쇼츠|shorts/.test(tx))) };
}
async function uploads(ch, n) {
  if (!ch.uploads) return [];
  const pl = await api('playlistItems', { part: 'contentDetails', playlistId: ch.uploads, maxResults: 50 });
  const ids = (pl.items || []).map(i => i.contentDetails.videoId).slice(0, n);
  if (!ids.length) return [];
  const vj = await api('videos', { part: 'snippet,statistics,contentDetails', id: ids.join(','), maxResults: 50 });
  const now = Date.now();
  const vs = (vj.items || []).map(mapVideo).filter(v => v.live !== 'upcoming');
  for (const v of vs) { v.age = Math.max(1 / 24, (now - v.pub) / DAY_MS); v.norm = v.views * Math.pow(30 / Math.min(3650, Math.max(v.age, 0.25)), 0.4); }
  const pool = vs.filter(v => v.age >= 3), nb = median((pool.length >= 5 ? pool : vs).map(v => v.norm)) || 1;
  for (const v of vs) v.score = v.norm / nb;
  return vs;
}
async function channelsById(ids) {
  const out = {};
  for (let i = 0; i < ids.length; i += 50) {
    const j = await api('channels', { part: 'snippet,statistics,contentDetails', id: ids.slice(i, i + 50).join(',') });
    for (const c of j.items || []) {
      const st = c.statistics || {};
      out[c.id] = { id: c.id, title: (c.snippet || {}).title || '', subs: st.hiddenSubscriberCount ? null : +st.subscriberCount, views: +st.viewCount || 0,
        videos: +st.videoCount || 0, uploads: ((c.contentDetails || {}).relatedPlaylists || {}).uploads };
    }
  }
  return out;
}
async function resolveRefs(list, hist) {
  const ids = [], missing = [];
  for (const it of list) {
    const ref = typeof it === 'string' ? it : (it && (it.id || it.ref)) || '';
    if (!ref) continue;
    if (/^UC[\w-]{20,}$/.test(ref)) { ids.push(ref); continue; }
    const handle = '@' + String(ref).replace(/^.*@/, '').replace(/[\/?#].*$/, '');
    if (hist.ids[handle.toLowerCase()]) { ids.push(hist.ids[handle.toLowerCase()]); continue; }
    try {
      const j = await api('channels', { part: 'id', forHandle: handle });
      const id = j.items && j.items[0] && j.items[0].id;
      if (id) { hist.ids[handle.toLowerCase()] = id; ids.push(id); } else missing.push(handle);
    } catch (e) { if (fatal(e)) throw e; missing.push(handle); }
  }
  return { ids: [...new Set(ids)], missing };
}

function speedText(v, hist) {
  // oldingi videolarning xuddi shu yoshdagi ko'rishlari bilan solishtirish (tarix bo'lsa), aks holda model bo'yicha
  const ageH = (Date.now() - v.pub) / 36e5, peers = [];
  for (const [id, e] of Object.entries(hist.videos)) {
    if (id === v.id || e.c !== v.ch || !!e.s !== !!v.isShort || !Array.isArray(e.p)) continue;
    const P = e.p.map(([t, x]) => [(t - e.pub) / 36e5, x]);
    let val = null;
    for (const p of P) if (Math.abs(p[0] - ageH) <= Math.max(1, ageH * 0.15)) { val = p[1]; break; }
    if (val == null) for (let i = 1; i < P.length; i++) { const a = P[i - 1], b = P[i]; if (a[0] <= ageH && ageH <= b[0] && b[0] > a[0]) { val = a[1] + (b[1] - a[1]) * (ageH - a[0]) / (b[0] - a[0]); break; } }
    if (val != null) peers.push(val);
  }
  const r = peers.length >= 3 ? v.views / Math.max(1, median(peers)) : v.score;
  const word = r >= 1.8 ? '🔥 odatdagidan tez' : r >= 0.8 ? 'odatdagidek' : 'odatdagidan sekin';
  return { r, txt: `${r.toFixed(1)}× ${word}${peers.length >= 3 ? '' : ' (taxminiy)'}` };
}

async function sendTelegram(text) {
  const parts = [];
  let cur = '';
  for (const block of text.split('\n\n')) {
    if ((cur + '\n\n' + block).length > 3800 && cur) { parts.push(cur); cur = block; } else cur = cur ? cur + '\n\n' + block : block;
  }
  if (cur) parts.push(cur);
  for (const p of parts) {
    const r = await fetch(`${TGB}bot${TG}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT, text: p, parse_mode: 'HTML', disable_web_page_preview: true }) });
    const j = await r.json().catch(() => ({}));
    if (!j.ok) throw new Error('Telegram: ' + (j.description || r.status));
  }
  return parts.length;
}

async function main() {
  if (!KEY) {
    log("ℹ️ YT_API_KEY maxfiy qiymati qo'shilmagan — hisobot o'tkazib yuborildi. Qo'shish: GitHub → Settings → Secrets and variables → Actions.");
    return;
  }
  const cfg = JSON.parse(await fs.readFile(CFG_FILE, 'utf8'));
  let hist;
  try { hist = JSON.parse(await fs.readFile(HIST_FILE, 'utf8')); } catch { hist = {}; }
  hist = Object.assign({ v: 1, updated: null, ids: {}, channels: {}, videos: {} }, hist);
  const day = today(), now = Date.now();

  const own = await resolveRefs(cfg.mening_kanallarim || [], hist);
  const riv = await resolveRefs(cfg.raqiblar || [], hist);
  const rivIds = riv.ids.filter(id => !own.ids.includes(id)).slice(0, 15);
  if (!own.ids.length) throw new Error("kanallar.json'dagi o'z kanallaringizdan birortasi ham topilmadi: " + own.missing.join(', '));
  const chans = await channelsById([...own.ids, ...rivIds]);

  const lines = [`📊 <b>YouTube Tahlil</b> — ${day}`];
  for (const id of own.ids) {
    const c = chans[id]; if (!c) continue;
    const h = hist.channels[id] = hist.channels[id] || { title: c.title, days: {} };
    h.title = c.title;
    const prevDays = Object.keys(h.days).filter(d => d < day).sort();
    const at = n => { const lim = addDays(day, -n); let b = null; for (const d of prevDays) if (d <= lim) b = d; return b; };
    const d1 = at(1), d7 = at(7);
    const diff = (d, i, cur) => d && h.days[d][i] != null && cur != null ? cur - h.days[d][i] : null;
    const span = d => d ? Math.round((Date.parse(day) - Date.parse(d)) / DAY_MS) : 0;
    h.days[day] = [c.subs, c.views, c.videos];
    let vs = [];
    try { vs = await uploads(c, 25); } catch (e) { if (fatal(e)) throw e; log('⚠️', c.title, e.message); }
    for (const v of vs) {
      if (v.age > 30) continue;
      const e = hist.videos[v.id] = hist.videos[v.id] || { c: id, s: v.isShort ? 1 : 0, pub: v.pub, t: v.title, p: [] };
      e.t = v.title;
      const last = e.p[e.p.length - 1];
      if (last && now - last[0] < 6 * 36e5) { last[0] = now; last[1] = v.views; } else e.p.push([now, v.views]);
    }
    const L = [`📺 <b>${esc(c.title)}</b>`];
    const s1 = diff(d1, 0, c.subs), s7 = diff(d7, 0, c.subs), v1 = diff(d1, 1, c.views);
    L.push(`👥 ${c.subs != null ? full(c.subs) : 'yashirin'} obunachi` + (s1 != null ? ` (${signed(s1)} ${span(d1) === 1 ? 'kecha' : span(d1) + ' kunda'})` : '') + (s7 != null ? ` · 7 kunda ${signed(s7)}` : ''));
    if (v1 != null) L.push(`👁 ${signed(v1)} ko'rish ${span(d1) === 1 ? 'kecha' : span(d1) + ' kunda'}`);
    const fresh = vs.filter(v => v.age <= 7).sort((a, b) => b.pub - a.pub);
    for (const v of fresh.slice(0, 4)) { const sp = speedText(v, hist); L.push(`🆕 ${esc(v.title)} — ${compact(v.views)} ko'rish, ${ago(now - v.pub)}, ${sp.txt}`); }
    if (!fresh.length && vs.length) {
      const last = Math.max(...vs.map(v => v.pub)), gaps = [];
      const sorted = [...vs].sort((a, b) => b.pub - a.pub);
      for (let i = 0; i < Math.min(sorted.length - 1, 15); i++) gaps.push((sorted[i].pub - sorted[i + 1].pub) / DAY_MS);
      const g = median(gaps);
      L.push(`🕒 Oxirgi video ${ago(now - last)}` + (g ? ` (odatda har ${Math.max(1, Math.round(g))} kunda)` : ''));
    }
    const best = vs.filter(v => !v.isShort && v.age >= 3 && v.age <= 60 && v.score >= 2).sort((a, b) => b.score - a.score)[0];
    if (best && !fresh.includes(best)) L.push(`💡 Eng yaxshi uzun video: «${esc(best.title)}» (${best.score.toFixed(1)}×) — undan Shorts kesing.`);
    lines.push(L.join('\n'));
  }
  if (own.missing.length) lines.push(`⚠️ Topilmadi: ${esc(own.missing.join(', '))} — kanallar.json'ni tekshiring.`);

  const hits = [];
  for (const id of rivIds) {
    const c = chans[id]; if (!c) continue;
    const h = hist.channels[id] = hist.channels[id] || { title: c.title, days: {}, raqib: true };
    h.title = c.title; h.raqib = true; h.days[day] = [c.subs, c.views, c.videos];
    try { hits.push(...(await uploads(c, 12)).filter(v => v.age <= 7 && v.age >= 0.25 && v.score >= 1.5)); }
    catch (e) { if (fatal(e)) throw e; log('⚠️', c.title, e.message); }
  }
  if (hits.length) {
    hits.sort((a, b) => b.score - a.score);
    lines.push('🔥 <b>Raqiblarda bu hafta</b>\n' + hits.slice(0, 5).map(v => `• <a href="https://youtu.be/${v.id}">${esc(v.title)}</a> — ${esc(v.chTitle)}, ${compact(v.views)} ko'rish, ${v.score.toFixed(1)}×`).join('\n'));
  }
  lines.push(`🔗 <a href="${SITE}#report">To'liq hisobot</a> · limitdan ≈ ${used} birlik`);

  // eski yozuvlarni tozalash
  for (const [id, e] of Object.entries(hist.videos)) if (!e || now - e.pub > 40 * DAY_MS) delete hist.videos[id];
  for (const h of Object.values(hist.channels)) { const ks = Object.keys(h.days || {}).sort(); while (ks.length > 800) delete h.days[ks.shift()]; }
  hist.updated = new Date().toISOString();
  await fs.writeFile(HIST_FILE, JSON.stringify(hist) + '\n');

  const text = lines.join('\n\n');
  log(text.replace(/<[^>]+>/g, ''));
  if (TG && CHAT) {
    try { const n = await sendTelegram(text); log(`✅ Telegram'ga yuborildi (${n} ta xabar)`); }
    catch (e) { console.error('❌', e.message); process.exitCode = 1; }
  } else log("ℹ️ TG_BOT_TOKEN / TG_CHAT_ID qo'shilmagan — faqat tarix yozildi.");
}

main().catch(async e => {
  console.error('❌ Xato:', e.message);
  process.exitCode = 1;
  if (TG && CHAT) {
    const why = /quota|dailyLimit/i.test(e.reason + e.message) ? "bugungi YouTube limiti tugagan" : /keyInvalid|not valid/i.test(e.reason + e.message) ? "YT_API_KEY noto'g'ri" : /REFERRER|referer/i.test(e.message) ? "API kalitda veb-sayt cheklovi bor" : e.message;
    try { await sendTelegram(`❌ <b>YouTube Tahlil</b>: kunlik hisobotni tuzib bo'lmadi — ${esc(why)}.`); } catch {}
  }
});
