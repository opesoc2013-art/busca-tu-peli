'use strict';
/* =========================================================
   BUSCA TU PELI — lógica de la app (v3)
   API: The Movie Database (TMDB) https://developer.themoviedb.org
   ========================================================= */

const CFG = (typeof CONFIG !== 'undefined' && CONFIG) || {};
const API = 'https://api.themoviedb.org/3';
const IMG = 'https://image.tmdb.org/t/p/';
const LANG = CFG.LANG || 'es-AR';
const REGION = CFG.REGION || 'AR';
const LS = { theme: 'btp-theme', favs: 'btp-favs', seen: 'btp-seen', key: 'btp-key' };

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
const grid = $('#grid');
const statusEl = $('#status');
const btnMore = $('#btnMore');
const input = $('#q');
const btnClear = $('#btnClear');
const selGenre = $('#selGenre');
const selYear = $('#selYear');
const btnReset = $('#btnReset');
const modal = $('#movieModal');
const modalBody = $('#modalBody');
const installModal = $('#installModal');

const VIEWS = {
  movie: {
    trending: { title: 'Películas en tendencia', path: '/trending/movie/week' },
    top: { title: 'Películas mejor puntuadas', path: '/movie/top_rated', params: { region: REGION } },
    upcoming: { title: 'Próximos estrenos en cines', path: '/movie/upcoming', params: { region: REGION }, chip: '📅 Próximos estrenos' }
  },
  tv: {
    trending: { title: 'Series en tendencia', path: '/trending/tv/week' },
    top: { title: 'Series mejor puntuadas', path: '/tv/top_rated' },
    upcoming: { title: 'Series en emisión', path: '/tv/on_the_air', chip: '📡 En emisión' }
  }
};
const LISTS = { favs: 'Tus favoritas', seen: 'Ya las viste' };

const state = { type: 'movie', view: 'trending', query: '', genre: '', year: '', page: 1, totalPages: 1, reqId: 0, items: new Map() };

/* ---------- utilidades ---------- */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const yearOf = (d) => (d || '').slice(0, 4);
const store = {
  get(k, def) { try { const v = localStorage.getItem(k); return v === null ? def : JSON.parse(v); } catch { return def; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};
const typeWord = (t) => (t === 'tv' ? 'serie' : 'película');

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

// Unifica películas y series en un mismo formato
function normalize(r, type) {
  return {
    key: `${type}-${r.id}`, id: r.id, type,
    title: r.title || r.name || '',
    date: r.release_date || r.first_air_date || r.date || '',
    poster_path: r.poster_path || null,
    vote_average: r.vote_average || 0,
    genre_ids: r.genre_ids || (r.genres || []).map((g) => g.id)
  };
}

/* ---------- clave de la API ---------- */
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
    statusEl.innerHTML = err.code === 'BAD_KEY' ? '<span class="big">🔒</span>La API key no es válida. Revisala y volvé a pegarla.' : '';
    return;
  }
  statusEl.innerHTML = navigator.onLine
    ? '<span class="big">😕</span>No pudimos cargar los resultados. Probá de nuevo en un rato.'
    : '<span class="big">📡</span>Estás sin internet. Conectate y volvé a intentar.';
}

/* ---------- listas guardadas: favoritas y "ya la vi" ---------- */
function getList(name) {
  // compatibilidad con la versión anterior (solo películas, sin "key")
  return store.get(LS[name], []).map((m) => (m.key ? m : normalize(m, 'movie')));
}
const inList = (name, key) => getList(name).some((m) => m.key === key);

function toggleList(name, key) {
  const item = state.items.get(key) || getList(name).find((m) => m.key === key);
  if (!item) return;
  let list = getList(name);
  const was = list.some((m) => m.key === key);
  list = was ? list.filter((m) => m.key !== key) : [item, ...list];
  store.set(LS[name], list);
  if (name === 'favs') toast(was ? 'Quitada de favoritas' : '❤️ Agregada a favoritas');
  else toast(was ? 'Quitada de "Ya las vi"' : '✅ Marcada como vista');
  refreshToggles(key);
  if (!state.query && state.view === name) renderList(name);
}

