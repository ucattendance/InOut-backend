const haversine = require('haversine-distance');

/** Map employee branch / address text to office config name. */
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

const matchOfficeFromCoords = (lat, lon, offices, preferredOfficeName = null) => {
  const userLocation = { latitude: lat, longitude: lon };
  const ordered = preferredOfficeName
    ? [
        ...offices.filter((o) => o.name === preferredOfficeName),
        ...offices.filter((o) => o.name !== preferredOfficeName),
      ]
    : offices;

  let nearest = { officeName: 'Outside Office', isInOffice: false, distanceMeters: null };

  for (const office of ordered) {
    const distance = haversine(userLocation, {
      latitude: office.latitude,
      longitude: office.longitude,
    });
    const radiusBoost = office.name === preferredOfficeName ? 1.5 : 1;
    const allowedRadius = office.radiusMeters * radiusBoost;

    if (distance <= allowedRadius) {
      return {
        officeName: office.name,
        isInOffice: true,
        distanceMeters: Math.round(distance),
      };
    }

    if (nearest.distanceMeters === null || distance < nearest.distanceMeters) {
      nearest = {
        officeName: 'Outside Office',
        isInOffice: false,
        distanceMeters: Math.round(distance),
      };
    }
  }

  return nearest;
};

module.exports = { branchToOfficeName, matchOfficeFromCoords };
