// Report page (report.html): login-gated form that writes to Firestore through
// submitReport() in reports.js. New reports are always saved as Pending there.
import { submitReport } from "./reports.js";
import {
  byId, initShell, createMap, inGujarat, prefersReducedMotion, setBusy, setMessage,
  errorMessage, geolocationErrorMessage
} from "./shared.js";
import { GUJARAT_CITIES, detectCity } from "./cities.js";

const form = byId("reportForm");
const gate = byId("reportGate");
const gateLink = byId("gateLink");
const titleInput = byId("reportTitle");
const categoryInput = byId("category");
const cityInput = byId("city");
const descriptionInput = byId("description");
const latitudeInput = byId("latitude");
const longitudeInput = byId("longitude");
const locationBtn = byId("locationBtn");
const submitBtn = byId("reportBtn");
const formMessage = byId("reportMessage");
const mapMessage = byId("mapMessage");
const fields = [titleInput, categoryInput, cityInput, descriptionInput, latitudeInput, longitudeInput, locationBtn, submitBtn];

let currentUser = null;
let map;
let pin;
let accuracyCircle;

init();

function init() {
  map = createMap("map");
  if (map) map.on("click", (event) => chooseLocation(event.latlng.lat, event.latlng.lng, null));
  else setMessage(mapMessage, "The map library did not load. Check your connection and refresh.", "error");

  // Populate city options
  if (cityInput) {
    GUJARAT_CITIES.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c.name;
      opt.textContent = c.name;
      cityInput.appendChild(opt);
    });
  }

  setAccess(null);
  form.addEventListener("submit", (event) => { event.preventDefault(); handleSubmit(); });
  locationBtn.addEventListener("click", handleGeolocation);
  [latitudeInput, longitudeInput].forEach((input) => input.addEventListener("change", syncPinFromInputs));
  initShell((user) => { currentUser = user; setAccess(user); });
}

function setAccess(user) {
  fields.forEach((field) => { field.disabled = !user; });
  gate.hidden = Boolean(user);
  if (!user) gateLink.href = "login.html?next=report.html";
}

async function handleSubmit() {
  if (!currentUser) {
    setMessage(formMessage, "Log in to submit a report.", "error");
    return;
  }
  // The user ID is never sent from here; submitReport() reads it from Firebase Auth.
  const draft = {
    title: titleInput.value,
    category: categoryInput.value,
    city: cityInput.value || detectCity(Number(latitudeInput.value), Number(longitudeInput.value)),
    description: descriptionInput.value,
    latitude: latitudeInput.value,
    longitude: longitudeInput.value
  };

  setBusy(submitBtn, true, "Submitting…");
  try {
    await submitReport(draft);
    form.reset();
    clearPin();
    setMessage(formMessage, "Report submitted. Its status is Pending until someone reviews it. View it in Reports.", "success");
  } catch (error) {
    console.error(error);
    setMessage(formMessage, errorMessage(error, "The report could not be submitted."), "error");
  } finally {
    setBusy(submitBtn, false);
    setAccess(currentUser);
  }
}

function handleGeolocation() {
  if (!navigator.geolocation) {
    setMessage(mapMessage, "This browser does not provide location access.", "error");
    return;
  }
  setBusy(locationBtn, true, "Locating…");
  setMessage(mapMessage, "Requesting your current location…", "");
  navigator.geolocation.getCurrentPosition(
    (position) => {
      setBusy(locationBtn, false);
      const { latitude, longitude, accuracy } = position.coords;
      chooseLocation(latitude, longitude, accuracy);
    },
    (error) => {
      setBusy(locationBtn, false);
      setMessage(mapMessage, geolocationErrorMessage(error), "error");
    },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 15000 }
  );
}

function chooseLocation(latitude, longitude, accuracy) {
  if (!currentUser) {
    setMessage(mapMessage, "Log in to choose a report location. You can still explore the map.", "error");
    return;
  }
  if (!inGujarat(latitude, longitude)) {
    setMessage(mapMessage, "That spot is outside the Gujarat service area. Choose a location inside Gujarat.", "error");
    return;
  }
  latitudeInput.value = latitude.toFixed(6);
  longitudeInput.value = longitude.toFixed(6);
  if (cityInput) cityInput.value = detectCity(latitude, longitude);
  placePin(latitude, longitude, accuracy);
  setMessage(mapMessage, `Report location set (${cityInput?.value || "Gujarat"}).`, "success");
}

function syncPinFromInputs() {
  const latitude = Number(latitudeInput.value);
  const longitude = Number(longitudeInput.value);
  if (latitudeInput.value === "" || longitudeInput.value === "") return;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !inGujarat(latitude, longitude)) {
    setMessage(mapMessage, "Latitude must be 20–25 and longitude 68–75 (Gujarat).", "error");
    return;
  }
  placePin(latitude, longitude, null);
  setMessage(mapMessage, "", "");
}

function placePin(latitude, longitude, accuracy) {
  if (!map) return;
  if (pin) pin.setLatLng([latitude, longitude]);
  else {
    pin = L.circleMarker([latitude, longitude], {
      radius: 9, color: "#ffffff", weight: 3, fillColor: "#c8102e", fillOpacity: 1
    }).addTo(map);
    pin.bindTooltip("Report location", { direction: "top" });
  }
  if (accuracyCircle) { map.removeLayer(accuracyCircle); accuracyCircle = null; }
  if (Number.isFinite(accuracy)) {
    accuracyCircle = L.circle([latitude, longitude], {
      radius: accuracy, color: "#d4a64a", weight: 1, fillColor: "#d4a64a", fillOpacity: 0.15, interactive: false
    }).addTo(map);
  }
  const zoom = Math.max(map.getZoom(), 15);
  if (prefersReducedMotion()) map.setView([latitude, longitude], zoom);
  else map.flyTo([latitude, longitude], zoom);
}

function clearPin() {
  if (pin) { map?.removeLayer(pin); pin = null; }
  if (accuracyCircle) { map?.removeLayer(accuracyCircle); accuracyCircle = null; }
}
