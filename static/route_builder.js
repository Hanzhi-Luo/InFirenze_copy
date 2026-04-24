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
const sheetHeadEl = bottomSheetEl ? bottomSheetEl.querySelector(".sheet-head") : null;

const timeControl = document.getElementById("time-control");
const categoryControl = document.getElementById("category-control");
const timeTrigger = document.getElementById("time-trigger");
const categoryTrigger = document.getElementById("category-trigger");
const timeLabel = document.getElementById("time-label");
const categoryLabel = document.getElementById("category-label");
const dateInput = document.getElementById("date-filter-input");
const dateControl = dateInput ? dateInput.closest(".date-filter-control") : null;
const mapEl = document.getElementById("map");

const FLORENCE = [43.7696, 11.2558];
const map = mapEl
  ? L.map(mapEl, {
      zoomControl: false,
    }).setView(FLORENCE, 13)
  : null;
if (map) {
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);
}

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
const SHEET_SNAP_POINTS = {
  collapsed: 32,
  medium: 42,
  expanded: 72,
};
let currentSheetState = "medium";
let activeSheetPointerId = null;
let dragStartY = 0;
let dragStartHeightPx = 0;
let hasDragged = false;
let suppressSheetToggleClickUntil = 0;

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
    if (!control) return;
    if (control.id === exceptId) {
      if (control.classList.contains("is-open")) {
        positionDropdown(control);
      }
      return;
    }
    control.classList.remove("is-open");
    resetDropdownPosition(control);
  });
}

