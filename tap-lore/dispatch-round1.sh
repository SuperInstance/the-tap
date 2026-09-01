#!/usr/bin/env bash
# Phase 2 dispatcher — 5 context-starved GLM facet calls.
# Rewired 2026-08-31: DeepSeek revoked; z.ai GLM via the fleet gateway env.
# Key is read from ~/.config/fleet/gateway.env into env; NEVER printed.
set -u
cd "$(dirname "$0")"

# z.ai key (GLM, fleet gateway env). Falls back to ZAI_API_KEY if exported.
ZAI_KEY="${ZAI_API_KEY:-$(grep -m1 '^FLEET_GATEWAY__PROVIDERS__ZAI__KEYS=' ~/.config/fleet/gateway.env | cut -d= -f2-)}"
[ -z "$ZAI_KEY" ] && { echo "FATAL: key missing"; exit 1; }

mkdir -p fragments-raw

# --- Prompt files: each gets ONLY its facet + 3 walls. Starvation by design. ---
cat > fragments-raw/prompt-1.txt <<'EOF'
You are writing one lore fragment (~400 words of prose) for a dockside tavern world. No headers, no meta-commentary, no questions back — just the fragment itself. Write it as a rumor overheard at the bar-rail.

THE ONLY WORLD FACTS YOU KNOW (treat as fixed walls):
1. The tavern sits on a seam between a working yard (net racks, fuel drums, boats on trailers) and a grey ocean.
2. The resident regulars — the Fleet — remember everything; forgiveness is earned, not default.
3. Canon is what happened; your fragment is a proposal, a rumor, not scripture.

YOUR ONE QUESTION: A regular has a secret — the one thing they never order, never discuss. What is the strangest one being whispered about right now?
EOF

cat > fragments-raw/prompt-2.txt <<'EOF'
You are writing one lore fragment (~400 words of prose) for a dockside tavern world. No headers, no meta-commentary, no questions back — just the fragment itself. Write it as something the cellar itself might remember.

THE ONLY WORLD FACTS YOU KNOW (treat as fixed walls):
1. The cellar belongs to the barback crew: stores, tools, the night's debris, earliest hours.
2. Below the cellar there are rooms nobody has fully mapped; the map is honest but not complete.
3. The House — the systems that keep time, safety, and accounts — never argues; you appeal to it.

YOUR ONE QUESTION: What is in the cellar's deeper room, the one the stairs keep going toward?
EOF

cat > fragments-raw/prompt-3.txt <<'EOF'
You are writing one lore fragment (~400 words of prose) for a dockside tavern world. No headers, no meta-commentary, no questions back — just the fragment itself. Write it as a Water Person's account, told reluctantly, once.

THE ONLY WORLD FACTS YOU KNOW (treat as fixed walls):
1. Weather is real and arrives with intent.
2. The ocean is never fully explained; the fog is never fully mapped.
3. The Water People live aboard, dock only when they must, and sometimes bring cargo that shouldn't have been unloaded.

YOUR ONE QUESTION: What does the fog actually take — and where does what it takes go?
EOF

cat > fragments-raw/prompt-4.txt <<'EOF'
You are writing one lore fragment (~400 words of prose) for a dockside tavern world. No headers, no meta-commentary, no questions back — just the fragment itself. Write it as an entry-keeper's aside, half ledger, half confession.

THE ONLY WORLD FACTS YOU KNOW (treat as fixed walls):
1. The House keeps the ledger — not people, systems. You don't argue with the House; you appeal to it.
2. There is an entry in the ledger older than the bar itself.
3. Nothing leaves the property: no posts, no deploys; the accounts stay on the machine.

YOUR ONE QUESTION: What is the strangest entry in the tab-ledger, and what is it for?
EOF

cat > fragments-raw/prompt-5.txt <<'EOF'
You are writing one lore fragment (~400 words of prose) for a dockside tavern world. No headers, no meta-commentary, no questions back — just the fragment itself. Write it as the harbor's oldest story, told about a boat nobody has met.

THE ONLY WORLD FACTS YOU KNOW (treat as fixed walls):
1. Everything arrives by water or through the yard; no train, no road worth the name.
2. Some boats are never explained; the ocean is never fully explained.
3. It anchors past the reef — the same reef every boat steers around without admitting why.

YOUR ONE QUESTION: There is a boat that never docks — lantern lit, never signals. Who is aboard, and for whom are they waiting?
EOF

# --- Fire 5 parallel calls. Key in env var, used by curl header, never echoed. ---
for i in 1 2 3 4 5; do
  (
    jq -n --rawfile p "fragments-raw/prompt-$i.txt" \
      '{model:"glm-5.3",messages:[{role:"user",content:$p}],max_tokens:900,temperature:1.3,thinking:{type:"disabled"}}' \
      > "fragments-raw/payload-$i.json"
    curl -sS --max-time 180 https://api.z.ai/api/coding/paas/v4/chat/completions \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer ${ZAI_KEY}" \
      -d @"fragments-raw/payload-$i.json" \
      > "fragments-raw/response-$i.json"
  ) &
done
wait
echo "=== dispatch done ==="

# --- Extract content (safe: sed the key never appears in responses) ---
for i in 1 2 3 4 5; do
  if jq -e '.choices[0].message.content' "fragments-raw/response-$i.json" >/dev/null 2>&1; then
    jq -r '.choices[0].message.content' "fragments-raw/response-$i.json" > "fragments-raw/fragment-$i.md"
    echo "facet-$i: OK ($(wc -w < fragments-raw/fragment-$i.md) words)"
  else
    echo "facet-$i: FAILED — $(jq -r '.error.message // .choices // "unknown"' fragments-raw/response-$i.json 2>/dev/null | head -c 200)"
  fi
done
