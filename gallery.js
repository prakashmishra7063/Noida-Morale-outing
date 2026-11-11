/* Photo & video gallery page: links to a OneDrive "Request files" upload link
   and a shared OneDrive folder. All text and links are edited in admin.html. */

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c]));
const icon = (name) => `<span class="icon icon-${name}" aria-hidden="true"></span>`;
/** Only allow http(s) links so a typo can't turn into a javascript: link. */
export const safeUrl = (url) => (/^https?:\/\//i.test(String(url || "").trim()) ? String(url).trim() : "");

export function galleryBannerHtml(g) {
  if (g.visible === false || g.showOnHome === false) return "";
  return `<div class="gallery-banner"><span class="gallery-banner-icon">${icon("camera")}</span><div><h2>${esc(g.homeTitle)}</h2><p>${esc(g.homeText)}</p></div><a class="button button-light" href="#gallery">${esc(g.homeButton)} ${icon("arrow")}</a></div>`;
}

function actionCard(kind, title, text, url, label, soon) {
  const link = safeUrl(url);
  const button = link
    ? `<a class="button ${kind === "upload" ? "button-primary" : "button-outline"}" href="${esc(link)}" target="_blank" rel="noopener">${icon(kind === "upload" ? "upload" : "arrow")} ${esc(label)}</a>`
    : `<span class="button button-disabled" aria-disabled="true">${esc(soon)}</span>`;
  return `<article class="gallery-card ${kind}"><span class="gallery-card-icon">${icon(kind === "upload" ? "upload" : "camera")}</span><h2>${esc(title)}</h2><p>${esc(text)}</p>${button}</article>`;
}

export function galleryPageHtml(g, heading) {
  const tips = (g.tips || []).filter(Boolean);
  return `<section class="page gallery-page">${heading}
    ${g.deadline ? `<p class="gallery-deadline">${icon("calendar")} ${esc(g.deadline)}</p>` : ""}
    <div class="gallery-grid">
      ${actionCard("upload", g.uploadTitle, g.uploadText, g.uploadUrl, g.uploadButton, g.comingSoonText)}
      ${actionCard("view", g.viewTitle, g.viewText, g.viewUrl, g.viewButton, g.comingSoonText)}
    </div>
    ${tips.length ? `<div class="panel gallery-tips"><div class="panel-title"><h2>${esc(g.tipsTitle)}</h2>${icon("info")}</div><ul class="instruction-list">${tips.map((t) => `<li>${icon("check")}<span>${esc(t)}</span></li>`).join("")}</ul></div>` : ""}
    ${g.accessNote ? `<p class="gallery-note">${icon("info")} ${esc(g.accessNote)}</p>` : ""}
  </section>`;
}
