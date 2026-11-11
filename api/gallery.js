/* Photo & video gallery API (Vercel serverless function, no dependencies).
 *
 * The browser never sees the storage key. This function checks the team code,
 * enforces size limits, and hands out short-lived SAS links so files go
 * straight from the browser to Azure Blob Storage.
 *
 * Environment variables (Vercel → Project → Settings → Environment Variables):
 *   AZURE_STORAGE_CONNECTION_STRING  required  storage account connection string
 *   GALLERY_UPLOAD_CODE              required  code people enter to upload
 *   GALLERY_VIEW_CODE                optional  code to view the gallery (blank = anyone can view)
 *   GALLERY_ADMIN_CODE               optional  code for deleting uploads from the editor
 *   GALLERY_CONTAINER                optional  container name (default "gallery")
 *   GALLERY_QUOTA_GB                 optional  total storage limit (default 50)
 *   GALLERY_MAX_FILE_MB              optional  per-file limit (default 2048)
 */
import crypto from "node:crypto";

const SV = "2022-11-02";
const env = (key, fallback = "") => String(process.env[key] ?? fallback).trim();
const config = () => ({
  account: parseConnectionString(env("AZURE_STORAGE_CONNECTION_STRING")),
  container: env("GALLERY_CONTAINER", "gallery").toLowerCase(),
  uploadCode: env("GALLERY_UPLOAD_CODE"),
  viewCode: env("GALLERY_VIEW_CODE"),
  adminCode: env("GALLERY_ADMIN_CODE"),
  quotaBytes: Number(env("GALLERY_QUOTA_GB", "50")) * 1024 ** 3,
  maxFileBytes: Number(env("GALLERY_MAX_FILE_MB", "2048")) * 1024 ** 2,
});

/* ---------- Azure helpers ---------- */
function parseConnectionString(cs) {
  if (!cs) return null;
  const parts = Object.fromEntries(cs.split(";").filter(Boolean).map((p) => { const i = p.indexOf("="); return [p.slice(0, i).trim(), p.slice(i + 1).trim()]; }));
  if (!parts.AccountName || !parts.AccountKey) return null;
  const base = (parts.BlobEndpoint || `${parts.DefaultEndpointsProtocol || "https"}://${parts.AccountName}.blob.${parts.EndpointSuffix || "core.windows.net"}`).replace(/\/+$/, "");
  return { name: parts.AccountName, key: parts.AccountKey, base };
}
const iso = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
const hmac = (account, text) => crypto.createHmac("sha256", Buffer.from(account.key, "base64")).update(text, "utf8").digest("base64");

/** Service SAS for one blob (sr=b) or a whole container (sr=c). */
function serviceSas(account, container, blob, permissions, minutes, contentDisposition = "") {
  const st = iso(Date.now() - 5 * 60_000);
  const se = iso(Date.now() + minutes * 60_000);
  const sr = blob ? "b" : "c";
  const resource = `/blob/${account.name}/${container}${blob ? `/${blob}` : ""}`;
  const toSign = [permissions, st, se, resource, "", "", "", SV, sr, "", "", "", contentDisposition, "", "", ""].join("\n");
  const q = new URLSearchParams({ sv: SV, sr, sp: permissions, st, se });
  if (contentDisposition) q.set("rscd", contentDisposition);
  q.set("sig", hmac(account, toSign));
  return q.toString();
}
/** Account SAS used only on the server (list, delete, setup). */
function accountSas(account) {
  const st = iso(Date.now() - 5 * 60_000);
  const se = iso(Date.now() + 15 * 60_000);
  const sp = "rwdlc";
  const toSign = [account.name, sp, "b", "sco", st, se, "", "", SV, "", ""].join("\n");
  return new URLSearchParams({ sv: SV, ss: "b", srt: "sco", sp, st, se, sig: hmac(account, toSign) }).toString();
}
const blobUrl = (c, blob, sas) => `${c.account.base}/${c.container}/${blob}?${sas}`;

