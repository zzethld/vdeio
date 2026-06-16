import { spawn } from 'child_process';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const electronPath = require('electron');

// Start Vite dev server
const vite = spawn('npx', ['vite'], { shell: true, stdio: 'inherit' });

// Wait for Vite to be ready
setTimeout(() => {
  // Start Electron
  const electron = spawn(electronPath, ['.'], { shell: true, stdio: 'inherit' });

  electron.on('close', (code) => {
    vite.kill();
    process.exit(code ?? 0);
  });
}, 5000);
