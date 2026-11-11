/* Upload & gallery page. Talks to /api/gallery, which hands out short-lived
   Azure Blob links; files are uploaded straight from the browser to storage. */

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c]));
const icon = (name) => `<span class="icon icon-${name}" aria-hidden="true"></span>`;
const store = {
  get(key) { try { return localStorage.getItem(`noida-gallery-${key}`) || ""; } catch { return ""; } },
  set(key, value) { try { localStorage.setItem(`noida-gallery-${key}`, value); } catch { /* storage unavailable */ } },
};
const SV = "2022-11-02";
const CHUNK = 8 * 1024 * 1024;
const cache = { config: null, list: null, listAt: 0 };
let filter = "all";
let lightboxIndex = -1;

export function apiBase(g) {
  return window.location.hostname.endsWith("github.io") && g.apiBase ? g.apiBase.replace(/\/+$/, "") : "";
}
async function api(g, action, body) {
  const res = await fetch(`${apiBase(g)}/api/gallery?action=${action}`, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `Request failed (${res.status})`), { status: res.status });
  return data;
}
export const formatBytes = (n) => {
  if (!n) return "0 MB";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toFixed(i >= 3 ? 1 : 0)} ${units[i]}`;
};

export function galleryBannerHtml(g) {
  if (g.visible === false || g.showOnHome === false) return "";
  return `<div class="gallery-banner"><span class="gallery-banner-icon">${icon("camera")}</span><div><h2>${esc(g.homeTitle)}</h2><p>${esc(g.homeText)}</p></div><a class="button button-light" href="#gallery">${esc(g.homeButton)} ${icon("arrow")}</a></div>`;
}

export function galleryPageHtml(g, heading) {
  const tips = (g.tips || []).filter(Boolean);
  return `<section class="page gallery-page">${heading}
    <div id="g-status"></div>
    <article class="panel upload-panel">
      <div class="upload-intro"><span class="gallery-card-icon">${icon("upload")}</span><div><h2>${esc(g.uploadTitle)}</h2><p>${esc(g.uploadText)}</p></div></div>
      <form id="g-form" class="upload-form" novalidate>
        <label class="field"><span>Your name</span><input id="g-name" type="text" autocomplete="name" placeholder="e.g. Ananya Gupta" required></label>
        <label class="field"><span>Team code</span><input id="g-code" type="password" autocomplete="off" placeholder="From the coordinators" required></label>
        <label class="drop-zone" id="g-drop"><input id="g-files" type="file" accept="image/*,video/*" multiple><b>${icon("camera")} Choose photos & videos</b><small id="g-picked">or drag them here</small></label>
        <button class="button button-primary" type="submit" id="g-submit" disabled>${icon("upload")} Upload</button>
      </form>
      <ul id="g-queue" class="upload-queue"></ul>
      ${tips.length ? `<ul class="upload-tips">${tips.map((t) => `<li>${icon("check")}<span>${esc(t)}</span></li>`).join("")}</ul>` : ""}
    </article>
    <div class="gallery-toolbar"><div class="seg-filter" role="group" aria-label="Filter">${["all", "image", "video"].map((f) => `<button type="button" data-filter="${f}" class="${f === filter ? "on" : ""}">${{ all: "All", image: "Photos", video: "Videos" }[f]}</button>`).join("")}</div><span class="result-count" id="g-count"></span></div>
    <div id="g-unlock" class="panel unlock-panel" hidden><p><b>Enter the team code to see the gallery.</b></p><form id="g-unlock-form"><input id="g-view-code" type="password" placeholder="Team code" autocomplete="off"><button class="button button-primary" type="submit">View gallery</button></form></div>
    <div id="g-grid" class="media-grid" aria-live="polite"></div>
    <div id="g-lightbox" class="lightbox" hidden></div>
  </section>`;
}

/* ---------- gallery grid ---------- */
function visibleItems() { return (cache.list?.items || []).filter((it) => filter === "all" || it.type === filter); }
function renderGrid(g) {
  const grid = document.querySelector("#g-grid");
  if (!grid) return;
  const items = visibleItems();
  document.querySelector("#g-count").textContent = cache.list ? `${items.length} ${items.length === 1 ? "item" : "items"}` : "";
  if (!cache.list) return;
  if (!items.length) { grid.innerHTML = `<div class="empty-state">${icon("camera")}<p>${esc(g.emptyText || "Nothing here yet.")}</p></div>`; return; }
  grid.innerHTML = items.map((it, i) => `<button type="button" class="media-tile ${it.type}" data-index="${i}" aria-label="${esc(`${it.type === "video" ? "Video" : "Photo"} by ${it.uploader || "someone"}`)}">
      ${it.thumb || it.type === "image" ? `<img src="${esc(it.thumb || it.url)}" alt="" loading="lazy">` : `<span class="tile-placeholder">${icon("camera")}</span>`}
      ${it.type === "video" ? `<span class="play-badge">▶</span>` : ""}
      ${it.uploader ? `<span class="tile-by">${esc(it.uploader)}</span>` : ""}
    </button>`).join("");
  grid.querySelectorAll(".media-tile").forEach((tile) => tile.addEventListener("click", () => openLightbox(Number(tile.dataset.index))));
  grid.querySelectorAll(".media-tile img").forEach((img) => img.addEventListener("error", () => { img.outerHTML = `<span class="tile-placeholder">${icon("camera")}</span>`; }, { once: true }));
}
function renderStatus(g, message, tone = "") {
  const el = document.querySelector("#g-status");
  if (!el) return;
  const list = cache.list;
  if (message) { el.innerHTML = `<div class="gallery-notice ${tone}">${icon("info")}<span>${esc(message)}</span></div>`; return; }
  if (list) {
    const pct = Math.min(100, (list.usedBytes / list.quotaBytes) * 100);
    el.innerHTML = `<div class="usage"><div class="usage-bar"><span style="width:${pct.toFixed(1)}%"></span></div><small>${formatBytes(list.usedBytes)} of ${formatBytes(list.quotaBytes)} used</small></div>`;
  } else el.innerHTML = "";
}
async function loadList(g, force = false) {
  if (!force && cache.list && Date.now() - cache.listAt < 60_000) { renderStatus(g); renderGrid(g); return; }
  const code = store.get("code");
  try {
    cache.list = await api(g, "list", { code });
    cache.listAt = Date.now();
    document.querySelector("#g-unlock")?.setAttribute("hidden", "");
    renderStatus(g);
    renderGrid(g);
  } catch (err) {
    if (err.status === 401) { document.querySelector("#g-unlock")?.removeAttribute("hidden"); document.querySelector("#g-grid").innerHTML = ""; renderStatus(g); }
    else renderStatus(g, `Couldn't load the gallery: ${err.message}`, "warn");
  }
}

