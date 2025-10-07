#!/bin/bash
# CSRF Protection Testing Script
# Tests the complete CSRF flow: token generation, validation, and retry logic

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
SUPABASE_URL="${SUPABASE_URL:-YOUR_SUPABASE_PROJECT_URL}"
JWT_TOKEN="${JWT_TOKEN:-YOUR_JWT_TOKEN}"

echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}  CSRF Protection Testing Suite${NC}"
echo -e "${YELLOW}========================================${NC}"
echo ""

# Check prerequisites
if [ "$SUPABASE_URL" = "YOUR_SUPABASE_PROJECT_URL" ]; then
    echo -e "${RED}❌ Error: SUPABASE_URL not set${NC}"
    echo "Usage: SUPABASE_URL=https://xxx.supabase.co JWT_TOKEN=eyJhbG... ./test-csrf.sh"
    exit 1
fi

if [ "$JWT_TOKEN" = "YOUR_JWT_TOKEN" ]; then
    echo -e "${RED}❌ Error: JWT_TOKEN not set${NC}"
    echo "Usage: SUPABASE_URL=https://xxx.supabase.co JWT_TOKEN=eyJhbG... ./test-csrf.sh"
    exit 1
fi

echo -e "${YELLOW}Testing against:${NC} $SUPABASE_URL"
echo ""

# Test 1: Get CSRF Token
echo -e "${YELLOW}Test 1: Fetch CSRF Token${NC}"
CSRF_RESPONSE=$(curl -s -X GET \
  "${SUPABASE_URL}/functions/v1/get-csrf-token" \
  -H "Authorization: Bearer ${JWT_TOKEN}")

CSRF_TOKEN=$(echo $CSRF_RESPONSE | jq -r '.csrfToken')
EXPIRES_IN=$(echo $CSRF_RESPONSE | jq -r '.expiresIn')

if [ "$CSRF_TOKEN" != "null" ] && [ "$CSRF_TOKEN" != "" ]; then
    echo -e "${GREEN}✅ CSRF token fetched successfully${NC}"
    echo "   Token: ${CSRF_TOKEN:0:50}..."
    echo "   Expires in: ${EXPIRES_IN}ms ($(($EXPIRES_IN / 1000 / 60)) minutes)"
else
    echo -e "${RED}❌ Failed to fetch CSRF token${NC}"
    echo "   Response: $CSRF_RESPONSE"
    exit 1
fi
echo ""

# Test 2: Rate Limiting on CSRF Endpoint
echo -e "${YELLOW}Test 2: Rate Limiting (should see headers)${NC}"
RATE_LIMIT_RESPONSE=$(curl -s -i -X GET \
  "${SUPABASE_URL}/functions/v1/get-csrf-token" \
  -H "Authorization: Bearer ${JWT_TOKEN}")

RATE_LIMIT=$(echo "$RATE_LIMIT_RESPONSE" | grep -i "x-ratelimit-limit:" | cut -d' ' -f2 | tr -d '\r\n')
RATE_REMAINING=$(echo "$RATE_LIMIT_RESPONSE" | grep -i "x-ratelimit-remaining:" | cut -d' ' -f2 | tr -d '\r\n')

if [ ! -z "$RATE_LIMIT" ]; then
    echo -e "${GREEN}✅ Rate limiting headers present${NC}"
    echo "   Limit: $RATE_LIMIT requests/min"
    echo "   Remaining: $RATE_REMAINING"
else
    echo -e "${YELLOW}⚠️  Rate limit headers not found (may not be implemented yet)${NC}"
fi
echo ""

# Test 3: Use CSRF Token in Request
echo -e "${YELLOW}Test 3: Upsert Client with CSRF Token${NC}"
UPSERT_RESPONSE=$(curl -s -X POST \
  "${SUPABASE_URL}/functions/v1/upsert-client" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -H "X-CSRF-Token: ${CSRF_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "name": "Test",
    "apellidos": "User"
  }')

ERROR=$(echo $UPSERT_RESPONSE | jq -r '.error // empty')

if [ -z "$ERROR" ]; then
    echo -e "${GREEN}✅ Request with CSRF token accepted${NC}"
    echo "   Response: $UPSERT_RESPONSE" | head -c 100
