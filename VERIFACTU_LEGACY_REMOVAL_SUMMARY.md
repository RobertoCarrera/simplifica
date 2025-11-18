# Verifactu: Legacy Columns Removed - Update Summary

## 🗑️ Database Change Applied

```sql
ALTER TABLE public.verifactu_settings
  DROP COLUMN IF EXISTS cert_pem,
  DROP COLUMN IF EXISTS key_pem,
  DROP COLUMN IF EXISTS key_passphrase;
```

**Result:** Only encrypted columns remain (`cert_pem_enc`, `key_pem_enc`, `key_pass_enc`)

---

## ✅ Code Updates Applied

### 1. Edge Function: `verifactu-cert-history`
- ❌ Removed: `cert_pem, key_pem, key_passphrase` from SELECT
- ❌ Removed: Legacy mode detection logic
- ✅ Updated: Mode calculation to only return `"encrypted"` or `"none"`

### 2. Edge Function: `upload-verifactu-cert`
- ❌ Removed: Legacy column references from comments
- ❌ Removed: Legacy plaintext migration logic
- ❌ Removed: `cert_pem: null, key_pem: null, key_passphrase: null` from upsert
- ✅ Simplified: Upsert now only includes encrypted columns

### 3. Angular Service: `verifactu.service.ts`
- ❌ Removed: Legacy fields from `VerifactuSettings` interface
- ❌ Removed: `cert_pem, key_pem, key_passphrase` from SELECT query
- ✅ Updated: Return type to only include `'encrypted' | 'none'` mode

### 4. Component: `verifactu-settings.component.ts`
- ❌ Removed: `'legacy'` from `certificateMode` type
- ✅ Added: Safeguard to treat any legacy mode as `'none'`

### 5. SQL Cleanup Script: `cleanup-legacy-verifactu.sql`
- ✅ Marked as OBSOLETE (columns already deleted)

---

## 🔍 Verification

**No legacy column references found in:**
- ✅ TypeScript files (`.ts`)
- ✅ Edge Functions
- ✅ Angular services
- ✅ Components

**Database state:**
```json
{
  "company_id": "cd830f43-f6f0-4b78-a2a4-505e4e0976b5",
  "software_code": "Simplifica",
  "issuer_nif": "45127276B",
  "environment": "pre",
  "cert_pem_enc": "3k5HspXFu37ureNsb++ign...", // ✅ Present
  "key_pem_enc": "XNJdIoc8VqeyslxUql9HeC...", // ✅ Present
  "key_pass_enc": "j+w4rF5Xu4l932vtgRKEU1..." // ✅ Present
}
```

---

## 🚀 Next Steps

### 1. Deploy Edge Functions
```bash
supabase functions deploy verifactu-cert-history
supabase functions deploy upload-verifactu-cert
```

### 2. Verify UI
- Navigate to: `/configuracion/verifactu`
- Expected: **"Certificado: Configurado (cifrado)"** ✅

### 3. Test Certificate Upload
- Click "Reemplazar certificado"
- Upload new certificate
- Verify rotation history created

---

## 📋 Testing Checklist

- [ ] Deploy both Edge Functions
- [ ] UI shows "Configurado (cifrado)"
- [ ] No console errors
- [ ] Certificate upload works
- [ ] History table populates
- [ ] No TypeScript compilation errors

---

## 🎯 Summary

**Before:**
- Mixed legacy plaintext + encrypted columns
- Client-side mode detection
- Complex migration logic

**After:**
- ✅ Encrypted-only storage
- ✅ Server-side mode calculation
- ✅ Simplified codebase
- ✅ GDPR compliant (no plaintext)
- ✅ Type-safe (TypeScript updated)

**Status:** 🟢 Ready for deployment
