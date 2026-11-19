'use strict';
/* =========================================================
   BUSCA TU PELI — lógica de la app
   API: The Movie Database (TMDB) https://developer.themoviedb.org
   ========================================================= */

const CFG = (typeof CONFIG !== 'undefined' && CONFIG) || {};
const API = 'https://api.themoviedb.org/3';
const IMG = 'https://image.tmdb.org/t/p/';
const LANG = CFG.LANG || 'es-AR';
const REGION = CFG.REGION || 'AR';
const LS = { theme: 'btp-theme', favs: 'btp-favs', key: 'btp-key' };

const $ = (s) => document.querySelector(s);
const grid = $('#grid');
const statusEl = $('#status');
const btnMore = $('#btnMore');
const input = $('#q');
const btnClear = $('#btnClear');
const modal = $('#movieModal');
const modalBody = $('#modalBody');
const installModal = $('#installModal');

const VIEWS = {
  trending: { title: 'Tendencias de la semana', path: '/trending/movie/week' },
  top: { title: 'Mejor puntuadas', path: '/movie/top_rated', params: { region: REGION } },
  upcoming: { title: 'Próximos estrenos en cines', path: '/movie/upcoming', params: { region: REGION } },
  favs: { title: 'Tus favoritas' }
};

const state = { view: 'trending', query: '', page: 1, totalPages: 1, reqId: 0, movies: new Map() };