function refreshToggles(key) {
  const fav = inList('favs', key);
  const seen = inList('seen', key);
  $$(`[data-fav="${key}"]`).forEach((b) => {
    b.classList.toggle('on', fav);
    b.setAttribute('aria-pressed', fav);
    b.innerHTML = b.classList.contains('fav') ? (fav ? '♥' : '♡') : (fav ? '♥ En favoritas' : '♡ Agregar a favoritas');
  });
  $$(`[data-seen="${key}"]`).forEach((b) => {
    b.classList.toggle('on', seen);
    b.setAttribute('aria-pressed', seen);
    b.innerHTML = b.classList.contains('seen-btn') ? (seen ? '✓' : '👁') : (seen ? '✅ Ya la vi' : '👁 Marcar como vista');
  });
  $$(`[data-card="${key}"]`).forEach((c) => {
    c.classList.toggle('is-seen', seen);
    const rib = c.querySelector('.ribbon');
    if (seen && !rib) c.querySelector('.poster').insertAdjacentHTML('beforeend', '<span class="ribbon">✓ Vista</span>');
    if (!seen && rib) rib.remove();
  });
}

/* ---------- tarjetas ---------- */
function cardHTML(m, showType) {
  const poster = m.poster_path
    ? `<img loading="lazy" src="${IMG}w342${m.poster_path}" alt="Póster de ${esc(m.title)}">`
    : `<div class="noposter">${m.type === 'tv' ? '📺' : '🎬'}<span>${esc(m.title)}</span></div>`;
  const rating = m.vote_average ? `<span class="badge">★ ${Number(m.vote_average).toFixed(1)}</span>` : '';
  const fav = inList('favs', m.key);
  const seen = inList('seen', m.key);
  return `<article class="card ${seen ? 'is-seen' : ''}" data-card="${m.key}">
    <button class="card-open" type="button" data-open="${m.type}:${m.id}" aria-label="Ver detalles de ${esc(m.title)}">
      <div class="poster">${poster}${rating}${seen ? '<span class="ribbon">✓ Vista</span>' : ''}${showType && m.type === 'tv' ? '<span class="type-tag">Serie</span>' : ''}</div>
      <div class="card-body"><h3>${esc(m.title)}</h3><p>${yearOf(m.date) || '—'}</p></div>
    </button>
    <button class="fav ${fav ? 'on' : ''}" type="button" data-fav="${m.key}" aria-pressed="${fav}" aria-label="Favorita: ${esc(m.title)}">${fav ? '♥' : '♡'}</button>
    <button class="seen-btn ${seen ? 'on' : ''}" type="button" data-seen="${m.key}" aria-pressed="${seen}" aria-label="Ya la vi: ${esc(m.title)}">${seen ? '✓' : '👁'}</button>
  </article>`;
}
function renderCards(list, showType = false) {
  list.forEach((m) => state.items.set(m.key, m));
  grid.insertAdjacentHTML('beforeend', list.map((m) => cardHTML(m, showType)).join(''));
}
function skeletons(n = 12) {
  grid.innerHTML = Array.from({ length: n }, () =>
    '<div class="card skeleton" aria-hidden="true"><div class="poster"></div><div class="line"></div></div>').join('');
}
function renderList(name) {
  const list = getList(name);
  grid.innerHTML = '';
  btnMore.hidden = true;
  statusEl.innerHTML = list.length ? '' : (name === 'favs'
    ? '<span class="big">💔</span>Todavía no tenés favoritas. Tocá el ♡ para guardar una.'
    : '<span class="big">👀</span>Todavía no marcaste nada como visto. Tocá el 👁 de una película o serie.');
  renderCards(list, true);
}

/* ---------- filtros ---------- */
const hasFilters = () => !!(state.genre || state.year);
const yearParam = () => (state.type === 'movie' ? 'primary_release_year' : 'first_air_date_year');

function filterLabel() {
  const parts = [];
  if (state.genre) parts.push(selGenre.options[selGenre.selectedIndex].text);
  if (state.year) parts.push(state.year);
  return parts.length ? ' · ' + parts.join(' · ') : '';
}

function discoverParams(view) {
  const t = state.type;
  const P = { include_adult: false, sort_by: 'popularity.desc' };
  if (state.genre) P.with_genres = state.genre;
  if (state.year) P[yearParam()] = state.year;
  if (view === 'top') { P.sort_by = 'vote_average.desc'; P['vote_count.gte'] = t === 'movie' ? 300 : 150; }
  if (view === 'upcoming') {
    const today = new Date().toISOString().slice(0, 10);
    if (t === 'movie') { P['primary_release_date.gte'] = today; P.region = REGION; } else P['air_date.gte'] = today;
  }
  return P;
}

