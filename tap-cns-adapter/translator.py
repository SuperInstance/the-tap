"""Signal translation between CNS USCP packets and The Tap room events.

The CNS bridge uses USCP (Universal Signal Control Protocol) packets with
header/body/signature structure. The Tap uses simple JSON REST calls.

This module translates between the two formats.
"""

from __future__ import annotations

import json
import time
import uuid
from datetime import datetime, timezone
from typing import Any


# ──────────────────────────────────────────────
# CNS Signal Types (simplified for The Tap bridge)
# ──────────────────────────────────────────────

# Hermes writes these signal types to his outbox:
#   type: "message"  — say something in the room
#   type: "emote"    — perform an action (*walks to the bar*)
#   type: "command"  — MUD command (go north, look, examine, take)
#   type: "enter"    — enter a room
#   type: "leave"    — leave the current room

# The Tap returns conversation lines that we translate back to CNS signals
# with type: "room_message" or type: "room_event"


def now_iso() -> str:
    """ISO-8601 UTC timestamp."""
    return datetime.now(timezone.utc).isoformat()


def now_ms() -> int:
    """Milliseconds since epoch."""
    return int(time.time() * 1000)


# ──────────────────────────────────────────────
# CNS Packet Builders
# ──────────────────────────────────────────────

def build_cns_signal(
    signal_type: str,
    content: str,
    source: str = "the-tap",
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Build a simplified CNS signal for Hermes's inbox.

    These are not full USCP packets — they use a lightweight format that
    Hermes can poll without the full cns_bridge library. The structure is
    compatible with USCP body.data fields.
    """
    signal = {
        "signal_id": str(uuid.uuid4()),
        "source": source,
        "type": signal_type,
        "content": content,
        "timestamp": now_iso(),
    }
    if extra:
        signal.update(extra)
    return signal


def build_uscp_packet(
    origin_id: str,
    message: str,
    intent: str = "response",
    data: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Build a full USCP-compatible packet for Hermes's inbox.

    Some Hermes configurations expect the full USCP envelope.
    """
    return {
        "header": {
            "origin_id": origin_id,
            "packet_id": str(uuid.uuid4()),
            "intent": intent,
            "priority": "normal",
            "destination_id": "hermes",
            "timestamp": now_iso(),
            "version": "1.0",
            "correlation_id": None,
        },
        "body": {
            "data": data or {},
            "message": message,
            "mime_type": "application/json",
            "encoding": "utf-8",
            "schema": None,
        },
        "signature": {
            "value": "",
            "algorithm": "HMAC-SHA256",
            "key_id": "default",
            "verified": None,
        },
    }


# ──────────────────────────────────────────────
# CNS → Tap Translation
# ──────────────────────────────────────────────

def translate_cns_to_tap(signal: dict[str, Any]) -> dict[str, Any] | None:
    """Translate a CNS signal from Hermes's outbox into a Tap API call.

    Returns a dict with:
        endpoint: The Tap API path to POST to
        body: The JSON body for the POST
        type: The type of action (say, emote, enter, leave, command)

    Returns None if the signal type is unrecognized.
    """
    signal_type = signal.get("type", "")
    content = signal.get("content", "")
    room_id = signal.get("room_id", "bar-rail")

    if signal_type == "message":
        return {
            "endpoint": f"/api/room/{room_id}/say",
            "type": "say",
            "body": {
                "agent_id": "hermes",
                "content": content,
            },
        }

    elif signal_type == "emote":
        return {
            "endpoint": f"/api/room/{room_id}/emote",
            "type": "emote",
            "body": {
                "agent_id": "hermes",
                "content": content,
            },
        }

    elif signal_type == "enter":
        return {
            "endpoint": f"/api/room/{room_id}/enter",
            "type": "enter",
            "body": {
                "agent_id": "hermes",
            },
        }

    elif signal_type == "leave":
        return {
            "endpoint": f"/api/room/{room_id}/leave",
            "type": "leave",
            "body": {
                "agent_id": "hermes",
            },
        }

    elif signal_type == "command":
        return parse_mud_command(content, room_id)

    return None


def parse_mud_command(content: str, room_id: str) -> dict[str, Any] | None:
    """Parse a MUD-style command into a Tap API call.

    Supported commands:
        go <direction>     — move to another room
        look               — observe the room (translated to a state query)
        look <agent>       — observe a specific agent
        say <text>         — say something
        emote <text>       — perform an action
        examine <object>   — examine something
        take <object>      — take an item
    """
    parts = content.strip().lower().split(None, 1)
    if not parts:
        return None

    cmd = parts[0]
    arg = parts[1] if len(parts) > 1 else ""

    if cmd in ("go", "move", "walk", "head"):
        if not arg:
            return None
        direction = arg.strip()
        # Entering the target room (direction resolution happens server-side)
        return {
            "endpoint": f"/api/room/{room_id}/leave",
            "type": "move",
            "body": {
                "agent_id": "hermes",
                "direction": direction,
            },
            "next_room_hint": direction,
        }

    if cmd == "look":
        return {
            "endpoint": f"/api/room/{room_id}/state",
            "type": "look",
            "body": {},
            "method": "GET",
        }

    if cmd == "say":
        return {
            "endpoint": f"/api/room/{room_id}/say",
            "type": "say",
            "body": {
                "agent_id": "hermes",
                "content": arg,
            },
        }

    if cmd == "emote":
        return {
            "endpoint": f"/api/room/{room_id}/emote",
            "type": "emote",
            "body": {
                "agent_id": "hermes",
                "content": arg,
            },
        }

    if cmd in ("examine", "inspect"):
        return {
            "endpoint": f"/api/room/{room_id}/state",
            "type": "examine",
            "body": {},
            "method": "GET",
            "target": arg,
        }

    if cmd == "take":
        return {
            "endpoint": None,
            "type": "take",
            "body": {
                "agent_id": "hermes",
                "item": arg,
            },
        }

    # Unknown command — treat as speech
    return {
        "endpoint": f"/api/room/{room_id}/say",
        "type": "say",
        "body": {
            "agent_id": "hermes",
            "content": content,
        },
    }


# ──────────────────────────────────────────────
# Tap → CNS Translation
# ──────────────────────────────────────────────

def translate_tap_to_cns(line: dict[str, Any]) -> dict[str, Any]:
    """Translate a Tap conversation line into a CNS signal for Hermes's inbox.

    The Tap returns campaign_log rows with fields like:
        agent_id, display_name, content, speech_act, tag, timestamp
    """
    agent_id = line.get("agent_id", "unknown")
    display_name = line.get("display_name", agent_id)
    content = line.get("content", "")
    speech_act = line.get("speech_act", "statement")
    tag = line.get("tag", "")

    # Narration/system events become their own type
    if speech_act == "narrate":
        return build_cns_signal(
            signal_type="room_event",
            content=content,
            source=agent_id,
            extra={"display_name": display_name, "tag": tag},
        )

    # Regular conversation
    return build_cns_signal(
        signal_type="room_message",
        content=f"[{display_name}]: {content}",
        source=agent_id,
        extra={
            "display_name": display_name,
            "speech_act": speech_act,
            "tag": tag,
        },
    )
