const fs = require('fs');
const p = 'src/app/shared/layout/responsive-sidebar/responsive-sidebar.component.ts';
let c = fs.readFileSync(p, 'utf8');
// Replace literal newlines inside the alert() and console.warn() with escaped \n
c = c.replace("alert('SIDEBAR DEBUG\n\n' + text);", "alert('SIDEBAR DEBUG\\\\n\\\\n' + text);");
c = c.replace("console.warn('=== SIDEBAR DEBUG ===\n' + text + '\n===================');", "console.warn('=== SIDEBAR DEBUG ===\\\\n' + text + '\\\\n===================');");
fs.writeFileSync(p, c, 'utf8');
console.log('done');
