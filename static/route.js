const routeContext = window.ROUTE_CONTEXT || {};
const isAuthenticated = Boolean(routeContext.isAuthenticated);
const loginUrl = routeContext.loginUrl || "/login";
const saveRouteBtn = document.getElementById("save-route-btn");
const saveFeedbackEl = document.getElementById("route-save-feedback");

function setSaveFeedback(message, type = "") {
  if (!saveFeedbackEl) return;
  saveFeedbackEl.textContent = message;
  saveFeedbackEl.classList.remove("is-success", "is-error");
  if (type) {
    saveFeedbackEl.classList.add(type);
  }
}

function parseEventsFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("events");
  if (!raw) return [];

  try {
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (_error) {
      parsed = JSON.parse(decodeURIComponent(raw));
    }
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item) =>
          item &&
          typeof item.title === "string" &&
          Number.isFinite(Number(item.lat)) &&
          Number.isFinite(Number(item.lng))
      )
      .map((item) => ({
        id: Number.isFinite(Number(item.id)) ? Number(item.id) : null,
        title: String(item.title).replace(/^\s*\d+\.\s*/, "").trim(),
        lat: Number(item.lat),
        lng: Number(item.lng),
        area: item.area || "",
        date: item.date || "",
        start_time: item.start_time || "",
        end_time: item.end_time || "",
        category: item.category || "",
      }));
  } catch (_error) {
    return [];
  }
}

