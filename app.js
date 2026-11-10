import { galleryBannerHtml, galleryPageHtml, initGallery } from "./gallery.js";

const DATA_FILES = ["site", "event", "hotel", "locations", "employees", "rooms", "cars"];
const ROUTES = ["home", "location", "hotel", "rooms", "travel", "team", "event", "gallery"];
const DRAFT_KEY = "noida-outing-draft";
const IS_PREVIEW = new URLSearchParams(window.location.search).has("preview");
const state = { site: {}, event: null, hotel: null, locations: null, employees: [], rooms: [], cars: [], route: "home" };
const app = document.querySelector("#app");
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
const icon = (name) => `<span class="icon icon-${name}" aria-hidden="true"></span>`;
const page = (route) => state.site?.pages?.[route] || {};
const techClass = (tech) => `tech-${String(tech || "other").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

function readDraft() { try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || "null"); } catch { return null; } }
function clearDraft() { try { localStorage.removeItem(DRAFT_KEY); } catch { /* storage unavailable */ } }

async function loadData() {
  const results = await Promise.all(DATA_FILES.map(async (file) => {
    const response = await fetch(`data/${file}.json`, { cache: "no-cache" });
    if (!response.ok) throw new Error(`Could not load data/${file}.json`);
    return [file, await response.json()];
  }));
  const published = Object.fromEntries(results);
  Object.assign(state, published);
  if (!IS_PREVIEW) {
    const draft = readDraft();
    if (draft) {
      const differs = DATA_FILES.some((file) => draft[file] !== undefined && JSON.stringify(draft[file]) !== JSON.stringify(published[file]));
      if (differs) { DATA_FILES.forEach((file) => { if (draft[file] !== undefined) state[file] = draft[file]; }); showDraftBanner(); }
      else clearDraft();
    }
  }
  validateData();
}

function showDraftBanner() {
  const banner = document.createElement("div");
  banner.className = "draft-banner";
  banner.innerHTML = `<span>You're viewing <b>unpublished edits</b> saved in this browser. Other people still see the published version.</span><a href="admin.html">Open editor</a><button type="button">Discard edits</button>`;
  banner.querySelector("button").addEventListener("click", () => { clearDraft(); window.location.reload(); });
  document.querySelector(".site-header").after(banner);
}

function validateData() {
  const assignedRooms = new Map();
  state.rooms.forEach((room) => {
    if (room.members.length > room.capacity) console.warn(`Room ${room.roomNumber} exceeds capacity.`);
    room.members.forEach((person) => {
      if (assignedRooms.has(person)) console.warn(`${person} is assigned to multiple rooms.`);
      assignedRooms.set(person, room.roomNumber);
    });
  });
  const assignedCars = new Map();
  state.cars.forEach((car) => {
    const occupants = [car.driver, ...car.passengers].filter(Boolean);
    if (occupants.length > car.capacity) console.warn(`${car.carNumber} exceeds capacity.`);
    occupants.forEach((person) => {
      if (assignedCars.has(person)) console.warn(`${person} is assigned to multiple cars.`);
      assignedCars.set(person, car.carNumber);
    });
  });
}

function parseDate(date) { const d = new Date(`${date}T00:00:00`); return Number.isNaN(d.getTime()) ? null : d; }
function formatDate(date) {
  const d = parseDate(date);
  return d ? new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric" }).format(d) : String(date || "");
}
function roomFor(name) { return state.rooms.find((room) => room.members.includes(name)); }
function carFor(name) { return state.cars.find((car) => car.driver === name || car.passengers.includes(name)); }
function carOf(person) { return carFor(person.name)?.carNumber || person.car || "—"; }
function roomOf(person) { return roomFor(person.name)?.roomNumber || person.room || "—"; }
function occupants(car) { return [car.driver, ...car.passengers].filter(Boolean); }
function pageHeading(eyebrow, title, copy = "") {
  return `<div class="page-heading"><div><p class="eyebrow">${esc(eyebrow)}</p><h1>${esc(title)}</h1>${copy ? `<p class="lede">${esc(copy)}</p>` : ""}</div></div>`;
}
function headingFor(route, fallbackTitle = "") { const p = page(route); return pageHeading(p.eyebrow, p.title || fallbackTitle, p.lede); }
function statCard(label, value, kind, detail = "") {
  return `<article class="stat-card"><div class="stat-icon ${kind}">${icon(kind)}</div><div><p>${esc(label)}</p><strong>${esc(value)}</strong>${detail ? `<small>${esc(detail)}</small>` : ""}</div></article>`;
}
function emptyState(message) { return `<div class="empty-state">${icon("search")}<p>${esc(message)}</p></div>`; }
function mapsButton(url, label = "Open in Google Maps") { return `<a class="button button-outline" href="${esc(url)}" target="_blank" rel="noopener">${icon("arrow")} ${esc(label)}</a>`; }

