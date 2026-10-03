'use strict';

// Usage: npm run set-pin -- "Downtown" 5678
const db = require('../src/db');
const { hashPinSync } = require('../src/security');

async function main() {
  const locality = process.argv[2];
  const pin = process.argv[3];
  if (!locality || !pin) {
    console.error('Usage: npm run set-pin -- "<locality>" <new pin>');
    process.exit(1);
  }
  if (pin.length < 4 || pin.length > 64) {
    console.error('The PIN must be 4 to 64 characters long.');
    process.exit(1);
  }

  await db.init();
  const admin = db.data().admins.find(function (a) { return a.locality === locality; });
  if (!admin) {
    console.error('No admin for locality "' + locality + '". Known: ' +
      db.data().admins.map(function (a) { return a.locality; }).join(', '));
    process.exit(1);
  }
  admin.pinHash = hashPinSync(pin);
  await db.save();
  console.log('PIN updated for ' + locality + '.');
}

main().catch(function (err) {
  console.error(err.message);
  process.exit(1);
});
