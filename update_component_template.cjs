const fs = require('fs');
const path = require('path');

const tsFilePath = path.join('src', 'app', 'features', 'tickets', 'detail', 'ticket-detail.component.ts');

try {
  let content = fs.readFileSync(tsFilePath, 'utf8');
  
  // Find the start of the template property
  const templateStartMarker = 'template: `';
  const startIdx = content.indexOf(templateStartMarker);
  
  if (startIdx === -1) {
      console.error('Could not find template start.');
      process.exit(1);
  }

  // Find the end of the component decorator configuration
  // We know "export class TicketDetailComponent" follows immediately after "})"
  const classDeclaration = 'export class TicketDetailComponent';
  const classIdx = content.indexOf(classDeclaration);
  
  if (classIdx === -1) {
      console.error('Could not find class declaration.');
      process.exit(1);
  }

  // Look backwards from class declaration for the closing of the object "}" or "})"
  // The file likely has `}) \n export class`
  
  // We want to replace everything from `template: ` up to the closing backtick.
  // The closing backtick should be the last one before the class declaration.
  
  const substringBeforeClass = content.substring(0, classIdx);
  const lastBacktick = substringBeforeClass.lastIndexOf('`');
  
  if (lastBacktick < startIdx) {
      console.error('Could not find closing backtick properly.');
      process.exit(1);
  }

  // Construct new content
  const before = content.substring(0, startIdx);
  const after = content.substring(lastBacktick + 1); // everything after the closing backtick
  
  const newContent = before + "templateUrl: './ticket-detail.component.html'" + after;
  
  fs.writeFileSync(tsFilePath, newContent);
  console.log('Successfully updated component to use templateUrl');

} catch (err) {
  console.error('Error:', err);
}
