"""Page-level contract checks for the It pickup display (whats-left.html).

These read the page as text: no browser, no network and no real It page. They
keep the redesigned dashboard inside prototypes/itcan/STATE_CONTRACT.md: every
display key stays bound, the button still sends only the exact-drop binding,
and the page stays one self-contained file.
"""

from __future__ import annotations

import re
import sys
import unittest
from html.parser import HTMLParser
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HERE))
import whats_left

PAGE = HERE / "whats-left.html"
CONTRACT = HERE / "STATE_CONTRACT.md"

DROP_ID = "123e4567-e89b-42d3-a456-426614174000"
COUNT_KEYS = {"total", "available", "held", "picked_up", "pantry_held", "pantry_transferred"}
DISPLAY_KEYS = COUNT_KEYS | {
    "food_name",
    "location",
    "status_label",
    "checked_at",
    "checked_at_iso",
    "answer",
    "error",
}
# Binding and outcome keys drive behaviour; they are never printed on the display.
HIDDEN_KEYS = {"drop_id", "page_id", "ok"}
DISCLOSURE_LINKS = {
    "https://campus.kennesaw.edu/current-students/student-affairs/wellbeing/care-services/",
    "https://campus.kennesaw.edu/offices-services/catering/policies.php",
}
RESOURCE_TAGS = {"link", "img", "iframe", "object", "embed", "video", "audio", "source", "base"}
RESOURCE_ATTRS = {"src", "srcset", "href", "xlink:href", "poster", "action", "data", "background"}
NETWORK_CALLS = ("fetch(", "XMLHttpRequest", "WebSocket", "EventSource", "sendBeacon", "import(")
JARGON = ("drop_id", "page_id", "uuid", "json", "api", "undefined", "null", "nan", "payload")


