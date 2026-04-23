const form = document.getElementById("filters-form");
const eventsListEl = document.getElementById("events-list");
const resultCountEl = document.getElementById("result-count");
const mapMetaEl = document.getElementById("map-meta");
const routeListEl = document.getElementById("route-list");
const clearRouteBtn = document.getElementById("clear-route-btn");
const saveRouteBtn = document.getElementById("save-route-btn");
const buildRouteBtn = document.getElementById("build-route-btn");
const resetBtn = document.getElementById("reset-button");
const routeModeBtn = document.getElementById("route-mode-btn");
const routeModeIndicator = document.getElementById("route-mode-indicator");
const bottomSheetEl = document.getElementById("home-bottom-sheet");
const sheetToggleBtn = document.getElementById("sheet-toggle-btn");

const timeControl = document.getElementById("time-control");
const categoryControl = document.getElementById("category-control");
const timeTrigger = document.getElementById("time-trigger");
const categoryTrigger = document.getElementById("category-trigger");
const timeLabel = document.getElementById("time-label");
const categoryLabel = document.getElementById("category-label");

const FLORENCE = [43.7696, 11.2558];
const map = L.map("map").setView(FLORENCE, 13);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap contributors",
}).addTo(map);

const defaultIcon = new L.Icon({
  iconUrl:
    "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png",
  shadowUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const activeIcon = new L.Icon({
  iconUrl:
    "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png",
  shadowUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

let eventsData = [];
let selectedEventIds = [];
let activeEventId = null;
let routeMode = false;
let markers = [];
const markerByEventId = new Map();
let savedEventIds = new Set();
const isAuthenticated = Boolean(window.APP_CONTEXT && window.APP_CONTEXT.isAuthenticated);

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

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

function isMobileViewport() {
  return window.matchMedia("(max-width: 1023px)").matches;
}

function scrollEventCardIntoView(eventId) {
  const card = eventsListEl.querySelector(`.event-item[data-id="${eventId}"]`);
  if (!card) return;
  card.scrollIntoView({
    behavior: "smooth",
    block: "nearest",
    inline: "nearest",
  });
}

function ensureSheetExpanded() {
  if (!bottomSheetEl || !isMobileViewport()) return;
  if (!bottomSheetEl.classList.contains("is-expanded")) {
    bottomSheetEl.classList.add("is-expanded");
    if (sheetToggleBtn) {
      sheetToggleBtn.setAttribute("aria-expanded", "true");
    }
    setTimeout(() => map.invalidateSize(), 230);
  }
}

function updateRouteModeUI() {
  if (routeMode) {
    routeModeBtn.textContent = "Exit Route Builder";
    routeModeBtn.classList.add("route-mode-on");
    routeModeIndicator.textContent = "Route Mode ON: click events or markers to add stops";
    routeModeIndicator.classList.add("on");
    document.body.classList.add("route-mode-active");
  } else {
    routeModeBtn.textContent = "Start Route Builder";
    routeModeBtn.classList.remove("route-mode-on");
    routeModeIndicator.textContent = "Route Mode OFF";
    routeModeIndicator.classList.remove("on");
    document.body.classList.remove("route-mode-active");
  }
}

function renderRouteList() {
  if (selectedEventIds.length === 0) {
    routeListEl.innerHTML = '<li class="route-empty">No stops selected</li>';
    return;
  }

  routeListEl.innerHTML = selectedEventIds
    .map((id, index) => {
      const event = getEventById(id);
      return event
        ? `<li class="route-stop" data-id="${event.id}"><span class="route-index">${index + 1}</span><span>${event.title}</span></li>`
        : "";
    })
    .join("");
}

function updateRouteOrder() {
  const items = document.querySelectorAll("#route-list li[data-id]");
  const newOrder = [];
  items.forEach((item) => {
    newOrder.push(Number(item.dataset.id));
  });
  selectedEventIds = newOrder;
  renderRouteList();
}

function resetMarkerIcons() {
  markers.forEach((marker) => marker.setIcon(defaultIcon));
}

function highlightActiveMarker() {
  resetMarkerIcons();
  const marker = markerByEventId.get(activeEventId);
  if (marker) marker.setIcon(activeIcon);
}

function setActiveEvent(eventId, centerMap = true, options = {}) {
  const { scrollToCard = true, openPopup = true } = options;
  if (!getEventById(eventId)) return;
  activeEventId = eventId;
  renderEvents();
  highlightActiveMarker();
  if (scrollToCard) {
    requestAnimationFrame(() => {
      scrollEventCardIntoView(eventId);
    });
  }

  const event = getEventById(eventId);
  if (!event) return;
  if (centerMap) {
    map.setView([event.lat, event.lng], 15, { animate: true });
    if (isMobileViewport()) {
      setTimeout(() => {
        map.panBy([0, -110], { animate: true, duration: 0.35 });
      }, 100);
    }
  }
  const marker = markerByEventId.get(eventId);
  if (marker && openPopup) marker.openPopup();
}

function addToRoute(eventId) {
  if (!selectedEventIds.includes(eventId)) {
    selectedEventIds.push(eventId);
  }
  renderRouteList();
  renderEvents();
}

async function refreshSavedEventIds() {
  if (!isAuthenticated) return;
  try {
    const response = await fetch("/api/saved-events");
    if (!response.ok) return;
    const ids = await response.json();
    savedEventIds = new Set(ids.map((id) => Number(id)));
  } catch (_error) {
    // Keep previous values when request fails.
  }
}

async function toggleSaveEvent(eventId) {
  if (!isAuthenticated) return;
  const isSaved = savedEventIds.has(eventId);
  const endpoint = isSaved ? `/unsave-event/${eventId}` : `/save-event/${eventId}`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "X-Requested-With": "XMLHttpRequest" },
    });
    if (!response.ok) return;
    if (isSaved) {
      savedEventIds.delete(eventId);
    } else {
      savedEventIds.add(eventId);
    }
    renderEvents();
  } catch (_error) {
    // No UI updates when saving fails.
  }
}

