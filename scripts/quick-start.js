const { spawn } = require('child_process');
const path = require('path');

const workspaceRoot = path.resolve(__dirname, '..');

console.log('Starting workspace in quick mode (npm run dev)...');

const child = spawn('npm', ['run', 'dev'], {
  cwd: workspaceRoot,
  stdio: 'inherit',
  shell: true,
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
