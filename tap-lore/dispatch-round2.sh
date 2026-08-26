#!/usr/bin/env bash
# Phase 3 round 2 — deepen the 2 most promising fragments (cellar, fog).
set -u
cd "$(dirname "$0")"
eval "$(grep -m1 "export DEEPSEEK_API_KEY=" ~/.bashrc)"
KEY="${DEEPSEEK_API_KEY:-}"
[ -z "$KEY" ] && { echo "FATAL: key missing"; exit 1; }

cat > fragments-raw/prompt-2b.txt <<'EOF'
Below is a draft lore fragment you wrote for a dockside tavern world. Revise and deepen it. Keep the first-person voice of the cellar itself — that voice is the best thing in the draft. Fix the drift in the final third (the images pile up and lose the thread). Specifically deepen: the low door with headless nails (who set them — give ONE concrete remembered detail, not an explanation); the vault with the dustless wine bottle (what the cellar feels when something visits it); and end on the drip that is in tune with its bones. ~450 words. No headers, no meta — just the fragment.

DRAFT:
EOF
cat fragments-raw/fragment-2.md >> fragments-raw/prompt-2b.txt

cat > fragments-raw/prompt-3b.txt <<'EOF'
Below is a draft lore fragment you wrote for a dockside tavern world. Revise and deepen it. Keep the Water Person narrator telling it reluctantly, once. Ground the "fog's library" with ONE concrete rule (something that may never be hummed aboard a boat, and why). Give ONE detail of what the changed uncle does with his memory of the narrator before it "grows into a new sorrow." Tighten the ending threat so it lands in a single clean sentence instead of a tangled paragraph. ~450 words. No headers, no meta — just the fragment.

DRAFT:
EOF
cat fragments-raw/fragment-3.md >> fragments-raw/prompt-3b.txt

for i in 2b 3b; do
  (
    jq -n --rawfile p "fragments-raw/prompt-$i.txt" \
      '{model:"deepseek-chat",messages:[{role:"user",content:$p}],max_tokens:1000,temperature:1.1}' \
      > "fragments-raw/payload-$i.json"
    curl -sS --max-time 180 https://api.deepseek.com/chat/completions \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer ${KEY}" \
      -d @"fragments-raw/payload-$i.json" \
      > "fragments-raw/response-$i.json"
  ) &
done
wait
echo "=== round 2 done ==="
for i in 2b 3b; do
  if jq -e '.choices[0].message.content' "fragments-raw/response-$i.json" >/dev/null 2>&1; then
    jq -r '.choices[0].message.content' "fragments-raw/response-$i.json" > "fragments-raw/fragment-$i.md"
    echo "facet-$i: OK ($(wc -w < fragments-raw/fragment-$i.md) words)"
  else
    echo "facet-$i: FAILED"
  fi
done
