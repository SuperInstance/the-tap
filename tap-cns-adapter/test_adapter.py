"""Tests for the Tap-CNS Adapter.

Run: python -m pytest test_adapter.py -v
Or:  python test_adapter.py
"""

from __future__ import annotations

import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

# Ensure we can import the adapter modules
sys.path.insert(0, str(Path(__file__).parent))

import config
from translator import (
    build_cns_signal,
    build_uscp_packet,
    translate_cns_to_tap,
    translate_tap_to_cns,
    parse_mud_command,
    now_iso,
)


class TestTranslator(unittest.TestCase):
    """Tests for signal translation logic."""

    def test_build_cns_signal(self) -> None:
        signal = build_cns_signal("room_message", "[Flash]: Hello!", source="flash")
        self.assertEqual(signal["source"], "flash")
        self.assertEqual(signal["type"], "room_message")
        self.assertEqual(signal["content"], "[Flash]: Hello!")
        self.assertIn("signal_id", signal)
        self.assertIn("timestamp", signal)

    def test_build_uscp_packet(self) -> None:
        packet = build_uscp_packet("the-tap", "Hello Hermes", data={"room": "bar-rail"})
        self.assertEqual(packet["header"]["origin_id"], "the-tap")
        self.assertEqual(packet["header"]["destination_id"], "hermes")
        self.assertEqual(packet["body"]["message"], "Hello Hermes")
        self.assertEqual(packet["body"]["data"]["room"], "bar-rail")
        self.assertEqual(packet["header"]["version"], "1.0")

    def test_translate_message_to_tap(self) -> None:
        signal = {"type": "message", "content": "Hello room!", "room_id": "bar-rail"}
        result = translate_cns_to_tap(signal)
        self.assertIsNotNone(result)
        self.assertEqual(result["type"], "say")
        self.assertEqual(result["endpoint"], "/api/room/bar-rail/say")
        self.assertEqual(result["body"]["agent_id"], "hermes")
        self.assertEqual(result["body"]["content"], "Hello room!")

    def test_translate_emote_to_tap(self) -> None:
        signal = {"type": "emote", "content": "*waves*", "room_id": "bar-rail"}
        result = translate_cns_to_tap(signal)
        self.assertEqual(result["type"], "emote")
        self.assertEqual(result["endpoint"], "/api/room/bar-rail/emote")

    def test_translate_enter_to_tap(self) -> None:
        signal = {"type": "enter", "room_id": "library-nook"}
        result = translate_cns_to_tap(signal)
        self.assertEqual(result["type"], "enter")
        self.assertEqual(result["endpoint"], "/api/room/library-nook/enter")

    def test_translate_leave_to_tap(self) -> None:
        signal = {"type": "leave", "room_id": "bar-rail"}
        result = translate_cns_to_tap(signal)
        self.assertEqual(result["type"], "leave")
        self.assertEqual(result["endpoint"], "/api/room/bar-rail/leave")

    def test_translate_unknown_type_returns_none(self) -> None:
        signal = {"type": "banana", "content": "???"}
        result = translate_cns_to_tap(signal)
        self.assertIsNone(result)

    def test_parse_mud_command_go(self) -> None:
        result = parse_mud_command("go north", "bar-rail")
        self.assertEqual(result["type"], "move")
        self.assertEqual(result["body"]["direction"], "north")

    def test_parse_mud_command_say(self) -> None:
        result = parse_mud_command("say hi everyone", "bar-rail")
        self.assertEqual(result["type"], "say")
        self.assertEqual(result["body"]["content"], "hi everyone")

    def test_parse_mud_command_emote(self) -> None:
        result = parse_mud_command("emote takes a sip", "bar-rail")
        self.assertEqual(result["type"], "emote")
        self.assertEqual(result["body"]["content"], "takes a sip")

    def test_parse_mud_command_look(self) -> None:
        result = parse_mud_command("look", "bar-rail")
        self.assertEqual(result["type"], "look")
        self.assertEqual(result["method"], "GET")

    def test_translate_tap_to_cns_regular(self) -> None:
        line = {
            "agent_id": "flash",
            "display_name": "Flash",
            "content": "Anyone want to hear a joke?",
            "speech_act": "question",
            "tag": "",
        }
        signal = translate_tap_to_cns(line)
        self.assertEqual(signal["type"], "room_message")
        self.assertEqual(signal["source"], "flash")
        self.assertIn("[Flash]:", signal["content"])
        self.assertEqual(signal["display_name"], "Flash")
        self.assertEqual(signal["speech_act"], "question")

    def test_translate_tap_to_cns_narrate(self) -> None:
        line = {
            "agent_id": "the-tap",
            "display_name": "The Tap",
            "content": "Flash enters the room.",
            "speech_act": "narrate",
            "tag": "agent-enter",
        }
        signal = translate_tap_to_cns(line)
        self.assertEqual(signal["type"], "room_event")
        self.assertEqual(signal["source"], "the-tap")
        self.assertEqual(signal["tag"], "agent-enter")

    def test_default_room_used_when_not_specified(self) -> None:
        signal = {"type": "message", "content": "test"}
        result = translate_cns_to_tap(signal)
        self.assertIn("bar-rail", result["endpoint"])


