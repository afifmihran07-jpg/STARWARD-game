import {Game} from './game.js?v=flight-dashboard-replica-20261111';

const STARWARD_BUILD_ID = 'STARWARD-SYSTEM-MAP-20261022';
window.__STARWARD_BUILD_ID = STARWARD_BUILD_ID;
console.info('[STARWARD build]', STARWARD_BUILD_ID);

window.addEventListener('error', (e) => {
  console.error('Global error:', e.error);
  const errDiv = document.createElement('div');
  errDiv.style.cssText = 'position:fixed;top:0;left:0;right:0;padding:1rem;background:#ff4444;color:white;z-index:9999;font-family:monospace;white-space:pre-wrap;';
  errDiv.textContent = 'Error: ' + (e.error?.message || e.message) + '\n' + (e.error?.stack || '');
  document.body.appendChild(errDiv);
});

window.addEventListener('unhandledrejection', (e) => {
  console.error('Unhandled rejection:', e.reason);
  const errDiv = document.createElement('div');
  errDiv.style.cssText = 'position:fixed;top:0;left:0;right:0;padding:1rem;background:#ff4444;color:white;z-index:9999;font-family:monospace;white-space:pre-wrap;';
  errDiv.textContent = 'Unhandled Promise Rejection: ' + (e.reason?.message || e.reason);
  document.body.appendChild(errDiv);
});

try {
  window.game = new Game(document.querySelector('#gameCanvas'));
} catch (e) {
  console.error('Game init error:', e);
  const errDiv = document.createElement('div');
  errDiv.style.cssText = 'position:fixed;top:0;left:0;right:0;padding:1rem;background:#ff4444;color:white;z-index:9999;font-family:monospace;white-space:pre-wrap;';
  errDiv.textContent = 'Game init error: ' + (e.message || e) + '\n' + (e.stack || '');
  document.body.appendChild(errDiv);
}







