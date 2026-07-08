/* ============================================================
   PageMind — Dashboard Logic (dashboard.js)
   ============================================================ */

'use strict';

// ── PDF.js worker ─────────────────────────────────────────────
if (typeof pdfjsLib !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

// ── State ─────────────────────────────────────────────────────
const books          = [];
let currentBook      = null;
let currentFontSize  = 18;
let currentRendition = null;   // custom rendition object (destroy + themes.fontSize)

// ── Cover gradients ───────────────────────────────────────────
const COVERS = [
  'linear-gradient(145deg, #1B365D 0%, #2a4f87 100%)',
  'linear-gradient(145deg, #2E86AB 0%, #1a6a8a 100%)',
  'linear-gradient(145deg, #27a96c 0%, #187a4f 100%)',
  'linear-gradient(145deg, #7c3aed 0%, #5b21b6 100%)',
  'linear-gradient(145deg, #d97706 0%, #92400e 100%)',
  'linear-gradient(145deg, #dc2626 0%, #991b1b 100%)',
  'linear-gradient(145deg, #0f766e 0%, #0d5c56 100%)',
  'linear-gradient(145deg, #be185d 0%, #9d174d 100%)',
];

// ── DOM references ────────────────────────────────────────────
const libraryGrid     = document.getElementById('libraryGrid');
const emptyState      = document.getElementById('emptyState');
const fileInput       = document.getElementById('fileInput');
const uploadBtn       = document.getElementById('uploadBtn');
const emptyUploadBtn  = document.getElementById('emptyUploadBtn');
const bookCountLabel  = document.getElementById('bookCountLabel');
const dropOverlay     = document.getElementById('dropOverlay');
const userAvatar      = document.getElementById('userAvatar');
const userNameEl      = document.getElementById('userName');
const signOutBtn      = document.getElementById('signOutBtn');

// Reader panel
const readerPanel     = document.getElementById('readerPanel');
const readerTitle     = document.getElementById('readerTitle');
const readerContent   = document.getElementById('readerContent');
const closeReaderBtn  = document.getElementById('closeReader');
const fontDecreaseBtn = document.getElementById('fontDecrease');
const fontIncreaseBtn = document.getElementById('fontIncrease');
const fontSizeVal     = document.getElementById('fontSizeVal');

// EPUB-specific
const tocPanel        = document.getElementById('tocPanel');
const tocList         = document.getElementById('tocList');
const tocToggleBtn    = document.getElementById('tocToggle');
const tocCloseBtn     = document.getElementById('tocClose');
const epubNav         = document.getElementById('epubNav');
const prevPageBtn     = document.getElementById('prevPage');
const nextPageBtn     = document.getElementById('nextPage');
const epubPageInfo    = document.getElementById('epubPageInfo');

// ── User info ─────────────────────────────────────────────────
const storedEmail = localStorage.getItem('pm_user_email') || '';
if (storedEmail) {
  userAvatar.textContent = storedEmail.charAt(0).toUpperCase();
  userNameEl.textContent = storedEmail.split('@')[0];
}

signOutBtn.addEventListener('click', () => {
  localStorage.removeItem('pm_user_email');
  window.location.href = '/index.html';
});

// ── Upload triggers ───────────────────────────────────────────
uploadBtn.addEventListener('click',      () => fileInput.click());
emptyUploadBtn.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', e => {
  Array.from(e.target.files).forEach(processFile);
  fileInput.value = '';
});

// ── Drag & drop ───────────────────────────────────────────────
let dragDepth = 0;

document.addEventListener('dragenter', e => {
  e.preventDefault();
  if (dragDepth++ === 0) dropOverlay.classList.add('active');
});
document.addEventListener('dragleave', () => {
  if (--dragDepth === 0) dropOverlay.classList.remove('active');
});
document.addEventListener('dragover',  e => e.preventDefault());
document.addEventListener('drop', e => {
  e.preventDefault();
  dragDepth = 0;
  dropOverlay.classList.remove('active');
  Array.from(e.dataTransfer.files).forEach(processFile);
});