/* ---------- lightbox ---------- */
function openLightbox(index) {
  const items = visibleItems();
  const it = items[index];
  if (!it) return;
  lightboxIndex = index;
  const box = document.querySelector("#g-lightbox");
  const date = it.created ? new Date(it.created).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "";
  box.hidden = false;
  box.innerHTML = `<div class="lightbox-inner" role="dialog" aria-modal="true" aria-label="${esc(it.title)}">
    <button class="lb-close" type="button" aria-label="Close">×</button>
    <button class="lb-nav prev" type="button" aria-label="Previous" ${index === 0 ? "disabled" : ""}>‹</button>
    <div class="lb-media">${it.type === "video" ? `<video src="${esc(it.url)}" controls autoplay playsinline ${it.thumb ? `poster="${esc(it.thumb)}"` : ""}></video>` : `<img src="${esc(it.url)}" alt="${esc(it.title)}">`}</div>
    <button class="lb-nav next" type="button" aria-label="Next" ${index === items.length - 1 ? "disabled" : ""}>›</button>
    <div class="lb-bar"><span>${esc(it.uploader || "Someone")}${date ? ` · ${esc(date)}` : ""} · ${esc(formatBytes(it.size))}</span><a class="button button-light" href="${esc(it.download)}">${icon("download")} Download</a></div>
  </div>`;
  box.querySelector(".lb-close").addEventListener("click", closeLightbox);
  box.querySelector(".prev").addEventListener("click", () => openLightbox(index - 1));
  box.querySelector(".next").addEventListener("click", () => openLightbox(index + 1));
  box.addEventListener("click", (e) => { if (e.target === box) closeLightbox(); }, { once: true });
}
function closeLightbox() { const box = document.querySelector("#g-lightbox"); if (box) { box.hidden = true; box.innerHTML = ""; } lightboxIndex = -1; }
document.addEventListener("keydown", (e) => {
  if (lightboxIndex < 0) return;
  if (e.key === "Escape") closeLightbox();
  if (e.key === "ArrowLeft") openLightbox(lightboxIndex - 1);
  if (e.key === "ArrowRight") openLightbox(lightboxIndex + 1);
});