function renderHome() {
  const e = state.event;
  const p = page("home");
  const d = parseDate(e.date);
  return `<section class="page home-page">
    <div class="hero">
      <div class="hero-copy"><p class="eyebrow light">${esc(p.heroEyebrow)}${p.heroEyebrow ? " · " : ""}${esc(formatDate(e.date))}</p><h1>${esc(p.heroTitleLine1)}<br><em>${esc(p.heroTitleLine2)}</em></h1><p>${esc(p.heroText)}</p>${p.heroButton ? `<a class="button button-light" href="#event">${esc(p.heroButton)} ${icon("arrow")}</a>` : ""}</div>
      <div class="hero-orbit"><span class="orbit-dot one"></span><span class="orbit-dot two"></span><span class="orbit-dot three"></span><span class="hero-date">${d ? esc(String(d.getDate()).padStart(2, "0")) : ""}<small>${d ? esc(d.toLocaleString("en-IN", { month: "short" })) : ""}</small></span></div>
    </div>
    <div class="stats-grid">${statCard(p.statDateLabel, formatDate(e.date), "calendar", p.statDateDetail)}${statCard(p.statDestinationLabel, e.destination, "pin", p.statDestinationDetail)}${statCard(p.statPeopleLabel, state.employees.length, "people", p.statPeopleDetail)}${statCard(p.statCarsLabel, state.cars.length, "car", p.statCarsDetail)}${statCard(p.statRoomsLabel, state.rooms.length, "bed", p.statRoomsDetail)}</div>
    <div class="home-grid">
      <article class="panel departure-panel"><div class="panel-title"><div><p class="eyebrow">${esc(p.departureEyebrow)}</p><h2>${esc(p.departureTitle)}</h2></div><span class="pill pill-blue">${esc(p.departurePill)}${p.departurePill ? " · " : ""}${esc(e.departureTime)}</span></div>
        <div class="info-list"><div><span class="list-icon">${icon("pin")}</span><div><b>${esc(p.reportingLabel)}</b><p>${esc(e.departure)}</p></div></div><div><span class="list-icon">${icon("clock")}</span><div><b>${esc(p.reportByLabel)} ${esc(e.reportingTime)}</b><p>${esc(p.departNote)} ${esc(e.departureTime)}</p></div></div><div><span class="list-icon">${icon("bed")}</span><div><b>${esc(p.checkInLabel)}</b><p>${esc(state.hotel.checkIn)} · ${esc(p.checkOutLabel)} ${esc(state.hotel.checkOut)}</p></div></div></div>
      </article>
      <article class="panel instruction-panel"><div class="panel-title"><div><p class="eyebrow">${esc(p.infoEyebrow)}</p><h2>${esc(p.infoTitle)}</h2></div>${icon("info")}</div><ul class="instruction-list">${e.importantInstructions.map((item) => `<li>${icon("check")}<span>${esc(item)}</span></li>`).join("")}</ul>${p.infoLink ? `<a class="text-link" href="#event">${esc(p.infoLink)} ${icon("arrow")}</a>` : ""}</article>
    </div>
    <div class="route-banner"><div><p class="eyebrow">${esc(p.routeEyebrow)}</p><h2>${esc(e.departure)} <span>→</span> ${esc(e.destination)}</h2></div>${mapsButton(state.locations.destination.mapsUrl, p.routeButton)}</div>
    ${galleryBannerHtml(page("gallery"))}
  </section>`;
}

