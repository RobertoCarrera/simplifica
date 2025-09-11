#!/usr/bin/env node
// Simple local import server using service_role key
// Usage: SERVICE_ROLE_KEY=... SUPABASE_URL=... node scripts/import-server.js

const express = require('express');
const bodyParser = require('body-parser');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(bodyParser.json({ limit: '10mb' }));

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Please set SUPABASE_URL and SERVICE_ROLE_KEY environment variables.');
  process.exit(1);
}

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

// health
app.get('/', (req, res) => res.json({ ok: true }));

// POST /import/services
// body: { rows: [ { name, description, base_price, estimated_hours, company_id, category } ], upsertCategory: true }
app.post('/import/services', async (req, res) => {
  try {
    const { rows, upsertCategory } = req.body || {};
    if (!Array.isArray(rows)) return res.status(400).json({ error: 'rows must be an array' });

    const inserted = [];

    for (const r of rows) {
      // optional: resolve or upsert category
      let categoryId = r.category || null;
      if (!categoryId && r.category_name && upsertCategory) {
        // try to find
        const { data: catData, error: catErr } = await supabaseAdmin
          .from('service_categories')
          .select('id')
          .eq('company_id', r.company_id)
          .eq('name', r.category_name)
          .limit(1)
          .maybeSingle();
        if (catErr) throw catErr;
        if (catData && catData.id) categoryId = catData.id;
        else {
          const { data: newCat, error: newCatErr } = await supabaseAdmin
            .from('service_categories')
            .insert({ name: r.category_name, company_id: r.company_id })
            .select()
            .maybeSingle();
          if (newCatErr) throw newCatErr;
          categoryId = newCat.id;
        }
      }

      const toInsert = Object.assign({}, r, { category: categoryId });
      // remove helper props
      delete toInsert.category_name;
      delete toInsert.upsertCategory;

      const { data, error } = await supabaseAdmin.from('services').insert(toInsert).select().maybeSingle();
      if (error) throw error;
      inserted.push(data);
    }

    res.json({ inserted });
  } catch (err) {
    console.error('Import error', err.message || err);
    res.status(500).json({ error: err.message || String(err) });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Import server listening on http://localhost:${PORT}`));
