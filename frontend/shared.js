// Helpers shared by the Dashboard, Report and Reports pages.
// Firebase itself is only initialised in firebase.js; auth goes through auth.js.
import { checkAuth, logout } from "./auth.js";
import { getUserProfile, isAnyAdmin, clearCachedProfile, ROLE_LABELS } from "./admin-service.js";

export const GUJARAT_CENTER = [22.6708, 71.5724];
// Same bounds as reports.js and the Firestore rules.
export const GUJARAT_BOUNDS = { latMin: 20, latMax: 25, lngMin: 68, lngMax: 75 };
export const STATUS_COLOR = {
  Pending: "#d97706",
  Verified: "#2563eb",
  "In Progress": "#7c3aed",
  Resolved: "#059669"
};

const LOGIN_URL = "login.html";

export function byId(id) {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id}`);
  return element;
}

// Wires the sidebar: shows Logout for signed-in users and Log in for guests.
// `onUser` runs once Firebase has restored (or failed to restore) the session,
// and again on every login or logout.
export function initShell(onUser) {
  const navAuth = byId("navAuth");
  const navAuthLabel = byId("navAuthLabel");
  const sideUser = byId("sideUser");
  const sideNav = document.querySelector(".side-nav");
  const page = window.location.pathname.split("/").pop() || "index.html";
  let current = null;

  navAuth.addEventListener("click", async (event) => {
    if (!current) return; // Guests follow the normal link to login.html.
    event.preventDefault();
    try {
      clearCachedProfile();
      await logout();
      window.location.replace(LOGIN_URL);
    } catch (error) {
      console.error(error);
      sideUser.textContent = "Could not log out. Try again.";
    }
  });

  checkAuth(async (user) => {
    current = user;
    document.body.classList.toggle("is-authenticated", Boolean(user));
    navAuthLabel.textContent = user ? "Logout" : "Log in";
    navAuth.setAttribute("href", user ? "#" : `${LOGIN_URL}?next=${encodeURIComponent(page)}`);

    if (user) {
      sideUser.textContent = user.email || "Signed in";
      try {
        const profile = await getUserProfile(user.uid);
        if (isAnyAdmin(profile)) {
          const roleLabel = ROLE_LABELS[profile.role] || "Admin";
          sideUser.textContent = `${user.email} (${roleLabel})`;
          ensureAdminNavLink(sideNav, page);
        }
      } catch (err) {
        console.warn("Could not check admin role in sidebar:", err);
      }
    } else {
      clearCachedProfile();
      sideUser.textContent = "Browsing as guest";
      removeAdminNavLink(sideNav);
    }

    onUser(user);
  });
}

function ensureAdminNavLink(sideNav, currentPage) {
  if (!sideNav || sideNav.querySelector('a[href="admin.html"]')) return;
  const link = document.createElement("a");
  link.href = "admin.html";
  if (currentPage === "admin.html") link.setAttribute("aria-current", "page");
  link.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true" style="width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg><span>Admin Panel</span>`;
  // Insert before navAuth
  const navAuth = byId("navAuth");
  sideNav.insertBefore(link, navAuth);
}

function removeAdminNavLink(sideNav) {
  const existing = sideNav?.querySelector('a[href="admin.html"]');
  if (existing) existing.remove();
}

export function createMap(elementId, { center = GUJARAT_CENTER, zoom = 7, withLayers = true } = {}) {
  if (typeof L === "undefined") return null;

  const osmStandard = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'
  });

  const esriSatellite = L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    {
      maxZoom: 19,
      attribution: 'Tiles &copy; <a href="https://www.esri.com" target="_blank" rel="noopener">Esri</a>'
    }
  );

  const esriLabels = L.tileLayer(
    "https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
    { maxZoom: 19 }
  );
  const satelliteGroup = L.layerGroup([esriSatellite, esriLabels]);

  const terrain = L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
    maxZoom: 17,
    subdomains: "abc",
    attribution: 'Map &copy; <a href="https://opentopomap.org" target="_blank" rel="noopener">OpenTopoMap</a>'
  });

  const baseMaps = {
    "Standard (OSM)": osmStandard,
    "Satellite (Esri)": satelliteGroup,
    "Terrain (Topo)": terrain
  };

  const map = L.map(elementId, {
    scrollWheelZoom: true,
    center,
    zoom,
    layers: [osmStandard]
  });

  if (withLayers) {
    L.control.layers(baseMaps, null, { position: "topright" }).addTo(map);
  }

  window.setTimeout(() => map.invalidateSize(), 250);
  window.addEventListener("resize", () => map.invalidateSize());
  return map;
}

export function inGujarat(latitude, longitude) {
  const b = GUJARAT_BOUNDS;
  return latitude >= b.latMin && latitude <= b.latMax && longitude >= b.lngMin && longitude <= b.lngMax;
}

