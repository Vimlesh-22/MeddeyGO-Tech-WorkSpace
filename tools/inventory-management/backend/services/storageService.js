const fs = require('fs');
const path = require('path');

const logPath = path.join(__dirname, '../logs', 'reminderLogs.json');

function saveLog(log) {
  let data = [];
  if (fs.existsSync(logPath)) {
    data = JSON.parse(fs.readFileSync(logPath));
  }
  data.push(log);
  fs.writeFileSync(logPath, JSON.stringify(data, null, 2));
}

function getLogs() {
  if (!fs.existsSync(logPath)) return [];
  return JSON.parse(fs.readFileSync(logPath));
}

module.exports = { saveLog, getLogs };
