const fs = require('fs');
const content = fs.readFileSync('F:/simplifica/simplifica-crm/src/assets/i18n/ca.json', 'utf8');
const lines = content.split('\n');
let inT = false, ts = 0, te = 0, d = 0;
lines.forEach((l, i) => {
  const t = l.trim();
  if (t.startsWith('"tickets"')) { inT = true; ts = i + 1; d = 0; }
  if (inT) {
    d += (l.match(/\{/g) || []).length;
    d -= (l.match(/\}/g) || []).length;
    if (d === 0 && ts > 0 && i > ts) { te = i; inT = false; }
  }
});
console.log('tickets: lines', ts, 'to', te);
console.log('Last 4 lines of tickets:', lines.slice(te - 3, te + 1).join('\n'));
