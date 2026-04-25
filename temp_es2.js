const fs = require('fs');
const lines = fs.readFileSync('F:/simplifica/simplifica-crm/src/assets/i18n/es.json', 'utf8').split('\n');
let endShared = 0, endClients = 0;
let inS = false, inC = false, d = 0;
lines.forEach((l, i) => {
  const t = l.trim();
  if (t.startsWith('"shared"')) { inS = true; d = 0; }
  if (inS) { d += (l.match(/\{/g) || []).length; d -= (l.match(/\}/g) || []).length; if (d === 0 && t.startsWith('"') && i > 0) { endShared = i; inS = false; } }
  if (t.startsWith('"clients"')) { inC = true; d = 0; }
  if (inC) { d += (l.match(/\{/g) || []).length; d -= (l.match(/\}/g) || []).length; if (d === 0 && t.startsWith('"') && !t.startsWith('"clients"') && i > 0) { endClients = i; inC = false; } }
});
console.log('shared ends line', endShared);
console.log('Last 3 lines of shared:', lines.slice(endShared - 2, endShared + 1).join('\n'));
console.log('clients ends line', endClients);
console.log('Last 3 lines of clients:', lines.slice(endClients - 2, endClients + 1).join('\n'));
