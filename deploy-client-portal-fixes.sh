#!/bin/bash
# Deploy client portal fixes
# Fixes for error 406 and 403 when accessing client portal

set -e

echo "🚀 Deploying Client Portal Fixes..."

# Get Supabase credentials from environment or .env
if [ -f .env ]; then
  source .env
fi

# Check required environment variables
if [ -z "$SUPABASE_PROJECT_ID" ] || [ -z "$SUPABASE_DB_PASSWORD" ]; then
  echo "❌ Error: SUPABASE_PROJECT_ID and SUPABASE_DB_PASSWORD must be set"
  echo "Please set them in .env file or environment variables"
  exit 1
fi

echo "📦 Step 1: Deploying edge functions..."
echo "  ├─ custom-access-token"
npx supabase functions deploy custom-access-token --no-verify-jwt

echo "  └─ client-invoices"
npx supabase functions deploy client-invoices --no-verify-jwt

echo ""
echo "🔒 Step 2: Applying RLS policies..."
PGPASSWORD=$SUPABASE_DB_PASSWORD psql \
  -h db.${SUPABASE_PROJECT_ID}.supabase.co \
  -p 5432 \
  -U postgres \
  -d postgres \
  -f rls-client-portal-policies.sql

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📝 Changes applied:"
echo "  • Updated custom-access-token hook to support clients table"
echo "  • Updated client-invoices function to support clients table"
echo "  • Added RLS policy for clients to read their own user record"
echo ""
echo "🧪 Test the changes:"
echo "  1. Login as a client user"
echo "  2. Check that the app loads without 406 errors"
echo "  3. Navigate to Facturas and verify no 403 errors"
echo ""
