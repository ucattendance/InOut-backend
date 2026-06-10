// server/config/officeLocation.js
// branchName = label shown in attendance logs when GPS is within radiusMeters
module.exports = [
  {
    name: 'Pallikaranai',
    branchName: 'Pallikaranai',
    latitude: 12.94198577,
    longitude: 80.21012198,
    radiusMeters: 200,
  },
  {
    name: 'Velechery',
    branchName: 'Velachery',
    latitude: 12.9912597,
    longitude: 80.2201616,
    radiusMeters: 400,
  },
  {
    name: 'Tirunelveli',
    branchName: 'Tirunelveli',
    // Fab Sapphire Towers, S Bypass Rd, Vasanth Nagar (was ~2.8km off — caused Outside Office)
    latitude: 8.7237565,
    longitude: 77.722212,
    radiusMeters: 1500,
  },
];
