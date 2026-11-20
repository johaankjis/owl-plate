"""Page-level contract checks for the campus rescue command center (command-center.html).

These read the page and the frozen contract as text: no browser, no network and no
real It page. They keep the showcase inside the command-center section of
prototypes/itcan/STATE_CONTRACT.md: the page reads only contract keys through one
state handler, sends only the seven contract actions with their exact payloads and
only once the page id matches, stays one self-contained file, and never ships agent
words of its own.
"""

from __future__ import annotations

import re
import unittest
from html.parser import HTMLParser
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
PAGE = HERE / "command-center.html"
CONTRACT = HERE / "STATE_CONTRACT.md"

PAGE_ID = "owl-rescue-command-center"
# Action name -> the exact payload keys the contract's action table allows.
ACTIONS = {
    "refresh_campus_activity": ("page_id",),
    "select_building": ("page_id", "building_id"),
    "inspect_listing": ("page_id", "drop_id"),
    "whats_left": ("page_id", "drop_id"),
    "analyze_remaining_food": ("page_id",),
    "show_recommendations": ("page_id",),
    "dismiss_recommendations": ("page_id",),
}
# Selecting a building or a listing happens on generated controls, not static buttons.
STATIC_ACTION_BUTTONS = set(ACTIONS) - {"select_building", "inspect_listing"}
SUMMARY_LABELS = {
    "total_published_servings": "Servings published",
    "available_servings": "Available now",
    "student_reserved_servings": "Student reservations",
    "completed_pickups": "Completed pickups",
    "pantry_reserved_servings": "Pantry reserved",
    "pantry_transferred_simulated": "Pantry transfers (simulated)",
    "student_recovery_percent": "Student recovery",
    "active_buildings_count": "Buildings with food",
}
STRUCTURED_KEYS = {
    "campus_buildings",
    "active_listings",
    "trend_points",
    "activity_events",
    "agent_recommendations",
}
SELECTED_KEYS = {
    "selected_building_id",
    "selected_drop_id",
    "selected_listing",
    "selected_answer",
}
AGENT_KEYS = {
    "agent_status",
    "agent_response",
    "agent_error",
    "agent_updated_at",
    "agent_updated_at_iso",
}
DATASET_KEYS = {"dataset_label", "dataset_is_simulated"}
FRESHNESS_KEYS = {"checked_at", "checked_at_iso", "ok", "error"}
STATE_KEYS = (
    {"page_id"}
    | set(SUMMARY_LABELS)
    | STRUCTURED_KEYS
    | SELECTED_KEYS
    | AGENT_KEYS
    | DATASET_KEYS
    | FRESHNESS_KEYS
)
# Selected-listing counts: field the page reads -> label the brief fixes for it.
LISTING_COUNT_LABELS = {
    "total_servings": "Total servings",
    "available_servings": "Available",
    "held_servings": "Student reservations",
    "picked_up": "Completed pickups",
    "pantry_held": "Pantry reserved",
    "pantry_transferred_simulated": "Pantry transfers (simulated)",
}
# Every word the agent panel shows before any state arrives: interface copy only.
AGENT_PANEL_COPY = {
    "Working alongside you",
    "Your agent",
    "Standing by",
    "Ask your agent what's left across campus.",
    "It reads the live campus picture and answers here in its own words.",
    "From your agent ·",
    "Recovery recommendations",
    "Dismiss",
    "Analyze remaining food",
    "Show recovery recommendations",
}
DISCLOSURE_LINKS = {
    "https://campus.kennesaw.edu/current-students/student-affairs/wellbeing/care-services/",
    "https://campus.kennesaw.edu/offices-services/catering/policies.php",
}
RESOURCE_TAGS = {
    "link",
    "img",
    "image",
    "use",
    "iframe",
    "object",
    "embed",
    "video",
    "audio",
    "source",
    "base",
    "canvas",
}
RESOURCE_ATTRS = {"src", "srcset", "href", "xlink:href", "poster", "action", "data", "background"}
NETWORK_CALLS = ("fetch(", "XMLHttpRequest", "WebSocket", "EventSource", "sendBeacon", "import(")
UNSAFE_SINKS = ("innerHTML", "outerHTML", "insertAdjacentHTML", "document.write", "eval(")
JARGON = (
    "drop_id",
    "page_id",
    "building_id",
    "uuid",
    "json",
    "api",
    "binding",
    "undefined",
    "null",
    "nan",
    "payload",
    "claude",
    "anthropic",
    "openrouter",
    "gemini",
    "firebase",
)


