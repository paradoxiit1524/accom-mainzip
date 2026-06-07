#!/bin/bash
echo "Triggering seed on Railway backend..."
RESULT=$(curl -s -X POST https://iitm-accom.up.railway.app/api/admin/seed-init \
  -H "Content-Type: application/json" \
  -H "x-seed-key: campusops-seed-init-2024" \
  -d '{}')
echo "Response: $RESULT"

if echo "$RESULT" | grep -q '"success":true'; then
  echo ""
  echo "✓ Railway DB seeded successfully!"
  echo ""
  echo "Demo accounts (password: 123456):"
  echo "  superadmin@iitm.ac.in"
  echo "  admin@iitm.ac.in"
  echo "  coordinator@iitm.ac.in"
  echo "  volunteer@iitm.ac.in"
  echo "  student@iitm.ac.in"
  echo ""
  echo "Live backend: https://iitm-accom.up.railway.app"
else
  echo ""
  echo "✗ Seed failed or Railway hasn't redeployed yet."
  echo "  Wait 2 more minutes and try again."
fi