const genreCache = {};
async function loadGenres() {
  const t = state.type;
  selGenre.innerHTML = '<option value="">Género: todos</option>';
  try {
    if (!genreCache[t]) genreCache[t] = (await tmdb(`/genre/${t}/list`)).genres || [];
    if (state.type !== t) return;
    selGenre.insertAdjacentHTML('beforeend', genreCache[t].map((g) => `<option value="${g.id}">${esc(g.name)}</option>`).join(''));
    selGenre.value = state.genre;
  } catch {}
}
function fillYears() {
  const now = new Date().getFullYear();
  let html = '<option value="">Año: todos</option>';
  for (let y = now + 1; y >= 1920; y--) html += `<option value="${y}">${y}</option>`;
  selYear.innerHTML = html;
}

/* ---------- cargar resultados ---------- */
async function fetchPage() {
  const t = state.type;
  if (state.query) {
    const params = { query: state.query, page: state.page, include_adult: false };
    if (state.year) params[yearParam()] = state.year;
    const d = await tmdb(`/search/${t}`, params);
    if (state.genre) d.results = d.results.filter((r) => (r.genre_ids || []).includes(Number(state.genre)));
    return d;
  }
  if (!hasFilters()) {
    const v = VIEWS[t][state.view];
    return tmdb(v.path, { ...v.params, page: state.page });
  }
  return tmdb(`/discover/${t}`, { ...discoverParams(state.view), page: state.page });
}

function updateTitle() {
  let title;
  if (state.query) title = `Resultados para “${state.query}”` + filterLabel();
  else if (LISTS[state.view]) title = LISTS[state.view];
  else title = VIEWS[state.type][state.view].title + filterLabel();
  $('#sectionTitle').textContent = title;
  btnReset.hidden = !hasFilters();
}

async function load(reset = true) {
  $('#setup').hidden = true;
  if (reset) { state.page = 1; statusEl.innerHTML = ''; }
  updateTitle();

  if (!state.query && LISTS[state.view]) { state.reqId++; renderList(state.view); return; }

  const id = ++state.reqId;
  if (reset) skeletons();
  btnMore.disabled = true;
  try {
    const data = await fetchPage();
    if (id !== state.reqId) return; // llegó una búsqueda más nueva
    if (reset) grid.innerHTML = '';
    state.totalPages = Math.min(data.total_pages || 1, 500);
    const items = (data.results || []).map((r) => normalize(r, state.type));
    if (reset && !items.length) {
      statusEl.innerHTML = state.query
        ? `<span class="big">🔎</span>No encontramos ninguna ${typeWord(state.type)} así${hasFilters() ? ' con esos filtros' : ''}. Probá con otra palabra.`
        : '<span class="big">🔎</span>No hay resultados con esos filtros. Probá con otros.';
    }
    renderCards(items);
    btnMore.hidden = state.page >= state.totalPages;
  } catch (err) {
    if (id === state.reqId) handleError(err);
  } finally {
    if (id === state.reqId) btnMore.disabled = false;
  }
}

/* ---------- detalle ---------- */
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

const closeBtn = '<button class="m-close" type="button" data-close aria-label="Cerrar">✕</button>';

async function openItem(type, id, opts = {}) {
  modalBody.innerHTML = closeBtn + '<div class="loading"><div class="spinner"></div>Cargando…</div>';
  if (!modal.open) modal.showModal();
  history.replaceState(null, '', `#${type === 'tv' ? 'serie' : 'peli'}-${id}`);
  try {
    const d = await tmdb(`/${type}/${id}`, { append_to_response: 'videos,credits,watch/providers,similar', include_video_language: 'es,en,null' });
    if (!d.overview) { // si no hay sinopsis en español, la traemos en inglés
      try { const en = await tmdb(`/${type}/${id}`, { language: 'en-US' }); d.overview = en.overview; d.overviewEn = !!en.overview; } catch {}
    }
    const item = normalize(d, type);
    state.items.set(item.key, item);
    renderDetail(d, item, opts);
  } catch {
    modalBody.innerHTML = closeBtn + '<div class="loading">😕 No se pudo cargar.</div>';
  }
}

