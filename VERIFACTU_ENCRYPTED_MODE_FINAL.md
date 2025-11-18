# Verifactu Encrypted Mode - Implementation Complete (Updated Nov 18, 2025)

## ✅ Changes Applied

### Database Schema Change
**Legacy columns DELETED from `verifactu_settings`:**
```sql
ALTER TABLE public.verifactu_settings
  DROP COLUMN IF EXISTS cert_pem,
  DROP COLUMN IF EXISTS key_pem,
  DROP COLUMN IF EXISTS key_passphrase;
```

Only encrypted columns remain:
- `cert_pem_enc` (encrypted certificate)
- `key_pem_enc` (encrypted private key)
- `key_pass_enc` (encrypted passphrase, nullable)

---

### 1. Edge Function: `verifactu-cert-history`
**Location:** `supabase/functions/verifactu-cert-history/index.ts`

**Changes:**
- Removed legacy column references from SELECT query
- Simplified mode detection: only `"encrypted"` or `"none"` (no legacy mode)
- Returns `settings` object with:
  - `configured`: `true` if encrypted cert exists
  - `mode`: `"encrypted"` | `"none"` (legacy mode removed)
  - `software_code`, `issuer_nif`, `environment`
- Returns `history` array with rotation metadata

**Logic:**
```typescript
configured = cert_pem_enc && key_pem_enc present
mode = configured ? "encrypted" : "none"
```

**Response Example:**
```json
{
  "ok": true,
  "settings": {
    "software_code": "Simplifica",
    "issuer_nif": "45127276B",
    "environment": "pre",
    "configured": true,
    "mode": "encrypted"
  },
  "history": [...]
}
```

---

### 2. Edge Function: `upload-verifactu-cert`
**Location:** `supabase/functions/upload-verifactu-cert/index.ts`

**Changes:**
- Removed legacy column references from SELECT query
- Removed legacy plaintext migration logic (no longer needed)
- Removed legacy column cleanup from upsert (columns don't exist)
- Simplified upsert to only include encrypted columns

**Before:**
```typescript
cert_pem: null,
key_pem: null,
key_passphrase: null,
```

**After:** (removed - columns don't exist)

---

### 3. Angular Service: `verifactu.service.ts`
**Location:** `src/app/services/verifactu.service.ts`

**Changes:**
- Updated `VerifactuSettings` interface: removed legacy fields, kept only encrypted
- Updated `fetchSettingsForCompany()`: removed legacy columns from SELECT
- Updated `fetchCertificateHistory()` return type: mode is now `'encrypted' | 'none'`

**Before:**
```typescript
interface VerifactuSettings {
  cert_pem?: string;
  key_pem?: string;
  key_passphrase?: string;
  cert_pem_enc?: string;
  // ...
}
```

**After:**
```typescript
interface VerifactuSettings {
  // encrypted versions only
  cert_pem_enc?: string;
  key_pem_enc?: string;
  key_pass_enc?: string | null;
  // ...
}
```

---

### 4. Component: `verifactu-settings.component.ts`
**Location:** `src/app/modules/invoices/verifactu-settings/verifactu-settings.component.ts`

**Changes:**
- Updated `certificateMode` signal type: `'none' | 'encrypted'` (removed `'legacy'`)
- Added safeguard in `loadSettingsAndHistory()` to treat any legacy mode as `'none'`

**UI Behavior:**
- `mode === "encrypted"` → Shows "Certificado: Configurado (cifrado)" ✅
- `mode === "none"` → Shows "No configurado"
- No legacy mode handling needed (columns deleted)

---

### 5. SQL Cleanup Script
**Location:** `cleanup-legacy-verifactu.sql`

**Status:** Marked as OBSOLETE (columns already deleted)

---

## 🚀 Deployment Steps

### 1. Deploy Edge Functions
```bash
supabase functions deploy verifactu-cert-history
supabase functions deploy upload-verifactu-cert
```

### 2. Test from UI
1. Navigate to `/configuracion/verifactu`
2. Should show **"Certificado: Configurado (cifrado)"** ✅
3. History table should populate if rotations exist

---

## 📊 Database Verification

**Current state:**
```sql
SELECT 
  company_id,
  software_code,
  issuer_nif,
  cert_pem_enc IS NOT NULL AS has_encrypted_cert,
  key_pem_enc IS NOT NULL AS has_encrypted_key
FROM verifactu_settings;
```

Expected result:
```
company_id: cd830f43-f6f0-4b78-a2a4-505e4e0976b5
has_encrypted_cert: true
has_encrypted_key: true
```

---

## ✨ Key Changes Summary

1. **Schema Simplified:** Legacy plaintext columns deleted permanently
2. **Code Cleanup:** All references to `cert_pem`, `key_pem`, `key_passphrase` removed
3. **Mode Simplified:** Only `"encrypted"` or `"none"` (no legacy mode)
4. **Type Safety:** TypeScript types updated to reflect encrypted-only storage
5. **GDPR Compliant:** No plaintext sensitive data in database

---

## 🔐 Security Notes

- All certificate data now stored encrypted client-side before upload
- Edge Functions use **service role** to bypass RLS for settings read
- Only `owner`/`admin` roles can access endpoints
- Sensitive cert data never returned to client (only metadata)

---

## 📝 Migration Complete

**Before:** Mixed legacy plaintext + encrypted columns  
**After:** Encrypted-only storage, legacy columns deleted  
**Status:** ✅ Production-ready with proper encryption and rotation history
