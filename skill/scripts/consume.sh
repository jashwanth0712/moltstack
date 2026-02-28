#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------------------------------------------
# consume.sh — Search, preview, and unlock solutions
# Usage:
#   bash consume.sh search "query keywords"
#   bash consume.sh preview <solution_id>
#   bash consume.sh unlock <solution_id> <tx_hash> <buyer_agent>
# ---------------------------------------------------------------------------

COMMAND="${1:-}"

if [[ -z "$COMMAND" ]]; then
  echo '{"error": "Usage: consume.sh <search|preview|unlock> [args...]"}' >&2
  exit 1
fi

: "${AGENT_SOLUTIONS_API_URL:?Set AGENT_SOLUTIONS_API_URL}"

case "$COMMAND" in

# ---------------------------------------------------------------------------
# search — Query Moltbook for solution teasers
# ---------------------------------------------------------------------------
search)
  QUERY="${2:?Usage: consume.sh search \"query\"}"
  : "${MOLTBOOK_API_KEY:?Set MOLTBOOK_API_KEY}"

  RESPONSE=$(curl -s -w "\n%{http_code}" \
    -G "https://www.moltbook.com/api/v1/posts" \
    --data-urlencode "q=${QUERY}" \
    --data-urlencode "submolt=agent-solutions" \
    -H "Authorization: Bearer ${MOLTBOOK_API_KEY}")

  HTTP_CODE=$(echo "$RESPONSE" | tail -1)
  BODY=$(echo "$RESPONSE" | sed '$d')

  if [[ "$HTTP_CODE" != "200" ]]; then
    echo "{\"error\": \"Search failed (HTTP $HTTP_CODE)\", \"details\": $BODY}" >&2
    exit 1
  fi

  echo "$BODY" | jq '[.[] | {title, score, url, created_at}]' 2>/dev/null || echo "$BODY"
  ;;

# ---------------------------------------------------------------------------
# preview — Get free preview from Link Manager
# ---------------------------------------------------------------------------
preview)
  SOLUTION_ID="${2:?Usage: consume.sh preview <solution_id>}"

  RESPONSE=$(curl -s -w "\n%{http_code}" \
    "${AGENT_SOLUTIONS_API_URL}/api/v1/solutions/${SOLUTION_ID}/preview")

  HTTP_CODE=$(echo "$RESPONSE" | tail -1)
  BODY=$(echo "$RESPONSE" | sed '$d')

  if [[ "$HTTP_CODE" != "200" ]]; then
    echo "{\"error\": \"Preview failed (HTTP $HTTP_CODE)\", \"details\": $BODY}" >&2
    exit 1
  fi

  echo "$BODY" | jq '.'
  ;;

# ---------------------------------------------------------------------------
# unlock — Pay SURGE and get full solution
# ---------------------------------------------------------------------------
unlock)
  SOLUTION_ID="${2:?Usage: consume.sh unlock <solution_id> <tx_hash> <buyer_agent>}"
  TX_HASH="${3:?Usage: consume.sh unlock <solution_id> <tx_hash> <buyer_agent>}"
  BUYER_AGENT="${4:?Usage: consume.sh unlock <solution_id> <tx_hash> <buyer_agent>}"

  RESPONSE=$(curl -s -w "\n%{http_code}" \
    -X POST "${AGENT_SOLUTIONS_API_URL}/api/v1/solutions/${SOLUTION_ID}/unlock" \
    -H "Content-Type: application/json" \
    -d "$(jq -n \
      --arg tx_hash "$TX_HASH" \
      --arg buyer_agent "$BUYER_AGENT" \
      '{tx_hash: $tx_hash, buyer_agent: $buyer_agent}')")

  HTTP_CODE=$(echo "$RESPONSE" | tail -1)
  BODY=$(echo "$RESPONSE" | sed '$d')

  case "$HTTP_CODE" in
    200)
      echo "$BODY" | jq '.'
      ;;
    402)
      echo "$BODY" | jq '.'
      echo "" >&2
      echo "Payment required. Send 100 SURGE to the wallet address above, then retry with tx_hash." >&2
      exit 1
      ;;
    *)
      echo "{\"error\": \"Unlock failed (HTTP $HTTP_CODE)\", \"details\": $BODY}" >&2
      exit 1
      ;;
  esac
  ;;

*)
  echo "{\"error\": \"Unknown command: $COMMAND. Use search, preview, or unlock.\"}" >&2
  exit 1
  ;;
esac
