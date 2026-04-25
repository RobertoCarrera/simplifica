Import server (local)
=====================

This small Express server allows importing rows into Supabase using the service_role key. It's intended for local testing or to be deployed server-side (do NOT ship SERVICE_ROLE_KEY to frontend).

Usage
-----

1. Set environment variables:

```bash
export SUPABASE_URL="https://your-project.supabase.co"
export SERVICE_ROLE_KEY="your-service-role-key"
```

2. Start server:

```bash
node scripts/import-server.js
```

3. POST data to /import/services:

Request body JSON:

{
  "rows": [
    { "name": "Servicio importado", "description": "", "base_price": 0, "estimated_hours": 0, "company_id": "..." }
  ],
  "upsertCategory": true
}

Response: { inserted: [ ... ] }

Notes
-----
- This server runs the inserts with service_role privileges, bypassing RLS. Use it only from trusted environments.
- You can deploy it as a small server, an Edge Function, or integrate the logic into your backend.
