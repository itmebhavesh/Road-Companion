// Dashboard (index.html): public statistics, advanced hazard map and recent reports.
// Viewing is public; submitting happens on report.html and needs a login.
import { fetchReports } from "./reports.js";
import {
  byId, initShell, createMap, createReportCard, renderStats,
  hasCoordinates, prefersReducedMotion, setBusy, setMessage, errorMessage
} from "./shared.js";
import { createClusterGroup, createHazardMarker, addLocationControl } from "./map-layers.js";
import { GUJARAT_CITIES } from "./cities.js";

const RECENT_LIMIT = 5;

const refreshBtn = byId("refreshBtn");
const mapMessage = byId("mapMessage");
const recentList = byId("recentList");
const recentMessage = byId("recentMessage");
const mapCard = byId("mapSection");
const citySelect = document.getElementById("mapCityJump");
const searchInput = document.getElementById("mapSearchInput");
const filterPills = document.querySelectorAll(".map-filter-bar .filter-pill");

const statEls = {
  total: byId("statTotal"),
  Pending: byId("statPending"),
  Verified: byId("statVerified"),
  "In Progress": byId("statProgress"),
  Resolved: byId("statResolved")
};

const focusId = new URLSearchParams(window.location.search).get("report");
const markerById = new Map();
let map;
let clusterGroup;
let loadToken = 0;
let hasFitted = false;
let currentReports = [];
let activeStatusFilter = "";
let activeSearchQuery = "";

init();

function init() {
  map = createMap("map", { withLayers: true });
  if (map) {
    clusterGroup = createClusterGroup();
    map.addLayer(clusterGroup);
    addLocationControl(map, (lat, lng, accuracy) => {
      setMessage(mapMessage, `Centered on your location (${lat.toFixed(4)}, ${lng.toFixed(4)})`, "success");
      setTimeout(() => setMessage(mapMessage, "", ""), 3000);
    });
  } else {
    setMessage(mapMessage, "The map library did not load. Check your connection and refresh.", "error");
  }

  // Populate city jump dropdown
  if (citySelect) {
    GUJARAT_CITIES.forEach((city) => {
      const opt = document.createElement("option");
      opt.value = `${city.lat},${city.lng}`;
      opt.textContent = city.name;
      citySelect.appendChild(opt);
    });

    citySelect.addEventListener("change", () => {
      if (!citySelect.value || !map) return;
      const [lat, lng] = citySelect.value.split(",").map(Number);
      map.flyTo([lat, lng], 13);
    });
  }

  // Status filter pills
  filterPills.forEach((pill) => {
    pill.addEventListener("click", () => {
      filterPills.forEach((p) => p.classList.remove("active"));
      pill.classList.add("active");
      activeStatusFilter = pill.dataset.status || "";
      applyFilters();
    });
  });

  // Search input
  searchInput?.addEventListener("input", () => {
    activeSearchQuery = searchInput.value.trim().toLowerCase();
    applyFilters();
  });

  refreshBtn.addEventListener("click", () => loadReports());
  // Reports are public, so load straight away; the sidebar only needs auth for its label.
  initShell(() => {});
  loadReports();
}

async function loadReports() {
  const token = ++loadToken;
  setBusy(refreshBtn, true, "Refreshing…");
  setMessage(recentMessage, "Loading reports…", "");

  try {
    const reports = await fetchReports();
    if (token !== loadToken) return;

    currentReports = reports;
    renderStats(statEls, reports);
    renderRecent(reports);
    applyFilters();
    setMessage(recentMessage, reports.length ? "" : "No hazard reports yet. Log in and use Report to add the first one.", "");

    const requested = focusId && reports.find((report) => report.id === focusId);
    if (requested && hasCoordinates(requested) && !hasFitted) {
      showOnMap(requested);
    } else if (!hasFitted) {
      fitToReports(reports);
    }
    hasFitted = true;
  } catch (error) {
    if (token !== loadToken) return;
    console.error("Could not load reports.", error);
    setMessage(recentMessage, errorMessage(error, "Reports could not be loaded."), "error");
  } finally {
    if (token === loadToken) setBusy(refreshBtn, false);
  }
}

function applyFilters() {
  const filtered = currentReports.filter((report) => {
    if (activeStatusFilter && report.status !== activeStatusFilter) return false;
    if (activeSearchQuery) {
      const matchText = `${report.title} ${report.description} ${report.category} ${report.city || ""}`.toLowerCase();
      if (!matchText.includes(activeSearchQuery)) return false;
    }
    return true;
  });

  renderMarkers(filtered);
}

function renderRecent(reports) {
  recentList.replaceChildren();
  const fragment = document.createDocumentFragment();
  reports.slice(0, RECENT_LIMIT).forEach((report) => {
    fragment.append(createReportCard(report, { compact: true, onShowOnMap: showOnMap }));
  });
  recentList.append(fragment);
}

function renderMarkers(reports) {
  if (!clusterGroup) return;
  clusterGroup.clearLayers();
  markerById.clear();

  reports.forEach((report) => {
    if (!hasCoordinates(report)) return;
    const marker = createHazardMarker(report, (selected) => {
      showOnMap(selected);
    });
    clusterGroup.addLayer(marker);
    markerById.set(report.id, marker);
  });
}

function showOnMap(report) {
  if (!map) return;
  mapCard.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "center" });

  const targetLatLng = [report.latitude, report.longitude];
  if (prefersReducedMotion()) {
    map.setView(targetLatLng, 16);
  } else {
    map.flyTo(targetLatLng, 16);
  }

  window.setTimeout(() => {
    map.invalidateSize();
    const marker = markerById.get(report.id);
    if (marker) {
      if (clusterGroup.zoomToShowLayer) {
        clusterGroup.zoomToShowLayer(marker, () => marker.openPopup());
      } else {
        marker.openPopup();
      }
    }
  }, prefersReducedMotion() ? 50 : 1200);
}

function fitToReports(reports) {
  const points = reports.filter(hasCoordinates).map((r) => [r.latitude, r.longitude]);
  if (!map || !points.length) return;
  if (points.length === 1) map.setView(points[0], 14);
  else map.fitBounds(points, { padding: [36, 36], maxZoom: 14 });
}
