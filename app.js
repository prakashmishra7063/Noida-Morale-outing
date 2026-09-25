const DATA_FILES = ["event", "hotel", "locations", "employees", "rooms", "cars"];
const state = { event: null, hotel: null, locations: null, employees: [], rooms: [], cars: [], route: "home" };
const app = document.querySelector("#app");
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
const icon = (name) => `<span class="icon icon-${name}" aria-hidden="true"></span>`;

async function loadData() {
  const results = await Promise.all(DATA_FILES.map(async (file) => {
    const response = await fetch(`data/${file}.json`);
    if (!response.ok) throw new Error(`Could not load data/${file}.json`);
    return [file, await response.json()];
  }));
  results.forEach(([key, value]) => { state[key] = value; });
  validateData();
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
    const occupants = [car.driver, ...car.passengers];
    if (occupants.length > car.capacity) console.warn(`${car.carNumber} exceeds capacity.`);
    occupants.forEach((person) => {
      if (assignedCars.has(person)) console.warn(`${person} is assigned to multiple cars.`);
      assignedCars.set(person, car.carNumber);
    });
  });
}

function formatDate(date) {
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric" }).format(new Date(`${date}T00:00:00`));
}
function findEmployee(name) { return state.employees.find((person) => person.name === name); }
function roomFor(name) { return state.rooms.find((room) => room.members.includes(name)); }
function carFor(name) { return state.cars.find((car) => car.driver === name || car.passengers.includes(name)); }
function pageHeading(eyebrow, title, copy = "") {
  return `<div class="page-heading"><div><p class="eyebrow">${esc(eyebrow)}</p><h1>${esc(title)}</h1>${copy ? `<p class="lede">${esc(copy)}</p>` : ""}</div></div>`;
}
function statCard(label, value, kind, detail = "") {
  return `<article class="stat-card"><div class="stat-icon ${kind}">${icon(kind)}</div><div><p>${esc(label)}</p><strong>${esc(value)}</strong>${detail ? `<small>${esc(detail)}</small>` : ""}</div></article>`;
}
function emptyState(message) { return `<div class="empty-state">${icon("search")}<p>${esc(message)}</p></div>`; }
function mapsButton(url, label = "Open in Google Maps") { return `<a class="button button-outline" href="${esc(url)}" target="_blank" rel="noopener">${icon("arrow")} ${esc(label)}</a>`; }

function renderHome() {
  const e = state.event;
  return `<section class="page home-page">
    <div class="hero">
      <div class="hero-copy"><p class="eyebrow light">TEAM GETAWAY · ${esc(formatDate(e.date))}</p><h1>Make time for<br><em>the good stuff.</em></h1><p>Two days away from the usual, with the people who make the work worth it.</p><a class="button button-light" href="#event">View the schedule ${icon("arrow")}</a></div>
      <div class="hero-orbit"><span class="orbit-dot one"></span><span class="orbit-dot two"></span><span class="orbit-dot three"></span><span class="hero-date">${esc(e.date.split("-")[2])}<small>${esc(new Date(`${e.date}T00:00:00`).toLocaleString("en-IN", { month: "short" }))}</small></span></div>
    </div>
    <div class="stats-grid">${statCard("Event date", formatDate(e.date), "calendar", "Mark your calendar")}${statCard("Destination", e.destination, "pin", "Sohna, Haryana")}${statCard("Team members", state.employees.length, "people", "Travelling together")}${statCard("Cars", state.cars.length, "car", "Assigned for the trip")}${statCard("Rooms", state.rooms.length, "bed", "Reserved for the group")}</div>
    <div class="home-grid">
      <article class="panel departure-panel"><div class="panel-title"><div><p class="eyebrow">FIRST THINGS FIRST</p><h2>Before we roll</h2></div><span class="pill pill-blue">Day 1 · ${esc(e.departureTime)}</span></div>
        <div class="info-list"><div><span class="list-icon">${icon("pin")}</span><div><b>Reporting point</b><p>${esc(e.departure)}</p></div></div><div><span class="list-icon">${icon("clock")}</span><div><b>Report by ${esc(e.reportingTime)}</b><p>Cars depart together at ${esc(e.departureTime)}</p></div></div><div><span class="list-icon">${icon("bed")}</span><div><b>Hotel check-in</b><p>${esc(state.hotel.checkIn)} · Check-out ${esc(state.hotel.checkOut)}</p></div></div></div>
      </article>
      <article class="panel instruction-panel"><div class="panel-title"><div><p class="eyebrow">GOOD TO KNOW</p><h2>Important information</h2></div>${icon("info")}</div><ul class="instruction-list">${e.importantInstructions.map((item) => `<li>${icon("check")}<span>${esc(item)}</span></li>`).join("")}</ul><a class="text-link" href="#event">See complete event schedule ${icon("arrow")}</a></article>
    </div>
    <div class="route-banner"><div><p class="eyebrow">THE ROUTE</p><h2>${esc(e.departure)} <span>→</span> ${esc(e.destination)}</h2></div>${mapsButton(state.locations.destination.mapsUrl, "Open route in Maps")}</div>
  </section>`;
}

