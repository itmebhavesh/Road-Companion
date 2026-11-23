import {
  db,
  auth,
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  serverTimestamp
} from "./firebase.js";
import { detectCity } from "./cities.js";

const REPORTS_COLLECTION = "reports";

export const CATEGORIES = [
  "Pothole",
  "Waterlogging",
  "Damaged Road",
  "Street Light",
  "Traffic Signal",
  "Other"
];

export const STATUSES = ["Pending", "Verified", "In Progress", "Resolved"];

// Gujarat MVP scope. Keep in sync with the bounds in firestore.rules.
const LAT_MIN = 20;
const LAT_MAX = 25;
const LNG_MIN = 68;
const LNG_MAX = 75;

function cleanText(value, maxLength) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function requireCoord(value, label, min, max) {
  if (String(value ?? "").trim() === "") {
    throw new Error(`Enter a ${label.toLowerCase()}.`);
  }

  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new Error(`${label} must be a number between ${min} and ${max}.`);
  }

  return number;
}

export function displayStatus(status) {
  const normalized = String(status ?? "").trim().toLowerCase();
  return STATUSES.find((item) => item.toLowerCase() === normalized) || "Pending";
}

function toMillis(createdAt) {
  if (!createdAt) return 0;
  if (typeof createdAt.toMillis === "function") return createdAt.toMillis();
  const parsed = new Date(createdAt).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function mapReport(docSnap) {
  const data = docSnap.data();
  const lat = Number(data.latitude);
  const lng = Number(data.longitude);
  return {
    id: docSnap.id,
    title: cleanText(data.title, 120) || "Untitled report",
    category: CATEGORIES.includes(data.category) ? data.category : "Other",
    description: cleanText(data.description, 1000),
    latitude: lat,
    longitude: lng,
    city: data.city || detectCity(lat, lng),
    status: displayStatus(data.status),
    userId: data.userId || "",
    createdAt: data.createdAt || null,
    updatedAt: data.updatedAt || null,
    updatedBy: data.updatedBy || null,
    flags: data.flags || { duplicate: false, suspicious: false, inappropriate: false },
    moderationNotes: data.moderationNotes || ""
  };
}

export async function submitReport(input) {
  const title = cleanText(input.title, 120);
  const description = cleanText(input.description, 1000);
  const category = input.category;

  // Never trust a caller-supplied user ID. Use the authenticated user only.
  const user = auth.currentUser;
  if (!user || !user.uid) {
    throw new Error("Log in to submit a report.");
  }
  const userId = user.uid;

  if (!title) {
    throw new Error("Enter a report title.");
  }
  if (!CATEGORIES.includes(category)) {
    throw new Error("Select a report category.");
  }
  if (!description) {
    throw new Error("Describe the road problem.");
  }

  const latitude = requireCoord(input.latitude, "Latitude", LAT_MIN, LAT_MAX);
  const longitude = requireCoord(input.longitude, "Longitude", LNG_MIN, LNG_MAX);
  const city = input.city || detectCity(latitude, longitude);

  // Citizen submissions always start as Pending. This client does not set Verified.
  return addDoc(collection(db, REPORTS_COLLECTION), {
    title,
    category,
    description,
    latitude,
    longitude,
    city,
    status: "Pending",
    userId,
    createdAt: serverTimestamp(),
    flags: { duplicate: false, suspicious: false, inappropriate: false }
  });
}

export async function fetchReports() {
  const reportsRef = collection(db, REPORTS_COLLECTION);

  try {
    const snapshot = await getDocs(query(reportsRef, orderBy("createdAt", "desc")));
    return snapshot.docs.map(mapReport);
  } catch (error) {
    if (error?.code !== "failed-precondition") {
      throw error;
    }

    const snapshot = await getDocs(reportsRef);
    return snapshot.docs
      .map(mapReport)
      .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
  }
}