async function azure(url, init = {}, okStatuses = []) {
  const res = await fetch(url, { ...init, headers: { "x-ms-version": SV, ...(init.headers || {}) } });
  if (!res.ok && !okStatuses.includes(res.status)) {
    const text = await res.text().catch(() => "");
    const code = (text.match(/<Code>([^<]+)<\/Code>/) || [])[1] || res.statusText;
    throw new Error(`Storage error ${res.status} (${code})`);
  }
  return res;
}

let setupDone = null;
/** Creates the private container and allows browser uploads (CORS). Runs once per instance. */
function ensureSetup(c) {
  if (!setupDone) {
    setupDone = (async () => {
      const sas = accountSas(c.account);
      await azure(`${c.account.base}/${c.container}?restype=container&${sas}`, { method: "PUT" }, [409]);
      const cors = `<?xml version="1.0" encoding="utf-8"?><StorageServiceProperties><Cors><CorsRule><AllowedOrigins>*</AllowedOrigins><AllowedMethods>GET,HEAD,PUT,OPTIONS</AllowedMethods><MaxAgeInSeconds>3600</MaxAgeInSeconds><ExposedHeaders>*</ExposedHeaders><AllowedHeaders>*</AllowedHeaders></CorsRule></Cors></StorageServiceProperties>`;
      await azure(`${c.account.base}/?restype=service&comp=properties&${sas}`, { method: "PUT", headers: { "Content-Type": "application/xml" }, body: cors });
    })().catch((err) => { setupDone = null; throw err; });
  }
  return setupDone;
}

const xmlDecode = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
async function listBlobs(c) {
  const sas = accountSas(c.account);
  const out = [];
  let marker = "";
  do {
    const res = await azure(`${c.account.base}/${c.container}?restype=container&comp=list&include=metadata&maxresults=5000${marker ? `&marker=${encodeURIComponent(marker)}` : ""}&${sas}`);
    const xml = await res.text();
    for (const [, b] of xml.matchAll(/<Blob>([\s\S]*?)<\/Blob>/g)) {
      const tag = (t) => xmlDecode((b.match(new RegExp(`<${t}>([\\s\\S]*?)</${t}>`)) || [])[1] || "");
      const metaXml = (b.match(/<Metadata>([\s\S]*?)<\/Metadata>/) || [])[1] || "";
      const meta = Object.fromEntries([...metaXml.matchAll(/<([\w-]+)>([\s\S]*?)<\/\1>/g)].map(([, k, v]) => [k.toLowerCase(), xmlDecode(v)]));
      out.push({ name: tag("Name"), size: Number(tag("Content-Length")) || 0, type: tag("Content-Type"), created: tag("Creation-Time") || tag("Last-Modified"), meta });
    }
    marker = (xml.match(/<NextMarker>([^<]*)<\/NextMarker>/) || [])[1] || "";
  } while (marker);
  return out;
}

/* ---------- request helpers ---------- */
function codeMatches(given, expected) {
  if (!expected) return false;
  const a = crypto.createHash("sha256").update(String(given || "")).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}
const decodeMeta = (v) => { try { return decodeURIComponent(v || ""); } catch { return v || ""; } };
const safeName = (name) => String(name || "file").normalize("NFKD").replace(/[^\w.-]+/g, "_").replace(/_+/g, "_").slice(-80) || "file";
const idOf = (blobName) => (blobName.split("/")[1] || "").split("-").slice(0, 2).join("-");

async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return req.body ? JSON.parse(req.body) : {};
  let raw = "";
  for await (const chunk of req) { raw += chunk; if (raw.length > 100_000) throw Object.assign(new Error("Request too large"), { status: 413 }); }
  return raw ? JSON.parse(raw) : {};
}
function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}
const fail = (status, message) => Object.assign(new Error(message), { status });

