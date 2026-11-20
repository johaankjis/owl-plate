# Milestone 6: live itcan.do pickup display

Branch `feature/itcan-integration`, from baseline `e73ab46f7f9422f1a0cd3549839d50ffddb10edf`.
Setup and the recording walkthrough are in `prototypes/itcan/README.md`. The page
state contract is in `prototypes/itcan/STATE_CONTRACT.md`.

## What changed

- **Display page** (`whats-left.html`): mobile pickup display in Owl Plate's
  consumer style. It shows the food, location, status, Available, Total, Student
  reservations, Completed pickups, Pantry reserved, Pantry transfers (simulated),
  and the time it was last updated, with one **What's left?** button. The page has
  no developer wording, and the old hardcoded "Fixture vision" label is removed.
- **Helpers** (`whats_left.py`, `create_companion.py`): one read of
  `GET /drops/{id}` builds the full contract state. It fails closed and keeps the
  last numbers on error. The page opens with a real snapshot. The printed
  tap-handler command now carries `--it-bin`, so installs outside `~/.it` patch
  the same page.
- **Host**: **Open pickup display** moved directly under the live counts.
- **Admin**: a new **Pickup display (It)** section shows the base-URL status (origin
  only), the page-id pattern, a checklist and a pointer to the README.
- No API or schema change. The OpenAPI SHA256 `3389fe59…7587` is the same as
  Milestone 5.

## Real paired It acceptance (sponsor test)

Run on the presenter's Mac with It 0.1.45 (protocol 1), Claude Code 2.1.327,
`it-bridge@it` enabled, network localhost-only, and the It site at
`http://localhost:4700`. Owl Plate ran at commit `5455361` through the SSH tunnel
with OpenRouter vision and Firebase push. The presenter reported:

| Step | It display |
|---|---|
| After publishing 3 servings, tap What's left? | 3 available · 0 reserved · 0 collected |
| After a student reservation, tap | 2 available · 1 reserved · 0 collected |
| After photo-assisted pickup, tap | 2 available · 0 reserved · 1 collected |

Each tap triggered the Claude Code conversation on the Mac, and the same page
updated from live Owl Plate data. **This evidence is reported by the user.**
The manager could not cross-check it against Owl Plate's database afterwards:
the live database had since been reset, and its only listing is a later
4-serving one. The Mac's It site is localhost-only and cannot be reached from
the server.

## Regression

| Check | Result |
|---|---|
| API (pytest) | 315 passed |
| Web (node test) | 99 passed (committed suite; 93 at baseline + 6 new) |
| Evaluation | OK |
| Campus validation | 1,591 checks, 0 failures; campus tests OK |
| Companion tests | 19 passed |
| Ruff, ESLint, Prettier, TypeScript | pass |
| Production build | pass |
| OpenAPI and generated types | zero drift |
| Browser: pickup routes, pantry routes, operations routes, operations UI | pass (port 3027 candidate) |
| Seeded natural-expiry rehearsal (`OWL_RECORD_VIDEO=false`) | PASS, 95.3 s |
| Display rendered with real helper state, 390×844 (stand-in It object) | no overflow, no developer words, tap sends only listing and page ids |

Four older browser scripts fail identically at baseline `e73ab46`, so they are
**not Milestone 6 regressions**. They are not in Milestone 5's verified set and
still expect earlier screens or setup:

- `verify_campus_feed`: waits for `student-vision-mode-label`.
- `verify_campus_map`: waits for `student-view-map-button`.
- `verify_pantry_ui`: waits for `picked-up-card`.
- `verify_pickup_mobile`: requires a "bad-result fixture phase" environment.

Logs are in `test-results/m6-itcan/{candidate,baseline}/` (gitignored).

## Independent review

OpenCode `openrouter/z-ai/glm-5.3` reviewed `7992558b4bf1fddb51441616095b5e66b92561c4`
and returned **PASS** with no blocking findings. It reproduced every deterministic
check independently: 315 / 116 / 4 / 19 / 99 tests, lint, types, build, 1,591 campus
checks, and zero OpenAPI drift. It found three non-blocking issues:

1. The web count here said 104. The main checkout also has untracked test files
   from paused cloud work. Corrected to 99.
2. The contract did not mention that the pantry counts default to 0. Added.
3. The page hides the error box twice (the `data-it-show` attribute and its
   script). This is harmless and was kept.

The commit after the review changes these two documentation lines only.

## Limitations

- The paired-It evidence is the presenter's report (see above). Agent
  transcripts and display screenshots are not stored in the repo.
- The host link path `/p/owl-whats-left-{id}` is not in It's docs. The presenter
  opened the display from the host flow during the test, but the comparison with
  the `Page:` URL is not stored as an artifact.
- Taps reach only the Claude Code conversation that created the page, and only
  while It, the paired browser and the tunnel are running.
- Physical push receipt, physical pickup, physical pantry transfer, and measured
  live-model accuracy remain unverified. Pantry transfers are simulated.
