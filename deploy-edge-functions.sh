#!/bin/bash
# ================================================================
# Deploy Edge Functions to Supabase (corregidas para RLS)
# ================================================================
# Fecha: 2025-10-07
# Uso: ./deploy-edge-functions.sh
# ================================================================

set -e  # Exit on error

echo "🚀 Deploying Edge Functions to Supabase..."
echo ""

# Check if supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI not found!"
    echo "📦 Install it with: npm install -g supabase"
    echo "📖 Or visit: https://supabase.com/docs/guides/cli"
    exit 1
fi

echo "✅ Supabase CLI found"
echo ""

# Check if logged in
if ! supabase projects list &> /dev/null; then
    echo "❌ Not logged in to Supabase!"
    echo "🔑 Run: supabase login"
    exit 1
fi

echo "✅ Logged in to Supabase"
echo ""

echo "📦 Deploying Edge Functions (invoices/verifactu)..."

# Ensure functions exist in supabase/functions (we keep sources in supabase/edge-functions too)

set -e

# Deploy invoices-pdf (JWT required; OPTIONS handled inside)
if [ -d "supabase/functions/invoices-pdf" ]; then
    echo "➡️  Deploying invoices-pdf..."
    (cd supabase/functions/invoices-pdf && supabase functions deploy invoices-pdf)
else
    echo "⚠️  Directory supabase/functions/invoices-pdf not found"
fi

# Deploy invoices-email (JWT required; OPTIONS handled inside)
if [ -d "supabase/functions/invoices-email" ]; then
    echo "➡️  Deploying invoices-email..."
    (cd supabase/functions/invoices-email && supabase functions deploy invoices-email)
else
    echo "⚠️  Directory supabase/functions/invoices-email not found"
fi

# Deploy verifactu-dispatcher (JWT not required for config/health/retry, but OPTIONS handled)
if [ -d "supabase/functions/verifactu-dispatcher" ]; then
    echo "➡️  Deploying verifactu-dispatcher..."
    (cd supabase/functions/verifactu-dispatcher && supabase functions deploy verifactu-dispatcher)
else
    echo "⚠️  Directory supabase/functions/verifactu-dispatcher not found"
fi

echo ""
echo "✅ Edge Functions deployed successfully!"
echo ""
echo "🧪 Test it with:"
echo "   1. Open your app"
echo "   2. Try to create a new client"
echo "   3. Check browser console for errors"
echo ""
echo "📊 View logs in Supabase Dashboard:"
echo "   Dashboard → Edge Functions → upsert-client → Logs"
echo ""
echo "🎉 Done!"
