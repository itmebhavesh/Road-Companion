// Advanced Map Layers and Controls for Road Companion
// Provides Standard OSM, Esri World Imagery (Satellite), and OpenTopoMap (Terrain)

import { GUJARAT_CENTER, STATUS_COLOR, statusSlug, formatWhen } from "./shared.js";
import { GUJARAT_CITIES } from "./cities.js";

export const SATELLITE_PROVIDER_INFO = {
  activeProvider: "Esri World Imagery",
  license: "Free for open, educational and civic mapping under Esri Master License Agreement.",
  googleMapsEvaluation: {
    status: "Requires Google Cloud Project & Map Tiles API Key",
    billingRequired: true,
    setupGuide: "To use Google Maps Satellite tiles, generate an API key with Map Tiles API enabled, request a session token from https://tile.googleapis.com/v1/createSession, and pass the session token in the 2D tile endpoint. Direct scraping of mt0/mt1.google.com violates Google Terms of Service and is blocked."
  }
};

export function getBaseLayers() {
  const osmStandard = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'
  });

  // Esri World Imagery: High-resolution satellite tiles, fully licensed and free
  const esriSatellite = L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    {
      maxZoom: 19,
      attribution: 'Tiles &copy; <a href="https://www.esri.com" target="_blank" rel="noopener">Esri</a> &mdash; Source: Esri, Maxar, Earthstar Geographics'
    }
  );

  // Hybrid labels overlay for satellite
  const satelliteLabels = L.tileLayer(
    "https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
    {
      maxZoom: 19,
      attribution: ""
    }
  );

  // Group satellite + place names
  const satelliteLayer = L.layerGroup([esriSatellite, satelliteLabels]);

  // OpenTopoMap / Esri Topographic terrain
  const terrainLayer = L.tileLayer(
    "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    {
      maxZoom: 17,
      subdomains: "abc",
      attribution: 'Map &copy; <a href="https://opentopomap.org" target="_blank" rel="noopener">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/" target="_blank" rel="noopener">CC-BY-SA</a>)'
    }
  );

  return {
    "Standard Map (OSM)": osmStandard,
    "Satellite View (Esri)": satelliteLayer,
    "Terrain View (Topo)": terrainLayer
  };
}

export function createAdvancedMap(elementId, { center = GUJARAT_CENTER, zoom = 7, withControls = true } = {}) {
  if (typeof L === "undefined") return null;

  const baseLayers = getBaseLayers();
  const map = L.map(elementId, {
    center,
    zoom,
    scrollWheelZoom: true,
    layers: [baseLayers["Standard Map (OSM)"]]
  });

  if (withControls) {
    // Add layer switcher control
    L.control.layers(baseLayers, null, { position: "topright", collapsed: false }).addTo(map);

    // Add scale bar
    L.control.scale({ imperial: false, metric: true, position: "bottomleft" }).addTo(map);
  }

  // Handle window resizing
  window.setTimeout(() => map.invalidateSize(), 250);
  window.addEventListener("resize", () => map.invalidateSize());

  return map;
}

export function createClusterGroup() {
  if (typeof L !== "undefined" && typeof L.markerClusterGroup === "function") {
    return L.markerClusterGroup({
      chunkedLoading: true,
      maxClusterRadius: 45,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
      iconCreateFunction(cluster) {
        const count = cluster.getChildCount();
        let sizeClass = "small";
        if (count > 20) sizeClass = "large";
        else if (count > 8) sizeClass = "medium";

        return L.divIcon({
          html: `<div class="hazard-cluster hazard-cluster-${sizeClass}"><span>${count}</span></div>`,
          className: "custom-cluster-icon",
          iconSize: L.point(38, 38)
        });
      }
    });
  }
  // Fallback to plain layer group if plugin fails to load
  return L.layerGroup();
}

export function createHazardMarker(report, onSelect) {
  const color = STATUS_COLOR[report.status] || STATUS_COLOR.Pending;
  const marker = L.circleMarker([report.latitude, report.longitude], {
    radius: 9,
    color: "#ffffff",
    weight: 2,
    fillColor: color,
    fillOpacity: 0.95
  });

  const popup = document.createElement("div");
  popup.className = "map-popup";

  const title = document.createElement("strong");
  title.textContent = report.title;

  const badge = document.createElement("span");
  badge.className = `badge badge-${statusSlug(report.status)}`;
  badge.textContent = report.status;
  badge.style.display = "inline-block";
  badge.style.marginTop = "4px";

  const meta = document.createElement("p");
  meta.textContent = `${report.category} · ${report.city || "Gujarat"}`;

  const desc = document.createElement("p");
  desc.textContent = report.description || "No description provided.";

  const time = document.createElement("p");
  time.style.fontSize = "0.78rem";
  time.style.color = "#64748b";
  time.textContent = `Reported: ${formatWhen(report.createdAt)}`;

  popup.append(title, badge, meta, desc, time);

  if (typeof onSelect === "function") {
    const actionBtn = document.createElement("button");
    actionBtn.className = "btn btn-secondary btn-small";
    actionBtn.style.marginTop = "8px";
    actionBtn.style.width = "100%";
    actionBtn.type = "button";
    actionBtn.textContent = "View details";
    actionBtn.addEventListener("click", () => onSelect(report));
    popup.append(actionBtn);
  }

  marker.bindPopup(popup);
  return marker;
}

// Current location button control
export function addLocationControl(map, onLocated) {
  if (!map) return;

  const ControlClass = L.Control.extend({
    options: { position: "topleft" },
    onAdd() {
      const container = L.DomUtil.create("div", "leaflet-bar leaflet-control leaflet-locate-control");
      const btn = L.DomUtil.create("a", "leaflet-control-locate-btn", container);
      btn.href = "#";
      btn.title = "Jump to my current location";
      btn.setAttribute("role", "button");
      btn.setAttribute("aria-label", "Current location");
      btn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" style="vertical-align:middle;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round"><circle cx="12" cy="12" r="8"></circle><line x1="12" y1="2" x2="12" y2="4"></line><line x1="12" y1="20" x2="12" y2="22"></line><line x1="2" y1="12" x2="4" y2="12"></line><line x1="20" y1="12" x2="22" y2="12"></line><circle cx="12" cy="12" r="3" fill="currentColor"></circle></svg>`;

      L.DomEvent.disableClickPropagation(container);
      L.DomEvent.on(btn, "click", (e) => {
        L.DomEvent.preventDefault(e);
        if (!navigator.geolocation) {
          alert("Geolocation is not supported by your browser.");
          return;
        }

        btn.classList.add("locating");
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            btn.classList.remove("locating");
            const { latitude, longitude, accuracy } = pos.coords;
            map.flyTo([latitude, longitude], 15);
            if (typeof onLocated === "function") {
              onLocated(latitude, longitude, accuracy);
            }
          },
          (err) => {
            btn.classList.remove("locating");
            alert("Could not retrieve current location: " + err.message);
          },
          { enableHighAccuracy: true, timeout: 10000 }
        );
      });

      return container;
    }
  });

  map.addControl(new ControlClass());
}