class PageParser(HTMLParser):
    """Collect what the checks need: tags, script, style and visible text with its ancestors."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.tags: list[tuple[str, dict[str, str | None]]] = []
        self.script = ""
        self.style = ""
        self.texts: list[tuple[str, tuple[str, ...]]] = []
        self._inside: list[tuple[str, str]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        found = dict(attrs)
        self.tags.append((tag, found))
        self._inside.append((tag, found.get("id") or ""))

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.tags.append((tag, dict(attrs)))

    def handle_endtag(self, tag: str) -> None:
        while self._inside and self._inside.pop()[0] != tag:
            continue

    def handle_data(self, data: str) -> None:
        open_tags = [tag for tag, _ in self._inside]
        if "script" in open_tags:
            self.script += data
        elif "style" in open_tags:
            self.style += data
        elif "title" not in open_tags and data.strip():
            ancestors = tuple(element_id for _, element_id in self._inside if element_id)
            self.texts.append((" ".join(data.split()), ancestors))

    @property
    def visible_text(self) -> str:
        return " ".join(text for text, _ in self.texts)

    def text_inside(self, element_id: str) -> list[str]:
        """Every text run that sits under the element with this id."""
        return [text for text, ancestors in self.texts if element_id in ancestors]

    def with_attr(self, name: str) -> list[tuple[str, dict[str, str | None]]]:
        """Every tag that carries the attribute `name`."""
        return [(tag, attrs) for tag, attrs in self.tags if name in attrs]

    def by_id(self, element_id: str) -> tuple[str, dict[str, str | None]]:
        """The one tag with this id; fails loudly when it is missing or duplicated."""
        found = [(tag, attrs) for tag, attrs in self.tags if attrs.get("id") == element_id]
        if len(found) != 1:
            raise AssertionError(f"expected exactly one #{element_id}, found {len(found)}")
        return found[0]


def contract_sections() -> dict[str, str]:
    """The command-center contract split by its `## ` headings (heading -> body)."""
    text = CONTRACT.read_text(encoding="utf-8")
    command_center = text.split("# Command center page", 1)[1]
    sections: dict[str, str] = {}
    for chunk in re.split(r"^## ", command_center, flags=re.MULTILINE)[1:]:
        heading, _, body = chunk.partition("\n")
        sections[heading.strip()] = body
    return sections


def table_rows(section: str) -> list[list[str]]:
    """Cells of each data row of the first markdown table in a contract section."""
    rows = [line for line in section.splitlines() if line.startswith("|")]
    return [[cell.strip() for cell in row.strip("|").split("|")] for row in rows[2:]]


def first_column_keys(section: str) -> set[str]:
    """Backticked names in the first column of a section's table."""
    return {key for row in table_rows(section) for key in re.findall(r"`(\w+)`", row[0])}


def function_body(script: str, signature: str) -> str:
    """Source of one top-level function of the page script, located by its signature."""
    start = script.index(signature)
    end = script.index("\n      }\n", start)
    return script[start:end]


def string_literals(script: str) -> list[str]:
    """Quoted strings and template strings of the script, with `${...}` parts collapsed."""
    quoted = re.findall(r'"((?:[^"\\\n]|\\.)*)"', script)
    templates = [re.sub(r"\$\{[^`]*?\}", "…", t) for t in re.findall(r"`([^`]*)`", script)]
    return quoted + templates


