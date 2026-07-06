const fs = require('fs');
const p = 'src/app/features/admin/modules/modules-admin.component.ts';
let s = fs.readFileSync(p, 'utf8');

const sigStart = '  /** Last debug payload from a plan-change attempt.';
const sigEnd = '  } | null>(null);';
const sigIdx = s.indexOf(sigStart);
if (sigIdx < 0) { console.error('sig not found'); process.exit(1); }
const sigClose = s.indexOf(sigEnd, sigIdx) + sigEnd.length;
s = s.slice(0, sigIdx) + s.slice(sigClose);
console.log('signal removed');

const setRe = /      this\.lastPlanChangeDebug\.set\(\{[\s\S]*?\n      \}\);/g;
const setMatches = s.match(setRe);
console.log('set matches:', setMatches ? setMatches.length : 0);
s = s.replace(setRe, '');

const fmtStart = '  /** Pretty-print the last plan-change debug payload';
const fmtIdx = s.indexOf(fmtStart);
if (fmtIdx > 0) {
  const marker = "Copia manualmente del textarea.');";
  const markerIdx = s.indexOf(marker, fmtIdx);
  if (markerIdx < 0) { console.error('marker not found'); process.exit(1); }
  // The catch closes, then "  }" closes the method. Find the next
  // "  }" that follows the catch close.
  let i = markerIdx;
  let closeIdx = -1;
  while ((i = s.indexOf('  }', i + 1)) >= 0) {
    if (i > markerIdx + marker.length) { closeIdx = i; break; }
  }
  if (closeIdx < 0) { console.error('close not found'); process.exit(1); }
  s = s.slice(0, fmtIdx) + s.slice(closeIdx + '  }'.length);
  console.log('helpers removed');
}

fs.writeFileSync(p, s, 'utf8');
console.log('done');
