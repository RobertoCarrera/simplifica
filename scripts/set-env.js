const fs = require('fs');
const path = require('path');

const env = process.argv[2]; // 'local' or 'prod'

if (!env || (env !== 'local' && env !== 'prod')) {
  console.error('Usage: node scripts/set-env.js [local|prod]');
  process.exit(1);
}

const sourceFile = path.join(__dirname, `../src/assets/runtime-config.${env}.json`);
const targetFile = path.join(__dirname, `../src/assets/runtime-config.json`);

if (!fs.existsSync(sourceFile)) {
  console.error(`Error: Configuration file for "${env}" not found at ${sourceFile}`);
  process.exit(1);
}

try {
  fs.copyFileSync(sourceFile, targetFile);
  console.log(`✅ successfully switched to ${env.toUpperCase()} environment.`);
  console.log(`   Source: ${sourceFile}`);
  console.log(`   Target: ${targetFile}`);
} catch (err) {
  console.error('Error copying configuration file:', err);
  process.exit(1);
}
