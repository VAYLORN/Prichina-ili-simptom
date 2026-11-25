// Exits with 0 and opens the host panel when the game already runs on this computer,
// so a second double click on START-GAME.cmd never starts a second server on the same data.
import { spawn } from 'node:child_process';

const first = Number(process.env.PORT || 3210);
for (let port = first; port < first + 10; port++) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(800) });
    if ((await res.json()).application !== 'cause-or-symptom') continue;
    console.log(`\n  Игра уже запущена: http://localhost:${port}/operator\n`);
    if (process.env.OPEN_BROWSER !== '0') spawn('explorer.exe', [`http://localhost:${port}/operator`], { stdio: 'ignore' });
    process.exit(0);
  } catch {
    // nothing on this port, or another program
  }
}
process.exit(1);