function renderDetail(d, item, opts) {
  const isTv = item.type === 'tv';
  const tr = pickTrailer(d.videos && d.videos.results);
  const cast = ((d.credits && d.credits.cast) || []).slice(0, 12);
  const people = isTv
    ? (d.created_by || []).map((c) => c.name).join(', ')
    : ((d.credits && d.credits.crew) || []).filter((c) => c.job === 'Director').map((c) => c.name).join(', ');
  const similar = ((d.similar && d.similar.results) || []).slice(0, 12);

  let years = yearOf(item.date);
  if (isTv && years) {
    const end = d.in_production ? 'actualidad' : yearOf(d.last_air_date);
    if (end && end !== years) years += '–' + end;
  }
  const length = isTv
    ? [d.number_of_seasons ? `${d.number_of_seasons} temporada${d.number_of_seasons > 1 ? 's' : ''}` : '',
       d.number_of_episodes ? `${d.number_of_episodes} episodios` : '',
       d.episode_run_time && d.episode_run_time[0] ? `~${d.episode_run_time[0]} min c/u` : ''].filter(Boolean).join(' · ')
    : runtime(d.runtime);
  const meta = [years, length,
    d.vote_average ? `<span class="stars">★ ${d.vote_average.toFixed(1)}</span> (${(d.vote_count || 0).toLocaleString('es-AR')} votos)` : ''
  ].filter(Boolean).join(' · ');
  const original = d.original_title || d.original_name;
  const fav = inList('favs', item.key);
  const seen = inList('seen', item.key);

  modalBody.innerHTML = `
    ${closeBtn}
    <div class="m-hero${d.backdrop_path ? '' : ' empty'}" style="${d.backdrop_path ? `background-image:url('${IMG}w1280${d.backdrop_path}')` : ''}"></div>
    <div class="m-content">
      <div class="m-head">
        ${d.poster_path ? `<img src="${IMG}w342${d.poster_path}" alt="Póster de ${esc(item.title)}">` : ''}
        <div>
          <h2>${esc(item.title)}</h2>
          ${original && original !== item.title ? `<div class="meta">Título original: ${esc(original)}</div>` : ''}
          ${d.tagline ? `<p class="tagline">${esc(d.tagline)}</p>` : ''}
          <div class="meta">${isTv ? '📺 Serie · ' : ''}${meta}</div>
          ${people ? `<div class="meta">${isTv ? 'Creada por' : 'Dirección'}: ${esc(people)}</div>` : ''}
          <div class="tags">${(d.genres || []).map((g) => `<span>${esc(g.name)}</span>`).join('')}</div>
        </div>
      </div>
      <div class="m-actions">
        <button class="btn ${fav ? 'on' : ''}" type="button" data-fav="${item.key}" aria-pressed="${fav}">${fav ? '♥ En favoritas' : '♡ Agregar a favoritas'}</button>
        <button class="btn ${seen ? 'on' : ''}" type="button" data-seen="${item.key}" aria-pressed="${seen}">${seen ? '✅ Ya la vi' : '👁 Marcar como vista'}</button>
        <button class="btn" type="button" data-share="${item.key}">📤 Compartir</button>
        ${opts.random ? '<button class="btn btn-gold" type="button" data-random>🎲 Otra sugerencia</button>' : ''}
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
        <button class="mini" type="button" data-open="${item.type}:${s.id}">${s.poster_path ? `<img loading="lazy" src="${IMG}w185${s.poster_path}" alt="">` : '<div class="ph">🎬</div>'}
          <b>${esc(s.title || s.name)}</b></button>`).join('')}</div>` : ''}
    </div>`;
  modal.scrollTop = 0;
}

async function shareItem(key) {
  const it = state.items.get(key);
  if (!it) return;
  const url = location.origin + location.pathname + `#${it.type === 'tv' ? 'serie' : 'peli'}-${it.id}`;
  const text = `${it.type === 'tv' ? '📺' : '🎬'} ${it.title}${yearOf(it.date) ? ' (' + yearOf(it.date) + ')' : ''} — mirala en Busca tu peli`;
  if (navigator.share) {
    try { await navigator.share({ title: it.title, text, url }); } catch {}
  } else {
    try { await navigator.clipboard.writeText(`${text} ${url}`); toast('🔗 Enlace copiado'); }
    catch { prompt('Copiá este enlace:', url); }
  }
}

/* ---------- 🎲 ¿Qué veo hoy? ---------- */
const btnRandom = $('#btnRandom');
async function randomPick() {
  if (btnRandom.disabled) return;
  btnRandom.disabled = true;
  const t = state.type;
  try {
    const params = { ...discoverParams('trending'), 'vote_average.gte': 6.5, 'vote_count.gte': t === 'movie' ? 300 : 150 };
    const first = await tmdb(`/discover/${t}`, { ...params, page: 1 });
    if (!first.total_results) { toast('No encontramos sugerencias con esos filtros'); return; }
    const page = 1 + Math.floor(Math.random() * Math.min(first.total_pages || 1, 25));
    const data = page === 1 ? first : await tmdb(`/discover/${t}`, { ...params, page });
    const seen = new Set(getList('seen').map((m) => m.key));
    const pool = data.results.filter((r) => !seen.has(`${t}-${r.id}`));
    const list = pool.length ? pool : data.results;
    const pick = list[Math.floor(Math.random() * list.length)];
    openItem(t, pick.id, { random: true });
  } catch (err) {
    toast(err.code === 'NO_KEY' ? '🔑 Falta la API key' : '😕 No pudimos elegir ahora, probá de nuevo');
  } finally {
    btnRandom.disabled = false;
  }
}
btnRandom.addEventListener('click', randomPick);