function renderLocation() {
  const l = state.locations;
  const locationCard = (location, label, accent) => `<article class="location-card ${accent}"><div class="location-number">${accent === "start" ? "01" : "02"}</div><div class="location-body"><p class="eyebrow">${label}</p><h2>${esc(location.name)}</h2><p>${esc(location.address)}</p><div class="card-actions">${mapsButton(location.mapsUrl, "Get directions")}</div></div></article>`;
  return `<section class="page">${pageHeading("ON THE MAP", "Location & route", "Everything you need to get from the Microsoft campus to our weekend destination.")}<div class="location-stack">${locationCard(l.departure, "DEPARTURE LOCATION", "start")}<div class="route-connector">${icon("car")}<span></span><b>~ 2 hr 30 min</b><span></span></div>${locationCard(l.destination, "DESTINATION", "finish")}</div><div class="map-note panel"><span class="list-icon">${icon("info")}</span><div><b>Open the route in Google Maps</b><p>Use live directions on the day of travel to account for traffic. The links open in a new tab.</p></div>${mapsButton(`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(l.departure.address)}&destination=${encodeURIComponent(l.destination.address)}`, "View full route")}</div></section>`;
}

function renderHotel() {
  const h = state.hotel;
  return `<section class="page">${pageHeading("YOUR STAY", h.name, "A comfortable base for the team, with everything arranged for an easy check-in.")}<div class="hotel-layout"><article class="hotel-card"><div class="hotel-image"><span class="hotel-monogram">W</span><span class="pill pill-light">GROUP BOOKING</span></div><div class="hotel-content"><p class="eyebrow">HOTEL INFORMATION</p><h2>${esc(h.name)}</h2><p class="muted">${esc(h.address)}</p><div class="hotel-actions">${mapsButton(h.mapsUrl, "View on Google Maps")}<a class="button button-outline" href="tel:${esc(h.phone.replace(/\s/g, ""))}">${icon("phone")} Call hotel</a><a class="button button-outline" href="${esc(h.website)}" target="_blank" rel="noopener">${icon("arrow")} Website</a></div></div></article><div class="hotel-details"><div class="detail-card"><span class="detail-label">CHECK-IN</span><strong>${esc(h.checkIn)}</strong><small>Day 1 · 17 October</small></div><div class="detail-card"><span class="detail-label">CHECK-OUT</span><strong>${esc(h.checkOut)}</strong><small>Day 2 · 18 October</small></div><div class="panel facilities-panel"><div class="panel-title"><h2>Make yourself at home</h2>${icon("spark")}</div><p>${esc(h.meals)}</p><div class="tag-list">${h.facilities.map((f) => `<span>${icon("check")}${esc(f)}</span>`).join("")}</div><div class="hotel-reference"><b>Booking reference</b><span>${esc(h.reference)}</span></div><div class="hotel-reference"><b>Special instruction</b><span>${esc(h.instructions)}</span></div></div></div></div></section>`;
}

function renderRooms() {
  return `<section class="page">${pageHeading("STAYING TOGETHER", "Room allocation", "Find your room, see your roommates and check the remaining capacity at a glance.")}<div class="toolbar"><label class="search-box">${icon("search")}<input id="room-search" type="search" placeholder="Search employee or room number" autocomplete="off"></label><span class="result-count" id="room-count">${state.rooms.length} rooms</span></div><div id="rooms-list" class="allocation-grid">${roomCards(state.rooms)}</div></section>`;
}
function roomCards(rooms) {
  if (!rooms.length) return emptyState("No rooms match your search.");
  return rooms.map((room) => `<article class="allocation-card room-card"><div class="allocation-head"><div><span class="room-number">ROOM ${esc(room.roomNumber)}</span><h2>${esc(room.type)} room</h2></div><span class="occupancy ${room.members.length === room.capacity ? "full" : ""}">${room.members.length}/${room.capacity} filled</span></div><div class="member-stack">${room.members.map((name) => `<div class="member-row">${avatar(name)}<span>${esc(name)}</span></div>`).join("")}</div><div class="allocation-foot"><span>${room.capacity - room.members.length} ${room.capacity - room.members.length === 1 ? "place" : "places"} remaining</span>${room.notes ? `<span>${icon("info")} ${esc(room.notes)}</span>` : ""}</div></article>`).join("");
}

