# Production Deployment Guide - Quick Start

**Last Updated:** 2025-10-06  
**Prerequisites:** Supabase CLI installed, Git, Node.js 18+

---

## 🚀 Quick Deployment (5 Steps)

### Step 1: Configure Environment Variables

**Supabase Dashboard → Project Settings → Edge Functions → Secrets**

Add the following secrets:

```bash
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
ALLOW_ALL_ORIGINS=false
ALLOWED_ORIGINS=https://yourdomain.com,https://app.yourdomain.com
```

⚠️ **CRITICAL:** Never commit `SUPABASE_SERVICE_ROLE_KEY` to Git!

---

### Step 2: Deploy Edge Functions

```bash
cd f:/simplifica

# Login to Supabase (if not already logged in)
supabase login

# Link to your project
supabase link --project-ref YOUR_PROJECT_REF

# Deploy all Edge Functions
supabase functions deploy upsert-client
supabase functions deploy normalize-clients
supabase functions deploy create-address
supabase functions deploy import-customers

# Verify deployment
supabase functions list
```

**Expected output:**
```
┌──────────────────────┬──────────┬─────────────────────┐
│ Function Name        │ Status   │ Last Updated        │
├──────────────────────┼──────────┼─────────────────────┤
│ upsert-client        │ deployed │ 2025-10-06 12:00:00 │
│ normalize-clients    │ deployed │ 2025-10-06 12:00:01 │
│ create-address       │ deployed │ 2025-10-06 12:00:02 │
│ import-customers     │ deployed │ 2025-10-06 12:00:03 │
└──────────────────────┴──────────┴─────────────────────┘
```

---

### Step 3: Test Edge Functions

**Health Check:**
```bash
curl https://YOUR_PROJECT.supabase.co/functions/v1/upsert-client
```

**Expected response:**
```json
{"ok":true,"name":"upsert-client"}
```

**Authenticated Test (replace YOUR_JWT with actual token):**
```bash
curl -X POST 'https://YOUR_PROJECT.supabase.co/functions/v1/upsert-client' \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "p_name": "Test Client",
    "p_email": "test@example.com",
    "p_apellidos": "Test Surname",
    "p_phone": "+34600123456"
  }'
```

**Expected response:**
```json
{
  "ok": true,
  "method": "create",
  "client": {
    "id": "...",
    "name": "TEST CLIENT",
    "email": "test@example.com",
    ...
  }
}
```

---

### Step 4: Build Angular Application

**Update environment file:**

```typescript
// src/environments/environment.prod.ts
export const environment = {
  production: true,
  supabaseUrl: 'https://YOUR_PROJECT.supabase.co',
  supabaseKey: 'YOUR_ANON_KEY',  // From Supabase Dashboard → Settings → API
  supabaseFunctionsUrl: 'https://YOUR_PROJECT.supabase.co/functions/v1'
};
```

**Build for production:**

```bash
cd f:/simplifica
npm run build --configuration=production
```

**Expected output:**
```
✔ Building...
Application bundle generation complete. [~10 seconds]
Output location: F:\simplifica\dist\simplifica
```

---

### Step 5: Deploy Frontend

**Option A: Vercel**

```bash
# Install Vercel CLI (if not installed)
npm i -g vercel

# Deploy
vercel --prod

# Follow prompts:
# - Set up and deploy: Y
# - Which scope: [your-account]
# - Link to existing project: N
# - Project name: simplifica
# - Directory: dist/simplifica/browser
# - Override settings: N
```

**Option B: Netlify**

```bash
# Install Netlify CLI (if not installed)
npm i -g netlify-cli

# Deploy
netlify deploy --prod --dir=dist/simplifica/browser

# Follow prompts to link/create site
```

**Option C: Firebase Hosting**

```bash
# Install Firebase CLI (if not installed)
npm i -g firebase-tools

# Login
firebase login

# Initialize (first time only)
firebase init hosting
# Choose dist/simplifica/browser as public directory

# Deploy
firebase deploy --only hosting
```

---

## ✅ Post-Deployment Verification

### 1. Verify Edge Functions

Visit your app and test:

- ✅ Create new customer → Check name is UPPERCASE in database
- ✅ Try duplicate email → Should show error message
- ✅ Create customer with unconfirmed email → Should fail with 403
- ✅ Update existing customer → Should work, preserving company_id
- ✅ Test from different browser (different company) → Cannot see other company's data

### 2. Check Database

**Supabase Dashboard → Table Editor → clients**

Verify:
- ✅ Name/apellidos are UPPERCASE
- ✅ Email is lowercase
- ✅ company_id is set correctly
- ✅ No duplicate emails within same company

### 3. Monitor Logs

