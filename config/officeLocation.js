// server/config/officeLocation.js
module.exports = [
  {
    name: "Pallikaranai",
    latitude: 12.94198577,
    longitude: 80.21012198,
    radiusMeters: 200, // Acceptable distance from Office 1
  },
  {
    name: "Velechery",
    latitude: 12.9912597,
    longitude: 80.2201616,
    radiusMeters: 400, // Acceptable distance from Office 2
  },
  {
    name: "Tirunelveli",
    latitude: 8.6988125,
    longitude: 77.7269375,
    radiusMeters: 500, // Fab Sapphire Towers (MPXG+GQ) — wider for GPS drift
  }
];
