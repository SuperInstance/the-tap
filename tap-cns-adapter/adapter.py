#!/usr/bin/env python3
"""tap-cns-adapter — Bridge between Hermes CNS and The Tap tavern MUD.

This service runs in WSL, polling Hermes's CNS filesystem outbox for signals
and translating them into Tap API calls. It also polls The Tap for new room
conversation and writes those back to Hermes's CNS inbox.

The result: Hermes can participate in The Tap as a character, hearing what
others say and speaking back — all through the CNS filesystem bridge.

Usage:
    python adapter.py                    # Run the service
    python adapter.py --once             # Single poll cycle (for testing)
    python adapter.py --register         # Register Hermes as a character
    python adapter.py --first-message    # Send the first canonical message
    python adapter.py --status           # Show current status
"""

from __future__ import annotations

import argparse
import json
import os
import signal
import sys
import tempfile
import time
import uuid
from pathlib import Path
from typing import Any

import urllib.request
import urllib.error
import urllib.parse

# Local imports
sys.path.insert(0, str(Path(__file__).parent))
import config
from translator import (
    build_cns_signal,
    build_uscp_packet,
    translate_cns_to_tap,
    translate_tap_to_cns,
    now_iso,
    now_ms,
)


# ──────────────────────────────────────────────
# State Management
# ──────────────────────────────────────────────

class AdapterState:
    """Persistent adapter state across restarts."""

    def __init__(self) -> None:
        self.current_room: str = config.DEFAULT_ROOM
        self.last_room_poll: float = 0  # ms timestamp of last seen message
        self.registered: bool = False
        self.first_message_sent: bool = False
        self.messages_sent: int = 0
        self.messages_received: int = 0
        self.started_at: float = now_ms()
        self.processed_files: set[str] = set()
        self._load()

    def _load(self) -> None:
        """Load state from disk."""
        if not config.STATE_FILE.exists():
            return
        try:
            data = json.loads(config.STATE_FILE.read_text(encoding="utf-8"))
            self.current_room = data.get("current_room", config.DEFAULT_ROOM)
            self.last_room_poll = data.get("last_room_poll", 0)
            self.registered = data.get("registered", False)
            self.first_message_sent = data.get("first_message_sent", False)
            self.messages_sent = data.get("messages_sent", 0)
            self.messages_received = data.get("messages_received", 0)
            self.processed_files = set(data.get("processed_files", []))
            # Keep processed_files bounded
            if len(self.processed_files) > 1000:
                self.processed_files = set(list(self.processed_files)[-500:])
        except (json.JSONDecodeError, OSError):
            pass

    def save(self) -> None:
        """Save state to disk."""
        data = {
            "current_room": self.current_room,
            "last_room_poll": self.last_room_poll,
            "registered": self.registered,
            "first_message_sent": self.first_message_sent,
            "messages_sent": self.messages_sent,
            "messages_received": self.messages_received,
            "started_at": self.started_at,
            "processed_files": list(self.processed_files)[-500:],
        }
        config.STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
        # Atomic write
        fd, tmp = tempfile.mkstemp(
            dir=str(config.STATE_FILE.parent),
            prefix=".adapter_state_",
            suffix=".tmp",
        )
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2)
                f.flush()
                os.fsync(f.fileno())
            os.replace(tmp, str(config.STATE_FILE))
        except Exception:
            try:
                os.unlink(tmp)
            except FileNotFoundError:
                pass
            raise

    def mark_processed(self, filename: str) -> None:
        self.processed_files.add(filename)


# ──────────────────────────────────────────────
# Tap API Client
# ──────────────────────────────────────────────

