// Hazard-Aware Navigation Engine for Road Companion
// Interfaces with OpenStreetMap / OSRM routing and performs spatial hazard corridor detection

import { haversineDistanceKm } from "./cities.js";

const OSRM_API_BASE = "https://router.project-osrm.org/route/v1/driving";

/**
 * Calculate distance in meters from a point (lat, lng) to a line segment (lat1, lng1)-(lat2, lng2)
 */
export function pointToSegmentDistanceMeters(pLat, pLng, aLat, aLng, bLat, bLng) {
  // Approximate projection using local flat-earth approximation
  const latMid = ((aLat + bLat) / 2) * (Math.PI / 180);
  const mPerDegLat = 111132.954;
  const mPerDegLng = 111412.84 * Math.cos(latMid);

  // Convert to local meter coordinates relative to point A
  const px = (pLng - aLng) * mPerDegLng;
  const py = (pLat - aLat) * mPerDegLat;
  const bx = (bLng - aLng) * mPerDegLng;
  const by = (bLat - aLat) * mPerDegLat;

  const segmentLengthSq = bx * bx + by * by;
  if (segmentLengthSq === 0) {
    return Math.hypot(px, py);
  }

  // Projection scalar t on segment [0, 1]
  let t = (px * bx + py * by) / segmentLengthSq;
  t = Math.max(0, Math.min(1, t));

  const projX = t * bx;
  const projY = t * by;

  return Math.hypot(px - projX, py - projY);
}

/**
 * Check if a hazard point is within a corridor radius (in meters) of a route polyline
 */
export function findHazardsAlongRoute(routeCoordinates, hazards, corridorMeters = 300) {
  // routeCoordinates is array of [lng, lat] from GeoJSON
  if (!routeCoordinates || routeCoordinates.length < 2 || !hazards || !hazards.length) {
    return [];
  }

  // Quick bounding box check for route
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const [lng, lat] of routeCoordinates) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  }

  // Buffer in degrees (~300m buffer ~ 0.003 deg)
  const degBuffer = (corridorMeters / 100000) * 1.5;
  const bMinLat = minLat - degBuffer;
  const bMaxLat = maxLat + degBuffer;
  const bMinLng = minLng - degBuffer;
  const bMaxLng = maxLng + degBuffer;

  const candidateHazards = hazards.filter((h) => {
    return (
      Number.isFinite(h.latitude) &&
      Number.isFinite(h.longitude) &&
      h.latitude >= bMinLat &&
      h.latitude <= bMaxLat &&
      h.longitude >= bMinLng &&
      h.longitude <= bMaxLng
    );
  });

  const matchedHazards = [];

  for (const hazard of candidateHazards) {
    let minDistance = Infinity;

    for (let i = 0; i < routeCoordinates.length - 1; i++) {
      const [aLng, aLat] = routeCoordinates[i];
      const [bLng, bLat] = routeCoordinates[i + 1];

      const dist = pointToSegmentDistanceMeters(
        hazard.latitude,
        hazard.longitude,
        aLat,
        aLng,
        bLat,
        bLng
      );

      if (dist < minDistance) {
        minDistance = dist;
      }

      if (minDistance <= corridorMeters) {
        break; // Within threshold, no need to check all remaining segments for this hazard
      }
    }

    if (minDistance <= corridorMeters) {
      matchedHazards.push({
        ...hazard,
        distanceFromRouteMeters: Math.round(minDistance)
      });
    }
  }

  // Sort by closest distance to route
  return matchedHazards.sort((a, b) => a.distanceFromRouteMeters - b.distanceFromRouteMeters);
}

/**
 * Fetch driving routes from OSRM
 */
export async function fetchRoutes(startLat, startLng, endLat, endLng) {
  const url = `${OSRM_API_BASE}/${startLng},${startLat};${endLng},${endLat}?overview=full&geometries=geojson&steps=true&alternatives=true`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Routing service responded with status ${response.status}`);
  }

  const data = await response.json();
  if (data.code !== "Ok" || !data.routes || !data.routes.length) {
    throw new Error(data.message || "No navigable driving route could be found between these locations.");
  }

  return data.routes.map((route, index) => {
    return {
      id: index,
      name: route.legs?.[0]?.summary || `Route ${index + 1}`,
      distanceKm: (route.distance / 1000).toFixed(1),
      durationMinutes: Math.round(route.duration / 60),
      geometry: route.geometry,
      steps: route.legs?.[0]?.steps || []
    };
  });
}