function renderEvents() {
  resultCountEl.textContent = String(eventsData.length);
  if (eventsData.length === 0) {
    eventsListEl.innerHTML = '<p class="empty">No approved events found.</p>';
    return;
  }

  eventsListEl.innerHTML = eventsData
    .map((event) => {
      const isActive = activeEventId === event.id;
      const isInRoute = selectedEventIds.includes(event.id);
      const isSaved = savedEventIds.has(event.id);
      return `
        <article class="event-item${isActive ? " is-active" : ""}${isInRoute ? " in-route" : ""}" data-id="${event.id}">
          <h3><a href="/events/${event.id}" class="event-title-link">${escapeHtml(event.title)}</a></h3>
          <p>${event.date} · ${event.start_time} - ${event.end_time}</p>
          <p>${event.area} · ${event.category}</p>
          ${
            isAuthenticated
              ? `<button type="button" class="btn btn-ghost save-event-btn" data-id="${event.id}">${isSaved ? "Saved" : "Save"}</button>`
              : ""
          }
        </article>
      `;
    })
    .join("");
}

function renderMap(fitBoundsOnLoad = false) {
  markers.forEach((marker) => marker.remove());
  markers = [];
  markerByEventId.clear();

  if (eventsData.length === 0) {
    map.setView(FLORENCE, 13);
    mapMetaEl.textContent = "0 pins";
    return;
  }

  const bounds = [];
  eventsData.forEach((event) => {
    const areaCategory = [event.area, event.category]
      .filter((value) => Boolean(value))
      .map((value) => escapeHtml(value))
      .join(" · ");
    const dateTime = [
      event.date,
      event.start_time && event.end_time
        ? `${event.start_time} - ${event.end_time}`
        : event.start_time || event.end_time || "",
    ]
      .filter((value) => Boolean(value))
      .map((value) => escapeHtml(value))
      .join(" · ");

    const marker = L.marker([event.lat, event.lng], { icon: defaultIcon }).addTo(map);
    marker.bindPopup(
      `
        <div class="event-popup event-popup--link-only">
          <a class="event-popup-inline-link" href="/events/${event.id}">
            ${escapeHtml(event.title)}
          </a>
        </div>
      `,
      {
        maxWidth: 260,
        className: "custom-popup custom-popup--compact",
        closeButton: true
      }
    );
    marker.on("click", () => {
      setActiveEvent(event.id, true, { scrollToCard: true, openPopup: true });
      ensureSheetExpanded();
      if (routeMode) addToRoute(event.id);
    });
    markers.push(marker);
    markerByEventId.set(event.id, marker);
    bounds.push([event.lat, event.lng]);
  });

  if (fitBoundsOnLoad) {
    if (isMobileViewport()) {
      map.fitBounds(bounds, {
        paddingTopLeft: [20, 90],
        paddingBottomRight: [20, 250],
      });
    } else {
      map.fitBounds(bounds, { padding: [24, 24] });
    }
  }

  mapMetaEl.textContent = `${eventsData.length} pins`;
  highlightActiveMarker();
}