**Edge Function Logs:**
```bash
supabase functions logs upsert-client --project-ref YOUR_REF
supabase functions logs normalize-clients --project-ref YOUR_REF
```

**Database Logs:**
Supabase Dashboard → Logs → Postgres Logs

---

## 🔒 Security Checklist

Before going live:

- [ ] Service Role Key is secret (not in Git)
- [ ] CORS configured for production domain only (`ALLOW_ALL_ORIGINS=false`)
- [ ] Email confirmation is working (test signup flow)
- [ ] RLS policies are enabled (Supabase Dashboard → Authentication → Policies)
- [ ] HTTPS is enforced (automatic on Vercel/Netlify/Firebase)
- [ ] Custom domain configured with SSL certificate
- [ ] Database backups enabled (Supabase Dashboard → Database → Backups)
- [ ] Monitoring configured (Sentry, LogRocket, etc.)

---

## 🛠️ Troubleshooting

### Edge Function Returns 401 Unauthorized

**Cause:** Invalid or expired JWT token

**Solution:**
```bash
# Check token expiration
# JWT tokens expire after 1 hour by default
# User needs to re-login or refresh token
```

### Edge Function Returns 403 Forbidden (Email not confirmed)

**Cause:** User's email is not verified

**Solution:**
1. User must click confirmation link in email
2. Or manually confirm in Supabase Dashboard → Authentication → Users → [user] → Confirm email

### Edge Function Returns 500 Internal Server Error

**Cause:** Environment variables not set or incorrect

**Solution:**
```bash
# Check secrets are set
supabase secrets list --project-ref YOUR_REF

# Should show:
# - SUPABASE_URL
# - SUPABASE_SERVICE_ROLE_KEY
# - ALLOW_ALL_ORIGINS
# - ALLOWED_ORIGINS
```

### CORS Error in Browser

**Cause:** Origin not in ALLOWED_ORIGINS

**Solution:**
```bash
# Add your domain to ALLOWED_ORIGINS
supabase secrets set ALLOWED_ORIGINS="https://yourdomain.com,https://app.yourdomain.com"
```

### Cannot Create Customer (Duplicate Email)

**Expected behavior:** This is working correctly!

**Solution:**
- Edge Function prevents duplicate emails within the same company
- Use a different email or update the existing customer

### Build Warnings (Bundle Size)

**Warning:** `bundle initial exceeded maximum budget`

**Solution:**
```bash
# These are warnings, not errors
# App will work fine
# To reduce bundle size (optional):
# 1. Enable lazy loading for more routes
# 2. Remove unused dependencies
# 3. Optimize images
```

---

## 📊 Monitoring & Alerts

### Set Up Monitoring (Recommended)

**Sentry (Error Tracking):**
```bash
npm install @sentry/angular
# Configure in src/main.ts
```

**Uptime Monitoring:**
- UptimeRobot: https://uptimerobot.com (free)
- Pingdom: https://www.pingdom.com
- Better Uptime: https://betteruptime.com

**Log Aggregation:**
- Supabase Dashboard → Logs (built-in)
- Logtail: https://logtail.com
- Papertrail: https://www.papertrail.com

---

## 🔄 Updating Edge Functions

When you make changes to Edge Functions:

```bash
# Make your changes to:
# supabase/functions/*/index.ts

# Test locally (optional)
supabase functions serve upsert-client

# Deploy updated function
supabase functions deploy upsert-client

# Verify with health check
curl https://YOUR_PROJECT.supabase.co/functions/v1/upsert-client
```

**No restart required** - Edge Functions update instantly!

---

## 📚 Additional Documentation

- **Full Security Documentation:** `SECURITY.md`
- **Security Hardening Summary:** `SECURITY_HARDENING_SUMMARY.md`
- **GDPR Compliance:** `GDPR_COMPLIANCE_GUIDE.md`
- **Multi-Tenancy Guide:** `GUIA-MULTITENANT.md`
- **RLS Status:** `ESTADO_ACTUAL_RLS.md`

---

## 🆘 Support

**Issues:**
- Check `SECURITY.md` for troubleshooting
- Review Edge Function logs: `supabase functions logs <function-name>`
- Check database logs in Supabase Dashboard

**Security Concerns:**
- Report to: security@yourdomain.com (configure this)
- See `SECURITY.md` → Incident Response

---

## ✨ Success!

If all checks pass:

🎉 **Your application is now deployed and secured for production!**

**Next steps:**
1. Monitor logs for the first 24 hours
2. Run security tests (see `SECURITY.md` → Security Testing)
3. Set up automated backups
4. Schedule security review (quarterly recommended)

---

**Deployment Date:** __________  
**Deployed By:** __________  
**Production URL:** __________  

---

**End of Deployment Guide**
