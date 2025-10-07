# Security Documentation - Simplifica Application

**Version:** 2025-10-06-PRODUCTION  
**Last Updated:** October 6, 2025

## Table of Contents
- [Overview](#overview)
- [Security Architecture](#security-architecture)
- [Edge Functions Security](#edge-functions-security)
- [Input Validation & Sanitization](#input-validation--sanitization)
- [Authentication & Authorization](#authentication--authorization)
- [Multi-Tenancy Security](#multi-tenancy-security)
- [Environment Configuration](#environment-configuration)
- [Deployment Checklist](#deployment-checklist)
- [Security Testing](#security-testing)
- [Incident Response](#incident-response)

---

## Overview

This document outlines the comprehensive security measures implemented in the Simplifica application to ensure production-grade security, data protection, and compliance with regulations (including Spanish Hacienda requirements).

### Security Principles
1. **Defense in Depth**: Multiple layers of security (client, service, server)
2. **Server-Side Validation**: All critical validation happens server-side via Edge Functions
3. **Principle of Least Privilege**: Users only access their own company's data
4. **Input Sanitization**: All user inputs are sanitized to prevent XSS/injection attacks
5. **Email Confirmation**: Sensitive operations require verified email addresses

---

## Security Architecture

### Layers of Security

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Client Layer (Angular)                                   │
│    - Basic form validation (UX only)                        │
│    - JWT token storage (secure)                             │
│    - HTTPS enforcement                                      │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. Service Layer (Angular Services)                         │
│    - Token attachment to requests                           │
│    - Error handling                                         │
│    - API routing to Edge Functions                          │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. Edge Functions (Supabase/Deno)                          │
│    - Authentication verification (JWT)                      │
│    - Email confirmation check                               │
│    - Input sanitization                                     │
│    - Business logic validation                              │
│    - Multi-tenancy enforcement                              │
│    - Rate limiting (planned)                                │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. Database Layer (Supabase/PostgreSQL)                     │
│    - Row Level Security (RLS) policies                      │
│    - Foreign key constraints                                │
│    - Unique constraints                                     │
│    - Data encryption at rest                                │
└─────────────────────────────────────────────────────────────┘
```

---

## Edge Functions Security

### Deployed Edge Functions

#### 1. `upsert-client` (Client Create/Update)

**Purpose:** Secure server-side creation and updating of customer records.

**Security Features:**
- ✅ JWT token validation
- ✅ Email confirmation verification
- ✅ Input sanitization (removes `<>"'` \x00-\x1F\x7F`, max 500 chars)
- ✅ Email format validation (RFC-compliant regex)
- ✅ Duplicate email detection within company
- ✅ Company ownership verification (prevents cross-company updates)
- ✅ Server-side normalization (uppercase for name/apellidos/dni, lowercase for email)
- ✅ Comprehensive error codes (400, 401, 403, 404, 409, 500)

**Accepted Parameters:**
```typescript
{
  p_id?: string,           // For updates
  p_name: string,          // Required
  p_apellidos?: string,
  p_email: string,         // Required, validated
  p_phone?: string,
  p_dni?: string,
  p_direccion_id?: string,
  p_metadata?: object
}
```

**Deployment:**
```bash
supabase functions deploy upsert-client --project-ref YOUR_PROJECT_REF
```

---

#### 2. `normalize-clients` (Bulk Normalization)

**Purpose:** Admin-only bulk normalization of existing customer data.

**Security Features:**
- ✅ Role-based access control (admin/owner only)
- ✅ JWT token validation
- ✅ Email confirmation verification
- ✅ Company isolation (cannot normalize other companies)
- ✅ Pagination (500 rows per batch to prevent memory issues)
- ✅ Input sanitization on all fields
- ✅ Error aggregation for troubleshooting

**Usage:**
```bash
curl -X POST 'https://YOUR_PROJECT.supabase.co/functions/v1/normalize-clients' \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json"
```

**Deployment:**
```bash
supabase functions deploy normalize-clients --project-ref YOUR_PROJECT_REF
```

---

#### 3. `create-address` (Address Creation)

**Purpose:** Secure address creation with normalization.

**Security Features:**
- ✅ JWT token validation
- ✅ Email confirmation verification
- ✅ Input sanitization
- ✅ UUID validation for locality_id
- ✅ Empty address prevention
- ✅ Server-side uppercase normalization
- ✅ RPC fallback for performance

**Accepted Parameters:**
```typescript
{
  p_direccion: string,    // Required, sanitized, uppercased
  p_locality_id: string,  // Required, must be valid UUID
  p_numero?: string       // Optional
}
```

**Deployment:**
```bash
supabase functions deploy create-address --project-ref YOUR_PROJECT_REF
```

---

#### 4. `import-customers` (Bulk Import)

**Purpose:** CSV/bulk import of customer data.

**Security Features:**
- ✅ JWT token validation
- ✅ Email confirmation verification
- ✅ Input sanitization on all fields
- ✅ Email format validation
- ✅ Server-side normalization (uppercase name/dni, lowercase email)
- ✅ Duplicate handling (graceful skip with logging)
- ✅ Batch processing (100 rows per chunk)
- ✅ Incomplete data handling (placeholder emails, metadata flags)

**Deployment:**
```bash
supabase functions deploy import-customers --project-ref YOUR_PROJECT_REF
```

---

## Input Validation & Sanitization

### Sanitization Function

All Edge Functions use a standardized `sanitizeString()` function:

```typescript
function sanitizeString(str: string): string {
  if (typeof str !== 'string') return str;
  return str.trim()
    .replace(/[<>\"'`]/g, '')        // Remove XSS injection chars
    .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
    .substring(0, 500);               // Max length: 500 chars
}
```

### Email Validation

```typescript
function isValidEmail(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  const emailRegex = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;
  return emailRegex.test(email.trim().toLowerCase());
}
```

### Data Normalization Rules

| Field Type | Normalization | Example |
|-----------|---------------|---------|
| Name | Uppercase + Sanitize | "Juan García" → "JUAN GARCIA" |
| Apellidos | Uppercase + Sanitize | "Pérez López" → "PEREZ LOPEZ" |
| DNI | Uppercase + Sanitize | "12345678a" → "12345678A" |
| Email | Lowercase + Sanitize | "User@Example.COM" → "user@example.com" |
| Address | Uppercase + Sanitize | "calle mayor 5" → "CALLE MAYOR 5" |
| Phone | Sanitize only | "+34 600 123 456" → "+34 600 123 456" |

---

## Authentication & Authorization

### JWT Token Validation

All Edge Functions validate JWT tokens using Supabase Auth:

```typescript
const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
if (userErr || !userData?.user) {
  return jsonResponse(401, { error: 'Invalid or expired token' }, origin || '*');
}
```

### Email Confirmation Check

Critical operations require verified email addresses:

```typescript
if (!userData.user.email_confirmed_at && !userData.user.confirmed_at) {
  return jsonResponse(403, { 
    error: 'Email not confirmed. Please verify your email.' 
  }, origin || '*');
}
```

### Role-Based Access Control

Admin/owner-only functions (e.g., `normalize-clients`):

```typescript
const userRole = await getUserRole(authUserId, companyId);
if (!['admin', 'owner'].includes(userRole)) {
  return jsonResponse(403, { 
    error: 'Insufficient permissions. Admin or owner role required.' 
  }, origin || '*');
}
```

---

## Multi-Tenancy Security

### Company Isolation

All operations enforce company-level isolation:

1. **User to Company Mapping:**
   ```typescript
   const { data: appUsers } = await supabaseAdmin
     .from("users")
     .select("company_id")
     .eq("auth_user_id", authUserId)
     .limit(1);
   ```

2. **Enforced Filtering:**
   - All queries include `.eq('company_id', authoritativeCompanyId)`
   - Users cannot access other companies' data
   - Updates verify ownership before modification

3. **RLS Policies:**
   - Database-level row-level security
   - Backup layer if Edge Function checks fail
   - See `ESTADO_ACTUAL_RLS.md` for policy details

---

## Environment Configuration

### Required Environment Variables

#### Supabase Edge Functions

```bash
# Required for all Edge Functions
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...  # KEEP SECRET!

# CORS Configuration
ALLOW_ALL_ORIGINS=false               # Set to 'false' in production
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
```

#### Angular Application

```typescript
// src/environments/environment.prod.ts
export const environment = {
  production: true,
  supabaseUrl: 'https://YOUR_PROJECT.supabase.co',
  supabaseKey: 'eyJhbGc...',  // ANON KEY (safe for client)
  supabaseFunctionsUrl: 'https://YOUR_PROJECT.supabase.co/functions/v1'
};
```

### CORS Security

**Development:**
```bash
ALLOW_ALL_ORIGINS=true
```

**Production:**
```bash
ALLOW_ALL_ORIGINS=false
ALLOWED_ORIGINS=https://yourdomain.com,https://app.yourdomain.com
```

---

## Deployment Checklist

### Pre-Deployment

- [ ] All Edge Functions tested locally with `supabase functions serve`
- [ ] Environment variables configured in Supabase dashboard
- [ ] CORS settings updated for production domain
- [ ] Service Role key secured (never committed to Git)
- [ ] RLS policies reviewed and enabled
- [ ] Angular environment files updated (`environment.prod.ts`)

### Deployment Steps

1. **Deploy Edge Functions:**
   ```bash
   supabase functions deploy upsert-client --project-ref YOUR_REF
   supabase functions deploy normalize-clients --project-ref YOUR_REF
   supabase functions deploy create-address --project-ref YOUR_REF
   supabase functions deploy import-customers --project-ref YOUR_REF
   ```

2. **Verify Environment Variables:**
   ```bash
   supabase secrets list --project-ref YOUR_REF
   ```

3. **Test Edge Functions:**
   ```bash
   # Health check
   curl https://YOUR_PROJECT.supabase.co/functions/v1/upsert-client
   
   # Authenticated request
   curl -X POST 'https://YOUR_PROJECT.supabase.co/functions/v1/upsert-client' \
     -H "Authorization: Bearer YOUR_JWT" \
     -H "Content-Type: application/json" \
     -d '{"p_name":"TEST","p_email":"test@example.com"}'
   ```

4. **Build Angular Application:**
   ```bash
   npm run build --configuration=production
   ```

5. **Deploy Frontend:**
   - Vercel: `vercel --prod`
   - Netlify: `netlify deploy --prod`
   - Firebase: `firebase deploy --only hosting`

### Post-Deployment

- [ ] Test all critical user flows (create/update customers, services, tickets)
- [ ] Verify email confirmation enforcement
- [ ] Test duplicate detection (try creating same email twice)
- [ ] Verify multi-tenancy (users cannot see other companies' data)
- [ ] Monitor Edge Function logs for errors
- [ ] Run security scan (OWASP ZAP, Burp Suite)

---

## Security Testing

### Manual Testing

1. **XSS Prevention:**
   ```bash
   # Try injecting script tags
   curl -X POST 'https://YOUR_PROJECT.supabase.co/functions/v1/upsert-client' \
     -H "Authorization: Bearer YOUR_JWT" \
     -d '{"p_name":"<script>alert(1)</script>","p_email":"test@test.com"}'
   
   # Expected: Input sanitized, script tags removed
   ```

2. **SQL Injection Prevention:**
   ```bash
   # Try SQL injection in email
   curl -X POST 'https://YOUR_PROJECT.supabase.co/functions/v1/upsert-client' \
     -H "Authorization: Bearer YOUR_JWT" \
     -d '{"p_name":"Test","p_email":"test@test.com'; DROP TABLE clients;--"}'
   
   # Expected: Email validation fails (invalid format)
   ```

3. **Multi-Tenancy Violation:**
   ```bash
   # Try updating a client from another company
   curl -X POST 'https://YOUR_PROJECT.supabase.co/functions/v1/upsert-client' \
     -H "Authorization: Bearer YOUR_JWT" \
     -d '{"p_id":"other-company-client-id","p_name":"Hacked"}'
   
   # Expected: 404 Not Found or 403 Forbidden
   ```

4. **Email Confirmation Bypass:**
   ```bash
   # Try creating client with unconfirmed account
   # Expected: 403 Forbidden with "Email not confirmed" message
   ```

### Automated Testing

**OWASP ZAP:**
```bash
# Install OWASP ZAP
docker run -v $(pwd):/zap/wrk/:rw -t owasp/zap2docker-stable zap-baseline.py \
  -t https://yourdomain.com -r zap-report.html
```

**Postman Collection:**
- Import `SECURITY_TESTS.postman_collection.json` (create this)
- Run automated tests for all Edge Functions
- Verify response codes and sanitization

---

## Incident Response

### Security Breach Protocol

1. **Immediate Actions:**
   - Rotate Service Role key in Supabase dashboard
   - Invalidate all user sessions (force re-login)
   - Disable affected Edge Functions
   - Enable maintenance mode on frontend

2. **Investigation:**
   - Review Edge Function logs for anomalous activity
   - Check database audit logs
   - Identify affected user accounts
   - Document timeline of events

3. **Remediation:**
   - Patch identified vulnerability
   - Deploy security fix
   - Notify affected users (if PII compromised)
   - Update security documentation

4. **Post-Incident:**
   - Conduct root cause analysis
   - Update security policies
   - Implement additional monitoring
   - Schedule security training

### Monitoring & Logging

**Edge Function Logs:**
```bash
supabase functions logs upsert-client --project-ref YOUR_REF
```

**Database Logs:**
```sql
-- Check failed login attempts
SELECT * FROM auth.audit_log_entries 
WHERE created_at > NOW() - INTERVAL '1 hour'
AND payload->>'action' = 'login'
AND payload->>'error' IS NOT NULL;
```

**Alerts (Planned):**
- [ ] Set up Sentry for error tracking
- [ ] Configure alerts for failed authentication (>10/min)
- [ ] Monitor Edge Function error rates
- [ ] Set up uptime monitoring (UptimeRobot, Pingdom)

---

## Compliance & Data Protection

### GDPR Compliance

- ✅ User data minimization (only collect necessary fields)
- ✅ Right to access (users can view their data)
- ✅ Right to deletion (delete account functionality)
- ✅ Data portability (export to JSON/CSV)
- ✅ Consent management (privacy policy acceptance)
- ⏳ Data retention policies (implement automatic cleanup)

See `GDPR_COMPLIANCE_GUIDE.md` for full details.

### Spanish Hacienda Compliance

- ✅ Uppercase normalization for official documents
- ✅ DNI/NIF validation and formatting
- ✅ Address standardization
- ✅ Audit trail for customer data changes

---

## Planned Security Enhancements

### Short-Term (Next Sprint)

- [ ] Implement rate limiting on Edge Functions (100 req/min per IP)
- [ ] Add request signing for Edge Function calls
- [ ] Implement CSRF protection tokens
- [ ] Add honeypot fields to forms
- [ ] Set up automated security scanning (weekly)

### Medium-Term (Next Quarter)

- [ ] Implement two-factor authentication (2FA)
- [ ] Add IP whitelisting for admin operations
- [ ] Implement advanced anomaly detection
- [ ] Add web application firewall (WAF)
- [ ] Conduct third-party security audit

### Long-Term (6-12 Months)

- [ ] ISO 27001 certification
- [ ] SOC 2 Type II compliance
- [ ] Bug bounty program
- [ ] Penetration testing (annual)

---

## Contact

**Security Concerns:** Report to security@yourdomain.com  
**Documentation Updates:** Submit PR to this repository  
**Last Reviewed:** 2025-10-06

---

**End of Security Documentation**
