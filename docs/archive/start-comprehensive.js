const { spawn } = require('child_process');
const path = require('path');

const workspaceRoot = path.resolve(__dirname, '..');

console.log('Starting all tools with detailed logging (start-all-tools.js)...');

const child = spawn('node', ['start-all-tools.js'], {
  cwd: workspaceRoot,
  stdio: 'inherit',
  shell: true,
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
