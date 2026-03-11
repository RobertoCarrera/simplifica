const fs = require('fs');
const path = require('path');
const p = path.join('src', 'app', 'features', 'webmail', 'components', 'message-viewer', 'message-viewer.component.ts');
let content = fs.readFileSync(p, 'utf8');

// We need to check if there is an attachment section and add a "Guardar en Cliente" button.
console.log(content.includes('attachments'));
