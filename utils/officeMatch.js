const mongoose = require('mongoose');
const haversine = require('haversine-distance');

/** Use stored timestamp, or ObjectId creation time for legacy rows missing timestamp. */
const getAttendanceTimestamp = (log) => {
  if (log?.timestamp) return new Date(log.timestamp);
  const id = log?._id;
  if (id && mongoose.Types.ObjectId.isValid(String(id))) {
    return new mongoose.Types.ObjectId(String(id)).getTimestamp();
  }
  return null;
};

const logDateKey = (log) => {
  const ts = getAttendanceTimestamp(log);
  return ts ? ts.toDateString() : 'unknown';
};

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
  const radius = office.radiusMeters;
  if (!preferredOfficeName || office.name !== preferredOfficeName) return radius;
  if (office.name === 'Tirunelveli') return Math.max(radius, 2500);
  return Math.round(radius * 1.5);
};

const userBranchFromLog = (log) => {
  if (log?.userBranch) return log.userBranch;
  const user = log?.user;
  if (!user) return null;
  return user.branch || user.bankDetails?.officeBranch || user.address || null;
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

const matchOfficeFromLocation = (locationString, offices, options = {}) => {
  const coords = parseLocationCoords(locationString);
  if (!coords) return { officeName: 'Outside Office', isInOffice: false, distanceMeters: null };
  return matchOfficeFromCoords(coords.lat, coords.lon, offices, options);
};

/** Check-out near same-day in-office check-in → keep office name (indoor GPS drift). */
const matchOfficeWithPairing = (lat, lon, offices, options = {}) => {
  const { preferredOfficeName, pairedCheckIn } = options;
  const match = matchOfficeFromCoords(lat, lon, offices, { preferredOfficeName });

  if (match.isInOffice || !pairedCheckIn?.isInOffice || !pairedCheckIn.officeName) {
    return match;
  }

  const inCoords = parseLocationCoords(pairedCheckIn.location);
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

/** Mongoose docs don't spread cleanly — fields sit under _doc, so convert first. */
const toPlainLog = (log) => {
  if (!log || typeof log !== 'object') return log;
  if (typeof log.toObject === 'function') {
    return log.toObject({ virtuals: false });
  }
  return log;
};

/** Recompute branch label from stored GPS; pair check-out with same-day check-in on read. */
const enrichAttendanceLogs = (logs) => {
  const offices = require('../config/officeLocation');
  const enriched = (logs || []).map((log) => {
    const plain = toPlainLog(log);
    if (!plain?.location) return plain;
    const branch = userBranchFromLog(plain);
    const preferredOfficeName = branchToOfficeName({
      branch,
      address: branch,
      bankDetails: { officeBranch: branch },
    });
    const match = matchOfficeFromLocation(plain.location, offices, { preferredOfficeName });
    return {
      ...plain,
      officeName: match.officeName,
      isInOffice: match.isInOffice,
    };
  });

  const pairs = {};
  for (const log of enriched) {
    const dateKey = logDateKey(log);
    const key = `${log.userId || log.user?._id || log.employeeName}-${dateKey}`;
    if (!pairs[key]) pairs[key] = {};
    if (log.type === 'check-in') pairs[key].checkIn = log;
  }

  return enriched.map((log) => {
    if (log.type !== 'check-out' || log.isInOffice) return log;
    const dateKey = logDateKey(log);
    const key = `${log.userId || log.user?._id || log.employeeName}-${dateKey}`;
    const checkIn = pairs[key]?.checkIn;
    if (!checkIn?.location || !log.location) return log;

    const coords = parseLocationCoords(log.location);
    if (!coords) return log;

    const branch = userBranchFromLog(log);
    const preferredOfficeName = branchToOfficeName({
      branch,
      address: branch,
      bankDetails: { officeBranch: branch },
    });
    const match = matchOfficeWithPairing(coords.lat, coords.lon, offices, {
      preferredOfficeName,
      pairedCheckIn: checkIn,
    });
    return {
      ...toPlainLog(log),
      officeName: match.officeName,
      isInOffice: match.isInOffice,
    };
  });
};

module.exports = {
  getAttendanceTimestamp,
  toPlainLog,
  parseLocationCoords,
  branchToOfficeName,
  matchOfficeFromCoords,
  matchOfficeFromLocation,
  matchOfficeWithPairing,
  enrichAttendanceLogs,
  effectiveRadius,
};
