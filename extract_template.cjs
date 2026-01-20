const fs = require('fs');
const path = require('path');

const tsFilePath = path.join('src', 'app', 'features', 'tickets', 'detail', 'ticket-detail.component.ts');
const htmlFilePath = path.join('src', 'app', 'features', 'tickets', 'detail', 'ticket-detail.component.html');

try {
  const content = fs.readFileSync(tsFilePath, 'utf8');
  // Regex to capture content between `template: \`` and the last closing backtick before `})`
  // We look for `template:` followed by backtick, then any char until backtick, then expected closure.
  // Note: The file ends with `}) \n export class...` so we should look for the backtick before that.
  
  const regex = /template:\s*`([\s\S]*?)`\s*\n\s*}\)/;
  const match = content.match(regex);

  if (match && match[1]) {
    console.log('Found template content. Length:', match[1].length);
    fs.writeFileSync(htmlFilePath, match[1]);
    console.log('Successfully wrote to', htmlFilePath);
  } else {
    console.error('Could not match template pattern.');
    // Fallback: Try simpler split if regex fails on large content?
    // But regex should work on memory string.
    
    const startIdx = content.indexOf('template: `');
    if (startIdx !== -1) {
        // Find last backtick
        const lastBacktick = content.lastIndexOf('`');
        if (lastBacktick > startIdx) {
            const template = content.substring(startIdx + 11, lastBacktick);
            fs.writeFileSync(htmlFilePath, template);
            console.log('Successfully wrote to (fallback method)', htmlFilePath);
        }
    }
  }
} catch (err) {
  console.error('Error:', err);
}