function renderLocation() {
  const l = state.locations;
  const p = page("location");
  const locationCard = (location, label, accent) => `<article class="location-card ${accent}"><div class="location-number">${accent === "start" ? "01" : "02"}</div><div class="location-body"><p class="eyebrow">${esc(label)}</p><h2>${esc(location.name)}</h2><p>${esc(location.address)}</p><div class="card-actions">${mapsButton(location.mapsUrl, p.directionsButton)}</div></div></article>`;
  return `<section class="page">${headingFor("location")}<div class="location-stack">${locationCard(l.departure, p.departureLabel, "start")}<div class="route-connector">${icon("car")}<span></span><b>${esc(l.travelDuration)}</b><span></span></div>${locationCard(l.destination, p.destinationLabel, "finish")}</div><div class="map-note panel"><span class="list-icon">${icon("info")}</span><div><b>${esc(p.mapNoteTitle)}</b><p>${esc(p.mapNoteText)}</p></div>${mapsButton(`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(l.departure.address)}&destination=${encodeURIComponent(l.destination.address)}`, p.routeButton)}</div></section>`;
}

function renderHotel() {
  const h = state.hotel;
  const p = page("hotel");
  return `<section class="page">${headingFor("hotel", h.name)}<div class="hotel-layout"><article class="hotel-card"><div class="hotel-image"><span class="hotel-monogram">${esc(h.monogram)}</span>${h.badge ? `<span class="pill pill-light">${esc(h.badge)}</span>` : ""}</div><div class="hotel-content"><p class="eyebrow">${esc(p.infoEyebrow)}</p><h2>${esc(h.name)}</h2><p class="muted">${esc(h.address)}</p><div class="hotel-actions">${mapsButton(h.mapsUrl, p.mapsButton)}${h.phone ? `<a class="button button-outline" href="tel:${esc(h.phone.replace(/\s/g, ""))}">${icon("phone")} ${esc(p.callButton)}</a>` : ""}${h.website ? `<a class="button button-outline" href="${esc(h.website)}" target="_blank" rel="noopener">${icon("arrow")} ${esc(p.websiteButton)}</a>` : ""}</div></div></article><div class="hotel-details"><div class="detail-card"><span class="detail-label">${esc(p.checkInLabel)}</span><strong>${esc(h.checkIn)}</strong><small>${esc(h.checkInDay)}</small></div><div class="detail-card"><span class="detail-label">${esc(p.checkOutLabel)}</span><strong>${esc(h.checkOut)}</strong><small>${esc(h.checkOutDay)}</small></div><div class="panel facilities-panel"><div class="panel-title"><h2>${esc(p.facilitiesTitle)}</h2>${icon("spark")}</div><p>${esc(h.meals)}</p><div class="tag-list">${h.facilities.map((f) => `<span>${icon("check")}${esc(f)}</span>`).join("")}</div><div class="hotel-reference"><b>${esc(p.referenceLabel)}</b><span>${esc(h.reference)}</span></div><div class="hotel-reference"><b>${esc(p.instructionsLabel)}</b><span>${esc(h.instructions)}</span></div></div></div></div></section>`;
}

function renderRooms() {
  const p = page("rooms");
  return `<section class="page">${headingFor("rooms")}<div class="toolbar"><label class="search-box">${icon("search")}<input id="room-search" type="search" placeholder="${esc(p.searchPlaceholder)}" autocomplete="off"></label><span class="result-count" id="room-count">${state.rooms.length} rooms</span></div><div id="rooms-list" class="allocation-grid">${roomCards(state.rooms)}</div></section>`;
}
function roomCards(rooms) {
  if (!rooms.length) return emptyState(page("rooms").emptyText);
  return rooms.map((room) => { const left = room.capacity - room.members.length; return `<article class="allocation-card room-card"><div class="allocation-head"><div><span class="room-number">ROOM ${esc(room.roomNumber)}</span><h2>${esc(room.type)} room</h2></div><span class="occupancy ${room.members.length === room.capacity ? "full" : ""}">${room.members.length}/${room.capacity} filled</span></div><div class="member-stack">${room.members.map((name) => `<div class="member-row">${avatar(name)}<span>${esc(name)}</span></div>`).join("")}</div><div class="allocation-foot"><span>${left} ${left === 1 ? "place" : "places"} remaining</span>${room.notes ? `<span>${icon("info")} ${esc(room.notes)}</span>` : ""}</div></article>`; }).join("");
}

