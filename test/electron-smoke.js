const { spawn } = require('child_process');
const electron = require('electron');
const path = require('path');

console.log('Starting Electron smoke test...');

const child = spawn(electron, [path.join(__dirname, '..', 'main.js')], {
  env: { ...process.env, SMOKE_TEST: 'true' },
  stdio: 'pipe'
});

let output = '';
child.stdout.on('data', d => output += d.toString());
child.stderr.on('data', d => output += d.toString());

// Kill after 4 seconds to avoid hanging GUI in automated test
const timer = setTimeout(() => {
  console.log('Electron launched and stayed alive without crashing for 4 seconds.');
  child.kill();
  process.exit(0);
}, 4000);

child.on('exit', (code) => {
  clearTimeout(timer);
  if (code !== 0 && code !== null) {
    console.error(`Electron exited with code ${code}:`, output);
    process.exit(code);
  } else {
    console.log('Electron exited cleanly.');
    process.exit(0);
  }
});