async function fetchEvents() {
  const qs = buildQueryString();
  const url = qs ? `/api/events?${qs}` : "/api/events";
  const response = await fetch(url);
  eventsData = await response.json();

  selectedEventIds = selectedEventIds.filter((id) => eventsData.some((e) => e.id === id));
  if (!eventsData.some((event) => event.id === activeEventId)) {
    activeEventId = null;
  }

  renderEvents();
  renderMap(true);
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
  const titleLink = event.target.closest(".event-title-link");
  if (titleLink) {
    event.stopPropagation();
    return;
  }

  const saveBtn = event.target.closest(".save-event-btn");
  if (saveBtn) {
    toggleSaveEvent(Number(saveBtn.dataset.id));
    return;
  }

  const card = event.target.closest(".event-item");
  if (!card) return;
  const eventId = Number(card.dataset.id);
  if (routeMode) {
    addToRoute(eventId);
    setActiveEvent(eventId, true, { scrollToCard: true, openPopup: true });
  } else {
    setActiveEvent(eventId, true, { scrollToCard: true, openPopup: true });
  }
});

routeModeBtn.addEventListener("click", () => {
  routeMode = !routeMode;
  updateRouteModeUI();
});

clearRouteBtn.addEventListener("click", () => {
  selectedEventIds = [];
  renderRouteList();
  renderEvents();
});

if (saveRouteBtn) {
  saveRouteBtn.addEventListener("click", async () => {
    if (selectedEventIds.length === 0) {
      alert("Select at least one stop first.");
      return;
    }

    const defaultName = `Florence Route ${new Date().toLocaleDateString()}`;
    const routeName = window.prompt("Route name", defaultName);
    if (routeName === null) return;

    try {
      const response = await fetch("/save-route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: routeName.trim(),
          event_ids: selectedEventIds,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        alert(data.error || "Unable to save route.");
        return;
      }
      alert(`Route saved: ${data.name}`);
    } catch (_error) {
      alert("Unable to save route right now.");
    }
  });
}

buildRouteBtn.addEventListener("click", () => {
  if (selectedEventIds.length === 0) {
    alert("Select at least one event.");
    return;
  }
  const selected = selectedEventIds
    .map((id) => getEventById(id))
    .filter(Boolean)
    .map((event) => ({
      id: event.id,
      title: event.title,
      lat: event.lat,
      lng: event.lng,
      area: event.area,
      category: event.category,
      date: event.date,
      start_time: event.start_time,
      end_time: event.end_time,
    }));
  const encoded = encodeURIComponent(JSON.stringify(selected));
  window.open(`/route.html?events=${encoded}`, "_blank", "noopener");
});

updateMultiLabel([], timeLabel, "Time");
updateMultiLabel([], categoryLabel, "Category");
updateRouteModeUI();

if (typeof Sortable !== "undefined") {
  new Sortable(routeListEl, {
    animation: 150,
    draggable: ".route-stop",
    onEnd() {
      updateRouteOrder();
    },
  });
}

if (sheetToggleBtn && bottomSheetEl) {
  sheetToggleBtn.addEventListener("click", () => {
    const expanded = bottomSheetEl.classList.toggle("is-expanded");
    sheetToggleBtn.setAttribute("aria-expanded", expanded ? "true" : "false");
    setTimeout(() => map.invalidateSize(), 230);
  });
}

window.addEventListener("resize", () => {
  setTimeout(() => map.invalidateSize(), 120);
});

(async function bootstrap() {
  map.invalidateSize();
  await refreshSavedEventIds();
  await fetchEvents();
})();
