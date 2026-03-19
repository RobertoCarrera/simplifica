const fs = require('fs');
const path = require('path');

const GUARD = `!(Deno.env.get("SUPABASE_URL") || "").startsWith("https://") && `;
const FUNCTIONS_DIR = path.join(process.cwd(), 'supabase', 'functions');
let patched = 0;
let skipped = 0;

function patchFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  if (content.includes('startsWith("https://")') || content.includes("startsWith('https://')")) {
    skipped++;
    return;
  }
  if (!content.includes('ALLOW_ALL_ORIGINS')) return;

  const lines = content.split('\n');
  let modified = false;
  const newLines = lines.map(line => {
    if (/Deno\.env\.get\(["']ALLOW_ALL_ORIGINS["']\)/.test(line)) {
      const eqIdx = line.indexOf(' = ');
      if (eqIdx === -1) return line;
      const before = line.slice(0, eqIdx + 3);
      const after  = line.slice(eqIdx + 3);
      modified = true;
      return before + GUARD + after;
    }
    return line;
  });

  if (modified) {
    fs.writeFileSync(filePath, newLines.join('\n'), 'utf8');
    console.log('Patched:', path.relative(process.cwd(), filePath));
    patched++;
  }
}

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      walk(full);
    } else if (entry.name.endsWith('.ts')) {
      patchFile(full);
    }
  }
}

walk(FUNCTIONS_DIR);
console.log('\nDone: ' + patched + ' patched, ' + skipped + ' already had production guard.');
