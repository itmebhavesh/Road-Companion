// Hazard-Aware Navigation Controller for Road Companion
import { fetchReports } from "./reports.js";
import { fetchRoutes, findHazardsAlongRoute } from "./routing.js";
import { GUJARAT_CITIES, detectCity } from "./cities.js";
import {
  byId,
  initShell,
  createMap,
  inGujarat,
  prefersReducedMotion,
  setBusy,
  setMessage,
  errorMessage,
  STATUS_COLOR,
  statusSlug
} from "./shared.js";
import { createHazardMarker } from "./map-layers.js";

const form = byId("routeForm");
const startCitySelect = byId("startCity");
const destCitySelect = byId("destCity");
const startCoordsInput = byId("startCoords");
const destCoordsInput = byId("destCoords");
const startLocationBtn = byId("startLocationBtn");
const pickStartOnMapBtn = byId("pickStartOnMapBtn");
const pickDestOnMapBtn = byId("pickDestOnMapBtn");
const corridorRadiusSelect = byId("corridorRadius");
const findRouteBtn = byId("findRouteBtn");
const routeMessage = byId("routeMessage");
const routeResultsSection = byId("routeResultsSection");
const routesList = byId("routesList");
const hazardBreakdownSection = byId("hazardBreakdownSection");
const hazardSummaryTitle = byId("hazardSummaryTitle");
const hazardAlertsList = byId("hazardAlertsList");
const mapStatusText = byId("mapStatusText");

let map;
let pickMode = null; // "start" | "dest" | null
let startMarker = null;
let destMarker = null;
let routeLayers = [];
let routeHazardMarkers = [];
let allReports = [];
let calculatedRoutes = [];
let selectedRouteIndex = 0;

init();

function init() {
  initShell(() => {});

  map = createMap("navMap", { withLayers: true });
  if (map) {
    map.on("click", handleMapClick);
  }

  // Populate city dropdowns
  GUJARAT_CITIES.forEach((c) => {
    const optStart = document.createElement("option");
    optStart.value = `${c.lat},${c.lng}`;
    optStart.textContent = c.name;
    startCitySelect.appendChild(optStart);

    const optDest = document.createElement("option");
    optDest.value = `${c.lat},${c.lng}`;
    optDest.textContent = c.name;
    destCitySelect.appendChild(optDest);
  });

  // Default selection: Ahmedabad to Gandhinagar
  startCitySelect.value = "23.0225,72.5714";
  startCoordsInput.value = "23.0225, 72.5714";
  destCitySelect.value = "23.2156,72.6369";
  destCoordsInput.value = "23.2156, 72.6369";

  startCitySelect.addEventListener("change", () => {
    if (startCitySelect.value) {
      const [lat, lng] = startCitySelect.value.split(",").map(Number);
      startCoordsInput.value = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      setStartPoint(lat, lng);
    }
  });

  destCitySelect.addEventListener("change", () => {
    if (destCitySelect.value) {
      const [lat, lng] = destCitySelect.value.split(",").map(Number);
      destCoordsInput.value = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      setDestPoint(lat, lng);
    }
  });

  startLocationBtn.addEventListener("click", handleCurrentLocation);

  pickStartOnMapBtn.addEventListener("click", () => {
    pickMode = "start";
    mapStatusText.textContent = "📍 Click anywhere on the map to set Origin (Start) point…";
    mapStatusText.style.color = "var(--gold)";
  });

  pickDestOnMapBtn.addEventListener("click", () => {
    pickMode = "dest";
    mapStatusText.textContent = "🏁 Click anywhere on the map to set Destination point…";
    mapStatusText.style.color = "var(--red)";
  });

  startCoordsInput.addEventListener("change", () => {
    const coords = parseCoords(startCoordsInput.value);
    if (coords) setStartPoint(coords[0], coords[1]);
  });

  destCoordsInput.addEventListener("change", () => {
    const coords = parseCoords(destCoordsInput.value);
    if (coords) setDestPoint(coords[0], coords[1]);
  });

  form.addEventListener("submit", handleRouteSubmit);
}

function parseCoords(text) {
  if (!text) return null;
  const parts = text.split(",").map((s) => Number(s.trim()));
  if (parts.length === 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1])) {
    return parts;
  }
  return null;
}

