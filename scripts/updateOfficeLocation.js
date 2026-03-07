const mongoose = require('mongoose');
const Attendance = require('../models/Attendance');
const officeLocation = require('../config/officeLocation');
const haversine = require('haversine-distance');

// ⛓️ Connect to your MongoDB
mongoose.connect(process.env.MONGO_URI, {
 useNewUrlParser: true,
  useUnifiedTopology: true,
});

const updateOfficeLocationForAll = async () => {
  try {
    const records = await Attendance.find({});

    for (const record of records) {
      if (!record.location || !record.location.includes(',')) continue;

      const [lat, lon] = record.location.split(',').map(parseFloat);
      const userLocation = { latitude: lat, longitude: lon };

      let isInOffice = false;
      let matchedOfficeName = 'Outside Office';

      for (const office of officeLocation) {
        const officeCoords = {
          latitude: office.latitude,
          longitude: office.longitude,
        };

        const distance = haversine(userLocation, officeCoords);
        if (distance <= office.radiusMeters) {
          isInOffice = true;
          matchedOfficeName = office.name;
          break;
        }
      }

      record.officeName = matchedOfficeName;
      record.isInOffice = isInOffice;

      await record.save();
      console.log(`✅ Updated ${record._id}: ${matchedOfficeName}`);
    }

    console.log('\n🎉 All records updated successfully.\n');
    process.exit();
  } catch (err) {
    console.error('❌ Error during update:', err);
    process.exit(1);
  }
};

updateOfficeLocationForAll();