function renderTravel() {
  return `<section class="page">${pageHeading("GETTING THERE", "Travel & cars", "Your car, driver and pickup details — all in one place.")}<div class="travel-summary"><div><span class="eyebrow">DEPARTURE</span><strong>${esc(state.event.departureTime)}</strong><small>${esc(state.event.departure)}</small></div><div class="travel-line"><span></span><span class="car-dot">${icon("car")}</span><span></span></div><div><span class="eyebrow">ARRIVAL</span><strong>~ 10:00 AM</strong><small>${esc(state.event.destination)}</small></div></div><div class="toolbar"><label class="search-box">${icon("search")}<input id="car-search" type="search" placeholder="Search employee or car number" autocomplete="off"></label><span class="result-count" id="car-count">${state.cars.length} cars</span></div><div id="cars-list" class="car-grid">${carCards(state.cars)}</div></section>`;
}
function carCards(cars) {
  if (!cars.length) return emptyState("No cars match your search.");
  return cars.map((car) => `<article class="allocation-card car-card"><div class="allocation-head"><div><span class="room-number">${esc(car.carNumber)}</span><h2>${esc(car.vehicleType)}</h2></div><span class="occupancy ${[car.driver, ...car.passengers].length === car.capacity ? "full" : ""}">${[car.driver, ...car.passengers].length}/${car.capacity} seats</span></div><div class="driver-row">${avatar(car.driver, true)}<div><span class="detail-label">DRIVER</span><b>${esc(car.driver)}</b></div></div><div class="passenger-list"><span class="detail-label">PASSENGERS</span>${car.passengers.map((name) => `<div class="member-row">${avatar(name)}<span>${esc(name)}</span></div>`).join("")}</div><div class="allocation-foot"><span>${car.capacity - car.passengers.length - 1} available ${car.capacity - car.passengers.length - 1 === 1 ? "seat" : "seats"}</span><span>${icon("pin")} ${esc(car.pickupPoint.split(" · ")[1] || car.pickupPoint)}</span></div></article>`).join("");
}
function avatar(name, driver = false) { return `<span class="avatar ${driver ? "driver" : ""}">${esc(name.split(" ").map((part) => part[0]).slice(0, 2).join(""))}</span>`; }

function renderTeam() {
  return `<section class="page">${pageHeading("THE CREW", "Team members", "Everyone travelling for the outing, with their technology group and allocations.")}<div class="toolbar team-toolbar"><label class="search-box">${icon("search")}<input id="team-search" type="search" placeholder="Search by name, car or room" autocomplete="off"></label><label class="select-box"><span class="sr-only">Filter by technology</span><select id="team-filter"><option value="">All technologies</option><option>MDO</option><option>MDC</option><option>MDE</option><option>Other</option></select></label><span class="result-count" id="team-count">${state.employees.length} people</span></div><div id="team-table-wrap" class="table-wrap">${teamTable(state.employees)}</div><div id="employee-drawer" class="employee-drawer" hidden></div></section>`;
}
function teamTable(people) {
  if (!people.length) return emptyState("No team members match your filters.");
  return `<table><thead><tr><th>Employee</th><th>Technology</th><th>Car</th><th>Room</th><th></th></tr></thead><tbody>${people.map((person) => `<tr class="employee-link" data-person-id="${person.id}" tabindex="0"><td><div class="employee-cell">${avatar(person.name)}<b>${esc(person.name)}</b></div></td><td><span class="tech-tag tech-${person.technology.toLowerCase()}">${esc(person.technology)}</span></td><td>${icon("car")} ${esc(person.car)}</td><td>${icon("bed")} ${esc(person.room)}</td><td>${icon("arrow")}</td></tr>`).join("")}</tbody></table>`;
}
function renderEvent() {
  return `<section class="page">${pageHeading("THE PLAN", "Event information", "A simple timeline for a relaxed, well-paced weekend together.")}<div class="timeline">${state.event.schedule.map((day) => `<section class="day-block"><div class="day-heading"><span>${esc(day.day)}</span><b>${esc(day.date)}</b></div><div class="day-items">${day.items.map((item, index) => `<article class="timeline-item"><div class="timeline-time">${esc(item.time)}</div><div class="timeline-marker ${index === 0 ? "active" : ""}"></div><div class="timeline-copy"><h2>${esc(item.title)}</h2><p>${esc(item.detail)}</p></div></article>`).join("")}</div></section>`).join("")}</div><div class="emergency-banner"><span class="list-icon">${icon("phone")}</span><div><b>Need help during the trip?</b><p>Contact ${esc(state.event.emergencyContact.name)} at <a href="tel:${esc(state.event.emergencyContact.phone.replace(/\s/g, ""))}">${esc(state.event.emergencyContact.phone)}</a>.</p></div></div></section>`;
}