class CommandCenterPageTest(unittest.TestCase):
    """The showcase page stays inside the frozen command-center contract."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.html = PAGE.read_text(encoding="utf-8")
        cls.page = PageParser()
        cls.page.feed(cls.html)
        cls.page.close()
        cls.script = cls.page.script
        cls.text = cls.page.visible_text
        cls.sections = contract_sections()

    # --- the frozen contract ----------------------------------------------

    def test_contract_binds_only_this_page_id(self) -> None:
        rows = table_rows(
            self.sections["Binding (set at create, repeated in every patch, never changed)"]
        )
        self.assertEqual([row[0] for row in rows], ["`page_id`"])
        self.assertIn(f"`{PAGE_ID}`", rows[0][2])

    def test_contract_actions_table_lists_the_seven_actions(self) -> None:
        rows = table_rows(self.sections["Actions (page -> paired Claude Code conversation)"])
        listed = {row[0].strip("`"): tuple(re.findall(r"\w+", row[1].strip("`"))) for row in rows}
        self.assertEqual(listed, ACTIONS)

    def test_contract_lists_exactly_the_expected_state_keys(self) -> None:
        sections = self.sections
        summary = table_rows(
            sections["Campus summary (numbers from `GET /analytics/operations` `summary`)"]
        )
        self.assertEqual({row[0].strip("`"): row[1] for row in summary}, SUMMARY_LABELS)
        structured = sections["Structured values (rendered by the page script, not `data-it-bind`)"]
        self.assertEqual(set(re.findall(r"^`(\w+)`:", structured, re.MULTILINE)), STRUCTURED_KEYS)
        self.assertEqual(first_column_keys(sections["Selected target"]), SELECTED_KEYS)
        self.assertEqual(first_column_keys(sections["Agent panel"]), AGENT_KEYS)
        dataset = sections["Dataset label (so sample data is never mistaken for app data)"]
        self.assertEqual(first_column_keys(dataset), DATASET_KEYS)
        self.assertEqual(first_column_keys(sections["Freshness and failure"]), FRESHNESS_KEYS)

    def test_contract_agent_states_match_the_page(self) -> None:
        row = next(r for r in table_rows(self.sections["Agent panel"]) if r[0] == "`agent_status`")
        states = re.findall(r"`(\w+)`", " ".join(row[1:]))
        self.assertEqual(states, ["idle", "thinking", "ready", "error"])
        self.assertIn('const AGENT_STATES = ["idle", "thinking", "ready", "error"];', self.script)

    # --- state: one handler, contract keys only, last good data kept --------

    def test_state_handler_is_registered_once(self) -> None:
        self.assertEqual(self.script.count("It.onState("), 1)
        self.assertIn("It.onState(handleState);", self.script)
        self.assertIn(
            'if (typeof It !== "undefined" && typeof It.onState === "function") {', self.script
        )
        self.assertIn("say(UNLINKED_COPY);", self.script)
        self.assertEqual(self.page.with_attr("data-it-bind"), [])
        self.assertEqual(self.page.with_attr("data-it-show"), [])

    def test_page_reads_every_contract_key(self) -> None:
        for key in STATE_KEYS:
            self.assertRegex(self.script, rf'(\.{key}\b|"{key}")', key)

    def test_page_reads_no_state_key_outside_the_contract(self) -> None:
        read = set(re.findall(r"\b(?:store|next|state)\.(\w+)", self.script))
        self.assertEqual(read - STATE_KEYS, set())
        for group in ("SUMMARY_KEYS", "LIST_KEYS", "TEXT_KEYS", "SELECTION_KEYS"):
            listed = re.search(rf"const {group} = \[(.*?)\];", self.script, re.DOTALL)
            self.assertIsNotNone(listed, group)
            self.assertEqual(set(re.findall(r'"(\w+)"', listed.group(1))) - STATE_KEYS, set())

    def test_structured_entries_use_the_contract_fields(self) -> None:
        structured = " ".join(
            self.sections[
                "Structured values (rendered by the page script, not `data-it-bind`)"
            ].split()
        )
        for name in STRUCTURED_KEYS:
            fields = re.search(rf"`{name}`:.*?`\{{([^}}]+)\}}`", structured)
            self.assertIsNotNone(fields, name)
            for field in re.findall(r"\w+", fields.group(1)):
                self.assertRegex(self.script, rf'(\.{field}\b|"{field}")', f"{name}.{field}")

    def test_each_summary_number_is_shown_once_with_its_contract_label(self) -> None:
        shown = [attrs["data-key"] for _, attrs in self.page.with_attr("data-key")]
        self.assertEqual(sorted(shown), sorted(SUMMARY_LABELS))
        for key, label in SUMMARY_LABELS.items():
            self.assertIn(label, self.text)
            self.assertRegex(self.html, rf'data-key="{key}"\s*>\s*–\s*<')
        self.assertIn("tabular-nums", self.page.style)

    def test_partial_patches_merge_and_bad_values_never_replace_good_ones(self) -> None:
        absorb = function_body(self.script, "function absorb(next) {")
        self.assertIn("if (Number.isFinite(value) && value >= 0) store[key] = value;", absorb)
        self.assertIn(
            "if (Array.isArray(next[key])) store[key] = next[key].filter(isRecord);", absorb
        )
        self.assertIn('if (typeof next[key] === "string") store[key] = next[key];', absorb)
        handler = function_body(self.script, "function handleState(state) {")
        self.assertIn("absorb(next);", handler)
        self.assertEqual(re.findall(r"\w+ store =(?!=)", self.script), ["const store ="])

    def test_error_line_comes_from_state_and_is_announced(self) -> None:
        _, banner = self.page.by_id("error-box")
        self.assertEqual(banner.get("role"), "alert")
        self.assertIn("hidden", banner)
        self.assertEqual(self.page.text_inside("error-box"), [])
        chrome = function_body(self.script, "function renderChrome() {")
        self.assertIn("const message = words(store.error);", chrome)
        self.assertIn("const failed = store.ok === false || message.length > 0;", chrome)

    # --- actions: seven exact payloads, all behind the page-id gate ---------

    def test_page_id_constant_matches_the_contract(self) -> None:
        self.assertIn(f'const PAGE_ID = "{PAGE_ID}";', self.script)
        self.assertEqual(self.html.count(PAGE_ID), 1)

    def test_seven_actions_send_exactly_the_contract_payloads(self) -> None:
        calls = re.findall(r'It\.action\(\s*"(\w+)",\s*\{([^{}]*)\}\s*,?\s*\)', self.script)
        self.assertEqual(self.script.count("It.action("), 7)
        self.assertEqual(len(calls), 7)
        sent = {}
        for name, body in calls:
            pairs = re.findall(r"(\w+):\s*([\w.]+)", body)
            sent[name] = tuple(key for key, _ in pairs)
            values = dict(pairs)
            self.assertEqual(values["page_id"], "PAGE_ID", name)
            self.assertEqual(re.sub(r"\w+:\s*[\w.]+\s*,?\s*", "", body).strip(), "", name)
            for key, value in values.items():
                if key != "page_id":
                    self.assertRegex(value, r"^[a-z][A-Za-z]*Id$", name)
        self.assertEqual(sent, ACTIONS)

    def test_every_action_goes_through_the_page_id_gate(self) -> None:
        script = self.script
        self.assertIn("linked = store.page_id === PAGE_ID;", script)
        self.assertEqual(len(re.findall(r"\blinked\s*=[^=]", script)), 2)  # false, then the gate
        self.assertIn("let linked = false;", script)
        table = script[script.index("const ACTIONS = {") : script.index("async function send(")]
        self.assertEqual(table.count("It.action("), 7)
        send = function_body(script, "async function send(name, detail) {")
        self.assertRegex(send, r"^async function send\(name, detail\) \{\s*if \(!linked \|\|")
        self.assertIn("await ACTIONS[name](detail);", send)
        self.assertEqual(script.count("ACTIONS["), 1)
        self.assertEqual(len(re.findall(r"\bACTIONS\b", script)), 3)  # table, guard, call

    def test_every_request_names_a_contract_action(self) -> None:
        requested = re.findall(r'\b(?:send|askAgent)\(\s*"(\w+)"', self.script)
        self.assertEqual(set(requested), set(ACTIONS))
        self.assertEqual(len(requested), 7)

    def test_action_buttons_start_disabled(self) -> None:
        buttons = [attrs for tag, attrs in self.page.tags if tag == "button"]
        acting = {attrs["data-action"]: attrs for attrs in buttons if "data-action" in attrs}
        self.assertEqual(set(acting), STATIC_ACTION_BUTTONS)
        for name, attrs in acting.items():
            self.assertIn("disabled", attrs, name)
        for attrs in buttons:
            self.assertEqual(attrs.get("type"), "button")
        sync = function_body(self.script, "function syncControls() {")
        for control in ("refreshButton", "leftButton", "analyzeButton", "recommendButton"):
            self.assertRegex(sync, rf"{control}\.disabled =\s*!linked \|\|", control)
        self.assertIn("dismissButton.disabled = !linked;", sync)
        self.assertEqual(
            [tag for tag, _ in self.page.tags if tag in {"input", "form", "select", "textarea"}], []
        )

    def test_selection_actions_only_send_ids_already_in_state(self) -> None:
        building = function_body(self.script, "function chooseBuilding(id) {")
        self.assertIn("const building = buildingById(id);", building)
        self.assertIn("if (!building) return;", building)
        self.assertIn('send("select_building", id);', building)
        listing = function_body(self.script, "function chooseListing(dropId) {")
        self.assertIn("if (!listingById(dropId)) return;", listing)
        self.assertIn('send("inspect_listing", dropId);', listing)
        self.assertRegex(self.script, r'await send\("whats_left", listing\.drop_id\)')

    def test_waiting_states_and_fallback_timers_stay(self) -> None:
        script = self.script
        self.assertIn("const CHECK_WAIT_MS = 12000;", script)
        self.assertIn("const AGENT_WAIT_MS = 20000;", script)
        self.assertIn('const AGENT_WAIT_COPY = "Waiting for your agent…";', script)
        self.assertIn("Still waiting. Check that your agent is open, then try again.", script)
        self.assertIn("Still checking… Tap to try again.", script)
        self.assertIn("Couldn't send that request. Try again in a moment.", script)
        self.assertIn("This command center isn't connected yet.", script)
        self.assertRegex(script, r"\}, AGENT_WAIT_MS\);")
        self.assertEqual(len(re.findall(r"\}, CHECK_WAIT_MS\);", script)), 2)
        ask = function_body(script, "async function askAgent(name) {")
        self.assertIn("if (!linked || agent.asked) return;", ask)

    # --- agent panel: only words that arrived in state ----------------------

    def test_agent_panel_ships_no_agent_words(self) -> None:
        self.assertEqual(set(self.page.text_inside("agent")), AGENT_PANEL_COPY)
        for element_id in ("agent-message-text", "agent-rec-list", "agent-alert", "agent-time"):
            self.assertEqual(self.page.text_inside(element_id), [], element_id)
        self.assertIn("hidden", self.page.by_id("agent-message")[1])
        self.assertIn("hidden", self.page.by_id("agent-recs")[1])
        self.assertEqual(self.page.by_id("agent")[1].get("data-phase"), "idle")

    def test_agent_words_render_only_from_state(self) -> None:
        script = self.script
        self.assertIn("setText(agentMessageText, store.agent_response);", script)
        self.assertEqual(len(re.findall(r"\bagentMessageText\b", script)), 2)  # lookup, render
        self.assertIn("return store.agent_recommendations", script)
        self.assertIn('block("p", "rec-title", words(item.title)),', script)
        self.assertIn('block("p", "rec-detail", words(item.detail)),', script)
        self.assertNotRegex(script, r"agent_(response|recommendations)\b[\"']?\]?\s*=[^=]")
        self.assertRegex(script, r'agent_response: "",')
        self.assertRegex(script, r"agent_recommendations: \[\],")

    def test_script_carries_no_canned_sentences(self) -> None:
        literals = string_literals(self.script)
        self.assertGreater(len(literals), 100)
        self.assertLessEqual(max(len(literal) for literal in literals), 120)
        for literal in literals:
            if len(literal.split()) >= 4:
                self.assertLessEqual(len(literal), 80, literal)

    def test_dismiss_hides_recommendations_locally_and_keeps_the_answer(self) -> None:
        script = self.script
        self.assertIn("agent.dismissed = recommendationMark();", script)
        self.assertIn("const shown = mark !== agent.dismissed ? recommendations() : [];", script)
        self.assertIn('send("dismiss_recommendations");', script)
        self.assertIn(".slice(0, MAX_RECOMMENDATIONS);", script)
        self.assertIn("const MAX_RECOMMENDATIONS = 6;", script)

    def test_status_regions_are_announced(self) -> None:
        for element_id in ("status", "agent-wait"):
            _, attrs = self.page.by_id(element_id)
            self.assertEqual(attrs.get("role"), "status", element_id)
            self.assertEqual(attrs.get("aria-live"), "polite", element_id)
        self.assertEqual(self.page.by_id("agent-alert")[1].get("role"), "alert")

    # --- self-contained file -----------------------------------------------

    def test_no_external_resources(self) -> None:
        self.assertEqual([tag for tag, _ in self.page.tags if tag in RESOURCE_TAGS], [])
        for tag, attrs in self.page.tags:
            for name in RESOURCE_ATTRS & set(attrs):
                self.assertEqual((tag, name), ("a", "href"), f"<{tag} {name}=...> loads a resource")
        self.assertEqual([attrs for tag, attrs in self.page.tags if tag == "script" and attrs], [])
        self.assertEqual(len([tag for tag, _ in self.page.tags if tag == "script"]), 1)
        self.assertNotIn("@import", self.page.style)
        self.assertNotIn("url(", self.html)
        self.assertNotIn("@font-face", self.page.style)
        for call in NETWORK_CALLS:
            self.assertNotIn(call, self.script)
        for sink in UNSAFE_SINKS:
            self.assertNotIn(sink, self.script)

    def test_only_the_two_disclosure_links_leave_the_page(self) -> None:
        anchors = [attrs for tag, attrs in self.page.tags if tag == "a"]
        self.assertEqual({attrs.get("href") for attrs in anchors}, DISCLOSURE_LINKS)
        self.assertEqual(len(anchors), 2)
        for attrs in anchors:
            self.assertEqual(set((attrs.get("rel") or "").split()), {"noopener", "noreferrer"})
        self.assertEqual(set(re.findall(r"""https?://[^\s"'<>)]+""", self.html)), DISCLOSURE_LINKS)
        self.assertIsNone(re.search(r"""["'(]//\w""", self.html))

    # --- disclosures and labels the contract requires -----------------------

    def test_policy_disclosure_keeps_both_ksu_links(self) -> None:
        self.assertRegex(
            self.text,
            r"Pantry transfers are simulated · not a KSU CARE acceptance or catering approval",
        )

    def test_geometry_disclosure_is_one_visible_line(self) -> None:
        note = " ".join(self.page.text_inside("geometry-note"))
        self.assertEqual(
            note,
            "Building footprints are stylized illustrative geometry · "
            "positions come from verified campus coordinates.",
        )
        _, attrs = self.page.by_id("geometry-note")
        self.assertNotIn("hidden", attrs)
        self.assertNotIn("sr-only", attrs.get("class") or "")

    def test_header_has_no_demo_pill(self) -> None:
        self.assertIsNone(re.search(r"\bdemo\b", self.text, re.IGNORECASE))
        classes = " ".join(attrs.get("class") or "" for _, attrs in self.page.tags)
        self.assertNotIn("demo", classes.lower())
        self.assertNotRegex(self.script, r"[\"'`][^\"'`\n]*\bDemo\b")
        for copy in ("Owl Plate", "Campus Rescue Command Center"):
            self.assertIn(copy, self.text)

    def test_simulated_labels_and_dataset_label_stay(self) -> None:
        self.assertGreaterEqual(self.text.count("Pantry transfers (simulated)"), 4)
        self.assertGreaterEqual(self.script.count('"Pantry transfers (simulated)"'), 2)
        title = function_body(self.script, "function eventTitle(event) {")
        self.assertIn("event.is_simulated === true", title)
        self.assertIn("return simulated ? `${label} (simulated)` : label;", title)
        self.page.by_id("dataset-label")
        self.assertEqual(self.page.text_inside("dataset-flag"), ["· simulated data"])
        chrome = function_body(self.script, "function renderChrome() {")
        self.assertIn("datasetChip.dataset.simulated = String(store.dataset_is_simulated);", chrome)
        self.assertIn('setText(byId("dataset-label"), label);', chrome)
        self.assertIn('.dataset[data-simulated="true"]', self.page.style)

    def test_selected_listing_shows_every_count_with_its_label(self) -> None:
        counts = [attrs["data-count"] for _, attrs in self.page.with_attr("data-count")]
        self.assertEqual(sorted(counts), sorted(LISTING_COUNT_LABELS))
        inspector = " ".join(self.page.text_inside("inspector"))
        for label in (*LISTING_COUNT_LABELS.values(), "Collection deadline", "Last updated"):
            self.assertIn(label, inspector)
        self.assertEqual(self.page.text_inside("whats-left-label"), ["What's left?"])
        self.assertIn("hidden", self.page.by_id("inspector")[1])
        detail = function_body(self.script, "function renderDetail(listing, building) {")
        for field in ("food", "description", "expires_at", "expires_at_iso", "updated_at"):
            self.assertIn(f"listing.{field}", detail)
        answer = function_body(self.script, "function answerFor(listing) {")
        self.assertIn("const fresh = words(store.selected_answer);", answer)

    def test_no_developer_jargon_on_screen(self) -> None:
        labels = [
            value
            for _, attrs in self.page.tags
            for name, value in attrs.items()
            if name == "aria-label"
        ]
        copy = [literal for literal in string_literals(self.script) if " " in literal]
        on_screen = " ".join([self.text, *filter(None, labels), *copy]).lower()
        for word in JARGON:
            self.assertIsNone(re.search(rf"\b{re.escape(word)}\b", on_screen), word)

    # --- map, motion and colour scheme --------------------------------------

    def test_map_is_inline_svg_projected_from_the_given_coordinates(self) -> None:
        tag, attrs = self.page.by_id("scene")
        self.assertEqual(tag, "svg")
        self.assertEqual(attrs.get("role"), "group")
        self.assertTrue(attrs.get("aria-label"))
        self.assertNotIn("getContext", self.script)
        self.assertIn("Math.log(Math.tan(Math.PI / 4 + (latitude * RADIAN) / 2))", self.script)
        self.assertIn("mercator(building.latitude, building.longitude)", self.script)
        self.assertNotRegex(self.script, r"\.(latitude|longitude)\s*[-+*/]?=[^=]")

    def test_map_is_operable_by_keyboard_pointer_and_buttons(self) -> None:
        script = self.script
        self.assertIn('role: "button",', script)
        self.assertIn('item.node.setAttribute("tabindex", key === id ? "0" : "-1");', script)
        self.assertIn('(event.key === "Enter" || event.key === " ")', script)
        for arrow in ("ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"):
            self.assertIn(f"{arrow}:", script)
        for event in ("pointerdown", "pointermove", "wheel", "keydown", "click"):
            self.assertIn(f'scene.addEventListener("{event}"', script.replace("\n        ", ""))
        for element_id in ("zoom-in", "zoom-out", "zoom-reset", "insp-close"):
            tag, attrs = self.page.by_id(element_id)
            self.assertEqual(tag, "button")
            self.assertTrue(attrs.get("aria-label"), element_id)
        self.assertEqual(self.page.by_id("scene")[1].get("aria-describedby"), "map-help")

    def test_reduced_motion_is_respected_in_css_and_script(self) -> None:
        self.assertIn("@media (prefers-reduced-motion: reduce)", self.page.style)
        self.assertIn("animation-duration: 0.01ms !important;", self.page.style)
        self.assertIn("transition-duration: 0.01ms !important;", self.page.style)
        self.assertIn('media("(prefers-reduced-motion: reduce)")', self.script)
        self.assertIn("const still = () => reduceMotion.matches || document.hidden;", self.script)
        for signature in (
            "function showNumber(node, value, format = whole, popNode = node) {",
            "function glide(immediate) {",
            "function renderTrend(resized) {",
        ):
            self.assertIn("still()", function_body(self.script, signature), signature)

    def test_light_and_dark_use_the_owl_plate_palette(self) -> None:
        self.assertIn("@media (prefers-color-scheme: dark)", self.page.style)
        for token in (
            "--bg: #f8f8fa;",
            "--bg: #0f1013;",
            "--gold: #fdbb30;",
            "--ink: #121214;",
            "--ink: #f4f4f6;",
        ):
            self.assertIn(token, self.page.style)
        self.assertIn(":focus-visible", self.page.style)
        self.assertIn("min-height: 44px;", self.page.style)

    def test_trend_chart_has_an_honest_empty_state_and_a_table_view(self) -> None:
        self.assertEqual(
            self.page.text_inside("trend-empty"), ["No recovery history for this period yet."]
        )
        self.assertEqual(self.page.text_inside("trend-rows"), [])
        self.assertEqual(self.page.by_id("trend-svg")[1].get("role"), "img")
        self.assertIn("hidden", self.page.by_id("trend-plot")[1])
        points = function_body(self.script, "function trendPoints() {")
        self.assertIn("TREND_KEYS.every((key) => count(point[key]) !== null)", points)


if __name__ == "__main__":
    unittest.main()
