const haversine = require('haversine-distance');

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

module.exports = { matchOfficeFromCoords };