// ── Process uploaded file ─────────────────────────────────────
function processFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (!['pdf', 'epub', 'txt'].includes(ext)) {
    alert(`Unsupported format: .${ext}\nPageMind supports PDF, EPUB, and TXT.`);
    return;
  }

  // EPUB: store the raw File object — JSZip reads it directly at open time.
  if (ext === 'epub') {
    books.push({
      id:      Date.now() + '_' + Math.random().toString(36).slice(2),
      title:   file.name.replace(/\.[^/.]+$/, ''),
      ext,
      data:    file,
      cover:   COVERS[books.length % COVERS.length],
      size:    formatSize(file.size),
      addedAt: new Date(),
    });
    renderLibrary();
    return;
  }

  const reader = new FileReader();
  reader.onload = ev => {
    books.push({
      id:      Date.now() + '_' + Math.random().toString(36).slice(2),
      title:   file.name.replace(/\.[^/.]+$/, ''),
      ext,
      data:    ev.target.result,
      cover:   COVERS[books.length % COVERS.length],
      size:    formatSize(file.size),
      addedAt: new Date(),
    });
    renderLibrary();
  };
  ext === 'txt' ? reader.readAsText(file) : reader.readAsArrayBuffer(file);
}

function formatSize(bytes) {
  if (bytes < 1024)         return bytes + ' B';
  if (bytes < 1024 * 1024)  return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// ── Render library grid ───────────────────────────────────────
function renderLibrary() {
  const n = books.length;
  bookCountLabel.textContent =
    n === 0 ? 'No books yet' :
    n === 1 ? '1 book in your collection' :
    `${n} books in your collection`;

  emptyState.style.display = n === 0 ? '' : 'none';
  libraryGrid.innerHTML = '';

  books.forEach(book => {
    const card = document.createElement('article');
    card.className = 'book-card';
    card.setAttribute('role', 'listitem');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', `${book.title} — ${book.ext.toUpperCase()}`);

    card.innerHTML = `
      <div class="book-cover" style="background:${book.cover}">
        <div class="book-spine"></div>
        <svg class="book-cover__icon" width="54" height="54" viewBox="0 0 24 24"
             fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="1.1"
             stroke-linecap="round" stroke-linejoin="round">
          <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
          <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
        </svg>
        <span class="book-ext-badge">${book.ext.toUpperCase()}</span>
      </div>
      <div class="book-info">
        <h3 class="book-title" title="${escHtml(book.title)}">${escHtml(book.title)}</h3>
        <span class="book-meta">${book.size} &middot; ${formatDate(book.addedAt)}</span>
      </div>`;

    const open = () => openReader(book);
    card.addEventListener('click', open);
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
    });
    libraryGrid.appendChild(card);
  });
}

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function formatDate(d) {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Open reader ───────────────────────────────────────────────
async function openReader(book) {
  // Destroy any previous epub rendition
  if (currentRendition) {
    try { currentRendition.destroy(); } catch (_) {}
    currentRendition = null;
  }

  currentBook     = book;
  currentFontSize = 18;
  fontSizeVal.textContent = '18px';
  readerTitle.textContent = book.title;

  // Reset reader content
  readerContent.innerHTML = '';
  readerContent.classList.remove('is-epub');

  // Hide EPUB-only chrome
  tocPanel.classList.add('toc-hidden');
  tocList.innerHTML = '';
  epubNav.classList.remove('visible');
  epubNav.setAttribute('aria-hidden', 'true');
  tocToggleBtn.classList.remove('visible');

  document.body.style.overflow = 'hidden';
  readerPanel.classList.remove('reader-panel--hidden');
  closeReaderBtn.focus();

  showReaderLoading('Opening book…');

  try {
    if      (book.ext === 'txt')  renderTXT(book.data);
    else if (book.ext === 'pdf')  await renderPDF(book.data);
    else if (book.ext === 'epub') await renderEPUB(book.data);
  } catch (err) {
    readerContent.innerHTML = `
      <div class="reader-error">
        <p>⚠️ Could not open this file.</p>
        <small>${escHtml(err.message)}</small>
      </div>`;
  }
}

function showReaderLoading(msg) {
  readerContent.innerHTML = `
    <div class="reader-loading">
      <div class="reader-spinner"></div>
      <p>${escHtml(msg)}</p>
    </div>`;
}

// ── Close reader ──────────────────────────────────────────────
function closeReader() {
  if (currentRendition) {
    try { currentRendition.destroy(); } catch (_) {}
    currentRendition = null;
  }
  readerPanel.classList.add('reader-panel--hidden');
  document.body.style.overflow = '';
  readerContent.innerHTML = '';
  readerContent.classList.remove('is-epub');
  tocPanel.classList.add('toc-hidden');
  epubNav.classList.remove('visible');
  tocToggleBtn.classList.remove('visible');
  currentBook = null;
}

closeReaderBtn.addEventListener('click', closeReader);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !readerPanel.classList.contains('reader-panel--hidden')) {
    closeReader();
  }
});

