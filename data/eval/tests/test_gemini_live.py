"""Offline tests for the live Gemini adapter: parsing, safety rule, credentials.

No test here touches the network. The credential helpers take explicit
environ/env_file arguments so tests never depend on (or leak into) the real
environment, and secret values are never asserted or printed.
"""

import base64
import json
import tempfile
import unittest
from pathlib import Path

import estimate
import gemini_live
from gemini_live import (
    RESPONSE_SCHEMA,
    GeminiError,
    LiveConfigError,
    apply_low_confidence_safety,
    build_request_body,
    load_env_file,
    parse_generate_content_response,
    read_photo,
    require_live_env,
)

MISSING_ENV_FILE = Path("/nonexistent/.env")

VALID_ESTIMATE = {
    "items": [{"name": "cheese pizza", "portion_unit": "slice", "count_estimate": 14}],
    "servings_estimate": 8,
    "servings_low": 6,
    "servings_high": 10,
    "allergens_likely": ["dairy", "gluten"],
    "diet_tags": ["vegetarian"],
    "confidence": 0.74,
    "notes": "one wrap tray partially eaten",
}


def generate_content_response(text: str) -> dict:
    return {"candidates": [{"content": {"parts": [{"text": text}]}, "finishReason": "STOP"}]}


class ParseResponseTest(unittest.TestCase):
    def test_valid_json_text(self) -> None:
        parsed = parse_generate_content_response(
            generate_content_response(json.dumps(VALID_ESTIMATE))
        )
        self.assertEqual(parsed, VALID_ESTIMATE)

    def test_multiple_parts_concatenated(self) -> None:
        payload = {
            "candidates": [
                {"content": {"parts": [{"text": '{"servings_'}, {"text": 'estimate": 8}'}]}}
            ]
        }
        self.assertIn("servings_estimate", parse_generate_content_response(payload))

    def test_no_candidates_reports_block_reason(self) -> None:
        with self.assertRaisesRegex(GeminiError, "blockReason: SAFETY"):
            parse_generate_content_response({"promptFeedback": {"blockReason": "SAFETY"}})

    def test_no_candidates_without_reason(self) -> None:
        with self.assertRaisesRegex(GeminiError, "no candidates"):
            parse_generate_content_response({})

    def test_empty_text_rejected(self) -> None:
        with self.assertRaisesRegex(GeminiError, "returned no text"):
            parse_generate_content_response({"candidates": [{"content": {"parts": []}}]})

    def test_non_json_text_rejected(self) -> None:
        with self.assertRaisesRegex(GeminiError, "not valid JSON"):
            parse_generate_content_response(generate_content_response("pizza!"))

    def test_non_object_json_rejected(self) -> None:
        with self.assertRaisesRegex(GeminiError, "not an object"):
            parse_generate_content_response(generate_content_response("[1, 2]"))


class LowConfidenceSafetyTest(unittest.TestCase):
    def test_below_threshold_flags_all_nine(self) -> None:
        vision = {**VALID_ESTIMATE, "confidence": 0.59, "allergens_likely": ["dairy"]}
        self.assertTrue(apply_low_confidence_safety(vision))
        self.assertEqual(vision["allergens_likely"], list(estimate.ALLERGENS))

    def test_at_threshold_not_inflated(self) -> None:
        vision = {**VALID_ESTIMATE, "confidence": 0.6, "allergens_likely": ["dairy"]}
        self.assertFalse(apply_low_confidence_safety(vision))
        self.assertEqual(vision["allergens_likely"], ["dairy"])

    def test_above_threshold_not_inflated(self) -> None:
        vision = {**VALID_ESTIMATE, "confidence": 0.61, "allergens_likely": ["dairy"]}
        self.assertFalse(apply_low_confidence_safety(vision))
        self.assertEqual(vision["allergens_likely"], ["dairy"])


class RequestBuildingTest(unittest.TestCase):
    def test_image_bytes_base64_round_trip(self) -> None:
        image = b"fake-jpeg-bytes"
        body = build_request_body("prompt", image, "image/jpeg")
        part = body["contents"][0]["parts"][1]
        self.assertEqual(part["inline_data"]["mime_type"], "image/jpeg")
        self.assertEqual(base64.b64decode(part["inline_data"]["data"]), image)

    def test_schema_enumerations(self) -> None:
        properties = RESPONSE_SCHEMA["properties"]
        self.assertEqual(properties["allergens_likely"]["items"]["enum"], list(estimate.ALLERGENS))
        self.assertEqual(properties["diet_tags"]["items"]["enum"], ["vegetarian", "vegan"])

    def test_url_keeps_key_out_of_query_string(self) -> None:
        url = gemini_live.GEMINI_URL_TEMPLATE.format(model="gemini-2.5-flash")
        self.assertNotIn("key=", url)
        self.assertIn(":generateContent", url)


class ReadPhotoTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self._tmp.name)
        self.addCleanup(self._tmp.cleanup)

    def test_unsupported_suffix_rejected(self) -> None:
        path = self.dir / "photo.gif"
        path.write_bytes(b"gif")
        with self.assertRaisesRegex(GeminiError, "unsupported photo type"):
            read_photo(path)

    def test_oversize_photo_rejected(self) -> None:
        path = self.dir / "photo.jpg"
        path.write_bytes(b"x" * (gemini_live.MAX_PHOTO_BYTES + 1))
        with self.assertRaisesRegex(GeminiError, "over the"):
            read_photo(path)

    def test_valid_photo_read(self) -> None:
        path = self.dir / "photo.jpg"
        path.write_bytes(b"jpeg-bytes")
        data, mime = read_photo(path)
        self.assertEqual(data, b"jpeg-bytes")
        self.assertEqual(mime, "image/jpeg")


class CredentialsTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self._tmp.name)
        self.addCleanup(self._tmp.cleanup)

    def test_missing_credentials_raise_with_names_only(self) -> None:
        with self.assertRaisesRegex(LiveConfigError, "GEMINI_API_KEY and GEMINI_MODEL"):
            require_live_env(environ={}, env_file=MISSING_ENV_FILE)

    def test_one_missing_variable_named(self) -> None:
        environ = {"GEMINI_API_KEY": "secret-value"}
        with self.assertRaisesRegex(LiveConfigError, "GEMINI_MODEL"):
            require_live_env(environ=dict(environ), env_file=MISSING_ENV_FILE)

    def test_present_credentials_returned(self) -> None:
        key, model = require_live_env(
            environ={"GEMINI_API_KEY": "k", "GEMINI_MODEL": "m"},
            env_file=MISSING_ENV_FILE,
        )
        self.assertEqual((key, model), ("k", "m"))

    def test_env_file_parsed_and_not_overriding(self) -> None:
        env_file = self.dir / ".env"
        env_file.write_text(
            '# comment\nGEMINI_MODEL=gemini-test\nGEMINI_API_KEY="quoted-key"\n'
            "GEMINI_MODEL=ignored-second-line\n",
            encoding="utf-8",
        )
        environ = {"GEMINI_MODEL": "from-environment"}
        loaded = load_env_file(env_file, environ=environ)
        self.assertEqual(loaded, ["GEMINI_API_KEY"])
        self.assertEqual(environ["GEMINI_MODEL"], "from-environment")
        self.assertEqual(environ["GEMINI_API_KEY"], "quoted-key")

    def test_missing_env_file_is_noop(self) -> None:
        self.assertEqual(load_env_file(MISSING_ENV_FILE, environ={}), [])


if __name__ == "__main__":
    unittest.main()