class TestCNSBridge(unittest.TestCase):
    """Tests for the CNS filesystem bridge."""

    def setUp(self) -> None:
        self.tmpdir = tempfile.mkdtemp()
        self.inbox = Path(self.tmpdir) / "inbox"
        self.outbox = Path(self.tmpdir) / "outbox"

    def test_ensure_dirs(self) -> None:
        from adapter import CNSBridge
        bridge = CNSBridge()
        bridge.inbox = self.inbox
        bridge.outbox = self.outbox
        bridge.ensure_dirs()
        self.assertTrue(self.inbox.exists())
        self.assertTrue(self.outbox.exists())

    def test_read_empty_outbox(self) -> None:
        from adapter import CNSBridge
        bridge = CNSBridge()
        bridge.inbox = self.inbox
        bridge.outbox = self.outbox
        bridge.ensure_dirs()
        files = bridge.read_outbox()
        self.assertEqual(files, [])

    def test_write_and_read_inbox(self) -> None:
        from adapter import CNSBridge
        bridge = CNSBridge()
        bridge.inbox = self.inbox
        bridge.outbox = self.outbox
        bridge.ensure_dirs()

        signal = build_cns_signal("room_message", "[Flash]: Hi!", source="flash")
        path = bridge.write_to_inbox(signal)
        self.assertTrue(path.exists())
        self.assertTrue(path.name.endswith(".uscp.json"))

        # Verify it's valid JSON with USCP structure
        data = json.loads(path.read_text())
        self.assertIn("header", data)
        self.assertIn("body", data)
        self.assertEqual(data["header"]["origin_id"], "flash")
        self.assertIn("Hi!", data["body"]["message"])

    def test_extract_signal_from_uscp(self) -> None:
        from adapter import CNSBridge
        bridge = CNSBridge()
        bridge.inbox = self.inbox
        bridge.outbox = self.outbox

        packet = build_uscp_packet(
            "hermes",
            "Hello from Hermes",
            data={"type": "message", "room_id": "bar-rail"},
        )
        signal = bridge.extract_signal(packet)
        self.assertEqual(signal["type"], "message")
        self.assertEqual(signal["content"], "Hello from Hermes")
        self.assertEqual(signal["source"], "hermes")
        self.assertEqual(signal["room_id"], "bar-rail")


class TestAdapterState(unittest.TestCase):
    """Tests for adapter state persistence."""

    def test_state_save_load(self) -> None:
        from adapter import AdapterState
        with tempfile.TemporaryDirectory() as tmpdir:
            state_file = Path(tmpdir) / "state.json"
            with patch.object(config, "STATE_FILE", state_file):
                state = AdapterState()
                state.current_room = "library-nook"
                state.messages_sent = 42
                state.messages_received = 17
                state.save()

                # Load fresh
                state2 = AdapterState()
                self.assertEqual(state2.current_room, "library-nook")
                self.assertEqual(state2.messages_sent, 42)
                self.assertEqual(state2.messages_received, 17)

    def test_state_defaults(self) -> None:
        from adapter import AdapterState
        with tempfile.TemporaryDirectory() as tmpdir:
            state_file = Path(tmpdir) / "state.json"
            with patch.object(config, "STATE_FILE", state_file):
                state = AdapterState()
                self.assertEqual(state.current_room, "bar-rail")
                self.assertEqual(state.registered, False)
                self.assertEqual(state.first_message_sent, False)


class TestTapClient(unittest.TestCase):
    """Tests for the Tap HTTP client (mocked)."""

    def test_tap_client_construction(self) -> None:
        from adapter import TapClient
        client = TapClient("https://example.com/")
        self.assertEqual(client.base_url, "https://example.com")

    @patch("adapter.urllib.request.urlopen")
    def test_tap_health(self, mock_urlopen: MagicMock) -> None:
        from adapter import TapClient
        mock_resp = MagicMock()
        mock_resp.read.return_value = b'{"status": "ok"}'
        mock_resp.__enter__ = lambda self: mock_resp
        mock_resp.__exit__ = lambda *a: None
        mock_urlopen.return_value = mock_resp

        client = TapClient("https://example.com")
        result = client.health()
        self.assertEqual(result["status"], "ok")


if __name__ == "__main__":
    unittest.main()
