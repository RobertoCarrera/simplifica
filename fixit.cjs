const fs = require('fs');
const p = 'src/app/shared/layout/responsive-sidebar/responsive-sidebar.component.ts';
let buf = fs.readFileSync(p);
const old1 = Buffer.from("alert('SIDEBAR DEBUG\n\n' + text);", 'utf8');
const new1 = Buffer.from("alert('SIDEBAR DEBUG\\n\\n' + text);", 'utf8');
const old2 = Buffer.from("console.warn('=== SIDEBAR DEBUG ===\n' + text + '\n===================');", 'utf8');
const new2 = Buffer.from("console.warn('=== SIDEBAR DEBUG ===\\n' + text + '\\n===================');", 'utf8');
if (!buf.includes(old1)) { console.error('old1 not found'); process.exit(1); }
if (!buf.includes(old2)) { console.error('old2 not found'); process.exit(1); }
buf = Buffer.concat([buf.slice(0, buf.indexOf(old1)), new1, buf.slice(buf.indexOf(old1) + old1.length)]);
let i2 = buf.indexOf(old2);
if (i2 < 0) { console.error('old2 gone'); process.exit(1); }
buf = Buffer.concat([buf.slice(0, i2), new2, buf.slice(i2 + old2.length)]);
fs.writeFileSync(p, buf);
console.log('done');