/* ---------- utilidades ---------- */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const year = (d) => (d || '').slice(0, 4);
const store = {
  get(k, def) { try { const v = localStorage.getItem(k); return v === null ? def : JSON.parse(v); } catch { return def; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

function keyFromConfig() {
  const k = String(CFG.TMDB_API_KEY || '').trim();
  return k && !k.startsWith('PEGA_ACA') ? k : '';
}
function getKey() {
  return keyFromConfig() || store.get(LS.key, '');
}

/* ---------- llamada a la API ---------- */
async function tmdb(path, params = {}) {
  const key = getKey();
  if (!key) throw Object.assign(new Error('Falta API key'), { code: 'NO_KEY' });
  const url = new URL(API + path);
  const isToken = key.startsWith('eyJ'); // "Token de lectura" (v4) en lugar de API Key (v3)
  const p = { language: LANG, ...params };
  if (!isToken) p.api_key = key;
  Object.entries(p).forEach(([k, v]) => { if (v !== undefined && v !== '') url.searchParams.set(k, v); });
  const res = await fetch(url, isToken ? { headers: { Authorization: 'Bearer ' + key, accept: 'application/json' } } : undefined);
  if (res.status === 401) throw Object.assign(new Error('Clave inválida'), { code: 'BAD_KEY' });
  if (!res.ok) throw Object.assign(new Error('Error ' + res.status), { code: 'HTTP' });
  return res.json();
}

function handleError(err) {
  grid.innerHTML = '';
  btnMore.hidden = true;
  // Si la clave viene de config.js, los visitantes NUNCA ven el cuadro para pegar clave
  if (err.code === 'BAD_KEY' && keyFromConfig()) {
    statusEl.innerHTML = '<span class="big">😕</span>El servicio de películas no responde en este momento. Probá más tarde.';
    console.warn('Busca tu peli: la API key de config.js fue rechazada por TMDB. Revisala.');
    return;
  }
  if (err.code === 'NO_KEY' || err.code === 'BAD_KEY') {
    $('#setup').hidden = false;
    statusEl.innerHTML = err.code === 'BAD_KEY'
      ? '<span class="big">🔒</span>La API key no es válida. Revisala y volvé a pegarla.'
      : '';
    return;
  }
  statusEl.innerHTML = navigator.onLine
    ? '<span class="big">😕</span>No pudimos cargar las películas. Probá de nuevo en un rato.'
    : '<span class="big">📡</span>Estás sin internet. Conectate y volvé a intentar.';
}

/* ---------- favoritas ---------- */
const getFavs = () => store.get(LS.favs, []);
const isFav = (id) => getFavs().some((m) => m.id === id);
function toggleFav(m) {
  let favs = getFavs();
  if (favs.some((f) => f.id === m.id)) {
    favs = favs.filter((f) => f.id !== m.id);
    toast('Quitada de favoritas');
  } else {
    favs.unshift({ id: m.id, title: m.title, poster_path: m.poster_path, release_date: m.release_date, vote_average: m.vote_average });
    toast('❤️ Agregada a favoritas');
  }
  store.set(LS.favs, favs);
  document.querySelectorAll(`[data-fav="${m.id}"]`).forEach(updateFavBtn);
  if (state.view === 'favs' && !state.query) renderFavs();
}
function updateFavBtn(btn) {
  const on = isFav(Number(btn.dataset.fav));
  btn.classList.toggle('on', on);
  btn.setAttribute('aria-pressed', on);
  if (btn.classList.contains('fav')) btn.textContent = on ? '♥' : '♡';
  else btn.innerHTML = on ? '♥ En favoritas' : '♡ Agregar a favoritas';
}

/* ---------- tarjetas ---------- */
function cardHTML(m) {
  const poster = m.poster_path
    ? `<img loading="lazy" src="${IMG}w342${m.poster_path}" alt="Póster de ${esc(m.title)}">`
    : `<div class="noposter">🎬<span>${esc(m.title)}</span></div>`;
  const rating = m.vote_average ? `<span class="badge">★ ${m.vote_average.toFixed(1)}</span>` : '';
  const fav = isFav(m.id);
  return `<article class="card">
    <button class="card-open" type="button" data-id="${m.id}" aria-label="Ver detalles de ${esc(m.title)}">
      <div class="poster">${poster}${rating}</div>
      <div class="card-body"><h3>${esc(m.title)}</h3><p>${year(m.release_date) || '—'}</p></div>
    </button>
    <button class="fav ${fav ? 'on' : ''}" type="button" data-fav="${m.id}" aria-pressed="${fav}" aria-label="Favorita: ${esc(m.title)}">${fav ? '♥' : '♡'}</button>
  </article>`;
}
function renderCards(list) {
  list.forEach((m) => state.movies.set(m.id, m));
  grid.insertAdjacentHTML('beforeend', list.map(cardHTML).join(''));
}
function skeletons(n = 12) {
  grid.innerHTML = Array.from({ length: n }, () =>
    '<div class="card skeleton" aria-hidden="true"><div class="poster"></div><div class="line"></div></div>').join('');
}
function renderFavs() {
  const favs = getFavs();
  grid.innerHTML = '';
  btnMore.hidden = true;
  statusEl.innerHTML = favs.length ? '' : '<span class="big">💔</span>Todavía no tenés favoritas. Tocá el ♡ de una película para guardarla.';
  renderCards(favs);
}

/* ---------- cargar listas ---------- */
async function load(reset = true) {
  $('#setup').hidden = true;
  if (reset) { state.page = 1; statusEl.innerHTML = ''; }
  $('#sectionTitle').textContent = state.query ? `Resultados para “${state.query}”` : VIEWS[state.view].title;

  if (!state.query && state.view === 'favs') { state.reqId++; renderFavs(); return; }

  const id = ++state.reqId;
  if (reset) skeletons();
  btnMore.disabled = true;
  try {
    const data = state.query
      ? await tmdb('/search/movie', { query: state.query, page: state.page, include_adult: false })
      : await tmdb(VIEWS[state.view].path, { ...VIEWS[state.view].params, page: state.page });
    if (id !== state.reqId) return; // llegó una búsqueda más nueva
    if (reset) grid.innerHTML = '';
    state.totalPages = Math.min(data.total_pages || 1, 500);
    if (reset && !data.results.length) {
      statusEl.innerHTML = '<span class="big">🔎</span>No encontramos películas con ese nombre. Probá con otra palabra.';
    }
    renderCards(data.results);
    btnMore.hidden = state.page >= state.totalPages;
  } catch (err) {
    if (id === state.reqId) handleError(err);
  } finally {
    if (id === state.reqId) btnMore.disabled = false;
  }
}

/* ---------- detalle de película ---------- */
function pickTrailer(videos = []) {
  const yt = videos.filter((v) => v.site === 'YouTube');
  const rank = (v) => (v.type === 'Trailer' ? 0 : v.type === 'Teaser' ? 1 : 2) + (v.iso_639_1 === 'es' ? 0 : 0.5);
  return yt.sort((a, b) => rank(a) - rank(b))[0];
}
function runtime(min) {
  if (!min) return '';
  const h = Math.floor(min / 60), m = min % 60;
  return h ? `${h} h ${m} min` : `${m} min`;
}
function providersHTML(wp) {
  const r = wp && wp.results && wp.results[REGION];
  if (!r) return '<p class="small">No hay información de plataformas para Argentina.</p>';
  const groups = [['flatrate', 'En streaming'], ['free', 'Gratis'], ['ads', 'Gratis con anuncios'], ['rent', 'Para alquilar'], ['buy', 'Para comprar']];
  const html = groups.filter(([k]) => r[k] && r[k].length).map(([k, label]) => `
    <div class="prov-group"><b>${label}</b><div class="prov-list">
      ${r[k].map((p) => `<a href="${esc(r.link)}" target="_blank" rel="noopener" title="${esc(p.provider_name)}">
        <img loading="lazy" src="${IMG}w92${p.logo_path}" alt="${esc(p.provider_name)}"></a>`).join('')}
    </div></div>`).join('');
  return (html || '<p class="small">No está disponible en plataformas en Argentina por ahora.</p>') +
    '<p class="small">Datos de disponibilidad: JustWatch.</p>';
}

async function openMovie(id) {
  modalBody.innerHTML = '<button class="m-close" type="button" data-close aria-label="Cerrar">✕</button><div class="loading"><div class="spinner"></div>Cargando…</div>';
  if (!modal.open) modal.showModal();
  history.replaceState(null, '', '#peli-' + id);
  try {
    const d = await tmdb(`/movie/${id}`, { append_to_response: 'videos,credits,watch/providers,similar', include_video_language: 'es,en,null' });
    if (!d.overview) { // si no hay sinopsis en español, la traemos en inglés
      try { const en = await tmdb(`/movie/${id}`, { language: 'en-US' }); d.overview = en.overview; d.overviewEn = !!en.overview; } catch {}
    }
    state.movies.set(d.id, d);
    renderMovie(d);
  } catch (err) {
    modalBody.innerHTML = '<button class="m-close" type="button" data-close aria-label="Cerrar">✕</button><div class="loading">😕 No se pudo cargar la película.</div>';
  }
}

function renderMovie(d) {
  const tr = pickTrailer(d.videos && d.videos.results);
  const cast = ((d.credits && d.credits.cast) || []).slice(0, 12);
  const director = ((d.credits && d.credits.crew) || []).filter((c) => c.job === 'Director').map((c) => c.name).join(', ');
  const similar = ((d.similar && d.similar.results) || []).slice(0, 12);
  const meta = [year(d.release_date), runtime(d.runtime),
    d.vote_average ? `<span class="stars">★ ${d.vote_average.toFixed(1)}</span> (${d.vote_count.toLocaleString('es-AR')} votos)` : ''
  ].filter(Boolean).join(' · ');
  const fav = isFav(d.id);

  modalBody.innerHTML = `
    <button class="m-close" type="button" data-close aria-label="Cerrar">✕</button>
    <div class="m-hero${d.backdrop_path ? '' : ' empty'}" style="${d.backdrop_path ? `background-image:url('${IMG}w1280${d.backdrop_path}')` : ''}"></div>
    <div class="m-content">
      <div class="m-head">
        ${d.poster_path ? `<img src="${IMG}w342${d.poster_path}" alt="Póster de ${esc(d.title)}">` : ''}
        <div>
          <h2>${esc(d.title)}</h2>
          ${d.original_title && d.original_title !== d.title ? `<div class="meta">Título original: ${esc(d.original_title)}</div>` : ''}
          ${d.tagline ? `<p class="tagline">${esc(d.tagline)}</p>` : ''}
          <div class="meta">${meta}</div>
          ${director ? `<div class="meta">Dirección: ${esc(director)}</div>` : ''}
          <div class="tags">${(d.genres || []).map((g) => `<span>${esc(g.name)}</span>`).join('')}</div>
        </div>
      </div>
      <div class="m-actions">
        <button class="btn ${fav ? 'on' : ''}" type="button" data-fav="${d.id}" aria-pressed="${fav}">${fav ? '♥ En favoritas' : '♡ Agregar a favoritas'}</button>
        <button class="btn" type="button" data-share="${d.id}">📤 Compartir</button>
      </div>

      <h3>Sinopsis</h3>
      <p>${d.overview ? esc(d.overview) : 'Sin sinopsis disponible.'}${d.overviewEn ? ' <em class="small">(en inglés)</em>' : ''}</p>

      ${tr ? `<h3>Tráiler</h3>
      <div class="trailer"><button class="play" type="button" data-yt="${esc(tr.key)}" style="background-image:url('https://i.ytimg.com/vi/${esc(tr.key)}/hqdefault.jpg')"><span>▶ Ver tráiler</span></button></div>` : ''}

      <h3>Dónde verla en Argentina</h3>
      <div class="providers">${providersHTML(d['watch/providers'])}</div>

      ${cast.length ? `<h3>Reparto</h3><div class="row">${cast.map((c) => `
        <div class="person">${c.profile_path ? `<img loading="lazy" src="${IMG}w185${c.profile_path}" alt="${esc(c.name)}">` : '<div class="ph">👤</div>'}
          <b>${esc(c.name)}</b><span>${esc(c.character)}</span></div>`).join('')}</div>` : ''}

      ${similar.length ? `<h3>Si te gustó, mirá también</h3><div class="row">${similar.map((s) => `
        <button class="mini" type="button" data-id="${s.id}">${s.poster_path ? `<img loading="lazy" src="${IMG}w185${s.poster_path}" alt="">` : '<div class="ph">🎬</div>'}
          <b>${esc(s.title)}</b></button>`).join('')}</div>` : ''}
    </div>`;
  modal.scrollTop = 0;
}

async function shareMovie(id) {
  const d = state.movies.get(id);
  const url = location.origin + location.pathname + '#peli-' + id;
  const text = d ? `🎬 ${d.title}${year(d.release_date) ? ' (' + year(d.release_date) + ')' : ''} — mirala en Busca tu peli` : 'Mirala en Busca tu peli';
  if (navigator.share) {
    try { await navigator.share({ title: d ? d.title : 'Busca tu peli', text, url }); } catch {}
  } else {
    try { await navigator.clipboard.writeText(`${text} ${url}`); toast('🔗 Enlace copiado'); }
    catch { prompt('Copiá este enlace:', url); }
  }
}

/* ---------- eventos ---------- */
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-id],[data-fav],[data-share],[data-yt],[data-close]');
  if (!t) return;
  if (t.dataset.close !== undefined) { t.closest('dialog').close(); return; }
  if (t.dataset.fav) {
    const id = Number(t.dataset.fav);
    const m = state.movies.get(id) || getFavs().find((f) => f.id === id);
    if (m) toggleFav(m);
    return;
  }
  if (t.dataset.share) { shareMovie(Number(t.dataset.share)); return; }
  if (t.dataset.yt) {
    t.parentElement.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(t.dataset.yt)}?autoplay=1&rel=0" title="Tráiler" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`;
    return;
  }
  if (t.dataset.id) openMovie(Number(t.dataset.id));
});

