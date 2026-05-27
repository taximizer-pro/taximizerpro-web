#!/bin/bash
# Refresh all OAuth tokens and push directly to Render env vars
# Runs every 50 min via automation — keeps Render live forever

RENDER_KEY="rnd_o8cFlcbCM5bpVQifpFMtMmuuqoun"
SVC_ID="srv-d8b7hkul51nc739ehve0"

DRIVE="${GOOGLEDRIVE_ACCESS_TOKEN}"
GMAIL="${GMAIL_ACCESS_TOKEN}"
GH="${GITHUB_ACCESS_TOKEN}"

if [[ -z "$DRIVE" || -z "$GMAIL" ]]; then
  echo "❌ Missing tokens — connectors not authorized"
  exit 1
fi

RESULT=$(curl -s -X PUT "https://api.render.com/v1/services/$SVC_ID/env-vars" \
  -H "Authorization: Bearer $RENDER_KEY" \
  -H "Content-Type: application/json" \
  -d "[
    {\"key\":\"DRIVE_ACCESS_TOKEN\",\"value\":\"$DRIVE\"},
    {\"key\":\"GMAIL_ACCESS_TOKEN_RENDER\",\"value\":\"$GMAIL\"},
    {\"key\":\"GITHUB_ACCESS_TOKEN_RENDER\",\"value\":\"$GH\"}
  ]")

COUNT=$(echo "$RESULT" | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d) if isinstance(d,list) else 0)" 2>/dev/null)

if [[ "$COUNT" == "3" ]]; then
  echo "✅ All 3 tokens pushed to Render successfully"
else
  echo "⚠️ Render push response: $RESULT" | head -c 200
fi