/* ---------- eventos ---------- */
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-open],[data-fav],[data-seen],[data-share],[data-yt],[data-close],[data-random]');
  if (!t) return;
  const ds = t.dataset;
  if (ds.close !== undefined) { t.closest('dialog').close(); return; }
  if (ds.random !== undefined) { randomPick(); return; }
  if (ds.fav) { toggleList('favs', ds.fav); return; }
  if (ds.seen) { toggleList('seen', ds.seen); return; }
  if (ds.share) { shareItem(ds.share); return; }
  if (ds.yt) {
    t.parentElement.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(ds.yt)}?autoplay=1&rel=0" title="Tráiler" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`;
    return;
  }
  if (ds.open) { const [type, id] = ds.open.split(':'); openItem(type, Number(id)); }
});

// cerrar ventanas tocando afuera
[modal, installModal].forEach((dlg) => dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); }));
modal.addEventListener('close', () => {
  modalBody.innerHTML = ''; // corta el video si estaba sonando
  if (/^#(peli|serie)-/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search);
});

// búsqueda (espera a que termines de escribir)
let debounce;
input.addEventListener('input', () => {
  btnClear.hidden = !input.value;
  clearTimeout(debounce);
  debounce = setTimeout(() => setQuery(input.value), 450);
});
$('#searchForm').addEventListener('submit', (e) => { e.preventDefault(); clearTimeout(debounce); setQuery(input.value, true); input.blur(); });
btnClear.addEventListener('click', () => { input.value = ''; btnClear.hidden = true; setQuery(''); input.focus(); });
function setQuery(q, force = false) {
  q = q.trim();
  if (q.length === 1) return; // esperamos al menos 2 letras
  if (q === state.query && !force) return;
  state.query = q;
  $$('.chip').forEach((c) => c.classList.toggle('active', !q && c.dataset.view === state.view));
  load(true);
}

// películas / series
$('#typeSwitch').addEventListener('click', (e) => {
  const b = e.target.closest('[data-type]');
  if (!b || b.dataset.type === state.type) return;
  state.type = b.dataset.type;
  $$('#typeSwitch [data-type]').forEach((x) => { const on = x === b; x.classList.toggle('active', on); x.setAttribute('aria-checked', on); });
  input.placeholder = state.type === 'tv' ? 'Buscá una serie…' : 'Buscá una película…';
  $('#chipUpcoming').textContent = VIEWS[state.type].upcoming.chip;
  state.genre = ''; // los géneros de series y películas son distintos
  loadGenres();
  if (LISTS[state.view] && !state.query) { state.view = 'trending'; $$('.chip').forEach((c) => c.classList.toggle('active', c.dataset.view === 'trending')); }
  load(true);
});

// filtros
selGenre.addEventListener('change', () => { state.genre = selGenre.value; leaveListView(); load(true); });
selYear.addEventListener('change', () => { state.year = selYear.value; leaveListView(); load(true); });
btnReset.addEventListener('click', () => { state.genre = ''; state.year = ''; selGenre.value = ''; selYear.value = ''; load(true); });
function leaveListView() {
  // los filtros se aplican a las secciones, no a tus listas
  if (LISTS[state.view] && !state.query) {
    state.view = 'trending';
    $$('.chip').forEach((c) => c.classList.toggle('active', c.dataset.view === 'trending'));
  }
}

// secciones
$('#chips').addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  state.view = chip.dataset.view;
  state.query = ''; input.value = ''; btnClear.hidden = true;
  $$('.chip').forEach((c) => c.classList.toggle('active', c === chip));
  load(true);
});

btnMore.addEventListener('click', () => { state.page++; load(false); });

// atajo: tecla "/" para ir al buscador
document.addEventListener('keydown', (e) => {
  if (e.key === '/' && document.activeElement !== input && !modal.open) { e.preventDefault(); input.focus(); }
});

// guardar API key desde la pantalla (solo si config.js no la tiene)
$('#keyForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const k = $('#keyInput').value.trim();
  if (!k) return;
  store.set(LS.key, k);
  toast('🔑 Clave guardada');
  loadGenres();
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
fillYears();
loadGenres();
load(true);
const deep = location.hash.match(/^#(peli|serie)-(\d+)$/);
if (deep) openItem(deep[1] === 'serie' ? 'tv' : 'movie', Number(deep[2]));