function renderTravel() {
  const p = page("travel");
  return `<section class="page">${headingFor("travel")}<div class="travel-summary"><div><span class="eyebrow">${esc(p.departureLabel)}</span><strong>${esc(state.event.departureTime)}</strong><small>${esc(state.event.departure)}</small></div><div class="travel-line"><span></span><span class="car-dot">${icon("car")}</span><span></span></div><div><span class="eyebrow">${esc(p.arrivalLabel)}</span><strong>${esc(state.event.arrivalTime)}</strong><small>${esc(state.event.destination)}</small></div></div><div class="toolbar"><label class="search-box">${icon("search")}<input id="car-search" type="search" placeholder="${esc(p.searchPlaceholder)}" autocomplete="off"></label><span class="result-count" id="car-count">${state.cars.length} cars</span></div><div id="cars-list" class="car-grid">${carCards(state.cars)}</div></section>`;
}
function carCards(cars) {
  const p = page("travel");
  if (!cars.length) return emptyState(p.emptyText);
  return cars.map((car) => { const used = occupants(car).length; const left = car.capacity - used; return `<article class="allocation-card car-card"><div class="allocation-head"><div><span class="room-number">${esc(car.carNumber)}</span><h2>${esc(car.vehicleType)}</h2></div><span class="occupancy ${used === car.capacity ? "full" : ""}">${used}/${car.capacity} seats</span></div><div class="driver-row">${avatar(car.driver || "?", true)}<div><span class="detail-label">${esc(p.driverLabel)}</span><b>${esc(car.driver || "Not assigned")}</b></div></div><div class="passenger-list"><span class="detail-label">${esc(p.passengersLabel)}</span>${car.passengers.map((name) => `<div class="member-row">${avatar(name)}<span>${esc(name)}</span></div>`).join("")}</div><div class="allocation-foot"><span>${left} available ${left === 1 ? "seat" : "seats"}</span><span>${icon("pin")} ${esc((car.pickupPoint || "").split(" · ")[1] || car.pickupPoint)}</span></div></article>`; }).join("");
}
function avatar(name, driver = false) { return `<span class="avatar ${driver ? "driver" : ""}">${esc(String(name).split(" ").filter(Boolean).map((part) => part[0]).slice(0, 2).join(""))}</span>`; }

function renderTeam() {
  const p = page("team");
  const techs = state.site.technologies || [];
  return `<section class="page">${headingFor("team")}<div class="toolbar team-toolbar"><label class="search-box">${icon("search")}<input id="team-search" type="search" placeholder="${esc(p.searchPlaceholder)}" autocomplete="off"></label><label class="select-box"><span class="sr-only">Filter by technology</span><select id="team-filter"><option value="">All technologies</option>${techs.map((t) => `<option>${esc(t)}</option>`).join("")}</select></label><span class="result-count" id="team-count">${state.employees.length} people</span></div><div id="team-table-wrap" class="table-wrap">${teamTable(state.employees)}</div><div id="employee-drawer" class="employee-drawer" hidden></div></section>`;
}
function teamTable(people) {
  if (!people.length) return emptyState(page("team").emptyText);
  return `<table><thead><tr><th>Employee</th><th>Technology</th><th>Car</th><th>Room</th><th></th></tr></thead><tbody>${people.map((person) => `<tr class="employee-link" data-person-id="${esc(person.id)}" tabindex="0"><td><div class="employee-cell">${avatar(person.name)}<b>${esc(person.name)}</b></div></td><td><span class="tech-tag ${techClass(person.technology)}">${esc(person.technology)}</span></td><td>${icon("car")} ${esc(carOf(person))}</td><td>${icon("bed")} ${esc(roomOf(person))}</td><td>${icon("arrow")}</td></tr>`).join("")}</tbody></table>`;
}
function renderGallery() { return galleryPageHtml(page("gallery"), headingFor("gallery")); }
function renderEvent() {
  const p = page("event");
  const c = state.event.emergencyContact || {};
  return `<section class="page">${headingFor("event")}<div class="timeline">${state.event.schedule.map((day) => `<section class="day-block"><div class="day-heading"><span>${esc(day.day)}</span><b>${esc(day.date)}</b></div><div class="day-items">${day.items.map((item, index) => `<article class="timeline-item"><div class="timeline-time">${esc(item.time)}</div><div class="timeline-marker ${index === 0 ? "active" : ""}"></div><div class="timeline-copy"><h2>${esc(item.title)}</h2><p>${esc(item.detail)}</p></div></article>`).join("")}</div></section>`).join("")}</div><div class="emergency-banner"><span class="list-icon">${icon("phone")}</span><div><b>${esc(p.emergencyTitle)}</b><p>${esc(p.emergencyPrefix)} ${esc(c.name)} at <a href="tel:${esc(String(c.phone || "").replace(/\s/g, ""))}">${esc(c.phone)}</a>.</p></div></div></section>`;
}