function showEmployee(id) {
  const person = state.employees.find((item) => item.id === Number(id));
  if (!person) return;
  const room = roomFor(person.name);
  const car = carFor(person.name);
  const drawer = document.querySelector("#employee-drawer");
  drawer.hidden = false;
  drawer.innerHTML = `<div class="drawer-content"><button class="drawer-close" aria-label="Close employee details">×</button><p class="eyebrow">EMPLOYEE DETAILS</p><div class="drawer-person">${avatar(person.name)}<div><h2>${esc(person.name)}</h2><span class="tech-tag tech-${person.technology.toLowerCase()}">${esc(person.technology)}</span></div></div><dl><div><dt>Car</dt><dd>${icon("car")}${esc(car?.carNumber || "Not assigned")}</dd></div><div><dt>Driver</dt><dd>${esc(car?.driver || "Not assigned")}</dd></div><div><dt>Room</dt><dd>${icon("bed")}Room ${esc(room?.roomNumber || person.room)}</dd></div><div><dt>Roommates</dt><dd>${room ? room.members.filter((name) => name !== person.name).map(esc).join(", ") || "None" : "Not assigned"}</dd></div></dl></div>`;
  drawer.querySelector(".drawer-close").addEventListener("click", () => { drawer.hidden = true; });
}

function render() {
  const route = window.location.hash.replace("#", "") || "home";
  state.route = ["home", "location", "hotel", "rooms", "travel", "team", "event"].includes(route) ? route : "home";
  const views = { home: renderHome, location: renderLocation, hotel: renderHotel, rooms: renderRooms, travel: renderTravel, team: renderTeam, event: renderEvent };
  app.innerHTML = views[state.route]();
  document.querySelectorAll("[data-route]").forEach((link) => link.classList.toggle("active", link.dataset.route === state.route));
  document.querySelector("#main-nav").classList.remove("open");
  document.querySelector(".menu-toggle").setAttribute("aria-expanded", "false");
  app.focus({ preventScroll: true });
  bindViewEvents();
}
function bindViewEvents() {
  const roomSearch = document.querySelector("#room-search");
  if (roomSearch) roomSearch.addEventListener("input", () => { const query = roomSearch.value.toLowerCase().trim(); const rooms = state.rooms.filter((room) => room.roomNumber.toLowerCase().includes(query) || room.members.some((name) => name.toLowerCase().includes(query))); document.querySelector("#rooms-list").innerHTML = roomCards(rooms); document.querySelector("#room-count").textContent = `${rooms.length} ${rooms.length === 1 ? "room" : "rooms"}`; });
  const carSearch = document.querySelector("#car-search");
  if (carSearch) carSearch.addEventListener("input", () => { const query = carSearch.value.toLowerCase().trim(); const cars = state.cars.filter((car) => car.carNumber.toLowerCase().includes(query) || car.driver.toLowerCase().includes(query) || car.passengers.some((name) => name.toLowerCase().includes(query))); document.querySelector("#cars-list").innerHTML = carCards(cars); document.querySelector("#car-count").textContent = `${cars.length} ${cars.length === 1 ? "car" : "cars"}`; });
  const teamSearch = document.querySelector("#team-search");
  const teamFilter = document.querySelector("#team-filter");
  if (teamSearch) { const update = () => { const query = teamSearch.value.toLowerCase().trim(); const filter = teamFilter.value; const people = state.employees.filter((person) => (!filter || person.technology === filter) && (!query || [person.name, person.car, person.room, person.technology].join(" ").toLowerCase().includes(query))); document.querySelector("#team-table-wrap").innerHTML = teamTable(people); document.querySelector("#team-count").textContent = `${people.length} ${people.length === 1 ? "person" : "people"}`; bindEmployeeLinks(); }; teamSearch.addEventListener("input", update); teamFilter.addEventListener("change", update); bindEmployeeLinks(); }
}
function bindEmployeeLinks() { document.querySelectorAll(".employee-link").forEach((row) => { row.addEventListener("click", () => showEmployee(row.dataset.personId)); row.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); showEmployee(row.dataset.personId); } }); }); }
document.querySelector(".menu-toggle").addEventListener("click", () => { const nav = document.querySelector("#main-nav"); const open = nav.classList.toggle("open"); document.querySelector(".menu-toggle").setAttribute("aria-expanded", String(open)); });
window.addEventListener("hashchange", render);
loadData().then(() => { document.querySelector("#last-updated").textContent = `Updated ${new Date().toLocaleDateString("en-IN", { month: "short", year: "numeric" })}`; render(); }).catch((error) => { app.innerHTML = `<section class="page error-state"><h1>We couldn't load the outing details.</h1><p>${esc(error.message)}</p><p>Check that the site is being served from a web server, not opened directly as a file.</p></section>`; });
