'use strict';

const fs = require('fs');
const config = require('./src/config');
const db = require('./src/db');
const { createApp } = require('./src/app');

async function main() {
  await db.init();
  const app = createApp();

  const server = app.listen(config.port, function () {
    console.log('EcoWatch API listening on http://localhost:' + config.port + ' (' + config.env + ')');
    if (fs.existsSync(config.frontendDir)) {
      console.log('Serving frontend from ' + config.frontendDir);
    } else {
      console.log('Frontend folder not found at ' + config.frontendDir + '; API only.');
    }
  });

  async function shutdown(signal) {
    console.log(signal + ' received, shutting down...');
    server.close(async function () {
      try { await db.flush(); } finally { process.exit(0); }
    });
    setTimeout(function () { process.exit(1); }, 10000).unref();
  }
  process.on('SIGINT', function () { shutdown('SIGINT'); });
  process.on('SIGTERM', function () { shutdown('SIGTERM'); });
}

main().catch(function (err) {
  console.error('Failed to start:', err.message);
  process.exit(1);
});
