#!/bin/bash
# Test local booking-public BFF
# Usage: bash test-local-bff.sh [slug]

SLUG="${1:-caibs}"
API_KEY=$(grep "^BOOKING_API_KEY=" .env | cut -d'=' -f2-)

echo "Testing /services?slug=$SLUG"
curl -sv "http://localhost:54321/functions/v1/booking-public/services?slug=$SLUG" \
  -H "x-api-key: $API_KEY" \
  -H "x-client-id: reservas-frontend-v1" 2>&1
