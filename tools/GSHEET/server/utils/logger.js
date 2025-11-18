const fs = require('fs');
const path = require('path');
const { LOG_FILE } = require('../config');

function logUpdate(entry) {
  const logPath = path.resolve(LOG_FILE);
  const payload = { timestamp: new Date().toISOString(), ...entry };
  fs.appendFileSync(logPath, JSON.stringify(payload) + '\n', 'utf-8');
}

module.exports = { logUpdate };