// cerrar ventana tocando afuera
[modal, installModal].forEach((dlg) => dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); }));
modal.addEventListener('close', () => {
  modalBody.innerHTML = ''; // corta el video si estaba sonando
  if (location.hash.startsWith('#peli-')) history.replaceState(null, '', location.pathname + location.search);
});

// búsqueda (espera a que termines de escribir)
let debounce;
input.addEventListener('input', () => {
  btnClear.hidden = !input.value;
  clearTimeout(debounce);
  debounce = setTimeout(() => setQuery(input.value), 450);
});
$('#searchForm').addEventListener('submit', (e) => { e.preventDefault(); clearTimeout(debounce); setQuery(input.value); input.blur(); });
btnClear.addEventListener('click', () => { input.value = ''; btnClear.hidden = true; setQuery(''); input.focus(); });
function setQuery(q) {
  q = q.trim();
  if (q.length === 1) return; // esperamos al menos 2 letras
  if (q === state.query) return;
  state.query = q;
  document.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', !q && c.dataset.view === state.view));
  load(true);
}

// secciones
$('#chips').addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  state.view = chip.dataset.view;
  state.query = ''; input.value = ''; btnClear.hidden = true;
  document.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c === chip));
  load(true);
});

btnMore.addEventListener('click', () => { state.page++; load(false); });

