/* Site editor for the Noida Morale Outing website.
   Edits every data/*.json file through forms, shows a live preview, and saves by:
   1) writing files directly when served by server.py,
   2) publishing a commit to GitHub (GitHub Pages hosting), or
   3) downloading the JSON files. Unsaved edits are kept in this browser as a draft. */

const FILES = ["site", "event", "hotel", "locations", "employees", "rooms", "cars"];
const ROUTES = { home: "Home", location: "Location", hotel: "Hotel", rooms: "Rooms", travel: "Travel", team: "Team", event: "Schedule", gallery: "Gallery" };
const DRAFT_KEY = "noida-outing-draft";
const GH_KEY = "noida-outing-github";
const UI_KEY = "noida-outing-editor-ui";

let data = null;          // working copy being edited
let baselineStr = "";     // JSON of what is currently published / saved
let serverMode = false;   // true when served by server.py (can write files)
let current = "site";
let restoredDraft = false;
const openCards = new Set();
let pendingFocus = null;
const undoStack = [];
const redoStack = [];
let lastSnapshot = "";

/* ---------- small helpers ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const clone = (v) => JSON.parse(JSON.stringify(v));
const storage = {
  get(key, fallback = null) { try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ } },
  remove(key) { try { localStorage.removeItem(key); } catch { /* storage unavailable */ } },
};
function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  let value;
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "value") value = v;
    else if (k === "checked") el.checked = !!v;
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, v);
  }
  kids.flat(Infinity).forEach((c) => { if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c))); });
  if (value !== undefined) el.value = value;
  return el;
}
function getPath(path) { return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), data); }
function setPath(path, value) {
  const keys = path.split(".");
  const last = keys.pop();
  const target = keys.reduce((o, k) => { if (o[k] == null) o[k] = {}; return o[k]; }, data);
  target[last] = value;
}
let toastTimer;
function toast(msg, error = false) {
  const t = $("#toast");
  t.textContent = msg;
  t.className = `toast show${error ? " error" : ""}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = "toast"; }, error ? 5000 : 2600);
}
const debounce = (fn, ms) => { let id; return (...a) => { clearTimeout(id); id = setTimeout(() => fn(...a), ms); }; };
const names = () => data.employees.map((p) => p.name);
const roomOf = (name) => data.rooms.find((r) => r.members.includes(name));
const carOf = (name) => data.cars.find((c) => c.driver === name || c.passengers.includes(name));
const seats = (car) => [car.driver, ...car.passengers].filter(Boolean).length;

/* ---------- field shorthands ---------- */
const T = (key, label, o = {}) => ({ type: "text", key, label, ...o });
const TA = (key, label, o = {}) => ({ type: "textarea", key, label, ...o });
const CB = (key, label, o = {}) => ({ type: "checkbox", key, label, ...o });
const URLF = (key, label, o = {}) => ({ type: "url", key, label, wide: true, ...o });
const pageText = (route, extra = []) => ({
  title: "Page heading & labels", base: `site.pages.${route}`, collapsed: true,
  fields: [T("eyebrow", "Small heading (eyebrow)"), T("title", "Page title", route === "hotel" ? { help: "Leave blank to use the hotel name." } : {}), TA("lede", "Intro text", { wide: true }), ...extra],
});

/* ---------- editor sections ---------- */
const SECTIONS = [
  { id: "site", group: "Website", title: "Site & branding", route: "home", desc: "Browser title, logo text, top menu and footer.", groups: [
    { title: "Branding", base: "site", fields: [T("brandTitle", "Logo title"), T("brandSubtitle", "Logo subtitle"), T("pageTitle", "Browser tab title", { wide: true }), TA("metaDescription", "Search engine description", { wide: true }), CB("showLogo", "Show the four-colour logo mark")] },
    { title: "Top menu", base: "site.pages", help: "Rename menu items or hide whole pages. Hidden pages are removed from the menu and can't be opened.", fields: Object.entries(ROUTES).flatMap(([r, label]) => [T(`${r}.navLabel`, `${label} — menu label`), r === "home" ? { type: "note", text: "Home is always shown." } : CB(`${r}.visible`, `Show the ${label} page`)]) },
    { title: "Footer", base: "site", fields: [T("footerText", "Footer text", { wide: true }), CB("showLastUpdated", "Show “Updated <month>” in the footer"), CB("showEditLink", "Show an “Edit site” link in the footer")] },
  ] },
  { id: "home", group: "Website", title: "Home page", route: "home", desc: "Hero banner, stat cards and the panels on the home page.", groups: [
    { title: "Hero banner", base: "site.pages.home", help: "The date shown after the eyebrow and in the circle comes from Event details.", fields: [T("heroEyebrow", "Eyebrow text"), T("heroButton", "Button label"), T("heroTitleLine1", "Headline — line 1"), T("heroTitleLine2", "Headline — line 2 (highlighted)"), TA("heroText", "Supporting text", { wide: true })] },
    { title: "Stat cards", base: "site.pages.home", collapsed: true, help: "Values are filled automatically from event, team, cars and rooms.", fields: [T("statDateLabel", "Date card — label"), T("statDateDetail", "Date card — detail"), T("statDestinationLabel", "Destination card — label"), T("statDestinationDetail", "Destination card — detail"), T("statPeopleLabel", "Team card — label"), T("statPeopleDetail", "Team card — detail"), T("statCarsLabel", "Cars card — label"), T("statCarsDetail", "Cars card — detail"), T("statRoomsLabel", "Rooms card — label"), T("statRoomsDetail", "Rooms card — detail")] },
    { title: "“Before we roll” panel", base: "site.pages.home", collapsed: true, fields: [T("departureEyebrow", "Eyebrow"), T("departureTitle", "Title"), T("departurePill", "Pill text (before departure time)"), T("reportingLabel", "Reporting point label"), T("reportByLabel", "“Report by” label"), T("departNote", "Departure note"), T("checkInLabel", "Hotel check-in label"), T("checkOutLabel", "Check-out label")] },
    { title: "Important information panel", base: "site.pages.home", fields: [T("infoEyebrow", "Eyebrow"), T("infoTitle", "Title"), T("infoLink", "Link text", { wide: true }), { type: "strings", abs: "event.importantInstructions", label: "Instructions", addLabel: "Add instruction" }] },
    { title: "Route banner", base: "site.pages.home", collapsed: true, fields: [T("routeEyebrow", "Eyebrow"), T("routeButton", "Button label")] },
  ] },
  { id: "gallery", group: "Website", title: "Photo gallery", route: "gallery", desc: "Gallery page with OneDrive links: one for uploading, one for browsing.", groups: [
    { title: "OneDrive links", base: "site.pages.gallery", help: "Upload link: in OneDrive, open the folder → ⋯ → Request files → copy the link. Browse link: same folder → Share → choose who can view → Copy link. Leave a link blank to show “Link coming soon”.", fields: [URLF("uploadUrl", "Upload link (OneDrive “Request files”)", { placeholder: "https://…sharepoint.com/:f:/…" }), URLF("viewUrl", "Browse link (shared folder)", { placeholder: "https://…sharepoint.com/:f:/…" }), T("deadline", "Deadline note (optional)", { wide: true, placeholder: "e.g. Please upload by 30 December" })] },
    { title: "Upload & browse boxes", base: "site.pages.gallery", fields: [T("uploadTitle", "Upload box — title"), T("uploadButton", "Upload box — button"), TA("uploadText", "Upload box — text", { wide: true }), T("viewTitle", "Browse box — title"), T("viewButton", "Browse box — button"), TA("viewText", "Browse box — text", { wide: true }), T("comingSoonText", "Button text when a link is missing", { wide: true })] },
    { title: "Tips & note", base: "site.pages.gallery", collapsed: true, fields: [T("tipsTitle", "Tips title", { wide: true }), { type: "strings", key: "tips", label: "Tips", addLabel: "Add tip" }, T("accessNote", "Note under the boxes", { wide: true })] },
    { title: "Home page banner", base: "site.pages.gallery", fields: [CB("showOnHome", "Show the “Share your memories” banner on the home page"), T("homeButton", "Button label"), T("homeTitle", "Title", { wide: true }), T("homeText", "Text", { wide: true })] },
    pageText("gallery"),
  ] },
  { id: "event", group: "Outing", title: "Event details", route: "home", desc: "Date, departure, timings and emergency contact used across the site.", groups: [
    { title: "Basics", base: "event", fields: [T("name", "Event name", { wide: true }), { type: "date", key: "date", label: "Event date" }, T("departure", "Departure (reporting point)"), T("destination", "Destination", { wide: true }), T("reportingTime", "Reporting time"), T("departureTime", "Departure time"), T("arrivalTime", "Expected arrival time")] },
    { title: "Important instructions", base: "event", fields: [{ type: "strings", key: "importantInstructions", label: "Shown on the home page", addLabel: "Add instruction" }] },
    { title: "Emergency contact", base: "event.emergencyContact", fields: [T("name", "Name"), { type: "tel", key: "phone", label: "Phone" }] },
  ] },
  { id: "schedule", group: "Outing", title: "Schedule", route: "event", desc: "Days and timeline items on the Schedule page.", groups: [
    { title: "Days", base: "event", fields: [{ type: "array", key: "schedule", label: "", addLabel: "Add day",
      titleOf: (d, i) => d.day || `Day ${i + 1}`, subOf: (d) => `${d.date || "No date"} · ${d.items.length} items`,
      newItem: (list) => ({ day: `Day ${list.length + 1}`, date: "", items: [] }),
      fields: [T("day", "Day label"), T("date", "Date text"), { type: "array", key: "items", label: "Timeline items", addLabel: "Add item", wide: true,
        titleOf: (it) => it.title || "Untitled", subOf: (it) => it.time,
        newItem: () => ({ time: "", title: "New item", detail: "" }),
        fields: [T("time", "Time"), T("title", "Title"), TA("detail", "Details", { wide: true })] }] }] },
    pageText("event", [T("emergencyTitle", "Emergency box title"), T("emergencyPrefix", "Text before contact name")]),
  ] },
  { id: "location", group: "Outing", title: "Location & route", route: "location", desc: "Departure and destination addresses and Google Maps links.", groups: [
    { title: "Departure", base: "locations.departure", fields: [T("name", "Name", { wide: true }), TA("address", "Address", { wide: true }), URLF("mapsUrl", "Google Maps link")] },
    { title: "Destination", base: "locations.destination", fields: [T("name", "Name", { wide: true }), TA("address", "Address", { wide: true }), URLF("mapsUrl", "Google Maps link", { help: "Also used by the “Open route in Maps” button on the home page." })] },
    { title: "Route", base: "locations", fields: [T("travelDuration", "Travel duration")] },
    pageText("location", [T("departureLabel", "Departure card label"), T("destinationLabel", "Destination card label"), T("directionsButton", "Directions button"), T("routeButton", "Full route button"), T("mapNoteTitle", "Map note title", { wide: true }), TA("mapNoteText", "Map note text", { wide: true })]),
  ] },
  { id: "hotel", group: "Outing", title: "Hotel", route: "hotel", desc: "Hotel information, timings, facilities and booking notes.", groups: [
    { title: "Hotel", base: "hotel", fields: [T("name", "Hotel name", { wide: true }), TA("address", "Address", { wide: true }), { type: "tel", key: "phone", label: "Phone" }, T("monogram", "Monogram letter on the image"), URLF("website", "Website"), URLF("mapsUrl", "Google Maps link"), T("badge", "Badge on the image")] },
    { title: "Check-in & check-out", base: "hotel", fields: [T("checkIn", "Check-in time"), T("checkInDay", "Check-in day text"), T("checkOut", "Check-out time"), T("checkOutDay", "Check-out day text")] },
    { title: "Stay details", base: "hotel", fields: [TA("meals", "Meals", { wide: true }), { type: "strings", key: "facilities", label: "Facilities", addLabel: "Add facility" }, T("reference", "Booking reference", { wide: true }), TA("instructions", "Special instructions", { wide: true })] },
    pageText("hotel", [T("infoEyebrow", "Card eyebrow"), T("mapsButton", "Maps button"), T("callButton", "Call button"), T("websiteButton", "Website button"), T("checkInLabel", "Check-in label"), T("checkOutLabel", "Check-out label"), T("facilitiesTitle", "Facilities panel title"), T("referenceLabel", "Reference label"), T("instructionsLabel", "Instructions label")]),
  ] },
  { id: "team", group: "People", title: "Team members", route: "team", desc: "Everyone on the outing. Car and room come from the Rooms and Cars sections.", count: () => data.employees.length, groups: [
    { title: "People", base: "", fields: [{ type: "employees" }] },
    { title: "Technology groups", base: "site", collapsed: true, help: "Options for each person's technology and for the filter on the Team page.", fields: [{ type: "strings", key: "technologies", label: "Groups", addLabel: "Add group" }] },
    pageText("team", [T("searchPlaceholder", "Search box placeholder"), T("emptyText", "No results text")]),
  ] },
  { id: "rooms", group: "People", title: "Rooms", route: "rooms", desc: "Room allocation. Adding someone already in another room moves them.", count: () => data.rooms.length, groups: [
    { title: "Rooms", base: "", fields: [{ type: "array", key: "rooms", label: "", addLabel: "Add room",
      titleOf: (r) => `Room ${r.roomNumber || "?"}`, subOf: (r) => `${r.type} · ${r.members.length}/${r.capacity} filled`, warnOf: (r) => r.members.length > r.capacity,
      newItem: (list) => ({ roomNumber: String((Math.max(100, ...list.map((r) => Number(r.roomNumber) || 0)) + 1)), type: "Double", capacity: 2, members: [], notes: "" }),
      fields: [T("roomNumber", "Room number"), T("type", "Room type"), { type: "number", key: "capacity", label: "Capacity", min: 1 }, T("notes", "Notes"), { type: "people", key: "members", label: "Members", kind: "room" }] }] },
    pageText("rooms", [T("searchPlaceholder", "Search box placeholder"), T("emptyText", "No results text")]),
  ] },
  { id: "cars", group: "People", title: "Cars", route: "travel", desc: "Cars, drivers and passengers. Adding someone already in another car moves them.", count: () => data.cars.length, groups: [
    { title: "Cars", base: "", fields: [{ type: "array", key: "cars", label: "", addLabel: "Add car",
      titleOf: (c) => c.carNumber || "Car", subOf: (c) => `${c.vehicleType} · ${c.driver || "no driver"} · ${seats(c)}/${c.capacity} seats`, warnOf: (c) => seats(c) > c.capacity || !c.driver,
      newItem: (list) => ({ carNumber: `Car ${list.length + 1}`, vehicleType: "SUV", driver: "", capacity: 4, passengers: [], pickupPoint: list[list.length - 1]?.pickupPoint || "", notes: "" }),
      fields: [T("carNumber", "Car name / number"), T("vehicleType", "Vehicle type"), { type: "number", key: "capacity", label: "Seats (incl. driver)", min: 1 }, { type: "person", key: "driver", label: "Driver" }, { type: "people", key: "passengers", label: "Passengers", kind: "car" }, T("pickupPoint", "Pickup point", { wide: true, help: "Text after “ · ” is shown on the card." }), T("notes", "Notes", { wide: true })] }] },
    { title: "Travel summary", base: "event", fields: [T("departureTime", "Departure time"), T("arrivalTime", "Expected arrival time")] },
    pageText("travel", [T("departureLabel", "Departure label"), T("arrivalLabel", "Arrival label"), T("driverLabel", "Driver label"), T("passengersLabel", "Passengers label"), T("searchPlaceholder", "Search box placeholder"), T("emptyText", "No results text")]),
  ] },
  { id: "publish", group: "Save", title: "Save & publish", route: null, desc: "Write your changes to the website.", custom: renderPublish },
];

/* ---------- validation ---------- */
function warnings() {
  const out = { team: [], rooms: [], cars: [], gallery: [] };
  const g = data.site.pages?.gallery || {};
  if (g.visible !== false) {
    const bad = (u) => u && !/^https?:\/\//i.test(u);
    if (!g.uploadUrl) out.gallery.push("No upload link yet — the Upload button shows “Link coming soon”.");
    if (!g.viewUrl) out.gallery.push("No browse link yet — the Browse button shows “Link coming soon”.");
    if (bad(g.uploadUrl) || bad(g.viewUrl)) out.gallery.push("Links must start with https:// — invalid links are hidden on the site.");
  }
  const all = new Set(names());
  const seen = new Set();
  data.employees.forEach((p) => {
    if (!p.name.trim()) out.team.push("A team member has no name.");
    else if (seen.has(p.name)) out.team.push(`“${p.name}” is listed twice.`);
    seen.add(p.name);
  });
  const inRoom = new Map();
  data.rooms.forEach((r) => {
    if (r.members.length > r.capacity) out.rooms.push(`Room ${r.roomNumber} has ${r.members.length} people but capacity ${r.capacity}.`);
    r.members.forEach((n) => { if (!all.has(n)) out.rooms.push(`Room ${r.roomNumber}: “${n}” is not in Team members.`); if (inRoom.has(n)) out.rooms.push(`${n} is in Room ${inRoom.get(n)} and Room ${r.roomNumber}.`); inRoom.set(n, r.roomNumber); });
  });
  const inCar = new Map();
  data.cars.forEach((c) => {
    if (!c.driver) out.cars.push(`${c.carNumber} has no driver.`);
    if (seats(c) > c.capacity) out.cars.push(`${c.carNumber} has ${seats(c)} people but ${c.capacity} seats.`);
    [c.driver, ...c.passengers].filter(Boolean).forEach((n) => { if (!all.has(n)) out.cars.push(`${c.carNumber}: “${n}” is not in Team members.`); if (inCar.has(n)) out.cars.push(`${n} is in ${inCar.get(n)} and ${c.carNumber}.`); inCar.set(n, c.carNumber); });
  });
  const noRoom = names().filter((n) => n && !inRoom.has(n));
  const noCar = names().filter((n) => n && !inCar.has(n));
  if (noRoom.length) out.rooms.push(`No room yet: ${noRoom.join(", ")}.`);
  if (noCar.length) out.cars.push(`No car yet: ${noCar.join(", ")}.`);
  return out;
}

/* ---------- moving people between rooms / cars ---------- */
function assignRoom(name, idx) {
  const from = roomOf(name);
  data.rooms.forEach((r) => { r.members = r.members.filter((n) => n !== name); });
  data.rooms[idx].members.push(name);
  if (from && from !== data.rooms[idx]) toast(`Moved ${name} from Room ${from.roomNumber}`);
}
function assignCar(name, idx, asDriver) {
  const from = carOf(name);
  data.cars.forEach((c) => { if (c.driver === name) c.driver = ""; c.passengers = c.passengers.filter((n) => n !== name); });
  if (asDriver) data.cars[idx].driver = name; else data.cars[idx].passengers.push(name);
  if (from && from !== data.cars[idx]) toast(`Moved ${name} from ${from.carNumber}`);
}
function renamePerson(oldName, newName) {
  if (!oldName || oldName === newName) return;
  data.rooms.forEach((r) => { r.members = r.members.map((n) => (n === oldName ? newName : n)); });
  data.cars.forEach((c) => { if (c.driver === oldName) c.driver = newName; c.passengers = c.passengers.map((n) => (n === oldName ? newName : n)); });
}

/* ---------- field rendering ---------- */
let uid = 0;
function fieldPath(f, base) { return f.abs || (base ? `${base}.${f.key}` : f.key); }
function labelled(f, id, control, extra) {
  return h("div", { class: `field${f.wide || ["textarea", "strings", "array", "people", "employees"].includes(f.type) ? " wide" : ""}` },
    f.label ? h("label", { for: id }, f.label) : null, f.help ? h("span", { class: "help" }, f.help) : null, control, extra);
}
function renderField(f, base) {
  const path = fieldPath(f, base);
  const id = `f${uid++}`;
  switch (f.type) {
    case "note": return h("div", { class: `field${f.wide ? " wide" : ""}` }, h("span", { class: "help", style: "padding-top:8px;font-size:12px" }, f.text));
    case "text": case "url": case "tel": case "date": case "number": {
      const input = h("input", { id, type: f.type, value: getPath(path) ?? "", "data-path": path, min: f.min, placeholder: f.placeholder,
        oninput: (e) => { setPath(path, f.type === "number" ? (e.target.value === "" ? 0 : Number(e.target.value)) : e.target.value); changed(); },
        onchange: f.type === "number" ? () => changed(true) : null });
      return labelled(f, id, input);
    }
    case "textarea": return labelled(f, id, h("textarea", { id, rows: 3, "data-path": path, value: getPath(path) ?? "", oninput: (e) => { setPath(path, e.target.value); changed(); } }));
    case "checkbox": return h("div", { class: "field" }, h("label", { class: "check" }, h("input", { type: "checkbox", checked: getPath(path) !== false, onchange: (e) => { setPath(path, e.target.checked); changed(true); } }), f.label));
    case "strings": return labelled(f, id, renderStrings(f, path));
    case "array": return labelled(f, id, renderCards(f, path));
    case "people": return labelled(f, id, renderPeople(f, path));
    case "person": return labelled(f, id, renderPerson(f, path, id));
    case "employees": return renderEmployees();
    default: return h("div", {}, `Unknown field ${f.type}`);
  }
}
function moveItem(list, i, dir) { const j = i + dir; if (j < 0 || j >= list.length) return; [list[i], list[j]] = [list[j], list[i]]; }

function renderStrings(f, path) {
  const list = getPath(path) || [];
  return h("div", { class: "str-list" },
    list.map((value, i) => h("div", { class: "str-row" },
      h("input", { type: "text", value, "data-path": `${path}.${i}`, oninput: (e) => { list[i] = e.target.value; changed(); },
        onkeydown: (e) => { if (e.key === "Enter") { e.preventDefault(); list.splice(i + 1, 0, ""); pendingFocus = `${path}.${i + 1}`; changed(true); } } }),
      h("button", { class: "icon-btn", type: "button", title: "Move up", disabled: i === 0, onclick: () => { moveItem(list, i, -1); changed(true); } }, "↑"),
      h("button", { class: "icon-btn", type: "button", title: "Move down", disabled: i === list.length - 1, onclick: () => { moveItem(list, i, 1); changed(true); } }, "↓"),
      h("button", { class: "icon-btn del", type: "button", title: "Remove", onclick: () => { list.splice(i, 1); changed(true); } }, "✕"))),
    h("button", { class: "add-btn", type: "button", onclick: () => { list.push(""); pendingFocus = `${path}.${list.length - 1}`; changed(true); } }, `+ ${f.addLabel || "Add"}`));
}

function renderCards(f, path) {
  const list = getPath(path) || [];
  return h("div", { class: "cards" },
    list.map((item, i) => {
      const p = `${path}.${i}`;
      const open = openCards.has(p);
      const card = h("div", { class: `card${open ? " open" : ""}`, "data-card": p },
        h("div", { class: "card-head" },
          h("button", { class: "card-toggle", type: "button", "aria-expanded": String(open), onclick: () => { if (open) openCards.delete(p); else openCards.add(p); renderEditor(); } },
            h("span", { class: "card-title" }, f.titleOf(item, i)), h("span", { class: `card-sub${f.warnOf?.(item) ? " warn" : ""}` }, f.subOf ? f.subOf(item, i) : "")),
          h("button", { class: "icon-btn", type: "button", title: "Move up", disabled: i === 0, onclick: () => { moveItem(list, i, -1); remapOpen(path, i, i - 1); changed(true); } }, "↑"),
          h("button", { class: "icon-btn", type: "button", title: "Move down", disabled: i === list.length - 1, onclick: () => { moveItem(list, i, 1); remapOpen(path, i, i + 1); changed(true); } }, "↓"),
          h("button", { class: "icon-btn", type: "button", title: "Duplicate", onclick: () => { const copy = clone(item); if (path === "rooms") copy.members = []; if (path === "cars") { copy.driver = ""; copy.passengers = []; } list.splice(i + 1, 0, copy); clearOpen(path); openCards.add(`${path}.${i + 1}`); changed(true); } }, "⧉"),
          h("button", { class: "icon-btn del", type: "button", title: "Delete", onclick: () => { if (!confirm(`Delete “${f.titleOf(item, i)}”?`)) return; list.splice(i, 1); clearOpen(path); changed(true); } }, "✕")),
        open ? h("div", { class: "card-body" }, f.fields.map((sub) => renderField(sub, p))) : null);
      card._refresh = () => { const it = getPath(p); if (!it) return; card.querySelector(".card-title").textContent = f.titleOf(it, i); const sub = card.querySelector(".card-sub"); sub.textContent = f.subOf ? f.subOf(it, i) : ""; sub.classList.toggle("warn", !!f.warnOf?.(it)); };
      return card;
    }),
    h("button", { class: "add-btn", type: "button", onclick: () => { list.push(f.newItem(list)); clearOpen(path); openCards.add(`${path}.${list.length - 1}`); changed(true); } }, `+ ${f.addLabel || "Add"}`));
}
function clearOpen(prefix) { [...openCards].forEach((p) => { if (p.startsWith(`${prefix}.`)) openCards.delete(p); }); }
function remapOpen(prefix, a, b) { const pa = `${prefix}.${a}`; const pb = `${prefix}.${b}`; const oa = openCards.has(pa); const ob = openCards.has(pb); clearOpen(prefix); if (oa) openCards.add(pb); if (ob) openCards.add(pa); }

function whereIs(name, kind) {
  if (kind === "room") { const r = roomOf(name); return r ? ` — in Room ${r.roomNumber}` : " — no room"; }
  const c = carOf(name); return c ? ` — ${c.driver === name ? "driving" : "in"} ${c.carNumber}` : " — no car";
}
function renderPeople(f, path) {
  const list = getPath(path) || [];
  const idx = Number(path.split(".")[1]);
  const item = getPath(path.split(".").slice(0, 2).join("."));
  const known = new Set(names());
  const used = f.kind === "car" ? seats(item) : list.length;
  const options = names().filter((n) => n && !list.includes(n) && !(f.kind === "car" && item.driver === n));
  return h("div", { class: "chips" },
    list.map((n) => h("span", { class: `chip${known.has(n) ? "" : " unknown"}`, title: known.has(n) ? "" : "Not in Team members" }, n,
      h("button", { type: "button", "aria-label": `Remove ${n}`, onclick: () => { setPath(path, list.filter((x) => x !== n)); changed(true); } }, "×"))),
    h("select", { "aria-label": `Add to ${f.label}`, onchange: (e) => { if (!e.target.value) return; if (f.kind === "room") assignRoom(e.target.value, idx); else assignCar(e.target.value, idx, false); changed(true); } },
      h("option", { value: "" }, options.length ? "+ Add person…" : "Everyone is added"),
      options.map((n) => h("option", { value: n }, `${n}${whereIs(n, f.kind)}`))),
    h("span", { class: `cap${used > item.capacity ? " over" : ""}` }, `${used}/${item.capacity} ${f.kind === "car" ? "seats incl. driver" : "filled"}`));
}
function renderPerson(f, path, id) {
  const idx = Number(path.split(".")[1]);
  const value = getPath(path) || "";
  return h("select", { id, value, onchange: (e) => { if (e.target.value) assignCar(e.target.value, idx, true); else setPath(path, ""); changed(true); } },
    h("option", { value: "" }, "— No driver —"),
    !value || names().includes(value) ? null : h("option", { value }, `${value} (not in team)`),
    names().filter(Boolean).map((n) => h("option", { value: n }, n === value ? n : `${n}${whereIs(n, "car")}`)));
}
function renderEmployees() {
  const techs = data.site.technologies || [];
  const rows = data.employees.map((p, i) => {
    const room = roomOf(p.name);
    const car = carOf(p.name);
    return h("div", { class: "emp-row" },
      h("input", { type: "text", value: p.name, "aria-label": "Name", "data-path": `employees.${i}.name`,
        onfocus: (e) => { e.target.dataset.old = p.name; },
        oninput: (e) => { const old = e.target.dataset.old ?? p.name; p.name = e.target.value; renamePerson(old, p.name); e.target.dataset.old = p.name; changed(); } }),
      h("select", { "aria-label": "Technology", value: p.technology, onchange: (e) => { p.technology = e.target.value; changed(); } },
        techs.includes(p.technology) ? null : h("option", { value: p.technology }, p.technology || "—"),
        techs.map((t) => h("option", { value: t }, t))),
      h("span", { class: "emp-meta" }, car ? h("b", {}, car.carNumber) : h("span", { class: "miss" }, "No car"), car?.driver === p.name ? " (driver)" : "", " · ", room ? h("b", {}, `Room ${room.roomNumber}`) : h("span", { class: "miss" }, "No room")),
      h("button", { class: "icon-btn del", type: "button", title: `Remove ${p.name}`, onclick: () => {
        if (!confirm(`Remove ${p.name || "this person"} from the team? They will also be removed from their room and car.`)) return;
        data.employees.splice(i, 1);
        data.rooms.forEach((r) => { r.members = r.members.filter((n) => n !== p.name); });
        data.cars.forEach((c) => { if (c.driver === p.name) c.driver = ""; c.passengers = c.passengers.filter((n) => n !== p.name); });
        changed(true);
      } }, "✕"));
  });
  const addPeople = () => {
    const input = prompt("Add team members — one name per line or separated by commas:");
    if (!input) return;
    const list = input.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
    let id = Math.max(0, ...data.employees.map((p) => Number(p.id) || 0));
    list.forEach((name) => data.employees.push({ id: ++id, name, technology: techs[0] || "", car: "", room: "" }));
    changed(true);
    toast(`Added ${list.length} ${list.length === 1 ? "person" : "people"} — assign them in Rooms and Cars.`);
  };
  return h("div", { class: "emp-table" },
    h("div", { class: "emp-row head" }, h("span", {}, "Name"), h("span", {}, "Technology"), h("span", {}, "Car · Room"), h("span", {})),
    rows,
    h("div", { class: "panel-actions" },
      h("button", { class: "add-btn", type: "button", onclick: () => { const id = Math.max(0, ...data.employees.map((p) => Number(p.id) || 0)) + 1; data.employees.push({ id, name: "", technology: techs[0] || "", car: "", room: "" }); pendingFocus = `employees.${data.employees.length - 1}.name`; changed(true); } }, "+ Add person"),
      h("button", { class: "add-btn", type: "button", onclick: addPeople }, "+ Add several")));
}

/* ---------- section rendering ---------- */
function renderSidebar() {
  const w = warnings();
  const nav = $("#sidebar");
  nav.innerHTML = "";
  let group = "";
  SECTIONS.forEach((s) => {
    if (s.group !== group) { group = s.group; nav.append(h("h6", {}, group)); }
    const issues = w[s.id]?.length || 0;
    nav.append(h("button", { class: `nav-item${s.id === current ? " active" : ""}`, type: "button", onclick: () => go(s.id) },
      s.title, issues ? h("span", { class: "badge", title: `${issues} to check` }, issues) : s.count ? h("span", { class: "count" }, s.count()) : null));
  });
}
function warningsBox(id) {
  const w = warnings()[id] || [];
  return h("div", { class: "warnings", "data-warnings": id, hidden: !w.length }, h("b", {}, `${w.length} thing${w.length === 1 ? "" : "s"} to check`), h("ul", {}, w.map((m) => h("li", {}, m))));
}
function renderEditor() {
  const editor = $("#editor");
  const scroll = editor.scrollTop;
  const section = SECTIONS.find((s) => s.id === current);
  editor.innerHTML = "";
  uid = 0;
  editor.append(h("div", { class: "editor-head" }, h("h1", {}, section.title), h("p", {}, section.desc)));
  if (restoredDraft && isDirty()) editor.append(h("div", { class: "notice warn" }, h("span", {}, "Restored unsaved edits from this browser. They're not on the live site until you save or publish."),
    h("button", { class: "btn small", type: "button", onclick: () => go("publish") }, "Save & publish"),
    h("button", { class: "btn small danger", type: "button", onclick: discardChanges }, "Discard")));
  editor.append(warningsBox(section.id));
  if (section.custom) section.custom(editor);
  else section.groups.forEach((g) => {
    const key = `${section.id}:${g.title}`;
    const ui = storage.get(UI_KEY, {});
    const isOpen = ui[key] ?? !g.collapsed;
    const details = h("details", { class: "group", open: isOpen, ontoggle: (e) => { const u = storage.get(UI_KEY, {}); u[key] = e.target.open; storage.set(UI_KEY, u); } },
      h("summary", {}, g.title),
      h("div", { class: "group-body" }, g.help ? h("p", { class: "group-help" }, g.help) : null, g.fields.map((f) => renderField(f, g.base))));
    editor.append(details);
  });
  editor.scrollTop = scroll;
  if (pendingFocus) { const el = editor.querySelector(`[data-path="${CSS.escape(pendingFocus)}"]`); pendingFocus = null; el?.focus(); }
}
function go(id) {
  current = id;
  $("#editor").scrollTop = 0;
  renderSidebar();
  renderEditor();
  const route = SECTIONS.find((s) => s.id === id).route;
  if (route) { $("#preview-route").value = route; sendPreview(route); }
  $("#editor").focus({ preventScroll: true });
}

/* ---------- change tracking, drafts, undo ---------- */
const isDirty = () => JSON.stringify(data) !== baselineStr;
function changed(structural = false) {
  if (structural) renderEditor();
  else {
    document.querySelectorAll("[data-card]").forEach((c) => c._refresh?.());
    const box = document.querySelector("[data-warnings]");
    if (box) box.replaceWith(warningsBox(box.dataset.warnings));
  }
  renderSidebar();
  updateStatus();
  schedulePreview();
  scheduleSnapshot();
  if (isDirty()) storage.set(DRAFT_KEY, data); else storage.remove(DRAFT_KEY);
}
function updateStatus(msg) {
  const el = $("#status");
  const dirty = isDirty();
  el.className = `status${dirty ? " dirty" : msg ? " ok" : ""}`;
  el.textContent = msg || (dirty ? (serverMode ? "Unsaved changes" : "Unpublished changes · kept in this browser") : "All changes saved");
  $("#primary").textContent = serverMode ? "Save to files" : "Save & publish";
  $("#undo").disabled = undoStack.length === 0;
  $("#redo").disabled = redoStack.length === 0;
}
const scheduleSnapshot = debounce(() => {
  const now = JSON.stringify(data);
  if (now === lastSnapshot) return;
  undoStack.push(lastSnapshot);
  if (undoStack.length > 80) undoStack.shift();
  redoStack.length = 0;
  lastSnapshot = now;
  updateStatus();
}, 450);
function restore(snapshot) { data = JSON.parse(snapshot); lastSnapshot = snapshot; renderEditor(); renderSidebar(); updateStatus(); schedulePreview(); if (isDirty()) storage.set(DRAFT_KEY, data); else storage.remove(DRAFT_KEY); }
function undo() { if (!undoStack.length) return; redoStack.push(JSON.stringify(data)); restore(undoStack.pop()); toast("Undone"); }
function redo() { if (!redoStack.length) return; undoStack.push(JSON.stringify(data)); restore(redoStack.pop()); toast("Redone"); }
function discardChanges() {
  if (!confirm("Discard all unsaved edits and go back to the published content?")) return;
  undoStack.push(JSON.stringify(data));
  restoredDraft = false;
  restore(baselineStr);
  storage.remove(DRAFT_KEY);
  toast("Edits discarded");
}

/* ---------- preview ---------- */
let previewRoute = "home";
let device = "desktop";
function sendPreview(route) {
  if (route) previewRoute = route;
  $("#preview-frame").contentWindow?.postMessage({ type: "noida-preview", data, route: route || null }, window.location.origin);
}
const schedulePreview = debounce(() => sendPreview(), 120);
function fitPreview() {
  const stage = $("#preview-stage");
  const frame = $("#preview-frame");
  const width = device === "mobile" ? 390 : 1280;
  const pad = device === "mobile" ? 32 : 0;
  const scale = Math.min(1, (stage.clientWidth - pad) / width);
  frame.style.width = `${width}px`;
  frame.style.height = `${(stage.clientHeight - (device === "mobile" ? 32 : 0)) / scale}px`;
  frame.style.transform = `scale(${scale})`;
  frame.style.left = `${Math.max(0, (stage.clientWidth - width * scale) / 2)}px`;
  stage.classList.toggle("mobile", device === "mobile");
}
function setupPreview() {
  const sel = $("#preview-route");
  Object.entries(ROUTES).forEach(([r, label]) => sel.append(h("option", { value: r }, label)));
  sel.addEventListener("change", () => sendPreview(sel.value));
  document.querySelectorAll("[data-device]").forEach((b) => b.addEventListener("click", () => {
    device = b.dataset.device;
    document.querySelectorAll("[data-device]").forEach((x) => x.classList.toggle("on", x === b));
    fitPreview();
  }));
  window.addEventListener("message", (e) => { if (e.origin === window.location.origin && e.data?.type === "noida-preview-ready" && data) sendPreview(previewRoute); });
  new ResizeObserver(fitPreview).observe($("#preview-stage"));
  const ws = $("#workspace");
  const wide = () => window.matchMedia("(min-width: 1181px)").matches;
  if (storage.get(UI_KEY, {}).hidePreview) ws.classList.add("no-preview");
  $("#toggle-preview").addEventListener("click", () => {
    if (wide()) { ws.classList.toggle("no-preview"); const u = storage.get(UI_KEY, {}); u.hidePreview = ws.classList.contains("no-preview"); storage.set(UI_KEY, u); }
    else ws.classList.toggle("show-preview");
    requestAnimationFrame(fitPreview);
  });
  $("#close-preview").addEventListener("click", () => ws.classList.remove("show-preview"));
}

/* ---------- saving ---------- */
function normalized() {
  const d = clone(data);
  d.employees.forEach((p) => {
    const car = d.cars.find((c) => c.driver === p.name || c.passengers.includes(p.name));
    const room = d.rooms.find((r) => r.members.includes(p.name));
    p.car = car ? car.carNumber : "";
    p.room = room ? room.roomNumber : "";
  });
  d.event.totalEmployees = d.employees.length;
  d.event.totalCars = d.cars.length;
  d.event.totalRooms = d.rooms.length;
  return d;
}
function markSaved(saved, msg) {
  data = saved;
  baselineStr = JSON.stringify(saved);
  lastSnapshot = baselineStr;
  restoredDraft = false;
  storage.remove(DRAFT_KEY);
  renderEditor();
  renderSidebar();
  updateStatus(msg);
  sendPreview();
}
async function saveToServer() {
  const files = normalized();
  const res = await fetch("api/save", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ files }) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Save failed (${res.status})`);
  markSaved(files, "Saved to data files");
  toast(`Saved. Backup of the previous version: data/.backups/${body.backup}`);
}
function ghSettings() { return { owner: "", repo: "", branch: "main", folder: "", token: "", remember: false, ...storage.get(GH_KEY, {}), ...(sessionStorage.getItem(GH_KEY + ":token") ? { token: sessionStorage.getItem(GH_KEY + ":token") } : {}) }; }
function storeGh(s) {
  const { token, ...rest } = s;
  storage.set(GH_KEY, s.remember ? s : rest);
  try { if (s.remember) sessionStorage.removeItem(GH_KEY + ":token"); else sessionStorage.setItem(GH_KEY + ":token", token); } catch { /* ignore */ }
}
async function publishToGitHub(s, message, log) {
  const api = async (path, opts = {}) => {
    const res = await fetch(`https://api.github.com/repos/${encodeURIComponent(s.owner)}/${encodeURIComponent(s.repo)}${path}`, { ...opts, headers: { Authorization: `Bearer ${s.token}`, Accept: "application/vnd.github+json", "Content-Type": "application/json" } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`GitHub ${res.status}: ${body.message || res.statusText}`);
    return body;
  };
  const files = normalized();
  const folder = s.folder.replace(/^\/+|\/+$/g, "");
  const prefix = folder ? `${folder}/` : "";
  log(`Reading branch ${s.branch}…`);
  const ref = await api(`/git/ref/heads/${encodeURIComponent(s.branch)}`);
  if (prefix) {
    try { await api(`/contents/${prefix.split("/").filter(Boolean).map(encodeURIComponent).join("/")}/index.html?ref=${encodeURIComponent(s.branch)}`); }
    catch { throw new Error(`There's no website in the folder “${folder}” on ${s.branch}. Clear “Site folder in repo” (leave it blank) and publish again.`); }
  }
  const head = await api(`/git/commits/${ref.object.sha}`);
  log("Uploading data files…");
  const tree = await api("/git/trees", { method: "POST", body: JSON.stringify({ base_tree: head.tree.sha, tree: FILES.map((f) => ({ path: `${prefix}data/${f}.json`, mode: "100644", type: "blob", content: `${JSON.stringify(files[f], null, 2)}\n` })) }) });
  if (tree.sha === head.tree.sha) { log("Nothing changed on GitHub — the files already match."); markSaved(files, "Already up to date"); return; }
  const commit = await api("/git/commits", { method: "POST", body: JSON.stringify({ message, tree: tree.sha, parents: [ref.object.sha] }) });
  await api(`/git/refs/heads/${encodeURIComponent(s.branch)}`, { method: "PATCH", body: JSON.stringify({ sha: commit.sha }) });
  log(`Published commit ${commit.sha.slice(0, 7)}.`, commit.html_url);
  log("GitHub Pages usually updates the live site within 1–2 minutes.");
  markSaved(files, "Published to GitHub");
}
function download(name, obj) {
  const a = h("a", { href: URL.createObjectURL(new Blob([`${JSON.stringify(obj, null, 2)}\n`], { type: "application/json" })), download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function guessFile(name, obj) {
  const base = name.replace(/\.json$/i, "").toLowerCase();
  if (FILES.includes(base)) return base;
  if (Array.isArray(obj)) { const x = obj[0] || {}; if ("roomNumber" in x) return "rooms"; if ("carNumber" in x) return "cars"; if ("technology" in x) return "employees"; }
  else if (obj) { if (obj.departure?.address) return "locations"; if ("schedule" in obj) return "event"; if ("checkIn" in obj) return "hotel"; if ("pages" in obj) return "site"; }
  return null;
}
async function importFiles(fileList) {
  const imported = [];
  for (const file of fileList) {
    let obj;
    try { obj = JSON.parse(await file.text()); } catch { toast(`${file.name} is not valid JSON`, true); continue; }
    if (obj && !Array.isArray(obj) && FILES.every((f) => f in obj)) { FILES.forEach((f) => { data[f] = obj[f]; }); imported.push("all content"); continue; }
    const target = guessFile(file.name, obj);
    if (!target) { toast(`Couldn't tell which file ${file.name} is`, true); continue; }
    data[target] = obj; imported.push(`${target}.json`);
  }
  if (imported.length) { changed(true); toast(`Imported ${imported.join(", ")}`); }
}

function renderPublish(root) {
  const dirty = isDirty();
  root.append(h("div", { class: `notice${dirty ? " warn" : " ok"}` }, h("span", {}, dirty ? "You have changes that aren't on the live site yet." : "Everything you've edited is saved.")));

  if (serverMode) {
    root.append(h("details", { class: "group", open: true }, h("summary", {}, "Save to this computer"), h("div", { class: "group-body" },
      h("p", { class: "group-help" }, "The editor server is running, so saving writes straight into the data/*.json files in the site folder. The previous version is kept in data/.backups/."),
      h("div", { class: "panel-actions" }, h("button", { class: "btn primary", type: "button", disabled: !dirty, onclick: () => runSave() }, "Save to files")))));
  }

  const s = ghSettings();
  if (!s.owner && /\.github\.io$/.test(window.location.hostname)) { s.owner = window.location.hostname.split(".")[0]; s.repo = window.location.pathname.split("/").filter(Boolean)[0] || `${s.owner}.github.io`; }
  const logBox = h("div", { class: "log", hidden: true });
  const log = (msg, link) => { logBox.hidden = false; logBox.append(msg, link ? " " : "", link ? h("a", { href: link, target: "_blank", rel: "noopener" }, "View on GitHub ↗") : "", "\n"); };
  const input = (key, label, o = {}) => h("div", { class: `field${o.wide ? " wide" : ""}` }, h("label", { for: `gh-${key}` }, label), o.help ? h("span", { class: "help" }, o.help) : null,
    h("input", { id: `gh-${key}`, type: o.type || "text", value: s[key], placeholder: o.placeholder, autocomplete: "off", spellcheck: "false", oninput: (e) => { s[key] = e.target.value.trim(); storeGh(s); } }));
  const msg = h("input", { id: "gh-msg", type: "text", value: "Update outing details from the site editor" });
  const publishBtn = h("button", { class: "btn primary", type: "button", onclick: async () => {
    if (!s.owner || !s.repo || !s.branch || !s.token) { toast("Fill in owner, repository, branch and token first", true); return; }
    publishBtn.disabled = true; logBox.textContent = "";
    try { await publishToGitHub(s, msg.value || "Update outing details", log); toast("Published to GitHub"); }
    catch (err) { log(`✕ ${err.message}`); toast(err.message, true); }
    finally { publishBtn.disabled = false; }
  } }, "Publish to GitHub");
  root.append(h("details", { class: "group", open: !serverMode }, h("summary", {}, "Publish to GitHub Pages", h("small", {}, "for the hosted website")), h("div", { class: "group-body" },
    h("p", { class: "group-help" }, "Commits the data files to your repository in one commit; GitHub Pages then rebuilds the live site. Use a fine‑grained personal access token limited to this one repository with “Contents: Read and write”. The token is only sent to api.github.com."),
    input("owner", "GitHub owner", { placeholder: "your-github-username" }), input("repo", "Repository", { placeholder: "Noida-Morale-outing" }),
    input("branch", "Branch", { placeholder: "main" }), input("folder", "Site folder in repo", { placeholder: "(root)", help: "Leave blank if index.html is at the top of the repo." }),
    input("token", "Access token", { type: "password", wide: true, placeholder: "github_pat_…" }),
    h("div", { class: "field wide" }, h("label", { class: "check" }, h("input", { type: "checkbox", checked: s.remember, onchange: (e) => { s.remember = e.target.checked; storeGh(s); } }), "Remember the token on this device (otherwise it's forgotten when the tab closes)")),
    h("div", { class: "field wide" }, h("label", { for: "gh-msg" }, "Commit message"), msg),
    h("div", { class: "panel-actions" }, publishBtn), logBox)));

  const fileInput = h("input", { type: "file", accept: ".json,application/json", multiple: true, hidden: true, onchange: (e) => { importFiles(e.target.files); e.target.value = ""; } });
  root.append(h("details", { class: "group", open: true }, h("summary", {}, "Download or import"), h("div", { class: "group-body" },
    h("p", { class: "group-help" }, "Download the data files and replace the ones in the data/ folder of your site, or import files you downloaded earlier."),
    h("div", { class: "panel-actions" },
      h("button", { class: "btn", type: "button", onclick: () => download("outing-content.json", normalized()) }, "⬇ All content (one file)"),
      FILES.map((f) => h("button", { class: "btn small", type: "button", onclick: () => download(`${f}.json`, normalized()[f]) }, `${f}.json`))),
    h("div", { class: "panel-actions" }, h("button", { class: "btn", type: "button", onclick: () => fileInput.click() }, "⬆ Import JSON…"), fileInput))));

  root.append(h("details", { class: "group" }, h("summary", {}, "Start over"), h("div", { class: "group-body" },
    h("p", { class: "group-help" }, "Throw away every edit that hasn't been saved or published."),
    h("div", { class: "panel-actions" }, h("button", { class: "btn danger", type: "button", disabled: !dirty, onclick: discardChanges }, "Discard unsaved edits")))));
}
async function runSave() {
  if (!serverMode) { go("publish"); return; }
  const btn = $("#primary");
  btn.disabled = true;
  try { await saveToServer(); } catch (err) { toast(err.message, true); } finally { btn.disabled = false; }
}

/* ---------- start ---------- */
async function init() {
  $("#editor").append(h("div", { class: "loading" }, "Loading content…"));
  setupPreview();
  try {
    const entries = await Promise.all(FILES.map(async (f) => { const r = await fetch(`data/${f}.json`, { cache: "no-cache" }); if (!r.ok) throw new Error(`Could not load data/${f}.json`); return [f, await r.json()]; }));
    const published = Object.fromEntries(entries);
    baselineStr = JSON.stringify(published);
    data = clone(published);
    const draft = storage.get(DRAFT_KEY);
    if (draft && FILES.every((f) => f in draft) && JSON.stringify(draft) !== baselineStr) { data = draft; restoredDraft = true; }
  } catch (err) {
    $("#editor").innerHTML = "";
    $("#editor").append(h("div", { class: "notice warn" }, h("span", {}, `${err.message}. Open the editor through a web server (see README), not as a file.`)));
    return;
  }
  serverMode = await fetch("api/status", { cache: "no-store" }).then((r) => r.ok && r.json()).then((j) => !!j?.canSave).catch(() => false);
  lastSnapshot = JSON.stringify(data);
  $("#site-name").textContent = data.site.pageTitle || "Website";
  $("#primary").addEventListener("click", runSave);
  $("#undo").addEventListener("click", undo);
  $("#redo").addEventListener("click", redo);
  document.addEventListener("keydown", (e) => {
    const mod = e.metaKey || e.ctrlKey;
    const typing = /INPUT|TEXTAREA/.test(document.activeElement?.tagName || "");
    if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); runSave(); }
    else if (mod && e.key.toLowerCase() === "z" && !typing) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
  });
  window.addEventListener("beforeunload", (e) => { if (serverMode && isDirty()) { e.preventDefault(); e.returnValue = ""; } });
  const startAt = window.location.hash.slice(1);
  go(SECTIONS.some((s) => s.id === startAt) ? startAt : "site");
  updateStatus();
}
init();