// ── TOC toggle ────────────────────────────────────────────────
tocToggleBtn.addEventListener('click', () => tocPanel.classList.toggle('toc-hidden'));
tocCloseBtn.addEventListener('click',  () => tocPanel.classList.add('toc-hidden'));

// ── TXT renderer ──────────────────────────────────────────────
function renderTXT(text) {
  readerContent.innerHTML = '';
  const div = document.createElement('div');
  div.className = 'reader-txt';
  div.style.fontSize = currentFontSize + 'px';
  div.textContent = text;
  readerContent.appendChild(div);
}

// ── PDF renderer ──────────────────────────────────────────────
async function renderPDF(arrayBuffer) {
  if (typeof pdfjsLib === 'undefined') {
    throw new Error('PDF.js failed to load. Check your internet connection.');
  }

  const pdf        = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const totalPages = pdf.numPages;

  readerContent.innerHTML = '';

  for (let n = 1; n <= totalPages; n++) {
    if (totalPages > 1) {
      let prog = readerContent.querySelector('.pdf-progress');
      if (!prog) {
        prog = Object.assign(document.createElement('p'), {
          className: 'pdf-progress',
          style: 'text-align:center;color:var(--muted);font-size:0.8rem;padding:0.75rem 0 1.5rem;',
        });
        readerContent.appendChild(prog);
      }
      prog.textContent = `Rendering page ${n} of ${totalPages}…`;
    }

    const page         = await pdf.getPage(n);
    const bodyWidth    = Math.max(readerContent.clientWidth - 48, 300);
    const base         = page.getViewport({ scale: 1 });
    const scale        = Math.min(1.8, bodyWidth / base.width);
    const viewport     = page.getViewport({ scale });

    const canvas       = document.createElement('canvas');
    canvas.width       = viewport.width;
    canvas.height      = viewport.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;

    const wrapper = document.createElement('div');
    wrapper.className = 'pdf-page-wrapper';
    wrapper.appendChild(canvas);

    const prog = readerContent.querySelector('.pdf-progress');
    readerContent.insertBefore(wrapper, prog || null);
  }
  readerContent.querySelector('.pdf-progress')?.remove();
}

