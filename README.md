# 🎬 Busca tu peli

Buscador de películas hecho con la API de **TMDB**. App web instalable en celular y compu (PWA), con modo claro/oscuro.
Creado por **DFF**.

👉 **Abrir la app:** https://opesoc2013-art.github.io/busca-tu-peli/

## Qué hace
- Buscar cualquier película (en español de Argentina).
- Secciones: Tendencias, Mejor puntuadas, Próximos estrenos y Favoritas.
- Detalle: sinopsis, duración, puntaje, géneros, dirección, reparto, tráiler y **dónde verla en Argentina**.
- Favoritas guardadas en el dispositivo, botón Compartir (WhatsApp, etc.).
- Instalable ("Descargar app"), funciona sin internet con lo último que viste.

## Archivos
| Archivo | Para qué sirve |
|---|---|
| `index.html` | La página |
| `config.js` | **Acá va tu API Key de TMDB** |
| `css/style.css` | Colores y diseño |
| `js/app.js` | Funcionamiento |
| `manifest.json` | Datos para instalarla como app |
| `sw.js` | Permite instalarla y usarla sin internet |
| `img/` | Ícono, favicon e imagen para WhatsApp |

## Si cambiás el nombre del repositorio
En `index.html` reemplazá `busca-tu-peli` por el nombre nuevo en las 5 líneas que empiezan con `<meta property="og:` / `twitter:image`.

## Si hacés cambios y no se ven
Abrí `sw.js`, cambiá `const VERSION = 'v1';` por `'v2'` (después `'v3'`, etc.) y volvé a subirlo.

---
Este producto usa la API de TMDB pero no está avalado ni certificado por TMDB.
