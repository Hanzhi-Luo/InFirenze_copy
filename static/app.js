const form = document.getElementById("filters-form");
const eventsListEl = document.getElementById("events-list");
const resultCountEl = document.getElementById("result-count");
const mapMetaEl = document.getElementById("map-meta");

const routeListEl = document.getElementById("route-list");
const clearRouteBtn = document.getElementById("clear-route-btn");
const buildRouteBtn = document.getElementById("build-route-btn");
const resetBtn = document.getElementById("reset-button");

const timeControl = document.getElementById("time-control");
const categoryControl = document.getElementById("category-control");
const timeTrigger = document.getElementById("time-trigger");
const categoryTrigger = document.getElementById("category-trigger");
const timeLabel = document.getElementById("time-label");
const categoryLabel = document.getElementById("category-label");

const map = L.map("map").setView([43.7696, 11.2558], 13);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap contributors",
}).addTo(map);
const markerLayer = L.layerGroup().addTo(map);

let eventsData = [];
let selectedEventIds = [];

function getSelectedValues(selector) {
  return Array.from(document.querySelectorAll(selector))
    .filter((el) => el.checked)
    .map((el) => el.value);
}

function closeDropdowns(exceptId = "") {
  [timeControl, categoryControl].forEach((control) => {
    if (!control || control.id === exceptId) return;
    control.classList.remove("is-open");
  });
}

function updateMultiLabel(values, element, fallback) {
  if (values.length === 0) {
    element.textContent = fallback;
    element.classList.add("placeholder");
    return;
  }
  if (values.length === 1) {
    element.textContent = values[0];
  } else {
    element.textContent = `${values[0]} +${values.length - 1}`;
  }
  element.classList.remove("placeholder");
}

function buildQueryString() {
  const params = new URLSearchParams();
  const selectedDate = form.elements.date.value;
  const selectedArea = form.elements.area.value;
  const selectedTimes = getSelectedValues('input[name="time_slots"]');
  const selectedCategories = getSelectedValues('input[name="categories"]');

  if (selectedDate) params.append("date", selectedDate);
  if (selectedArea) params.append("area", selectedArea);
  selectedTimes.forEach((slot) => params.append("time_slots", slot));
  selectedCategories.forEach((category) => params.append("categories", category));
  return params.toString();
}

function getEventById(id) {
  return eventsData.find((event) => event.id === id);
}

function renderRouteList() {
  if (selectedEventIds.length === 0) {
    routeListEl.innerHTML = "<li>No stops selected</li>";
    return;
  }
  routeListEl.innerHTML = selectedEventIds
    .map((id, idx) => {
      const event = getEventById(id);
      return event ? `<li>${idx + 1}. ${event.title}</li>` : "";
    })
    .join("");
}

function renderEvents() {
  resultCountEl.textContent = String(eventsData.length);
  if (eventsData.length === 0) {
    eventsListEl.innerHTML = '<p class="empty">No approved events found.</p>';
    return;
  }
  eventsListEl.innerHTML = eventsData
    .map((event) => {
      const selected = selectedEventIds.includes(event.id) ? " selected" : "";
      return `
        <article class="event-item${selected}" data-id="${event.id}">
          <h3>${event.title}</h3>
          <p>${event.date} · ${event.start_time} - ${event.end_time}</p>
          <p>${event.area} · ${event.category}</p>
        </article>
      `;
    })
    .join("");
}

function renderMap() {
  markerLayer.clearLayers();
  if (eventsData.length === 0) {
    map.setView([43.7696, 11.2558], 13);
    mapMetaEl.textContent = "0 pins";
    return;
  }

  const bounds = [];
  eventsData.forEach((event) => {
    const marker = L.marker([event.lat, event.lng]).addTo(markerLayer);
    marker.bindPopup(`<strong>${event.title}</strong><br>${event.date}`);
    marker.on("click", () => toggleSelected(event.id, true));
    bounds.push([event.lat, event.lng]);
  });
  map.fitBounds(bounds, { padding: [24, 24] });
  mapMetaEl.textContent = `${eventsData.length} pins`;
}

function toggleSelected(eventId, focus = false) {
  if (selectedEventIds.includes(eventId)) {
    selectedEventIds = selectedEventIds.filter((id) => id !== eventId);
  } else {
    selectedEventIds.push(eventId);
  }
  renderRouteList();
  renderEvents();
  if (focus) {
    const event = getEventById(eventId);
    if (event) map.setView([event.lat, event.lng], 15, { animate: true });
  }
}

async function fetchEvents() {
  const qs = buildQueryString();
  const url = qs ? `/api/events?${qs}` : "/api/events";
  const response = await fetch(url);
  eventsData = await response.json();
  selectedEventIds = selectedEventIds.filter((id) => eventsData.some((e) => e.id === id));
  renderEvents();
  renderMap();
  renderRouteList();
}

timeTrigger.addEventListener("click", (event) => {
  event.stopPropagation();
  const open = !timeControl.classList.contains("is-open");
  closeDropdowns("time-control");
  timeControl.classList.toggle("is-open", open);
});

categoryTrigger.addEventListener("click", (event) => {
  event.stopPropagation();
  const open = !categoryControl.classList.contains("is-open");
  closeDropdowns("category-control");
  categoryControl.classList.toggle("is-open", open);
});

document.addEventListener("click", (event) => {
  if (!event.target.closest(".filter-control")) {
    closeDropdowns();
  }
});

document.addEventListener("change", (event) => {
  if (event.target.name === "time_slots") {
    updateMultiLabel(getSelectedValues('input[name="time_slots"]'), timeLabel, "Time");
  }
  if (event.target.name === "categories") {
    updateMultiLabel(getSelectedValues('input[name="categories"]'), categoryLabel, "Category");
  }
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  fetchEvents();
});

resetBtn.addEventListener("click", () => {
  form.reset();
  updateMultiLabel([], timeLabel, "Time");
  updateMultiLabel([], categoryLabel, "Category");
  closeDropdowns();
  fetchEvents();
});

eventsListEl.addEventListener("click", (event) => {
  const card = event.target.closest(".event-item");
  if (!card) return;
  toggleSelected(Number(card.dataset.id), true);
});

clearRouteBtn.addEventListener("click", () => {
  selectedEventIds = [];
  renderRouteList();
  renderEvents();
});

buildRouteBtn.addEventListener("click", () => {
  if (selectedEventIds.length === 0) {
    alert("Select at least one event.");
    return;
  }
  const selected = selectedEventIds
    .map((id) => getEventById(id))
    .filter(Boolean)
    .map((event) => ({
      title: event.title,
      lat: event.lat,
      lng: event.lng,
      area: event.area,
      category: event.category,
    }));
  const encoded = encodeURIComponent(JSON.stringify(selected));
  window.open(`/route.html?events=${encoded}`, "_blank", "noopener");
});

updateMultiLabel([], timeLabel, "Time");
updateMultiLabel([], categoryLabel, "Category");
fetchEvents();