class PageParser(HTMLParser):
    """Collect what the checks need: tags with attributes, script, style and visible text."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.tags: list[tuple[str, dict[str, str | None]]] = []
        self.script = ""
        self.style = ""
        self.visible_text: list[str] = []
        self._inside: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.tags.append((tag, dict(attrs)))
        self._inside.append(tag)

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.tags.append((tag, dict(attrs)))

    def handle_endtag(self, tag: str) -> None:
        while self._inside and self._inside.pop() != tag:
            continue

    def handle_data(self, data: str) -> None:
        if "script" in self._inside:
            self.script += data
        elif "style" in self._inside:
            self.style += data
        elif "title" not in self._inside and data.strip():
            self.visible_text.append(" ".join(data.split()))

    def with_attr(self, name: str) -> list[tuple[str, dict[str, str | None]]]:
        """Every tag that carries the attribute `name`."""
        return [(tag, attrs) for tag, attrs in self.tags if name in attrs]

    def by_id(self, element_id: str) -> tuple[str, dict[str, str | None]]:
        """The one tag with this id; fails loudly when it is missing or duplicated."""
        found = [(tag, attrs) for tag, attrs in self.tags if attrs.get("id") == element_id]
        if len(found) != 1:
            raise AssertionError(f"expected exactly one #{element_id}, found {len(found)}")
        return found[0]


def contract_keys() -> set[str]:
    """State keys named in the first column of the frozen pickup contract's tables.

    The contract file also carries the manager-owned command-center section;
    that page has its own contract and its own pinning test.
    """
    text = CONTRACT.read_text(encoding="utf-8")
    pickup_contract = text.split("# Command center page", 1)[0]
    return set(re.findall(r"^\| `(\w+)` \|", pickup_contract, re.MULTILINE))


def contract_count_labels() -> dict[str, str]:
    """The on-screen label the pickup contract assigns to each count key."""
    text = CONTRACT.read_text(encoding="utf-8")
    pickup_contract = text.split("# Command center page", 1)[0]
    rows = re.findall(r"^\| `(\w+)` \| ([^|`]+) \|$", pickup_contract, re.MULTILINE)
    return {key: label.strip() for key, label in rows if key in COUNT_KEYS}


class WhatsLeftPageTest(unittest.TestCase):
    """The page keeps the frozen state contract after the dashboard redesign."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.html = PAGE.read_text(encoding="utf-8")
        cls.page = PageParser()
        cls.page.feed(cls.html)
        cls.page.close()
        cls.bound = [attrs["data-it-bind"] for _, attrs in cls.page.with_attr("data-it-bind")]
        cls.text = " ".join(cls.page.visible_text)

    # --- state contract -------------------------------------------------

    def test_contract_file_lists_the_expected_keys(self) -> None:
        self.assertEqual(contract_keys(), DISPLAY_KEYS | HIDDEN_KEYS)

    def test_every_display_key_is_bound(self) -> None:
        self.assertEqual(DISPLAY_KEYS - set(self.bound), set())

    def test_no_binding_falls_outside_the_contract(self) -> None:
        shown = [attrs["data-it-show"] for _, attrs in self.page.with_attr("data-it-show")]
        self.assertEqual(set(self.bound) - contract_keys(), set())
        self.assertEqual(set(shown) - contract_keys(), set())
        self.assertEqual(set(self.bound) & HIDDEN_KEYS, set())

    def test_each_key_is_bound_exactly_once(self) -> None:
        self.assertEqual(sorted(self.bound), sorted(DISPLAY_KEYS))

    def test_count_labels_match_the_contract(self) -> None:
        labels = contract_count_labels()
        self.assertEqual(set(labels), COUNT_KEYS)
        for label in labels.values():
            self.assertIn(label, self.text)

    def test_error_banner_shows_only_on_error(self) -> None:
        banners = self.page.with_attr("data-it-show")
        self.assertEqual(len(banners), 1)
        _, attrs = banners[0]
        self.assertEqual(attrs["data-it-show"], "error")
        self.assertEqual(attrs.get("role"), "alert")
        self.assertIn("display: none", attrs.get("style") or "")
        self.assertEqual(self.page.by_id("error-text")[1].get("data-it-bind"), "error")

    def test_machine_timestamp_is_bound_but_not_displayed(self) -> None:
        stamps = [
            a
            for _, a in self.page.with_attr("data-it-bind")
            if a["data-it-bind"] == "checked_at_iso"
        ]
        self.assertIn("hidden", stamps[0])
        self.assertEqual(self.page.by_id("checked-time")[0], "time")

    # --- It page API and exact-drop binding ------------------------------

    def test_state_handler_is_registered_once(self) -> None:
        self.assertEqual(self.page.script.count("It.onState("), 1)
        self.assertIn("It.onState(handleState);", self.page.script)

    def test_one_action_path_sends_only_the_binding(self) -> None:
        script = self.page.script
        self.assertEqual(script.count("It.action("), 1)
        self.assertIn('await It.action("whats_left", binding);', script)
        self.assertRegex(script, r"\?\s*\{\s*drop_id: dropId,\s*page_id: pageId\s*\}\s*:\s*null;")
        self.assertEqual(
            len(re.findall(r"\bbinding\s*=[^=]", script)), 2
        )  # declared null, set in one place

    def test_page_id_prefix_matches_the_helper(self) -> None:
        self.assertIn("pageId === `owl-whats-left-${dropId}`", self.page.script)
        self.assertEqual(whats_left.page_id_for_drop(DROP_ID), f"owl-whats-left-{DROP_ID}")

    def test_uuid_check_is_unchanged(self) -> None:
        match = re.search(r"const uuid =\s*/(\^[^\n]+\$)/i;", self.page.script)
        self.assertIsNotNone(match)
        pattern = re.compile(match.group(1), re.IGNORECASE)
        self.assertEqual(
            match.group(1),
            "^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
        )
        self.assertTrue(pattern.match(DROP_ID))
        for bad in ("", "not-a-uuid", DROP_ID[:-1], f"{DROP_ID}0", DROP_ID.replace("-", "")):
            self.assertIsNone(pattern.match(bad), bad)
        self.assertIn("uuid.test(dropId) && pageId ===", self.page.script)

    def test_button_starts_disabled_and_is_the_only_control(self) -> None:
        buttons = [attrs for tag, attrs in self.page.tags if tag == "button"]
        self.assertEqual(len(buttons), 1)
        self.assertEqual(buttons[0].get("id"), "ask")
        self.assertEqual(buttons[0].get("type"), "button")
        self.assertIn("disabled", buttons[0])
        self.assertEqual(
            [tag for tag, _ in self.page.tags if tag in {"input", "form", "select", "textarea"}], []
        )
        self.assertIn("What's left?", self.text)

    def test_waiting_state_and_fallback_timer_stay(self) -> None:
        script = self.page.script
        self.assertIn('askLabel.textContent = "Checking…";', script)
        self.assertIn("if (!binding || waiting) return;", script)
        self.assertRegex(script, r"waitTimer = setTimeout\(\(\) => \{[^}]+\}, 12000\);")
        self.assertIn("Still checking… Tap to try again.", script)
        self.assertRegex(script, r"\} catch \(_err\) \{\s*clearWaitTimer\(\);")
        self.assertIn("Couldn't send that request. Try again in a moment.", script)
        self.assertIn("This display isn't linked to a listing.", script)

    def test_status_region_is_announced(self) -> None:
        _, attrs = self.page.by_id("status")
        self.assertEqual(attrs.get("role"), "status")
        self.assertEqual(attrs.get("aria-live"), "polite")

    # --- self-contained file ---------------------------------------------

    def test_no_external_resources(self) -> None:
        self.assertEqual([tag for tag, _ in self.page.tags if tag in RESOURCE_TAGS], [])
        for tag, attrs in self.page.tags:
            for name in RESOURCE_ATTRS & set(attrs):
                self.assertEqual((tag, name), ("a", "href"), f"<{tag} {name}=...> loads a resource")
        self.assertEqual([attrs for tag, attrs in self.page.tags if tag == "script" and attrs], [])
        self.assertNotIn("@import", self.page.style)
        self.assertNotIn("url(", self.page.style)
        self.assertNotIn("@font-face", self.page.style)
        for call in NETWORK_CALLS:
            self.assertNotIn(call, self.page.script)

    def test_only_the_two_disclosure_links_leave_the_page(self) -> None:
        anchors = [attrs for tag, attrs in self.page.tags if tag == "a"]
        self.assertEqual({attrs.get("href") for attrs in anchors}, DISCLOSURE_LINKS)
        self.assertEqual(len(anchors), 2)
        for attrs in anchors:
            self.assertEqual(set((attrs.get("rel") or "").split()), {"noopener", "noreferrer"})
        self.assertEqual(set(re.findall(r"""https?://[^\s"'<>)]+""", self.html)), DISCLOSURE_LINKS)
        self.assertIsNone(re.search(r"""["'(]//\w""", self.html))

    def test_disclosure_and_brand_copy_stay(self) -> None:
        for copy in ("Owl Plate", "Pickup display", "Demo", "Pantry transfers (simulated)"):
            self.assertIn(copy, self.text)
        self.assertRegex(self.text, r"Demo only · not a KSU CARE or catering approval")

    def test_no_developer_jargon_on_screen(self) -> None:
        labels = [
            value
            for _, attrs in self.page.tags
            for name, value in attrs.items()
            if name == "aria-label"
        ]
        on_screen = " ".join([self.text, *filter(None, labels)]).lower()
        for word in JARGON:
            self.assertIsNone(re.search(rf"\b{re.escape(word)}\b", on_screen), word)

    # --- motion, colour scheme and the share rings -----------------------

    def test_reduced_motion_is_respected_in_css_and_script(self) -> None:
        self.assertIn("@media (prefers-reduced-motion: reduce)", self.page.style)
        self.assertIn('matchMedia("(prefers-reduced-motion: reduce)")', self.page.script)
        self.assertIn("if (reduceMotion.matches || document.hidden) {", self.page.script)

    def test_light_and_dark_use_the_owl_plate_palette(self) -> None:
        self.assertIn("@media (prefers-color-scheme: dark)", self.page.style)
        for token in (
            "--bg: #f8f8fa;",
            "--bg: #0f1013;",
            "--gold: #fdbb30;",
            "--surface: #18191e;",
        ):
            self.assertIn(token, self.page.style)
        self.assertIn(":focus-visible", self.page.style)

    def test_ring_has_one_segment_per_share_of_the_total(self) -> None:
        segments = [
            attrs.get("data-series")
            for tag, attrs in self.page.tags
            if tag == "circle" and "seg" in (attrs.get("class") or "").split()
        ]
        self.assertEqual(sorted(segments), sorted(COUNT_KEYS - {"total"}))
        rings = [
            attrs for tag, attrs in self.page.tags if tag == "svg" and attrs.get("role") == "img"
        ]
        self.assertEqual(len(rings), 1)
        self.assertTrue(rings[0].get("aria-label"))

    def test_counts_start_blank_so_no_number_is_invented(self) -> None:
        for key in COUNT_KEYS:
            self.assertRegex(self.html, rf'data-it-bind="{key}"\s*>–<')
        self.assertIn(
            "if (Number.isInteger(value) && value >= 0) known[key] = value;", self.page.script
        )
        self.assertIn(
            "if (counts.total <= 0 || sum !== counts.total) return shares;", self.page.script
        )


if __name__ == "__main__":
    unittest.main()
