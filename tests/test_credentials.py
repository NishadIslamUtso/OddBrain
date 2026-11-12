"""Passwords, keys and card numbers are hidden before anything is stored."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from memory_ob.credentials import HIDDEN, has_secret, redact, redact_parts  # noqa: E402


class Redaction(unittest.TestCase):
    def test_a_password_value_is_hidden_but_the_sentence_stays(self) -> None:
        out, n = redact("My wifi password is x7!kQ9z")
        self.assertEqual((out, n), (f"My wifi password is {HIDDEN}", 1))

    def test_several_ways_of_saying_it(self) -> None:
        for text in ("pin: 4821", "the passcode = 90817", "API key = sk-abcdefghijklmnop1234",
                     "my cvv is 123x", "token: ghp_abcdefghijklmnopqrstuvwxyz123456"):
            self.assertTrue(has_secret(text), text)

    def test_well_known_key_shapes(self) -> None:
        for text in ("AKIAIOSFODNN7EXAMPLE", "xoxb-1234567890-abcdefghij", "-----BEGIN PRIVATE KEY-----\nabc",
                     "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk"):
            self.assertTrue(has_secret(text), text)

    def test_a_real_card_number_is_hidden_and_a_random_number_is_not(self) -> None:
        self.assertEqual(redact("my card 4111 1111 1111 1111 expires soon"),
                         (f"my card {HIDDEN} expires soon", 1))
        self.assertFalse(has_secret("order number 1234567890123456"))
        self.assertFalse(has_secret("call me on 0171 234 5678"))

    def test_ordinary_sentences_are_left_alone(self) -> None:
        for text in ("my password is too short", "The secret is that I love chess", "I pinned the post",
                     "token of appreciation is nice", "the pin is 12", "I like cycling"):
            self.assertEqual(redact(text), (text, 0), text)

    def test_whole_conversations(self) -> None:
        parts = [{"role": "user", "content": "my password is abc123!x"},
                 {"role": "assistant", "content": "Please do not share it."}]
        clean, n = redact_parts(parts)
        self.assertEqual(n, 1)
        self.assertIn(HIDDEN, clean[0]["content"])
        self.assertEqual(clean[1], parts[1])
        self.assertIn("abc123", parts[0]["content"])      # the input is not changed in place


if __name__ == "__main__":
    unittest.main()
