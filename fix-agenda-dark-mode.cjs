const fs = require('fs');
let content = fs.readFileSync('src/app/features/agenda/agenda.component.html', 'utf8');

// Colors replacement map
const replacements = [
  ['bg-white', 'bg-white dark:bg-gray-800'],
  ['bg-[#fafafa]', 'bg-[#fafafa] dark:bg-gray-900'],
  ['border-gray-200', 'border-gray-200 dark:border-gray-700'],
  ['border-gray-300', 'border-gray-300 dark:border-gray-600'],
  ['text-gray-800', 'text-gray-800 dark:text-white'],
  ['text-gray-700', 'text-gray-700 dark:text-gray-200'],
  ['text-gray-600', 'text-gray-600 dark:text-gray-300'],
  ['text-gray-500', 'text-gray-500 dark:text-gray-400'],
  ['text-gray-400', 'text-gray-400 dark:text-gray-500'],
  ['bg-gray-50', 'bg-gray-50 dark:bg-gray-700'],
  ['bg-gray-100', 'bg-gray-100 dark:bg-gray-700'],
  ['hover:bg-gray-50', 'hover:bg-gray-50 dark:hover:bg-gray-700'],
  ['hover:bg-gray-100', 'hover:bg-gray-100 dark:hover:bg-gray-700'],
  ['bg-gray-200', 'bg-gray-200 dark:bg-gray-600'],
];

// Clean up any double dark: classes just in case
content = content.replace(/dark:[A-Za-z0-9-]+ dark:[A-Za-z0-9-]+/g, (match) => {
    let parts = match.split(' ');
    // just return the first one
    return parts[0];
});

replacements.forEach(([from, to]) => {
  // Be careful to replace only whole words
  const regex = new RegExp(`(?<!dark:)\\b${from}\\b(?! dark:)`, 'g');
  content = content.replace(regex, to);
});

// Since the array replacements can accumulate things, clean up
content = content.replace(/bg-white dark:bg-gray-800 dark:bg-gray-800/g, 'bg-white dark:bg-gray-800');

// specifically for the scrollable container, we want scrollbars visible:
content = content.replace('flex-1 overflow-auto relative flex flex-col', 'flex-1 overflow-auto relative flex flex-col overflow-y-scroll overflow-x-scroll custom-scrollbar');

fs.writeFileSync('src/app/features/agenda/agenda.component.html', content);
