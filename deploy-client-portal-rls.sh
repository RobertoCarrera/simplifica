#!/bin/bash

# ============================================================================
# DEPLOY CLIENT PORTAL RLS POLICIES TO PRODUCTION
# ============================================================================
# Este script despliega las políticas RLS para el portal de clientes
# a la base de datos de producción en Supabase.
# ============================================================================

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Supabase connection details
SUPABASE_PROJECT_ID="ufutyjbqfjrlzkprvyvs"
SUPABASE_HOST="db.${SUPABASE_PROJECT_ID}.supabase.co"
SUPABASE_USER="postgres"
SUPABASE_DB="postgres"

echo -e "${BLUE}============================================================================${NC}"
echo -e "${BLUE}  CLIENT PORTAL RLS POLICIES DEPLOYMENT${NC}"
echo -e "${BLUE}============================================================================${NC}"
echo ""

# Check if required files exist
if [ ! -f "rls-client-portal-policies.sql" ]; then
    echo -e "${RED}❌ ERROR: rls-client-portal-policies.sql not found!${NC}"
    echo "Please make sure you're in the project root directory."
    exit 1
fi

if [ ! -f "verify-client-portal-security.sql" ]; then
    echo -e "${RED}❌ ERROR: verify-client-portal-security.sql not found!${NC}"
    echo "Please make sure you're in the project root directory."
    exit 1
fi

echo -e "${YELLOW}⚠️  WARNING: This will modify the production database!${NC}"
echo ""
echo "Connection details:"
echo "  Host: ${SUPABASE_HOST}"
echo "  User: ${SUPABASE_USER}"
echo "  Database: ${SUPABASE_DB}"
echo ""
read -p "Do you want to continue? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo -e "${YELLOW}Deployment cancelled.${NC}"
    exit 0
fi

echo ""
echo -e "${BLUE}Step 1: Applying RLS policies...${NC}"
echo "----------------------------------------"

# Apply RLS policies
psql -h "$SUPABASE_HOST" \
     -U "$SUPABASE_USER" \
     -d "$SUPABASE_DB" \
     -f rls-client-portal-policies.sql

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ RLS policies applied successfully!${NC}"
else
    echo -e "${RED}❌ ERROR: Failed to apply RLS policies.${NC}"
    exit 1
fi

echo ""
echo -e "${BLUE}Step 2: Verifying security configuration...${NC}"
echo "----------------------------------------"

# Run verification script
psql -h "$SUPABASE_HOST" \
     -U "$SUPABASE_USER" \
     -d "$SUPABASE_DB" \
     -f verify-client-portal-security.sql

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Security verification completed!${NC}"
else
    echo -e "${YELLOW}⚠️  WARNING: Security verification had warnings.${NC}"
    echo "Please review the output above."
fi

echo ""
echo -e "${BLUE}============================================================================${NC}"
echo -e "${GREEN}✅ DEPLOYMENT COMPLETED SUCCESSFULLY!${NC}"
echo -e "${BLUE}============================================================================${NC}"
echo ""
echo "Next steps:"
echo "  1. Review the verification output above"
echo "  2. Test the client portal with a test user"
echo "  3. Verify data isolation (client can only see their own data)"
echo "  4. Check that guards prevent unauthorized access"
echo ""
echo "Test user:"
echo "  Email: puchu_114@hotmail.com"
echo "  Name: Gemma Socias Lahoz"
echo "  Role: client"
echo ""
echo -e "${YELLOW}📝 Remember to document any issues found during testing!${NC}"
echo ""
