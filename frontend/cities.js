// Gujarat cities reference and spatial utilities for Road Companion

export const GUJARAT_CITIES = [
  { name: "Ahmedabad", lat: 23.0225, lng: 72.5714 },
  { name: "Surat", lat: 21.1702, lng: 72.8311 },
  { name: "Vadodara", lat: 22.3072, lng: 73.1812 },
  { name: "Rajkot", lat: 22.3039, lng: 70.8022 },
  { name: "Bhavnagar", lat: 21.7645, lng: 72.1519 },
  { name: "Jamnagar", lat: 22.4707, lng: 70.0577 },
  { name: "Gandhinagar", lat: 23.2156, lng: 72.6369 },
  { name: "Junagadh", lat: 21.5222, lng: 70.4579 },
  { name: "Anand", lat: 22.5645, lng: 72.9289 },
  { name: "Navsari", lat: 20.9467, lng: 72.9520 },
  { name: "Bharuch", lat: 21.7051, lng: 72.9959 },
  { name: "Mehsana", lat: 23.5880, lng: 72.3693 },
  { name: "Bhuj", lat: 23.2420, lng: 69.6669 },
  { name: "Porbandar", lat: 21.6417, lng: 69.6293 },
  { name: "Morbi", lat: 22.8173, lng: 70.8370 },
  { name: "Surendranagar", lat: 22.7284, lng: 71.6371 },
  { name: "Patan", lat: 23.8493, lng: 72.1266 },
  { name: "Godhra", lat: 22.7758, lng: 73.6149 },
  { name: "Valsad", lat: 20.5992, lng: 72.9342 },
  { name: "Vapi", lat: 20.3712, lng: 72.9044 }
];

export const CITY_NAMES = GUJARAT_CITIES.map((c) => c.name);

// Haversine distance in kilometers between two points
export function haversineDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Find closest Gujarat city based on coordinates
export function detectCity(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return "Other";
  let closestCity = "Other";
  let minDistance = Infinity;

  for (const city of GUJARAT_CITIES) {
    const dist = haversineDistanceKm(lat, lng, city.lat, city.lng);
    if (dist < minDistance) {
      minDistance = dist;
      closestCity = city.name;
    }
  }

  // If closest city is within 65 km, associate with that city, else "Other"
  return minDistance <= 65 ? closestCity : "Other";
}