function handleMapClick(e) {
  const { lat, lng } = e.latlng;
  if (!inGujarat(lat, lng)) {
    alert("Please select a location inside Gujarat state boundaries.");
    return;
  }

  if (pickMode === "start") {
    startCoordsInput.value = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    setStartPoint(lat, lng);
    pickMode = null;
    mapStatusText.textContent = "Origin set. You can now set destination or find routes.";
    mapStatusText.style.color = "var(--muted)";
  } else if (pickMode === "dest") {
    destCoordsInput.value = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    setDestPoint(lat, lng);
    pickMode = null;
    mapStatusText.textContent = "Destination set. Click 'Find Hazard-Aware Routes' below.";
    mapStatusText.style.color = "var(--muted)";
  }
}

function setStartPoint(lat, lng) {
  if (!map) return;
  if (startMarker) map.removeLayer(startMarker);
  startMarker = L.circleMarker([lat, lng], {
    radius: 9,
    fillColor: "#10b981",
    color: "#ffffff",
    weight: 3,
    fillOpacity: 1
  }).addTo(map);
  startMarker.bindTooltip("Origin (Start)", { permanent: false, direction: "top" });
  map.setView([lat, lng], Math.max(map.getZoom(), 11));
}

function setDestPoint(lat, lng) {
  if (!map) return;
  if (destMarker) map.removeLayer(destMarker);
  destMarker = L.circleMarker([lat, lng], {
    radius: 9,
    fillColor: "#ef4444",
    color: "#ffffff",
    weight: 3,
    fillOpacity: 1
  }).addTo(map);
  destMarker.bindTooltip("Destination", { permanent: false, direction: "top" });
  map.setView([lat, lng], Math.max(map.getZoom(), 11));
}

