const fs = require('fs');
const content = fs.readFileSync('F:/simplifica/simplifica-crm/src/assets/i18n/es.json', 'utf8');
const lines = content.split('\n');
let inQ = false, qs = 0, qe = 0, d = 0;
lines.forEach((l, i) => {
  const t = l.trim();
  if (t.startsWith('"quotes"')) { inQ = true; qs = i + 1; d = 0; }
  if (inQ) {
    d += (l.match(/\{/g) || []).length;
    d -= (l.match(/\}/g) || []).length;
    if (d === 0 && qs > 0 && i > qs) { qe = i; inQ = false; }
  }
});
console.log('quotes: lines', qs, 'to', qe);
console.log('Last 5 lines of quotes:', lines.slice(qe - 4, qe + 1).join('\n'));
console.log('portal starts at line:', lines.findIndex(l => l.trim().startsWith('"portal"')));