function showEmployee(id) {
  const person = state.employees.find((item) => String(item.id) === String(id));
  if (!person) return;
  const room = roomFor(person.name);
  const car = carFor(person.name);
  const drawer = document.querySelector("#employee-drawer");
  drawer.hidden = false;
  drawer.innerHTML = `<div class="drawer-content"><button class="drawer-close" aria-label="Close employee details">×</button><p class="eyebrow">EMPLOYEE DETAILS</p><div class="drawer-person">${avatar(person.name)}<div><h2>${esc(person.name)}</h2><span class="tech-tag ${techClass(person.technology)}">${esc(person.technology)}</span></div></div><dl><div><dt>Car</dt><dd>${icon("car")}${esc(car?.carNumber || "Not assigned")}</dd></div><div><dt>Driver</dt><dd>${esc(car?.driver || "Not assigned")}</dd></div><div><dt>Room</dt><dd>${icon("bed")}Room ${esc(room?.roomNumber || person.room || "—")}</dd></div><div><dt>Roommates</dt><dd>${room ? room.members.filter((name) => name !== person.name).map(esc).join(", ") || "None" : "Not assigned"}</dd></div></dl></div>`;
  drawer.querySelector(".drawer-close").addEventListener("click", () => { drawer.hidden = true; });
}

/* Header, navigation and footer text all come from data/site.json */
function applyChrome() {
  const s = state.site || {};
  document.title = s.pageTitle || "Outing";
  document.querySelector('meta[name="description"]')?.setAttribute("content", s.metaDescription || "");
  document.querySelector(".brand strong").textContent = s.brandTitle || "";
  document.querySelector(".brand small").textContent = s.brandSubtitle || "";
  document.querySelector(".brand").setAttribute("aria-label", `${s.pageTitle || ""} home`);
  document.querySelector(".site-header .ms-mark").hidden = s.showLogo === false;
  document.querySelector(".site-footer .ms-mark").hidden = s.showLogo === false;
  document.querySelector("#main-nav").innerHTML = ROUTES.filter((route) => page(route).visible !== false)
    .map((route) => `<a href="#${route}" data-route="${route}">${esc(page(route).navLabel || route)}</a>`).join("");
  document.querySelector("#footer-text").textContent = s.footerText || "";
  document.querySelector("#last-updated").textContent = s.showLastUpdated === false ? "" : `Updated ${new Date().toLocaleDateString("en-IN", { month: "short", year: "numeric" })}`;
  const edit = document.querySelector("#edit-link");
  edit.hidden = IS_PREVIEW || s.showEditLink === false;
}

