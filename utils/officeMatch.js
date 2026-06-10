const haversine = require('haversine-distance');

/** Parse "lat,lon" and fix swapped coordinates (common on some phones). */
const parseLocationCoords = (locationString) => {
  if (!locationString || !String(locationString).includes(',')) return null;
  let [lat, lon] = String(locationString).split(',').map((v) => parseFloat(v.trim()));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  // South India: lat ~8–13, lon ~76–82 — if reversed, swap back
  if (lat > 20 && lon < 20) {
    [lat, lon] = [lon, lat];
  }
  return { lat, lon };
};

/** Nearest office within its radius → branch name; otherwise Outside Office. */
const matchOfficeFromCoords = (lat, lon, offices) => {
  const userLocation = { latitude: lat, longitude: lon };
  let best = null;

  for (const office of offices) {
    const distance = haversine(userLocation, {
      latitude: office.latitude,
      longitude: office.longitude,
    });

    if (distance <= office.radiusMeters) {
      if (!best || distance < best.distanceMeters) {
        best = {
          officeName: office.branchName || office.name,
          isInOffice: true,
          distanceMeters: Math.round(distance),
        };
      }
    }
  }

  if (best) return best;
  return { officeName: 'Outside Office', isInOffice: false, distanceMeters: null };
};

const matchOfficeFromLocation = (locationString, offices) => {
  const coords = parseLocationCoords(locationString);
  if (!coords) return { officeName: 'Outside Office', isInOffice: false, distanceMeters: null };
  return matchOfficeFromCoords(coords.lat, coords.lon, offices);
};

/** Recompute office label from stored GPS — check-in and check-out evaluated separately. */
const enrichAttendanceLogs = (logs) =>
  (logs || []).map((log) => {
    if (!log?.location) return log;
    const match = matchOfficeFromLocation(log.location, require('../config/officeLocation'));
    return {
      ...log,
      officeName: match.officeName,
      isInOffice: match.isInOffice,
    };
  });

module.exports = {
  parseLocationCoords,
  matchOfficeFromCoords,
  matchOfficeFromLocation,
  enrichAttendanceLogs,
};