// atajo: tecla "/" para ir al buscador
document.addEventListener('keydown', (e) => {
  if (e.key === '/' && document.activeElement !== input && !modal.open) { e.preventDefault(); input.focus(); }
});

// guardar API key desde la pantalla
$('#keyForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const k = $('#keyInput').value.trim();
  if (!k) return;
  store.set(LS.key, k);
  toast('🔑 Clave guardada');
  load(true);
});

/* ---------- modo claro / oscuro ---------- */
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem(LS.theme, t); } catch {}
  document.querySelector('meta[name="theme-color"]').setAttribute('content', t === 'dark' ? '#0f0a1f' : '#f7f5fb');
  $('#btnTheme').setAttribute('aria-label', t === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro');
}
applyTheme(document.documentElement.dataset.theme || 'dark');
$('#btnTheme').addEventListener('click', () => applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));

/* ---------- instalar app ---------- */
let deferredPrompt = null;
const btnInstall = $('#btnInstall');
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
if (isStandalone()) btnInstall.hidden = true;

window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; });
window.addEventListener('appinstalled', () => { btnInstall.hidden = true; deferredPrompt = null; toast('🎉 ¡App instalada!'); });

btnInstall.addEventListener('click', async () => {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    return;
  }
  const ua = navigator.userAgent;
  const iOS = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const android = /android/i.test(ua);
  $('#installSteps').innerHTML = iOS
    ? `<ol><li>Abrí esta página en <b>Safari</b>.</li><li>Tocá el botón <b>Compartir</b> (el cuadrado con la flecha hacia arriba ⬆️).</li><li>Bajá y elegí <b>“Agregar a inicio”</b>.</li><li>Tocá <b>“Agregar”</b>. ¡Listo! Vas a ver el ícono en tu pantalla.</li></ol>`
    : android
      ? `<ol><li>Abrí esta página en <b>Chrome</b>.</li><li>Tocá los <b>tres puntitos ⋮</b> arriba a la derecha.</li><li>Elegí <b>“Instalar app”</b> o <b>“Agregar a la pantalla principal”</b>.</li><li>Confirmá con <b>“Instalar”</b>.</li></ol>`
      : `<ol><li>Usá <b>Chrome</b> o <b>Edge</b>.</li><li>Buscá el ícono de <b>instalar</b> (una pantallita con flecha) a la derecha de la barra de direcciones.</li><li>Hacé clic en <b>“Instalar”</b>.</li></ol>`;
  installModal.showModal();
});

/* ---------- avisos de conexión ---------- */
window.addEventListener('offline', () => toast('📡 Sin conexión'));
window.addEventListener('online', () => toast('✅ Conexión recuperada'));

/* ---------- service worker (modo app / sin internet) ---------- */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

/* ---------- inicio ---------- */
load(true);
const deep = location.hash.match(/^#peli-(\d+)$/);
if (deep) openMovie(Number(deep[1]));
