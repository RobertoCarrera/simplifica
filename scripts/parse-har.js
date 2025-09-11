// Script: parse-har.js
// Usage: node parse-har.js /path/to/session.har
// Prints request headers, request body, and response status/body for entries matching /rest/v1/services

const fs = require('fs');
const path = require('path');

const harPath = process.argv[2] || path.join(process.cwd(), 'session.har');
if (!fs.existsSync(harPath)) {
  console.error('HAR file not found:', harPath);
  process.exit(2);
}

let raw;
try {
  raw = fs.readFileSync(harPath, 'utf8');
} catch (err) {
  console.error('Failed to read HAR file:', err.message);
  process.exit(2);
}

let har;
try {
  har = JSON.parse(raw);
} catch (err) {
  console.error('HAR is not valid JSON:', err.message);
  process.exit(2);
}

const entries = (har.log && har.log.entries) || [];
const matches = entries.filter(e => {
  try {
    const url = e.request.url || '';
    return url.includes('/rest/v1/services');
  } catch (err) { return false; }
});

if (!matches.length) {
  console.log('No entries matching /rest/v1/services were found in the HAR.');
  process.exit(0);
}

matches.forEach((e, i) => {
  console.log('\n---- ENTRY', i + 1, '----');
  console.log('Request URL:', e.request.url);
  console.log('Method:', e.request.method);

  console.log('\nRequest headers:');
  (e.request.headers || []).forEach(h => {
    console.log(`  ${h.name}: ${h.value}`);
  });

  if (e.request.postData && e.request.postData.text) {
    console.log('\nRequest body:');
    console.log(e.request.postData.text);
  }

  console.log('\nResponse status:', e.response.status, e.response.statusText);
  console.log('\nResponse headers:');
  (e.response.headers || []).forEach(h => {
    console.log(`  ${h.name}: ${h.value}`);
  });

  if (e.response.content && e.response.content.text) {
    const enc = e.response.content.encoding || null;
    let text = e.response.content.text;
    if (enc === 'base64') {
      try {
        text = Buffer.from(text, 'base64').toString('utf8');
      } catch (err) {
        // fallthrough
      }
    }
    console.log('\nResponse body:');
    console.log(text);
  }

  console.log('\n---- END ENTRY ----\n');
});