function handleCurrentLocation() {
  if (!navigator.geolocation) {
    alert("Geolocation is not supported by your browser.");
    return;
  }
  setBusy(startLocationBtn, true, "Locating…");
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      setBusy(startLocationBtn, false);
      const { latitude, longitude } = pos.coords;
      if (!inGujarat(latitude, longitude)) {
        alert("Your current location is outside Gujarat.");
        return;
      }
      startCoordsInput.value = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
      setStartPoint(latitude, longitude);
      mapStatusText.textContent = "Current location set as Origin.";
    },
    (err) => {
      setBusy(startLocationBtn, false);
      alert("Could not access location: " + err.message);
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

async function handleRouteSubmit(e) {
  e.preventDefault();
  const startCoords = parseCoords(startCoordsInput.value);
  const destCoords = parseCoords(destCoordsInput.value);

  if (!startCoords) {
    setMessage(routeMessage, "Please specify a valid start origin coordinate.", "error");
    return;
  }
  if (!destCoords) {
    setMessage(routeMessage, "Please specify a valid destination coordinate.", "error");
    return;
  }
  if (!inGujarat(startCoords[0], startCoords[1]) || !inGujarat(destCoords[0], destCoords[1])) {
    setMessage(routeMessage, "Both start and destination must be inside Gujarat.", "error");
    return;
  }

  setBusy(findRouteBtn, true, "Calculating Routes & Scanning Hazards…");
  setMessage(routeMessage, "Querying road routing engine and hazard database…", "");

  try {
    // 1. Fetch real Firestore reports
    allReports = await fetchReports();

    // 2. Fetch OSRM driving routes
    const routes = await fetchRoutes(startCoords[0], startCoords[1], destCoords[0], destCoords[1]);

    const corridorMeters = Number(corridorRadiusSelect.value) || 300;

    // 3. Detect hazards along each route
    calculatedRoutes = routes.map((route) => {
      const hazards = findHazardsAlongRoute(route.geometry.coordinates, allReports, corridorMeters);
      return {
        ...route,
        hazards,
        hazardCount: hazards.length
      };
    });

    setMessage(routeMessage, `Found ${calculatedRoutes.length} route(s). Review options below.`, "success");
    routeResultsSection.hidden = false;
    selectedRouteIndex = 0;

    renderRouteOptions();
    displayRouteOnMap(0);
  } catch (err) {
    console.error("Routing calculation failed:", err);
    setMessage(routeMessage, errorMessage(err, "Failed to calculate navigation route."), "error");
  } finally {
    setBusy(findRouteBtn, false);
  }
}

function renderRouteOptions() {
  routesList.replaceChildren();

  // Find minimum hazards among routes to recommend the safest option
  const minHazards = Math.min(...calculatedRoutes.map((r) => r.hazardCount));

  calculatedRoutes.forEach((route, idx) => {
    const card = document.createElement("div");
    card.className = `route-card ${idx === selectedRouteIndex ? "active" : ""}`;

    const isLowestHazard = route.hazardCount === minHazards;
    const hazardTagClass = route.hazardCount === 0 ? "safe" : "warning";
    const hazardText =
      route.hazardCount === 0
        ? "✓ 0 Reported Hazards"
        : `⚠️ ${route.hazardCount} Hazard${route.hazardCount === 1 ? "" : "s"} on Route`;

    card.innerHTML = `
      <div class="route-header">
        <span class="route-title">Option ${idx + 1}: ${route.name}</span>
        ${isLowestHazard ? '<span style="color:var(--gold-light);font-size:0.78rem;font-weight:700;">★ Recommended</span>' : ""}
      </div>
      <div class="route-metrics">
        <span><strong>${route.distanceKm} km</strong></span>
        <span>Est. Drive: <strong>${route.durationMinutes} mins</strong></span>
      </div>
      <div>
        <span class="route-hazard-tag ${hazardTagClass}">${hazardText}</span>
      </div>
    `;

    card.addEventListener("click", () => {
      selectedRouteIndex = idx;
      document.querySelectorAll(".route-card").forEach((c) => c.classList.remove("active"));
      card.classList.add("active");
      displayRouteOnMap(idx);
    });

    routesList.appendChild(card);
  });
}

function displayRouteOnMap(routeIndex) {
  if (!map || !calculatedRoutes[routeIndex]) return;

  const currentRoute = calculatedRoutes[routeIndex];

  // Clear existing route polylines and hazard markers
  routeLayers.forEach((layer) => map.removeLayer(layer));
  routeLayers = [];

  routeHazardMarkers.forEach((m) => map.removeLayer(m));
  routeHazardMarkers = [];

  // Draw other alternative routes first (in muted grey/purple)
  calculatedRoutes.forEach((r, idx) => {
    if (idx !== routeIndex) {
      const latLngs = r.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
      const altPoly = L.polyline(latLngs, {
        color: "#64748b",
        weight: 4,
        opacity: 0.6,
        dashArray: "6, 8"
      }).addTo(map);
      routeLayers.push(altPoly);
    }
  });

  // Draw active selected route (in vivid blue with glow)
  const activeLatLngs = currentRoute.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
  const activePoly = L.polyline(activeLatLngs, {
    color: "#2563eb",
    weight: 6,
    opacity: 0.95
  }).addTo(map);
  routeLayers.push(activePoly);

  // Fit map to active route bounds
  map.fitBounds(activePoly.getBounds(), { padding: [40, 40] });

  // Place highlighted hazard markers along this route
  currentRoute.hazards.forEach((h) => {
    const marker = L.circleMarker([h.latitude, h.longitude], {
      radius: 11,
      fillColor: STATUS_COLOR[h.status] || "#ef4444",
      color: "#ffffff",
      weight: 3,
      fillOpacity: 1
    }).addTo(map);

    const popupHtml = `
      <div class="map-popup">
        <strong style="color:#b91c1c;">⚠️ On-Route Hazard</strong>
        <p><strong>${h.title}</strong></p>
        <p>${h.category} · Status: <strong>${h.status}</strong></p>
        <p>Approx. <strong>${h.distanceFromRouteMeters}m</strong> from your route corridor</p>
        <p style="font-size:0.82rem;color:#475569;">${h.description || ""}</p>
      </div>
    `;
    marker.bindPopup(popupHtml);
    routeHazardMarkers.push(marker);
  });

  renderHazardBreakdown(currentRoute);
}

function renderHazardBreakdown(route) {
  if (!route.hazards.length) {
    hazardBreakdownSection.hidden = true;
    return;
  }

  hazardBreakdownSection.hidden = false;
  hazardSummaryTitle.textContent = `${route.hazards.length} Hazard(s) Detected in Scan Corridor (${corridorRadiusSelect.value}m)`;
  hazardAlertsList.replaceChildren();

  route.hazards.forEach((hazard, index) => {
    const item = document.createElement("div");
    item.className = "hazard-alert-item";

    item.innerHTML = `
      <div class="hazard-alert-info">
        <strong>${hazard.title}</strong>
        <span>${hazard.category} (${hazard.distanceFromRouteMeters}m from road) · ${hazard.status}</span>
      </div>
      <button class="btn btn-secondary btn-small" type="button" data-index="${index}">
        Locate
      </button>
    `;

    item.querySelector("button").addEventListener("click", () => {
      const marker = routeHazardMarkers[index];
      if (marker && map) {
        map.flyTo([hazard.latitude, hazard.longitude], 16);
        setTimeout(() => marker.openPopup(), 600);
      }
    });

    hazardAlertsList.appendChild(item);
  });
}