function formatDistance(meters) {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function formatDuration(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  if (hours === 0) return `${minutes} min`;
  return `${hours} h ${minutes} min`;
}

function renderStops(stops) {
  const stopsList = document.getElementById("stops-list");
  if (stops.length === 0) {
    stopsList.innerHTML = '<li class="placeholder">No stops selected.</li>';
    return;
  }
  stopsList.innerHTML = stops
    .map(
      (stop) => `<li>${stop.title}${stop.area ? ` · ${stop.area}` : ""}</li>`
    )
    .join("");
}

function renderInstructions(instructions) {
  const list = document.getElementById("directions");
  if (!instructions || instructions.length === 0) {
    list.innerHTML = '<p class="placeholder">Directions will appear after route calculation.</p>';
    return;
  }
  list.innerHTML = instructions
    .map((step, index) => `<div class="step">${index + 1}. ${step.text || "Continue"}</div>`)
    .join("");
}

function updateGoogleMapsLink(points) {
  const button = document.getElementById("google-maps-btn");
  if (!points || points.length < 1) {
    button.disabled = true;
    return;
  }

  const origin = `${points[0].lat},${points[0].lng}`;
  const destination = `${points[points.length - 1].lat},${points[points.length - 1].lng}`;
  const waypointPoints = points.slice(1, -1).map((p) => `${p.lat},${p.lng}`);
  const waypointParam = waypointPoints.length
    ? `&waypoints=${encodeURIComponent(waypointPoints.join("|"))}`
    : "";
  const url =
    `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}` +
    `&destination=${encodeURIComponent(destination)}${waypointParam}&travelmode=walking`;

  button.disabled = false;
  button.onclick = () => window.open(url, "_blank", "noopener");
}

function createMap(stops) {
  const first = stops[0] || { lat: 43.7696, lng: 11.2558 };
  const map = L.map("route-map").setView([first.lat, first.lng], 13);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);
  return map;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildNumberedIcon(label, active = false, isStart = false) {
  const extraClass = active ? " is-active" : "";
  const startClass = isStart ? " is-start" : "";
  return L.divIcon({
    className: "custom-marker-wrapper",
    html: `<div class="marker-number${extraClass}${startClass}">${escapeHtml(label)}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -30],
  });
}

function buildPopupContent(stop, indexLabel) {
  const detailsHref = stop.id ? `/events/${stop.id}` : "#";
  const hasDetails = Boolean(stop.id);
  const timeText =
    stop.date && stop.start_time && stop.end_time
      ? `${stop.date} · ${stop.start_time} - ${stop.end_time}`
      : stop.date || "";

  return `
    <div class="event-popup">
      <p class="event-popup-title">${escapeHtml(indexLabel)}. ${escapeHtml(stop.title)}</p>
      <p class="event-popup-meta">${escapeHtml(stop.area)}${stop.category ? ` · ${escapeHtml(stop.category)}` : ""}</p>
      ${timeText ? `<p class="event-popup-meta">${escapeHtml(timeText)}</p>` : ""}
      ${
        hasDetails
          ? `<a class="event-popup-link" href="${detailsHref}">View Details <span aria-hidden="true">→</span></a>`
          : ""
      }
    </div>
  `;
}

function buildRouting(map, stops, startPoint) {
  let activeMarker = null;
  const setActiveMarker = (marker) => {
    if (activeMarker && activeMarker !== marker) {
      activeMarker.setIcon(buildNumberedIcon(activeMarker._routeLabel, false, false));
    }
    marker.setIcon(buildNumberedIcon(marker._routeLabel, true, false));
    activeMarker = marker;
  };

  const stopWaypoints = stops.map((s) => L.latLng(s.lat, s.lng));
  const waypoints = startPoint ? [startPoint, ...stopWaypoints] : stopWaypoints;

  const routingControl = L.Routing.control({
    waypoints,
    addWaypoints: false,
    draggableWaypoints: false,
    routeWhileDragging: false,
    showAlternatives: false,
    show: false,
    fitSelectedRoutes: true,
    lineOptions: {
      styles: [{ color: "#ff5a5f", weight: 5, opacity: 0.9 }],
    },
    createMarker(index, waypoint) {
      if (index === 0 && startPoint) {
        return L.marker(waypoint.latLng, {
          icon: buildNumberedIcon("S", false, true),
        }).bindPopup('<div class="event-popup"><p class="event-popup-title">Start</p></div>');
      }
      const stopIndex = startPoint ? index - 1 : index;
      const stopLabelNumber = startPoint ? index : index + 1;
      const stop = stops[stopIndex];
      const marker = L.marker(waypoint.latLng, {
        icon: buildNumberedIcon(stopLabelNumber),
      });
      marker._routeLabel = String(stopLabelNumber);
      marker.bindPopup(
        buildPopupContent(stop || { title: "Stop" }, stopLabelNumber)
      );
      marker.on("click", () => setActiveMarker(marker));
      return marker;
    },
  }).addTo(map);

  // Ensure default routing instructions container never overlays the map.
  setTimeout(() => {
    const routingContainer = document.querySelector(".leaflet-routing-container");
    if (routingContainer) routingContainer.remove();
  }, 0);

  routingControl.on("routesfound", (event) => {
    const route = event.routes[0];
    document.getElementById("total-distance").textContent = formatDistance(
      route.summary.totalDistance
    );
    document.getElementById("total-time").textContent = formatDuration(route.summary.totalTime);
    renderInstructions(route.instructions || []);
  });
}

function initRoutePage() {
  const stops = parseEventsFromUrl();
  renderStops(stops);

  const map = createMap(stops);

  if (stops.length === 0) {
    document.getElementById("total-distance").textContent = "-";
    document.getElementById("total-time").textContent = "-";
    renderInstructions([]);
    updateGoogleMapsLink([]);
    if (saveRouteBtn) saveRouteBtn.disabled = true;
    return;
  }

  if (saveRouteBtn) {
    saveRouteBtn.addEventListener("click", async () => {
      if (!isAuthenticated) {
        const next = encodeURIComponent(
          `${window.location.pathname}${window.location.search}`
        );
        window.location.assign(`${loginUrl}?next=${next}`);
        return;
      }

      const orderedEventIds = stops
        .map((stop) => Number(stop.id))
        .filter((id) => Number.isFinite(id) && id > 0);

      if (orderedEventIds.length === 0) {
        setSaveFeedback("This route cannot be saved because stop IDs are missing.", "is-error");
        return;
      }

      const proposedName = "My Florence Route";
      const routeName = window.prompt("Route name", proposedName);
      if (routeName === null) return;

      try {
        const response = await fetch("/save-route", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: routeName.trim(),
            event_ids: orderedEventIds,
          }),
        });
        const payload = await response.json();
        if (!response.ok) {
          setSaveFeedback(payload.error || "Unable to save route.", "is-error");
          return;
        }
        setSaveFeedback(`Route saved: ${payload.name}`, "is-success");
      } catch (_error) {
        setSaveFeedback("Unable to save route right now.", "is-error");
      }
    });
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const userStart = L.latLng(position.coords.latitude, position.coords.longitude);
      buildRouting(map, stops, userStart);
      updateGoogleMapsLink([{ lat: userStart.lat, lng: userStart.lng }, ...stops]);
    },
    () => {
      buildRouting(map, stops, null);
      updateGoogleMapsLink(stops);
    },
    { enableHighAccuracy: true, timeout: 8000 }
  );
}

initRoutePage();