// ── EPUB renderer (JSZip-based, lazy image loading) ──────────
async function renderEPUB(file) {
  if (typeof JSZip === 'undefined') {
    throw new Error('JSZip is not loaded — check the script tags in dashboard.html.');
  }

  // Leave the "Opening book…" spinner visible during setup.
  // readerContent is cleared only once the viewer div is ready.

  // ── 1. Unzip ───────────────────────────────────────────────
  let zip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch (e) {
    throw new Error('Cannot unzip this EPUB: ' + e.message);
  }

  const readZip = async (path) => {
    const entry = zip.file(path);
    if (!entry) throw new Error('EPUB is missing required file: ' + path);
    return entry.async('string');
  };

  // ── 2. container.xml → OPF path ───────────────────────────
  const containerXml = await readZip('META-INF/container.xml');
  const opfPath      = containerXml.match(/full-path="([^"]+)"/)[1];
  const opfDir       = opfPath.lastIndexOf('/') > 0
    ? opfPath.slice(0, opfPath.lastIndexOf('/')) : '';
  const abs          = (href) => (opfDir ? opfDir + '/' : '') + href;

  // ── 3. Parse OPF → manifest + ordered spine ───────────────
  const opfXml = await readZip(opfPath);

  const manifest = {};
  for (const m of opfXml.matchAll(/<item\b[^>]+?\/>/gs)) {
    const get = (k) => (m[0].match(new RegExp(`\\b${k}="([^"]*)"`))||[])[1] || '';
    const id  = get('id');
    if (id) manifest[id] = { id, href: get('href'), mt: get('media-type') };
  }

  const spineIds = [...opfXml.matchAll(/<itemref[^>]+idref="([^"]+)"/g)].map(m => m[1]);
  const spine    = spineIds
    .map(id => manifest[id])
    .filter(item => item && item.mt === 'application/xhtml+xml');

  if (spine.length === 0) throw new Error('No readable XHTML content found in this EPUB\'s spine.');

  // ── 4. Index images (no data loaded yet) ──────────────────
  // Images are resolved lazily per chapter — loading all 300+ images upfront
  // before the first render causes an indefinite hang on image-heavy EPUBs.
  const imgEntries = {};
  for (const item of Object.values(manifest)) {
    if (item.mt.startsWith('image/')) imgEntries[item.href] = item;
  }
  const imgBlobCache = {}; // href → blob URL; populated on demand, revoked on destroy

  async function getImgBlob(href) {
    if (imgBlobCache[href]) return imgBlobCache[href];
    const item = imgEntries[href];
    if (!item) return null;
    const entry = zip.file(abs(href));
    if (!entry) return null;
    const blob = await entry.async('blob');
    imgBlobCache[href] = URL.createObjectURL(blob);
    return imgBlobCache[href];
  }

  // ── 5. Read CSS (text/layout styles only; url() left as-is) ─
  let combinedCss = '';
  for (const item of Object.values(manifest).filter(i => i.mt === 'text/css')) {
    const entry = zip.file(abs(item.href));
    if (!entry) continue;
    combinedCss += await entry.async('string') + '\n';
  }

  // ── 6. Parse NCX TOC and merge generic labels with their titles ─
  //
  // Many EPUBs (especially Project Gutenberg) produce two consecutive NCX entries
  // for the same chapter: a bare label ("Chapter 1") and a real title
  // ("THE RIVER AND ITS HISTORY"), both anchored to the same spine file.
  // Rendering them as separate buttons causes visual clutter and the double-
  // highlight bug (both satisfy the same file-match condition).
  //
  // Detection: the label matches a generic structural keyword + optional number,
  // and the very next entry shares the same spine file (same href before '#').
  // Action: merge into one entry — "Chapter 1: THE RIVER AND ITS HISTORY" —
  // using the first entry's href (the earlier anchor in the file).
  //
  const CHAPTER_LABEL_RE =
    /^(?:chapter|part|section|book|volume|preface|introduction|intro|conclusion|appendix|epilogue|prologue|afterword)(?:\s+[\w.]+)?\.?$/i;

  const tocEntries = [];
  const ncxItem    = Object.values(manifest).find(i => i.mt === 'application/x-dtbncx+xml');
  if (ncxItem) {
    try {
      const ncx = await readZip(abs(ncxItem.href));
      const raw = [];
      for (const m of ncx.matchAll(
        /<navLabel>\s*<text>([^<]+)<\/text>[\s\S]*?<content\s+src="([^"]+)"/g)) {
        raw.push({ label: m[1].trim(), href: m[2] });
      }
      for (let i = 0; i < raw.length; i++) {
        const cur  = raw[i];
        const next = raw[i + 1];
        if (
          next &&
          CHAPTER_LABEL_RE.test(cur.label) &&
          cur.href.split('#')[0] === next.href.split('#')[0]
        ) {
          // Merge: one entry, one button, one highlight
          tocEntries.push({ label: cur.label + ': ' + next.label, href: cur.href });
          i++; // skip the consumed title entry
        } else {
          tocEntries.push(cur);
        }
      }
    } catch (_) {}
  }

  // ── 7. Swap spinner for the viewer div ────────────────────
  const viewerEl = document.createElement('div');
  viewerEl.id = 'epub-viewer';
  viewerEl.style.cssText = [
    'width:100%', 'height:600px', 'overflow-y:auto', 'background:#fff',
    'padding:1.5rem 3rem', 'box-sizing:border-box', 'border-radius:12px',
    'box-shadow:0 2px 18px rgba(0,0,0,.08)',
    `font-size:${currentFontSize}px`,
    'line-height:1.7',
    'color:#2a3140',
    "font-family:'Lora',Georgia,'Times New Roman',serif",
  ].join(';');
  readerContent.innerHTML = '';
  readerContent.classList.add('is-epub');
  readerContent.appendChild(viewerEl);

  // ── 8. Render one spine item ───────────────────────────────
  let currentIdx   = 0;
  let activeTocLink = null; // the single <a> currently marked active

  function setActiveTocLink(linkEl) {
    if (activeTocLink) activeTocLink.classList.remove('active');
    activeTocLink = linkEl || null;
    if (activeTocLink) activeTocLink.classList.add('active');
  }

  async function displayItem(idx, callerLink = null) {
    if (idx < 0 || idx >= spine.length) return;
    currentIdx = idx;
    viewerEl.innerHTML = '<p style="color:#888;text-align:center;padding:2rem">Loading…</p>';

    const item = spine[idx];
    let   html = await readZip(abs(item.href));

    const bm   = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    let   body = bm ? bm[1] : html;

    body = body.replace(/<(link|meta|script)\b[^>]*\/?>(?:[\s\S]*?<\/\1>)?/gi, '');

    // Strip decorative spacer paragraphs that Gutenberg EPUBs use for whitespace:
    //   <p>&#160;</p>  <p>&nbsp;</p>  <p> </p>
    body = body.replace(/<p[^>]*>(?:\s|&nbsp;|&#160;|&#xA0;)*<\/p>/gi, '');
    // Collapse runs of 3+ consecutive <br> tags into a single line break
    body = body.replace(/(<br\s*\/?>\s*){3,}/gi, '<br>');

    // Collect every image href referenced in this chapter
    const imgRefs = new Set();
    for (const m of body.matchAll(/\b(?:src|xlink:href)="([^"]+)"/g)) {
      const u = m[1];
      if (!/^(https?:|data:|blob:|#)/.test(u)) imgRefs.add(u.split('#')[0]);
    }

    // Decompress only those images (parallel, cached across chapters)
    await Promise.all([...imgRefs].map(href => getImgBlob(href)));

    // Rewrite src / xlink:href to blob URLs
    body = body.replace(/\b(src|xlink:href)="([^"]+)"/g, (match, attr, url) => {
      if (/^(https?:|data:|blob:|#)/.test(url)) return match;
      const blobUrl = imgBlobCache[url.split('#')[0]];
      return blobUrl ? `${attr}="${blobUrl}"` : match;
    });

    viewerEl.innerHTML = `<style>
      ${combinedCss}

      /* ── PageMind reader theme — overrides EPUB CSS via cascade order ── */
      body, p, div, span, li, td, th {
        font-family: 'Lora', Georgia, 'Times New Roman', serif;
        line-height: 1.7;
      }
      p {
        margin-top: 0.15em;
        margin-bottom: 0.15em;
        line-height: 1.7;
      }
      /* Any empty paragraph that slipped through JS cleanup */
      p:empty { display: none; }
      h1, h2, h3, h4, h5, h6 {
        font-family: 'Lora', Georgia, serif;
        color: #1B365D;
        line-height: 1.3;
        margin-top: 1.8em;
        margin-bottom: 0.4em;
        font-weight: 600;
      }
      img  { max-width:100%; height:auto; display:block; margin:1.25rem auto; }
      pre, code { white-space:pre-wrap; font-family:monospace; line-height:1.5; }
      a    { color:#2E6DA4; }
      blockquote { border-left:3px solid #c5cdd8; margin:1em 0; padding-left:1em; color:#555; }
    </style>${body}`;
    viewerEl.scrollTop = 0;

    prevPageBtn.disabled = idx <= 0;
    nextPageBtn.disabled = idx >= spine.length - 1;

    // Active TOC link: use the explicitly clicked link, or fall back to the
    // first TOC entry whose file matches this spine item (for prev/next nav).
    if (callerLink) {
      setActiveTocLink(callerLink);
    } else {
      const firstMatch = tocList.querySelector(`.toc-link[data-filehref="${item.href}"]`);
      setActiveTocLink(firstMatch);
    }

    const tocMatch = tocEntries.find(e => item.href.endsWith(e.href.split('#')[0]));
    epubPageInfo.textContent = tocMatch
      ? tocMatch.label
      : `Part ${idx + 1} of ${spine.length}`;
  }

  // ── 9. Wire up Prev / Next ────────────────────────────────
  prevPageBtn.onclick = () => displayItem(currentIdx - 1);
  nextPageBtn.onclick = () => displayItem(currentIdx + 1);

  // ── 10. Build TOC sidebar ─────────────────────────────────
  tocList.innerHTML = '';
  for (const entry of tocEntries) {
    const [fileHref] = entry.href.split('#');
    const spineItem  = spine.find(
      s => s.href === fileHref || s.href.endsWith(fileHref) || fileHref.endsWith(s.href)
    );
    if (!spineItem) continue; // skip orphan TOC entries with no matching spine item

    const li = document.createElement('li');
    li.className = 'toc-item';
    const a = document.createElement('a');
    a.className       = 'toc-link';
    a.textContent     = entry.label;
    a.title           = entry.label;       // tooltip for truncated text
    a.dataset.href    = entry.href;        // full href including #fragment
    a.dataset.filehref = spineItem.href;  // resolved spine href for fast lookup
    a.href            = '#';

    a.addEventListener('click', async e => {
      e.preventDefault();
      const [fHref, frag] = entry.href.split('#');
      const idx = spine.indexOf(spineItem);
      if (idx !== currentIdx) {
        await displayItem(idx, a);
      } else {
        // Same chapter — just update the active link without re-rendering
        setActiveTocLink(a);
      }
      if (frag) {
        const target = viewerEl.querySelector('#' + CSS.escape(frag));
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      if (window.innerWidth < 900) tocPanel.classList.add('toc-hidden');
    });

    li.appendChild(a);
    tocList.appendChild(li);
  }

  // ── 11. Show EPUB chrome ───────────────────────────────────
  epubNav.classList.add('visible');
  epubNav.setAttribute('aria-hidden', 'false');
  tocToggleBtn.classList.add('visible');
  if (tocEntries.length > 0) tocPanel.classList.remove('toc-hidden');

  // ── 12. Rendition shim ────────────────────────────────────
  currentRendition = {
    destroy() {
      Object.values(imgBlobCache).forEach(u => URL.revokeObjectURL(u));
    },
    themes: {
      fontSize(px) { viewerEl.style.fontSize = px; },
      register()   {},
      select()     {},
    },
  };

  // ── 13. Display first chapter ─────────────────────────────
  await displayItem(0);
}

// ── Font size controls ────────────────────────────────────────
fontDecreaseBtn.addEventListener('click', () => adjustFontSize(-2));
fontIncreaseBtn.addEventListener('click', () => adjustFontSize(+2));

function adjustFontSize(delta) {
  currentFontSize = Math.min(32, Math.max(12, currentFontSize + delta));
  fontSizeVal.textContent  = currentFontSize + 'px';
  fontDecreaseBtn.disabled = currentFontSize <= 12;
  fontIncreaseBtn.disabled = currentFontSize >= 32;

  if (!currentBook) return;

  if (currentBook.ext === 'txt') {
    const el = readerContent.querySelector('.reader-txt');
    if (el) el.style.fontSize = currentFontSize + 'px';
  } else if (currentBook.ext === 'epub' && currentRendition) {
    currentRendition.themes.fontSize(currentFontSize + 'px');
  }
}

// ── Init ──────────────────────────────────────────────────────
renderLibrary();