export function hasCoordinates(report) {
  return Number.isFinite(report.latitude)
    && Number.isFinite(report.longitude)
    && Math.abs(report.latitude) <= 90
    && Math.abs(report.longitude) <= 180;
}

export function statusSlug(status) {
  return status.toLowerCase().replace(/\s+/g, "-");
}

export function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function setMessage(element, text, type) {
  element.textContent = text;
  element.classList.toggle("success", type === "success" && Boolean(text));
  element.classList.toggle("error", type === "error" && Boolean(text));
}

export function setBusy(button, busy, busyLabel) {
  if (!button) return;
  if (busy) {
    if (!button.dataset.label) button.dataset.label = button.textContent;
    if (busyLabel) button.textContent = busyLabel;
    button.disabled = true;
    return;
  }
  if (button.dataset.label) {
    button.textContent = button.dataset.label;
    delete button.dataset.label;
  }
  button.disabled = false;
}

export function errorMessage(error, fallback) {
  if (error?.code === "permission-denied") {
    return "Firestore denied this request. Public reading and signed-in report creation must be allowed in the project rules.";
  }
  if (error?.code === "unavailable" || error?.code === "auth/network-request-failed") {
    return "Network error. Check your connection and try again.";
  }
  if (error instanceof Error && error.message && !error.code) return error.message;
  return fallback;
}

export function formatWhen(createdAt) {
  let date = null;
  if (createdAt && typeof createdAt.toDate === "function") date = createdAt.toDate();
  else if (createdAt) date = new Date(createdAt);
  if (!date || Number.isNaN(date.getTime())) return "Time unavailable";
  return date.toLocaleString(undefined, {
    day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit"
  });
}

export function geolocationErrorMessage(error) {
  if (error?.code === 1) return "Location permission was denied. Click the map to choose a location instead.";
  if (error?.code === 3) return "Location request timed out. Try again or click the map.";
  return "Your location could not be determined.";
}

export function renderStats(statEls, reports) {
  statEls.total.textContent = String(reports.length);
  for (const status of Object.keys(STATUS_COLOR)) {
    statEls[status].textContent = String(reports.filter((r) => r.status === status).length);
  }
}

export function createStatusMarker(report) {
  const marker = L.circleMarker([report.latitude, report.longitude], {
    radius: 9,
    color: "#ffffff",
    weight: 2,
    fillColor: STATUS_COLOR[report.status] || STATUS_COLOR.Pending,
    fillOpacity: 0.95
  });
  const popup = document.createElement("div");
  popup.className = "map-popup";
  const title = document.createElement("strong");
  title.textContent = report.title;
  const detail = document.createElement("p");
  detail.textContent = `${report.category} · ${report.status}`;
  const description = document.createElement("p");
  description.textContent = report.description || "No description provided.";
  popup.append(title, detail, description);
  marker.bindPopup(popup);
  return marker;
}

// One report card, used by the Dashboard (compact) and Reports pages.
// With `onShowOnMap` the action is a button; otherwise it links to the dashboard map.
export function createReportCard(report, { onShowOnMap, compact = false } = {}) {
  const card = document.createElement("article");
  card.className = compact ? "report-card compact" : "report-card";
  card.id = `report-${report.id}`;

  const top = document.createElement("div");
  top.className = "report-top";
  const title = document.createElement("h3");
  title.textContent = report.title;
  const badge = document.createElement("span");
  badge.className = `badge badge-${statusSlug(report.status)}`;
  badge.textContent = report.status;
  top.append(title, badge);

  const meta = document.createElement("p");
  meta.className = "report-meta";
  meta.textContent = `${report.category} · ${formatWhen(report.createdAt)}`;
  card.append(top, meta);

  if (!compact) {
    const description = document.createElement("p");
    description.className = "report-copy";
    description.textContent = report.description || "No description provided.";
    card.append(description);
  }

  const foot = document.createElement("div");
  foot.className = "report-foot";
  const location = document.createElement("span");
  location.className = "report-location";
  location.textContent = hasCoordinates(report)
    ? `${report.latitude.toFixed(5)}, ${report.longitude.toFixed(5)}`
    : "Location unavailable";
  foot.append(location);

  if (hasCoordinates(report)) {
    let action;
    if (onShowOnMap) {
      action = document.createElement("button");
      action.type = "button";
      action.addEventListener("click", () => onShowOnMap(report));
    } else {
      action = document.createElement("a");
      action.href = `index.html?report=${encodeURIComponent(report.id)}`;
    }
    action.className = "btn btn-secondary btn-small";
    action.textContent = "Show on map";
    foot.append(action);
  }

  card.append(foot);
  return card;
}
