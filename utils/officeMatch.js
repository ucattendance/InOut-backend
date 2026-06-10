const haversine = require('haversine-distance');

const parseCoords = (locationString) => {
  if (!locationString || !String(locationString).includes(',')) return null;
  const [lat, lon] = String(locationString).split(',').map(parseFloat);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
};

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
  if (office.name === 'Tirunelveli') return 2500;
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

/** Check-out near same-day in-office check-in → keep office name (indoor GPS drift). */
const matchOfficeWithPairing = (lat, lon, offices, options = {}) => {
  const { preferredOfficeName, pairedCheckIn } = options;
  const match = matchOfficeFromCoords(lat, lon, offices, { preferredOfficeName });

  if (match.isInOffice || !pairedCheckIn?.isInOffice || !pairedCheckIn.officeName) {
    return match;
  }

  const inCoords = parseCoords(pairedCheckIn.location);
  if (!inCoords) return match;

  const dist = haversine(
    { latitude: lat, longitude: lon },
    { latitude: inCoords.lat, longitude: inCoords.lon }
  );

  if (dist <= 600) {
    return {
      officeName: pairedCheckIn.officeName,
      isInOffice: true,
      distanceMeters: Math.round(dist),
    };
  }

  return match;
};

/** Recompute branch label from stored GPS (fixes old "Outside Office" rows on read). */
const enrichAttendanceLogs = (logs) => {
  const offices = require('../config/officeLocation');
  const enriched = (logs || []).map((log) => {
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
    const match = matchOfficeFromCoords(lat, lon, offices, { preferredOfficeName });
    return {
      ...log,
      officeName: match.officeName,
      isInOffice: match.isInOffice,
    };
  });

  const pairs = {};
  for (const log of enriched) {
    const dateKey = new Date(log.timestamp).toDateString();
    const key = `${log.userId || log.employeeName}-${dateKey}`;
    if (!pairs[key]) pairs[key] = {};
    if (log.type === 'check-in') pairs[key].checkIn = log;
  }

  return enriched.map((log) => {
    if (log.type !== 'check-out' || log.isInOffice) return log;
    const dateKey = new Date(log.timestamp).toDateString();
    const key = `${log.userId || log.employeeName}-${dateKey}`;
    const checkIn = pairs[key]?.checkIn;
    if (!checkIn?.location || !log.location) return log;

    const [lat, lon] = String(log.location).split(',').map(parseFloat);
    const preferredOfficeName = branchToOfficeName({
      branch: log.userBranch,
      address: log.userBranch,
      bankDetails: { officeBranch: log.userBranch },
    });
    const match = matchOfficeWithPairing(lat, lon, offices, {
      preferredOfficeName,
      pairedCheckIn: checkIn,
    });
    return {
      ...log,
      officeName: match.officeName,
      isInOffice: match.isInOffice,
    };
  });
};

module.exports = {
  branchToOfficeName,
  matchOfficeFromCoords,
  matchOfficeWithPairing,
  enrichAttendanceLogs,
  effectiveRadius,
  parseCoords,
};
