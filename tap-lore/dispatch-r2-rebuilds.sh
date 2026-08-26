#!/usr/bin/env bash
# Round 2 (2026-08-26) — two rebuilds + one new starved facet (Q7).
# Actually run inline this round; this script documents the calls 1:1.
#   4b  = Kettle tail, iteration 1  (surviving half + walls + nudge)         -> fragment-4b.md
#   4c  = Kettle tail, iteration 2  (editor's direction: quiet the wonder-   -> fragment-4c.md
#         stack, add the drowning ritual, end on the triple cadence)
#   1b  = Corvan, one surgical pass (rebuild ONLY the final third)           -> fragment-1b.md
#   6   = Q7 buried thing, starved (yard walls only, ledger voice)           -> fragment-6.md
# Final texts assembled editorially into LORE-FRAGMENTS.md (ROUND 2 section):
#   4R = surviving half + 4b's drunk paragraph + 4c remainder (2 micro-trims)
#   1R = r1 setup through the anchor sentence + 1b ending
set -u
cd "$(dirname "$0")"
eval "$(grep -m1 "export DEEPSEEK_API_KEY=" ~/.bashrc)"
KEY="${DEEPSEEK_API_KEY:-}"
[ -z "$KEY" ] && { echo "FATAL: key missing"; exit 1; }

for i in 4b 4c 1b 6; do
  jq -n --rawfile p "fragments-raw/prompt-$i.txt" \
    '{model:"deepseek-chat",messages:[{role:"user",content:$p}],max_tokens:1100,temperature:1.1}' \
    > "fragments-raw/payload-$i.json"
  curl -sS --max-time 180 https://api.deepseek.com/chat/completions \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${KEY}" \
    -d @"fragments-raw/payload-$i.json" \
    > "fragments-raw/response-$i.json"
  jq -e '.choices[0].message.content' "fragments-raw/response-$i.json" >/dev/null 2>&1 \
    && jq -r '.choices[0].message.content' "fragments-raw/response-$i.json" > "fragments-raw/fragment-$i.md" \
    || echo "facet-$i: FAILED"
done
echo "round 2 raw complete; see LORE-FRAGMENTS.md ROUND 2 for verdicts and assembly"