function render() {
  const route = window.location.hash.replace("#", "") || "home";
  const allowed = ROUTES.filter((r) => r === "home" || page(r).visible !== false);
  state.route = allowed.includes(route) ? route : "home";
  const views = { home: renderHome, location: renderLocation, hotel: renderHotel, rooms: renderRooms, travel: renderTravel, team: renderTeam, event: renderEvent, gallery: renderGallery };
  const scroll = window.scrollY;
  app.innerHTML = views[state.route]();
  document.querySelectorAll("[data-route]").forEach((link) => link.classList.toggle("active", link.dataset.route === state.route));
  document.querySelector("#main-nav").classList.remove("open");
  document.querySelector(".menu-toggle").setAttribute("aria-expanded", "false");
  if (IS_PREVIEW) window.scrollTo(0, scroll); else app.focus({ preventScroll: true });
  bindViewEvents();
}
function bindViewEvents() {
  if (state.route === "gallery") initGallery(page("gallery"));
  const roomSearch = document.querySelector("#room-search");
  if (roomSearch) roomSearch.addEventListener("input", () => { const query = roomSearch.value.toLowerCase().trim(); const rooms = state.rooms.filter((room) => String(room.roomNumber).toLowerCase().includes(query) || room.members.some((name) => name.toLowerCase().includes(query))); document.querySelector("#rooms-list").innerHTML = roomCards(rooms); document.querySelector("#room-count").textContent = `${rooms.length} ${rooms.length === 1 ? "room" : "rooms"}`; });
  const carSearch = document.querySelector("#car-search");
  if (carSearch) carSearch.addEventListener("input", () => { const query = carSearch.value.toLowerCase().trim(); const cars = state.cars.filter((car) => car.carNumber.toLowerCase().includes(query) || (car.driver || "").toLowerCase().includes(query) || car.passengers.some((name) => name.toLowerCase().includes(query))); document.querySelector("#cars-list").innerHTML = carCards(cars); document.querySelector("#car-count").textContent = `${cars.length} ${cars.length === 1 ? "car" : "cars"}`; });
  const teamSearch = document.querySelector("#team-search");
  const teamFilter = document.querySelector("#team-filter");
  if (teamSearch) { const update = () => { const query = teamSearch.value.toLowerCase().trim(); const filter = teamFilter.value; const people = state.employees.filter((person) => (!filter || person.technology === filter) && (!query || [person.name, carOf(person), roomOf(person), person.technology].join(" ").toLowerCase().includes(query))); document.querySelector("#team-table-wrap").innerHTML = teamTable(people); document.querySelector("#team-count").textContent = `${people.length} ${people.length === 1 ? "person" : "people"}`; bindEmployeeLinks(); }; teamSearch.addEventListener("input", update); teamFilter.addEventListener("change", update); bindEmployeeLinks(); }
}
function bindEmployeeLinks() { document.querySelectorAll(".employee-link").forEach((row) => { row.addEventListener("click", () => showEmployee(row.dataset.personId)); row.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); showEmployee(row.dataset.personId); } }); }); }

/* Live preview: the editor (admin.html) sends its working copy to this page inside an iframe */
if (IS_PREVIEW) {
  window.addEventListener("message", (event) => {
    if (event.origin !== window.location.origin || event.data?.type !== "noida-preview") return;
    DATA_FILES.forEach((file) => { if (event.data.data?.[file] !== undefined) state[file] = event.data.data[file]; });
    if (event.data.route && window.location.hash !== `#${event.data.route}`) { window.location.hash = event.data.route; window.scrollTo(0, 0); }
    applyChrome();
    render();
  });
}

document.querySelector(".menu-toggle").addEventListener("click", () => { const nav = document.querySelector("#main-nav"); const open = nav.classList.toggle("open"); document.querySelector(".menu-toggle").setAttribute("aria-expanded", String(open)); });
window.addEventListener("hashchange", render);
loadData().then(() => {
  applyChrome();
  render();
  if (IS_PREVIEW && window.parent !== window) window.parent.postMessage({ type: "noida-preview-ready" }, window.location.origin);
}).catch((error) => { app.innerHTML = `<section class="page error-state"><h1>We couldn't load the outing details.</h1><p>${esc(error.message)}</p><p>Check that the site is being served from a web server, not opened directly as a file.</p></section>`; });