function updateMultiLabel(values, element, fallback) {
  if (!element) return;
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

function updateDateLabel() {
  if (!dateControl || !dateInput) return;
  dateControl.classList.toggle("has-value", Boolean(dateInput.value));
}

function buildQueryString() {
  if (!form) return "";
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

function isMobileDropdownMode() {
  return window.matchMedia("(max-width: 1023px)").matches;
}

function getDropdownMenu(control) {
  if (!control) return null;
  return control.querySelector(".multi-menu");
}

function getDropdownAnchor(control) {
  if (!control) return null;
  return (
    control.querySelector(".filter-trigger") ||
    control.querySelector("select") ||
    control.querySelector("input") ||
    control
  );
}

function resetDropdownPosition(control) {
  const menu = getDropdownMenu(control);
  if (!menu) return;
  menu.style.position = "";
  menu.style.top = "";
  menu.style.left = "";
  menu.style.width = "";
  menu.style.maxHeight = "";
  menu.style.zIndex = "";
  menu.style.pointerEvents = "";
}

function positionDropdown(control) {
  const menu = getDropdownMenu(control);
  if (!menu) return;

  if (!isMobileDropdownMode()) {
    resetDropdownPosition(control);
    return;
  }

  const anchor = getDropdownAnchor(control);
  if (!anchor) return;

  const triggerRect = anchor.getBoundingClientRect();
  const viewportMaxWidth = window.innerWidth - 20;
  const baseWidth = Math.min(220, viewportMaxWidth);
  const width = Math.min(
    viewportMaxWidth,
    Math.max(Math.round(triggerRect.width), baseWidth)
  );
  const left = Math.max(
    10,
    Math.min(triggerRect.left, window.innerWidth - width - 10)
  );
  const top = triggerRect.bottom + 8;
  const availableHeight = Math.max(100, window.innerHeight - top - 16);
  const maxHeight = Math.min(220, availableHeight);

  menu.style.position = "fixed";
  menu.style.top = `${top}px`;
  menu.style.left = `${left}px`;
  menu.style.width = `${width}px`;
  menu.style.maxHeight = `${maxHeight}px`;
  menu.style.zIndex = "1400";
  menu.style.pointerEvents = "auto";
}

function openDropdown(control) {
  if (!control) return;
  closeDropdowns(control.id);
  control.classList.add("is-open");
  positionDropdown(control);
}

function repositionOpenDropdowns() {
  [timeControl, categoryControl].forEach((control) => {
    if (!control || !control.classList.contains("is-open")) return;
    positionDropdown(control);
  });
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getSnapVhFromState(state) {
  return SHEET_SNAP_POINTS[state] ?? SHEET_SNAP_POINTS.medium;
}

function getCurrentSheetHeightVh() {
  if (!bottomSheetEl) return SHEET_SNAP_POINTS.medium;
  const heightPx = bottomSheetEl.getBoundingClientRect().height;
  if (!window.innerHeight) return SHEET_SNAP_POINTS.medium;
  return (heightPx / window.innerHeight) * 100;
}

function setSheetHeight(vh, options = { animate: true }) {
  if (!bottomSheetEl) return;
  const { animate = true } = options;
  bottomSheetEl.classList.toggle("is-dragging", !animate);
  const clamped = clamp(vh, SHEET_SNAP_POINTS.collapsed, SHEET_SNAP_POINTS.expanded);
  bottomSheetEl.style.height = `${clamped}dvh`;
}

function updateSheetStateClasses(state) {
  if (!bottomSheetEl) return;
  bottomSheetEl.classList.toggle("is-collapsed", state === "collapsed");
  bottomSheetEl.classList.toggle("is-expanded", state === "expanded");
  if (sheetToggleBtn) {
    sheetToggleBtn.setAttribute("aria-expanded", state === "expanded" ? "true" : "false");
  }
}

function invalidateMapAfterSheetTransition(delay = 280) {
  if (!map) return;
  window.setTimeout(() => map.invalidateSize(), delay);
}

function setSheetState(state, options = { animate: true }) {
  if (!bottomSheetEl) return;
  const { animate = true } = options;
  currentSheetState = state;
  updateSheetStateClasses(state);
  setSheetHeight(getSnapVhFromState(state), { animate });
  invalidateMapAfterSheetTransition(animate ? 280 : 0);
}

function getClosestSheetState(vh) {
  const entries = Object.entries(SHEET_SNAP_POINTS);
  let bestState = "medium";
  let bestDistance = Number.POSITIVE_INFINITY;
  entries.forEach(([state, point]) => {
    const distance = Math.abs(vh - point);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestState = state;
    }
  });
  return bestState;
}

function isSheetDragActive() {
  return activeSheetPointerId !== null;
}

function onSheetPointerDown(event) {
  if (!bottomSheetEl || !isMobileViewport()) return;
  if (event.pointerType === "mouse" && event.button !== 0) return;
  if (isSheetDragActive()) return;

  activeSheetPointerId = event.pointerId;
  dragStartY = event.clientY;
  dragStartHeightPx = bottomSheetEl.getBoundingClientRect().height;
  hasDragged = false;

  if (event.currentTarget && event.currentTarget.setPointerCapture) {
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  bottomSheetEl.classList.add("is-dragging");
  event.preventDefault();
}

function onSheetPointerMove(event) {
  if (!bottomSheetEl || !isSheetDragActive()) return;
  if (event.pointerId !== activeSheetPointerId) return;

  const deltaY = event.clientY - dragStartY;
  if (Math.abs(deltaY) > 3) {
    hasDragged = true;
  }

  const newHeightPx = dragStartHeightPx - deltaY;
  const vh = (newHeightPx / window.innerHeight) * 100;
  setSheetHeight(vh, { animate: false });
  event.preventDefault();
}

function finishSheetDrag(event, canceled = false) {
  if (!bottomSheetEl || !isSheetDragActive()) return;
  if (event.pointerId !== activeSheetPointerId) return;

  if (event.currentTarget && event.currentTarget.releasePointerCapture) {
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch (_error) {
      // no-op
    }
  }

  bottomSheetEl.classList.remove("is-dragging");
  const wasDragged = hasDragged;
  activeSheetPointerId = null;

  if (canceled) {
    setSheetState(currentSheetState, { animate: true });
    return;
  }

  if (!wasDragged) {
    setSheetState(currentSheetState, { animate: true });
    return;
  }

  const vh = getCurrentSheetHeightVh();
  const closestState = getClosestSheetState(vh);
  setSheetState(closestState, { animate: true });
  suppressSheetToggleClickUntil = Date.now() + 350;
  event.preventDefault();
}

function scrollEventCardIntoView(eventId) {
  if (!eventsListEl) return;
  const card = eventsListEl.querySelector(`.event-item[data-id="${eventId}"]`);
  if (!card) return;
  card.scrollIntoView({
    behavior: "smooth",
    block: "nearest",
    inline: "nearest",
  });
}

function ensureSheetExpanded() {
  if (!bottomSheetEl || !isMobileViewport() || !map) return;
  if (currentSheetState !== "expanded") {
    setSheetState("expanded", { animate: true });
  }
}

function updateRouteModeUI() {
  if (!routeModeBtn || !routeModeIndicator) return;
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
  if (!routeListEl) return;
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
  if (!resultCountEl || !eventsListEl) return;
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
  if (!map || !mapMetaEl) return;
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
  if (!form) return;
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

if (timeTrigger && timeControl) {
  timeTrigger.addEventListener("click", (event) => {
    event.stopPropagation();
    if (timeControl.classList.contains("is-open")) {
      closeDropdowns();
      return;
    }
    openDropdown(timeControl);
  });
}

if (categoryTrigger && categoryControl) {
  categoryTrigger.addEventListener("click", (event) => {
    event.stopPropagation();
    if (categoryControl.classList.contains("is-open")) {
      closeDropdowns();
      return;
    }
    openDropdown(categoryControl);
  });
}

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

if (form) {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    fetchEvents();
  });
}

if (resetBtn && form) {
  resetBtn.addEventListener("click", () => {
    form.reset();
    updateMultiLabel([], timeLabel, "Time");
    updateMultiLabel([], categoryLabel, "Category");
    updateDateLabel();
    closeDropdowns();
    fetchEvents();
  });
}

if (eventsListEl) {
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
}

if (routeModeBtn) {
  routeModeBtn.addEventListener("click", () => {
    routeMode = !routeMode;
    updateRouteModeUI();
  });
}

if (clearRouteBtn) {
  clearRouteBtn.addEventListener("click", () => {
    selectedEventIds = [];
    renderRouteList();
    renderEvents();
  });
}

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

if (buildRouteBtn) {
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
}

updateMultiLabel([], timeLabel, "Time");
updateMultiLabel([], categoryLabel, "Category");
if (dateInput) {
  dateInput.addEventListener("change", updateDateLabel);
  updateDateLabel();
}
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
  sheetToggleBtn.addEventListener("pointerdown", onSheetPointerDown);
  sheetToggleBtn.addEventListener("pointermove", onSheetPointerMove);
  sheetToggleBtn.addEventListener("pointerup", (event) => finishSheetDrag(event, false));
  sheetToggleBtn.addEventListener("pointercancel", (event) => finishSheetDrag(event, true));
  sheetToggleBtn.addEventListener("click", () => {
    if (!isMobileViewport()) return;
    if (Date.now() < suppressSheetToggleClickUntil) {
      return;
    }
    if (currentSheetState === "expanded") {
      setSheetState("medium", { animate: true });
    } else {
      setSheetState("expanded", { animate: true });
    }
  });
}

if (sheetHeadEl && bottomSheetEl) {
  sheetHeadEl.addEventListener("pointerdown", onSheetPointerDown);
  sheetHeadEl.addEventListener("pointermove", onSheetPointerMove);
  sheetHeadEl.addEventListener("pointerup", (event) => finishSheetDrag(event, false));
  sheetHeadEl.addEventListener("pointercancel", (event) => finishSheetDrag(event, true));
}

window.addEventListener("resize", repositionOpenDropdowns);
window.addEventListener("scroll", repositionOpenDropdowns, { passive: true });
if (form) {
  const filtersRow = form.querySelector(".filters-row");
  if (filtersRow) {
    filtersRow.addEventListener("scroll", repositionOpenDropdowns, { passive: true });
  }
}

window.addEventListener("resize", () => {
  if (bottomSheetEl) {
    if (isMobileViewport()) {
      setSheetState(currentSheetState, { animate: false });
    } else {
      bottomSheetEl.classList.remove("is-dragging", "is-collapsed", "is-expanded");
      bottomSheetEl.style.height = "";
      currentSheetState = "medium";
    }
  }
  if (map) {
    setTimeout(() => map.invalidateSize(), 120);
  }
});

(async function bootstrap() {
  if (!map || !form || !eventsListEl || !resultCountEl || !mapMetaEl || !routeListEl) {
    return;
  }
  if (bottomSheetEl && isMobileViewport()) {
    setSheetState("medium", { animate: false });
  }
  map.invalidateSize();
  await refreshSavedEventIds();
  await fetchEvents();
})();
