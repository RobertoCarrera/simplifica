const fs = require('fs');
const content = fs.readFileSync('F:/simplifica/simplifica-crm/src/assets/i18n/ca.json', 'utf8');
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
console.log('Last 4 lines of quotes:', lines.slice(qe - 3, qe + 1).join('\n'));
// Also find where webmail/portal ends
for (let i = lines.length - 1; i >= 0; i--) {
  const t = lines[i].trim();
  if (t.startsWith('"webmail"') || t.startsWith('"portal"')) {
    console.log('Last section starts at line', i + 1, ':', t);
    // Find its closing brace
    let d2 = 0, endLine = i;
    for (let j = i; j < lines.length; j++) {
      d2 += (lines[j].match(/\{/g) || []).length;
      d2 -= (lines[j].match(/\}/g) || []).length;
      if (d2 === 0 && j > i) { endLine = j; break; }
    }
    console.log('Last section ends at line', endLine + 1);
    console.log('Last 3 lines:', lines.slice(endLine - 2, endLine + 1).join('\n'));
    break;
  }
}