/* ---------- actions ---------- */
async function list(c, body) {
  const isAdmin = codeMatches(body.code, c.adminCode);
  if (c.viewCode && !isAdmin && !codeMatches(body.code, c.viewCode) && !codeMatches(body.code, c.uploadCode)) throw fail(401, "Wrong code");
  await ensureSetup(c);
  const blobs = await listBlobs(c);
  const thumbs = new Set(blobs.filter((b) => b.name.startsWith("thumbs/")).map((b) => b.name));
  const readSas = serviceSas(c.account, c.container, "", "r", 240);
  const items = blobs.filter((b) => b.name.startsWith("media/")).map((b) => {
    const thumb = `thumbs/${idOf(b.name)}.jpg`;
    const title = decodeMeta(b.meta.originalname) || b.name.split("/").pop();
    return {
      name: b.name,
      type: b.type.startsWith("video/") ? "video" : "image",
      contentType: b.type,
      size: b.size,
      created: b.created,
      uploader: decodeMeta(b.meta.uploader),
      title,
      url: blobUrl(c, b.name, readSas),
      thumb: thumbs.has(thumb) ? blobUrl(c, thumb, readSas) : "",
      download: blobUrl(c, b.name, serviceSas(c.account, c.container, b.name, "r", 240, `attachment; filename="${safeName(title)}"`)),
    };
  }).sort((a, b) => new Date(b.created) - new Date(a.created));
  return { items, usedBytes: blobs.reduce((sum, b) => sum + b.size, 0), quotaBytes: c.quotaBytes, isAdmin };
}

async function createUpload(c, body) {
  if (!c.uploadCode) throw fail(403, "Uploads are switched off");
  if (!codeMatches(body.code, c.uploadCode) && !codeMatches(body.code, c.adminCode)) throw fail(401, "Wrong team code");
  const size = Number(body.size);
  const type = String(body.type || "");
  if (!/^(image|video)\/[\w.+-]+$/.test(type)) throw fail(400, "Only photos and videos can be uploaded");
  if (!(size > 0)) throw fail(400, "This file is empty");
  if (size > c.maxFileBytes) throw fail(413, `Files can be at most ${Math.round(c.maxFileBytes / 1024 ** 2)} MB`);
  await ensureSetup(c);
  const used = (await listBlobs(c)).reduce((sum, b) => sum + b.size, 0);
  if (used + size > c.quotaBytes) throw fail(507, "The gallery is full");
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const id = `${stamp}-${crypto.randomBytes(4).toString("hex")}`;
  const name = `media/${id}-${safeName(body.name)}`;
  const thumb = `thumbs/${id}.jpg`;
  return {
    name,
    uploadUrl: blobUrl(c, name, serviceSas(c.account, c.container, name, "cw", 180)),
    thumbUrl: blobUrl(c, thumb, serviceSas(c.account, c.container, thumb, "cw", 180)),
  };
}

async function remove(c, body) {
  if (!codeMatches(body.code, c.adminCode)) throw fail(401, "Wrong admin code");
  const name = String(body.name || "");
  if (!/^media\/[\w.-]+$/.test(name)) throw fail(400, "Unknown file");
  const sas = accountSas(c.account);
  await azure(`${c.account.base}/${c.container}/${name}?${sas}`, { method: "DELETE" }, [404]);
  await azure(`${c.account.base}/${c.container}/thumbs/${idOf(name)}.jpg?${sas}`, { method: "DELETE" }, [404]);
  return { ok: true };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }
  const c = config();
  const action = new URL(req.url, "http://localhost").searchParams.get("action") || "config";
  try {
    if (action === "config") {
      return send(res, 200, { configured: !!c.account, uploadsEnabled: !!(c.account && c.uploadCode), viewNeedsCode: !!c.viewCode, adminEnabled: !!c.adminCode, quotaBytes: c.quotaBytes, maxFileBytes: c.maxFileBytes });
    }
    if (req.method !== "POST") throw fail(405, "Use POST");
    if (!c.account) throw fail(503, "Gallery storage isn't connected yet");
    const body = await readJson(req);
    if (action === "list") return send(res, 200, await list(c, body));
    if (action === "upload") return send(res, 200, await createUpload(c, body));
    if (action === "delete") return send(res, 200, await remove(c, body));
    throw fail(404, "Unknown action");
  } catch (err) {
    if (!err.status) console.error(err);
    return send(res, err.status || 500, { error: err.status ? err.message : "Something went wrong talking to storage" });
  }
}