/* ---------- uploading ---------- */
function xhrPut(url, body, headers, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    Object.entries({ "x-ms-version": SV, ...headers }).forEach(([k, v]) => xhr.setRequestHeader(k, v));
    if (onProgress) xhr.upload.onprogress = (e) => onProgress(e.loaded);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Storage returned ${xhr.status}`)));
    xhr.onerror = () => reject(new Error("Network error"));
    xhr.send(body);
  });
}
async function retry(fn, tries = 3) {
  for (let i = 1; ; i += 1) {
    try { return await fn(); } catch (err) { if (i >= tries) throw err; await new Promise((r) => setTimeout(r, 1000 * i)); }
  }
}
async function uploadBlocks(url, file, meta, onProgress) {
  const count = Math.max(1, Math.ceil(file.size / CHUNK));
  const ids = Array.from({ length: count }, (_, i) => btoa(String(i).padStart(6, "0")));
  const loaded = new Array(count).fill(0);
  let next = 0;
  const report = () => onProgress(loaded.reduce((a, b) => a + b, 0) / file.size);
  const worker = async () => {
    while (next < count) {
      const i = next++;
      const part = file.slice(i * CHUNK, Math.min(file.size, (i + 1) * CHUNK));
      await retry(() => xhrPut(`${url}&comp=block&blockid=${encodeURIComponent(ids[i])}`, part, {}, (l) => { loaded[i] = l; report(); }));
      loaded[i] = part.size; report();
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, count) }, worker));
  const xml = `<?xml version="1.0" encoding="utf-8"?><BlockList>${ids.map((id) => `<Latest>${id}</Latest>`).join("")}</BlockList>`;
  await retry(() => xhrPut(`${url}&comp=blocklist`, xml, { "Content-Type": "application/xml", "x-ms-blob-content-type": file.type || "application/octet-stream", ...meta }));
}
function loadImage(src) { return new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = src; }); }
function videoFrame(src) {
  return new Promise((resolve, reject) => {
    const v = document.createElement("video");
    const timer = setTimeout(() => reject(new Error("timeout")), 10_000);
    v.muted = true; v.playsInline = true; v.preload = "auto"; v.src = src;
    v.onloadeddata = () => { v.currentTime = Math.min(1, (v.duration || 2) / 2); };
    v.onseeked = () => { clearTimeout(timer); resolve(v); };
    v.onerror = () => { clearTimeout(timer); reject(new Error("video")); };
  });
}
async function makeThumbnail(file) {
  const src = URL.createObjectURL(file);
  try {
    const media = file.type.startsWith("video/") ? await videoFrame(src) : await loadImage(src);
    const w = media.videoWidth || media.naturalWidth;
    const h = media.videoHeight || media.naturalHeight;
    if (!w || !h) return null;
    const scale = Math.min(1, 480 / Math.max(w, h));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w * scale); canvas.height = Math.round(h * scale);
    canvas.getContext("2d").drawImage(media, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.8));
  } catch { return null; } finally { URL.revokeObjectURL(src); }
}
async function uploadFile(g, file, row) {
  const setState = (text, pct, tone = "") => { row.querySelector(".q-state").textContent = text; row.className = `q-row ${tone}`; if (pct != null) row.querySelector(".q-bar span").style.width = `${(pct * 100).toFixed(1)}%`; };
  try {
    setState("Preparing…", 0);
    const name = store.get("name");
    const ticket = await api(g, "upload", { code: store.get("code"), name: file.name, size: file.size, type: file.type, uploader: name });
    const thumb = await makeThumbnail(file);
    await uploadBlocks(ticket.uploadUrl, file, { "x-ms-meta-uploader": encodeURIComponent(name), "x-ms-meta-originalname": encodeURIComponent(file.name) }, (p) => setState(`${Math.floor(p * 100)}%`, p));
    if (thumb) await xhrPut(ticket.thumbUrl, thumb, { "x-ms-blob-type": "BlockBlob", "Content-Type": "image/jpeg" }).catch(() => {});
    setState("Uploaded ✓", 1, "done");
    return true;
  } catch (err) {
    setState(err.message, null, "error");
    if (err.status === 401) store.set("code", "");
    return false;
  }
}

/* ---------- wiring ---------- */
export async function initGallery(g) {
  const form = document.querySelector("#g-form");
  if (!form) return;
  const nameInput = document.querySelector("#g-name");
  const codeInput = document.querySelector("#g-code");
  const filesInput = document.querySelector("#g-files");
  const submit = document.querySelector("#g-submit");
  const drop = document.querySelector("#g-drop");
  nameInput.value = store.get("name");
  codeInput.value = store.get("code");
  let picked = [];
  const refresh = () => {
    submit.disabled = !picked.length || !nameInput.value.trim() || !codeInput.value.trim() || !cache.config?.uploadsEnabled;
    const total = picked.reduce((s, f) => s + f.size, 0);
    document.querySelector("#g-picked").textContent = picked.length ? `${picked.length} selected · ${formatBytes(total)}` : "or drag them here";
  };
  const pick = (list) => { picked = [...list].filter((f) => /^(image|video)\//.test(f.type)); refresh(); };
  filesInput.addEventListener("change", () => pick(filesInput.files));
  ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
  drop.addEventListener("drop", (e) => pick(e.dataTransfer.files));
  nameInput.addEventListener("input", refresh);
  codeInput.addEventListener("input", refresh);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (submit.disabled) return;
    store.set("name", nameInput.value.trim());
    store.set("code", codeInput.value.trim());
    const max = cache.config?.maxFileBytes || Infinity;
    const queue = document.querySelector("#g-queue");
    const files = picked;
    picked = []; filesInput.value = ""; refresh();
    submit.disabled = true;
    let ok = 0;
    for (const file of files) {
      const row = document.createElement("li");
      row.className = "q-row";
      row.innerHTML = `<span class="q-name">${esc(file.name)} <small>${esc(formatBytes(file.size))}</small></span><span class="q-bar"><span></span></span><span class="q-state">Waiting…</span>`;
      queue.prepend(row);
      if (file.size > max) { row.className = "q-row error"; row.querySelector(".q-state").textContent = `Too large (max ${formatBytes(max)})`; continue; }
      if (await uploadFile(g, file, row)) ok += 1;
    }
    if (ok) loadList(g, true);
    refresh();
  });
  document.querySelectorAll("[data-filter]").forEach((b) => b.addEventListener("click", () => {
    filter = b.dataset.filter;
    document.querySelectorAll("[data-filter]").forEach((x) => x.classList.toggle("on", x === b));
    renderGrid(g);
  }));
  document.querySelector("#g-unlock-form").addEventListener("submit", (e) => {
    e.preventDefault();
    store.set("code", document.querySelector("#g-view-code").value.trim());
    loadList(g, true);
  });

  try { cache.config = cache.config || await api(g, "config"); }
  catch { cache.config = { configured: false }; }
  if (!cache.config.configured) {
    renderStatus(g, "The gallery isn't connected to storage yet — check back soon.", "warn");
    form.querySelectorAll("input,button").forEach((el) => { el.disabled = true; });
    return;
  }
  if (!cache.config.uploadsEnabled) renderStatus(g, "Uploads are closed right now.", "warn");
  refresh();
  loadList(g);
}