else
    # Check if it's a CSRF error or other error
    if echo "$ERROR" | grep -q -i "csrf"; then
        echo -e "${RED}❌ CSRF validation failed (token may be invalid)${NC}"
        echo "   Error: $ERROR"
        exit 1
    else
        echo -e "${YELLOW}⚠️  Request failed (but not due to CSRF)${NC}"
        echo "   Error: $ERROR"
    fi
fi
echo ""

# Test 4: Request WITHOUT CSRF Token (should fail if validation is enabled)
echo -e "${YELLOW}Test 4: Request WITHOUT CSRF Token (should fail if validation enabled)${NC}"
NO_CSRF_RESPONSE=$(curl -s -X POST \
  "${SUPABASE_URL}/functions/v1/upsert-client" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test2@example.com",
    "name": "Test",
    "apellidos": "User"
  }')

NO_CSRF_ERROR=$(echo $NO_CSRF_RESPONSE | jq -r '.error // empty')

if [ ! -z "$NO_CSRF_ERROR" ] && echo "$NO_CSRF_ERROR" | grep -q -i "csrf"; then
    echo -e "${GREEN}✅ Request without CSRF token rejected (validation working)${NC}"
    echo "   Error: $NO_CSRF_ERROR"
else
    echo -e "${YELLOW}⚠️  CSRF validation not enforced yet (backend needs update)${NC}"
    echo "   Response: $NO_CSRF_RESPONSE" | head -c 100
fi
echo ""

# Test 5: Invalid CSRF Token (should fail)
echo -e "${YELLOW}Test 5: Request with INVALID CSRF Token${NC}"
INVALID_RESPONSE=$(curl -s -X POST \
  "${SUPABASE_URL}/functions/v1/upsert-client" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -H "X-CSRF-Token: INVALID_TOKEN_12345" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test3@example.com",
    "name": "Test",
    "apellidos": "User"
  }')

INVALID_ERROR=$(echo $INVALID_RESPONSE | jq -r '.error // empty')

if [ ! -z "$INVALID_ERROR" ] && echo "$INVALID_ERROR" | grep -q -i "csrf"; then
    echo -e "${GREEN}✅ Invalid CSRF token rejected${NC}"
    echo "   Error: $INVALID_ERROR"
else
    echo -e "${YELLOW}⚠️  CSRF validation not enforced for invalid tokens${NC}"
    echo "   Response: $INVALID_RESPONSE" | head -c 100
fi
echo ""

# Test 6: Rate Limiting Exhaustion (101+ requests should get 429)
echo -e "${YELLOW}Test 6: Rate Limiting Exhaustion (this will take ~1 minute)${NC}"
echo -e "${YELLOW}   Sending 105 requests to test rate limit...${NC}"

RATE_LIMIT_HIT=0
for i in {1..105}; do
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X GET \
      "${SUPABASE_URL}/functions/v1/get-csrf-token" \
      -H "Authorization: Bearer ${JWT_TOKEN}")
    
    if [ "$STATUS" = "429" ]; then
        RATE_LIMIT_HIT=1
        echo -e "${GREEN}✅ Rate limit hit at request #$i (429 Too Many Requests)${NC}"
        break
    fi
    
    # Progress indicator
    if [ $((i % 10)) -eq 0 ]; then
        echo "   Progress: $i/105 requests..."
    fi
done

if [ $RATE_LIMIT_HIT -eq 0 ]; then
    echo -e "${YELLOW}⚠️  Rate limit not enforced (sent 105 requests, none returned 429)${NC}"
fi
echo ""

# Summary
echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}  Test Summary${NC}"
echo -e "${YELLOW}========================================${NC}"
echo ""
echo -e "${GREEN}✅ Tests completed!${NC}"
echo ""
echo "Next steps:"
echo "1. If CSRF validation warnings appeared, update Edge Functions to validate tokens"
echo "2. If rate limiting warnings appeared, verify rate limiter is deployed"
echo "3. Monitor logs: supabase functions logs get-csrf-token"
echo "4. Monitor logs: supabase functions logs upsert-client"
echo ""
