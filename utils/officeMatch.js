const haversine = require('haversine-distance');

/** Map employee profile fields to office config `name`. */
const branchToOfficeName = (user) => {
  const raw = [user?.branch, user?.bankDetails?.officeBranch, user?.address]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (raw.includes('tirunel') || raw.includes('tvl')) return 'Tirunelveli';
  if (raw.includes('pallikar')) return 'Pallikaranai';
  if (raw.includes('velach') || raw.includes('velech')) return 'Velechery';
  return null;
};

/** Nearest office within its radius → branch name; otherwise Outside Office. */
const matchOfficeFromCoords = (lat, lon, offices, options = {}) => {
  const { preferredOfficeName } = options;
  const userLocation = { latitude: lat, longitude: lon };
  let best = null;

  for (const office of offices) {
    const distance = haversine(userLocation, {
      latitude: office.latitude,
      longitude: office.longitude,
    });

    let radius = office.radiusMeters;
    if (preferredOfficeName && office.name === preferredOfficeName) {
      radius = Math.round(radius * 1.5);
    }

    if (distance <= radius) {
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

/** Recompute branch label from stored GPS (fixes old "Outside Office" rows on read). */
const enrichAttendanceLogs = (logs) =>
  (logs || []).map((log) => {
    if (!log?.location || !String(log.location).includes(',')) {
      return log;
    }
    const [lat, lon] = String(log.location).split(',').map(parseFloat);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return log;
    const match = matchOfficeFromCoords(lat, lon, require('../config/officeLocation'));
    return {
      ...log,
      officeName: match.officeName,
      isInOffice: match.isInOffice,
    };
  });

module.exports = { branchToOfficeName, matchOfficeFromCoords, enrichAttendanceLogs };
