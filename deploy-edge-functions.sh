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

# Deploy specific function (upsert-client)
echo "📦 Deploying upsert-client (RLS-compatible)..."
cd supabase/functions/upsert-client
supabase functions deploy upsert-client --no-verify-jwt
cd ../../..

echo ""
echo "✅ Edge Function deployed successfully!"
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
