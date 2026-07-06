const fs = require('fs');
const p = 'src/app/shared/layout/responsive-sidebar/responsive-sidebar.component.ts';
let buf = fs.readFileSync(p);

// The file's string literal in alert() spans 2 lines because a literal LF
// was inserted where \n should have been. Same for console.warn().
// Find:        alert('SIDEBAR DEBUG\n'   (literal LF)\n        ' + text);
// Replace with: alert('SIDEBAR DEBUG\\n\\n' + text);

const old1 = Buffer.from("alert('SIDEBAR DEBUG\n\n' + text);", 'utf8');
const new1 = Buffer.from("alert('SIDEBAR DEBUG\\\\n\\\\n' + text);", 'utf8');

const old2 = Buffer.from("console.warn('=== SIDEBAR DEBUG ===\n' + text + '\n===================');", 'utf8');
const new2 = Buffer.from("console.warn('=== SIDEBAR DEBUG ===\\\\n' + text + '\\\\n===================');", 'utf8');

// The string above may not be found if the file's line terminators are CRLF
// but the LITERAL \n inside the string is just LF. Search for either case.
let found1 = buf.indexOf(old1);
let found2 = buf.indexOf(old2);

if (found1 < 0) {
  // Try with explicit \r\n
  const alt1 = Buffer.from("alert('SIDEBAR DEBUG\r\n\r\n' + text);", 'utf8');
  if (buf.indexOf(alt1) >= 0) { console.log('using CRLF for old1'); buf = Buffer.concat([buf.slice(0, buf.indexOf(alt1)), new1, buf.slice(buf.indexOf(alt1) + alt1.length)]); }
  else { console.error('old1 not found in either LF or CRLF form'); process.exit(1); }
} else {
  buf = Buffer.concat([buf.slice(0, found1), new1, buf.slice(found1 + old1.length)]);
  console.log('replaced old1 (LF)');
}

found2 = buf.indexOf(old2);
if (found2 < 0) {
  const alt2 = Buffer.from("console.warn('=== SIDEBAR DEBUG ===\r\n' + text + '\r\n===================');", 'utf8');
  if (buf.indexOf(alt2) >= 0) { console.log('using CRLF for old2'); buf = Buffer.concat([buf.slice(0, buf.indexOf(alt2)), new2, buf.slice(buf.indexOf(alt2) + alt2.length)]); }
  else { console.error('old2 not found in either LF or CRLF form'); process.exit(1); }
} else {
  buf = Buffer.concat([buf.slice(0, found2), new2, buf.slice(found2 + old2.length)]);
  console.log('replaced old2 (LF)');
}

fs.writeFileSync(p, buf);
console.log('done');