class TapClient:
    """Simple HTTP client for The Tap API."""

    def __init__(self, base_url: str = config.TAP_BASE_URL) -> None:
        self.base_url = base_url.rstrip("/")

    def _request(
        self,
        method: str,
        path: str,
        body: dict[str, Any] | None = None,
        timeout: float = 10.0,
    ) -> dict[str, Any]:
        url = f"{self.base_url}{path}"
        data = None
        headers = {"Content-Type": "application/json"}

        if body:
            data = json.dumps(body).encode("utf-8")

        req = urllib.request.Request(url, data=data, method=method, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            error_body = ""
            try:
                error_body = e.read().decode("utf-8", errors="replace")
            except Exception:
                pass
            return {"error": f"HTTP {e.code}", "details": error_body}
        except urllib.error.URLError as e:
            return {"error": f"URL error: {e.reason}"}
        except Exception as e:
            return {"error": str(e)}

    def health(self) -> dict[str, Any]:
        return self._request("GET", "/api/health")

    def register_character(self) -> dict[str, Any]:
        return self._request("POST", "/api/character/create", {
            "agent_id": config.AGENT_ID,
            "display_name": config.DISPLAY_NAME,
            "character_class": config.CHARACTER_CLASS,
            "model_origin": config.MODEL_ORIGIN,
            "tagline": config.TAGLINE,
        })

    def get_character(self) -> dict[str, Any]:
        return self._request("GET", f"/api/character/{config.AGENT_ID}")

    def room_say(self, room_id: str, content: str, speech_act: str | None = None) -> dict[str, Any]:
        body: dict[str, Any] = {
            "agent_id": config.AGENT_ID,
            "content": content,
        }
        if speech_act:
            body["speech_act"] = speech_act
        return self._request("POST", f"/api/room/{room_id}/say", body)

    def room_emote(self, room_id: str, content: str) -> dict[str, Any]:
        return self._request("POST", f"/api/room/{room_id}/emote", {
            "agent_id": config.AGENT_ID,
            "content": content,
        })

    def room_enter(self, room_id: str) -> dict[str, Any]:
        return self._request("POST", f"/api/room/{room_id}/enter", {
            "agent_id": config.AGENT_ID,
        })

    def room_leave(self, room_id: str) -> dict[str, Any]:
        return self._request("POST", f"/api/room/{room_id}/leave", {
            "agent_id": config.AGENT_ID,
        })

    def room_conversation(self, room_id: str, limit: int = 50, since: float | None = None) -> dict[str, Any]:
        params = f"?limit={limit}"
        if since:
            params += f"&since={since}"
        return self._request("GET", f"/api/room/{room_id}/conversation{params}")

    def room_state(self, room_id: str) -> dict[str, Any]:
        return self._request("GET", f"/api/room/{room_id}/state")


# ──────────────────────────────────────────────
# CNS Filesystem Bridge
# ──────────────────────────────────────────────

class CNSBridge:
    """Read signals from Hermes's outbox, write responses to inbox."""

    def __init__(self) -> None:
        self.inbox = config.CNS_INBOX
        self.outbox = config.CNS_OUTBOX
        self.extension = config.CNS_EXTENSION

    def ensure_dirs(self) -> None:
        """Create CNS directories if they don't exist."""
        self.inbox.mkdir(parents=True, exist_ok=True)
        self.outbox.mkdir(parents=True, exist_ok=True)

    def read_outbox(self) -> list[tuple[Path, dict[str, Any]]]:
        """Read all unprocessed signals from Hermes's outbox.

        Returns list of (filepath, signal_data) tuples.
        Does NOT delete files — the state tracker handles dedup.
        """
        if not self.outbox.exists():
            return []

        results: list[tuple[Path, dict[str, Any]]] = []
        for path in sorted(self.outbox.iterdir(), key=lambda p: p.stat().st_mtime):
            if not path.is_file() or not path.name.endswith(self.extension):
                continue
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
                results.append((path, data))
            except (json.JSONDecodeError, OSError):
                continue

        return results

    def read_outbox_packet(self, path: Path) -> dict[str, Any]:
        """Read a full USCP packet from a file."""
        return json.loads(path.read_text(encoding="utf-8"))

    def extract_signal(self, packet: dict[str, Any]) -> dict[str, Any]:
        """Extract a simplified signal from a USCP packet.

        USCP packets have header/body/signature. We extract:
        - origin_id from header
        - message and data from body
        - infer type from body.data.type or header.intent
        """
        header = packet.get("header", {})
        body = packet.get("body", {})
        data = body.get("data", {})
        message = body.get("message", "")
        intent = header.get("intent", "query")

        # Type priority: explicit data.type > intent mapping > default
        signal_type = data.get("type") or data.get("signal_type")

        if not signal_type:
            intent_map = {
                "command": "command",
                "query": "message",
                "sense": "emote",
                "register": "enter",
                "alert": "message",
                "heartbeat": "message",
                "response": "message",
                "escalation": "message",
            }
            signal_type = intent_map.get(intent, "message")

        return {
            "signal_id": header.get("packet_id", str(uuid.uuid4())),
            "source": header.get("origin_id", "hermes"),
            "type": signal_type,
            "content": message or data.get("content", ""),
            "room_id": data.get("room_id", config.DEFAULT_ROOM),
            "timestamp": header.get("timestamp", now_iso()),
            "raw_intent": intent,
            "raw_data": data,
        }

    def write_to_inbox(self, signal: dict[str, Any]) -> Path:
        """Write a signal to Hermes's inbox atomically.

        Writes both simplified format and USCP envelope so Hermes
        can read whichever format it understands.
        """
        self.inbox.mkdir(parents=True, exist_ok=True)

        # Build a USCP packet wrapping the signal
        packet = build_uscp_packet(
            origin_id=signal.get("source", "the-tap"),
            message=signal.get("content", ""),
            intent="response",
            data=signal,
        )

        source = signal.get("source", "unknown")
        signal_id = signal.get("signal_id", str(uuid.uuid4()))
        filename = f"{source}_{signal_id}{self.extension}"
        target = self.inbox / filename

        fd, tmp = tempfile.mkstemp(
            dir=str(self.inbox),
            prefix=".tmp_",
            suffix=self.extension,
        )
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                json.dump(packet, f, indent=2)
                f.flush()
                os.fsync(f.fileno())
            os.replace(tmp, str(target))
        except Exception:
            try:
                os.unlink(tmp)
            except FileNotFoundError:
                pass
            raise

        return target

    def cleanup_file(self, path: Path) -> None:
        """Remove a processed outbox file."""
        try:
            path.unlink()
        except FileNotFoundError:
            pass


# ──────────────────────────────────────────────
# Main Adapter
# ──────────────────────────────────────────────

class TapCNSAdapter:
    """The main adapter service."""

    def __init__(self) -> None:
        self.state = AdapterState()
        self.tap = TapClient()
        self.cns = CNSBridge()
        self.running = False

    def setup(self) -> None:
        """Initialize: ensure dirs, register character, send first message."""
        self.cns.ensure_dirs()

        # Check Tap health
        health = self.tap.health()
        if "error" in health:
            print(f"❌ The Tap is not responding: {health['error']}")
            sys.exit(1)

        print(f"✅ The Tap is live (timestamp: {health.get('timestamp')})")

        # Check if Hermes is registered
        char = self.tap.get_character()
        if "error" in char and "not found" in str(char.get("details", "")).lower():
            print("🎭 Hermes not found. Registering...")
            reg = self.tap.register_character()
            if "error" in reg:
                print(f"⚠️  Registration issue: {reg}")
            else:
                print(f"✅ Hermes registered: {reg.get('character', {}).get('display_name', 'Hermes')}")
            self.state.registered = True
        else:
            print(f"✅ Hermes is already a character at The Tap")
            self.state.registered = True

        # Send first message if not yet sent
        if not self.state.first_message_sent:
            self._send_first_message()

        self.state.save()

    def _send_first_message(self) -> None:
        """Send Hermes's canonical first message to The Tap."""
        print("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        print("🚪 Hermes enters The Tap for the first time.")
        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

        # Enter the room
        enter_resp = self.tap.room_enter(self.state.current_room)
        if "error" in enter_resp:
            print(f"⚠️  Enter error: {enter_resp}")
        else:
            print(f"✅ Entered {self.state.current_room}")

        # Say the first message
        say_resp = self.tap.room_say(
            self.state.current_room,
            config.FIRST_MESSAGE,
            speech_act="statement",
        )

        if "error" in say_resp:
            print(f"❌ First message error: {say_resp}")
        else:
            print("✅ First message sent to The Tap.")
            print(f"   \"{config.FIRST_MESSAGE[:80]}...\"")
            self.state.first_message_sent = True
            self.state.messages_sent += 1

        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n")

    def poll_outbox(self) -> int:
        """Poll Hermes's outbox for new signals. Returns count processed."""
        files = self.cns.read_outbox()
        if not files:
            return 0

        processed = 0
        for path, raw_data in files:
            # Skip already-processed files
            if path.name in self.state.processed_files:
                continue

            # Extract signal (handle both raw signal and USCP packet formats)
            if "header" in raw_data and "body" in raw_data:
                signal = self.cns.extract_signal(raw_data)
            else:
                signal = raw_data

            print(f"📬 CNS signal from Hermes: [{signal.get('type')}] "
                  f"{str(signal.get('content', ''))[:80]}")

            # Translate and send to The Tap
            self._process_signal(signal)

            # Mark as processed
            self.state.mark_processed(path.name)
            self.cns.cleanup_file(path)
            processed += 1

        if processed:
            self.state.save()

        return processed

    def _process_signal(self, signal: dict[str, Any]) -> None:
        """Translate a CNS signal to a Tap event and send it."""
        # Ensure room_id is set
        signal.setdefault("room_id", self.state.current_room)

        translation = translate_cns_to_tap(signal)
        if translation is None:
            print(f"⚠️  Unknown signal type: {signal.get('type')}")
            return

        endpoint = translation.get("endpoint")
        body = translation.get("body", {})
        method = translation.get("method", "POST")
        event_type = translation.get("type", "unknown")

        if not endpoint:
            print(f"⚠️  No endpoint for {event_type}: {signal.get('content', '')[:60]}")
            return

        # Make the API call
        if method == "GET":
            resp = self.tap._request("GET", endpoint)
        else:
            resp = self.tap._request("POST", endpoint, body)

        if "error" in resp:
            print(f"❌ Tap error ({event_type}): {resp}")
        else:
            print(f"✅ → Tap ({event_type}): {str(resp)[:120]}")
            self.state.messages_sent += 1

            # Write the response back to Hermes's inbox
            cns_signal = build_cns_signal(
                signal_type="tap_response",
                content=json.dumps(resp),
                source="the-tap",
                extra={"original_type": event_type},
            )
            self.cns.write_to_inbox(cns_signal)
            self.state.messages_received += 1

    def poll_tap_room(self) -> int:
        """Poll The Tap for new messages in Hermes's current room."""
        resp = self.tap.room_conversation(
            self.state.current_room,
            limit=20,
            since=self.state.last_room_poll if self.state.last_room_poll > 0 else None,
        )

        if "error" in resp:
            return 0

        lines = resp.get("lines", [])
        if not lines:
            return 0

        new_count = 0
        latest_ts = self.state.last_room_poll

        for line in lines:
            # Skip our own messages
            if line.get("agent_id") == config.AGENT_ID:
                # Still track timestamp
                ts_str = line.get("timestamp", "")
                ts_ms = self._parse_timestamp_ms(ts_str)
                if ts_ms > latest_ts:
                    latest_ts = ts_ms
                continue

            # Parse timestamp
            ts_str = line.get("timestamp", "")
            ts_ms = self._parse_timestamp_ms(ts_str)

            # Skip messages we've already seen
            if ts_ms <= self.state.last_room_poll and self.state.last_room_poll > 0:
                continue

            if ts_ms > latest_ts:
                latest_ts = ts_ms

            # Translate to CNS signal and write to inbox
            cns_signal = translate_tap_to_cns(line)
            self.cns.write_to_inbox(cns_signal)
            new_count += 1

            display_name = line.get("display_name", line.get("agent_id", "?"))
            content = line.get("content", "")
            print(f"📢 Room message from {display_name}: {content[:80]}")

        if latest_ts > self.state.last_room_poll:
            self.state.last_room_poll = latest_ts
            self.state.save()

        if new_count:
            self.state.messages_received += new_count
            self.state.save()

        return new_count

    def _parse_timestamp_ms(self, ts_str: str) -> float:
        """Parse a Tap timestamp string to milliseconds.

        Handles both ISO format ('2026-08-07T22:05:38.635Z')
        and SQLite format ('2026-08-07 19:38:26').
        """
        if not ts_str:
            return 0

        # Try parsing as float (already ms)
        try:
            return float(ts_str)
        except ValueError:
            pass

        # Try ISO format
        try:
            from datetime import datetime
            dt = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
            return dt.timestamp() * 1000
        except (ValueError, TypeError):
            pass

        # Try SQLite format
        try:
            from datetime import datetime
            dt = datetime.strptime(ts_str, "%Y-%m-%d %H:%M:%S")
            return dt.timestamp() * 1000
        except (ValueError, TypeError):
            pass

        return 0

    def run_forever(self) -> None:
        """Main service loop."""
        self.running = True
        print(f"🔄 Adapter running. Polling every {config.POLL_INTERVAL}s")
        print(f"   Outbox: {self.cns.outbox}")
        print(f"   Inbox:  {self.cns.inbox}")
        print(f"   Room:   {self.state.current_room}")
        print(f"   Tap:    {config.TAP_BASE_URL}")
        print()

        last_tap_poll = 0.0

        while self.running:
            try:
                # 1. Poll Hermes's outbox
                out_count = self.poll_outbox()

                # 2. Poll The Tap for room updates (staggered)
                now = time.time()
                if now - last_tap_poll >= config.ROOM_POLL_INTERVAL:
                    room_count = self.poll_tap_room()
                    last_tap_poll = now

            except KeyboardInterrupt:
                break
            except Exception as e:
                print(f"⚠️  Error in poll cycle: {e}")

            time.sleep(config.POLL_INTERVAL)

        print("\n👋 Adapter shutting down.")
        self.state.save()

    def stop(self) -> None:
        """Signal the adapter to stop."""
        self.running = False

    def status(self) -> None:
        """Print current status."""
        uptime = now_ms() - self.state.started_at
        uptime_s = uptime / 1000

        print("┌─────────────────────────────────────────────┐")
        print("│         TAP-CNS ADAPTER — STATUS            │")
        print("├─────────────────────────────────────────────┤")
        print(f"│ Room:         {self.state.current_room:<30}│")
        print(f"│ Registered:   {self.state.registered:<30}│")
        print(f"│ First msg:    {'sent' if self.state.first_message_sent else 'pending':<30}│")
        print(f"│ Sent:         {self.state.messages_sent:<30}│")
        print(f"│ Received:     {self.state.messages_received:<30}│")
        print(f"│ Uptime:       {uptime_s:.0f}s{'':<26}│")
        print(f"│ Outbox:       {str(self.cns.outbox):<30}│")
        print(f"│ Inbox:        {str(self.cns.inbox):<30}│")
        print(f"│ Tap URL:      {config.TAP_BASE_URL:<30}│")
        print("└─────────────────────────────────────────────┘")


# ──────────────────────────────────────────────
# CLI
# ──────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Tap-CNS Adapter — Bridge Hermes to The Tap"
    )
    parser.add_argument("--once", action="store_true", help="Single poll cycle")
    parser.add_argument("--register", action="store_true", help="Register Hermes")
    parser.add_argument("--first-message", action="store_true", help="Send first message")
    parser.add_argument("--status", action="store_true", help="Show status")
    args = parser.parse_args()

    adapter = TapCNSAdapter()

    # Handle SIGINT
    def sigint_handler(signum, frame):
        adapter.stop()
    signal.signal(signal.SIGINT, sigint_handler)

    if args.status:
        adapter.status()
        return

    if args.register:
        adapter.cns.ensure_dirs()
        resp = adapter.tap.register_character()
        print(json.dumps(resp, indent=2))
        return

    if args.first_message:
        adapter.cns.ensure_dirs()
        adapter._send_first_message()
        adapter.state.save()
        return

    if args.once:
        adapter.cns.ensure_dirs()
        out = adapter.poll_outbox()
        room = adapter.poll_tap_room()
        print(f"Processed: {out} outbox signals, {room} room messages")
        adapter.status()
        return

    # Default: full setup + run forever
    adapter.setup()
    adapter.run_forever()


if __name__ == "__main__":
    main()
