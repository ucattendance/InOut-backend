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

const effectiveRadius = (office, preferredOfficeName) => {
  let radius = office.radiusMeters;
  if (!preferredOfficeName || office.name !== preferredOfficeName) return radius;
  // Tirunelveli indoor GPS is often 1–2 km off; widen when employee branch matches.
  if (office.name === 'Tirunelveli') return 2000;
  return Math.round(radius * 1.5);
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

    const radius = effectiveRadius(office, preferredOfficeName);

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
    const preferredOfficeName = branchToOfficeName({
      branch: log.userBranch,
      address: log.userBranch,
      bankDetails: { officeBranch: log.userBranch },
    });
    const match = matchOfficeFromCoords(lat, lon, require('../config/officeLocation'), {
      preferredOfficeName,
    });
    return {
      ...log,
      officeName: match.officeName,
      isInOffice: match.isInOffice,
    };
  });

module.exports = { branchToOfficeName, matchOfficeFromCoords, enrichAttendanceLogs, effectiveRadius };
