# Owl Plate local rehearsal package

Prepared locally, **not submitted**. Deadline Friday November 20, 2026, noon
Eastern / 17:00 UTC. Johaan approves deployment/distribution and submits.

| File | Purpose / evidence |
|---|---|
| `Owl_Plate_Pitch.pptx` | Seven editable slides and notes, with fixture/pending labels |
| `evidence/slides/Owl_Plate_Pitch.pdf` | Font-stable PDF backup; all seven slides visually reviewed |
| `evidence/slides/slide-1.png` … `slide-7.png` | Individual rendered slide images |
| `Owl_Plate_Fallback.mp4` | 96.6s, Full HD, 25fps, silent captioned browser recording; fixture vision/simulated notifications |
| `SLIDE_REVIEW.md` | Slide findings, exact edits, timing assessment |
| `PITCH_SCRIPT.md` | Five-minute cues and pending human rehearsal log |
| `REHEARSAL.html` | Offline five-minute slide/video companion, speaker cues and local timing export |
| `SUBMISSION_STATUS.md` | Candidate version, actual evidence and submission-cutoff rule |
| `LIVE_RUN_CHECKLIST.md` | Single live checklist and empty actual phone/vision registers |
| `SURVEY.md` | Questions, proposed audience/owner and unsent copy; n=0 |
| `RECORDING_PLAN.md` | Thursday physical-device capture plan |
| `LIVE_DEMO_NOTE.md` | Honest draft for final review |
| `evidence/technical-playback.json` | Actual five-minute technical timing, not spoken team delivery |
| `evidence/live-preflight.json` | Missing configuration/device/label inputs; no secret values |
| `evidence/rehearsal-timing.json` | Selected 97.027s clean-reset natural-expiry browser run |
| `evidence/first-rehearsal-timing.json` | Earlier passing 109.823s rehearsal; no usable video |
| `evidence/demo/` | Eight screenshots through final reset |
| `SHA256SUMS` | Integrity checks: run `sha256sum -c SHA256SUMS` from this directory |

App code is unchanged from `684e20b8a6d145be27fe5eadcc0be5b6fadbb761`, matching
independently reviewed `f025edd224fe06d2dadd94ae699dd393e8adf8da`. Changes are
rehearsal tools, docs and submission assets. Physical push receipts, live model
accuracy and survey responses remain pending. No deployment or submission.

## Replay

Open `REHEARSAL.html` locally for the timed companion, or play the MP4 directly.
It is silent, with burned-in action captions. Narrate with
the cue sheet. The wait for C is real elapsed time, not a clock jump. The PDF
embeds DejaVu Sans substituted for Aptos; native PowerPoint/venue playback still
needs the live check. Save copies on both laptops before rehearsal.

## Reproduce capture

Start Owl API 8017/web 3017 with explicit demo auth, fixture vision, simulated
notifications and an isolated SQLite database (see `docs/RUNBOOK.md`). This
script resets the instance at both ends and refuses live notification transport.
Use synthetic data only; do not run it during a physical FCM test.

Provide Playwright Core, compatible Chromium, and the matching Playwright FFmpeg
revision (install through that module's `cli.js install ffmpeg` if needed).
From repository root:

```bash
OWL_PLAYWRIGHT_MODULE=/path/to/playwright-core \
OWL_BROWSER_EXECUTABLE=/path/to/chromium \
OWL_REHEARSAL_ARTIFACTS=test-results/rehearsal-new \
node scripts/rehearse_demo.cjs

.venv/bin/python scripts/build_fallback_recording.py test-results/rehearsal-new \
  --ffmpeg /path/to/full-ffmpeg \
  --font /path/to/DejaVuSans.ttf \
  --output submission/Owl_Plate_Fallback.mp4
```

Selected raw WebMs remain locally under gitignored
`test-results/rehearsal/raw/`, referenced by the selected timing JSON. To rebuild
that selected recording, copy `evidence/rehearsal-timing.json` into an otherwise
empty capture directory as `timing.json` and pass that directory to the builder
from repository root. The raw relative paths then resolve correctly.

This host used browser libraries/fonts extracted under `/tmp/owl-browser-libs`;
shared T3 preview failed. No system packages were installed. Exact environment:
`FONTCONFIG_FILE=/tmp/owl-browser-libs/fonts.conf` and
`LD_LIBRARY_PATH=/tmp/owl-browser-libs/root/usr/lib/x86_64-linux-gnu:/tmp/owl-browser-libs/root/lib/x86_64-linux-gnu`.
Playwright module is `/tmp/owl-browser-run/node_modules/playwright-core`;
Chromium is `/home/node/.cache/ms-playwright/chromium_headless_shell-1254/chrome-headless-shell-linux64/chrome-headless-shell`;
matching FFmpeg cache is selected with
`PLAYWRIGHT_BROWSERS_PATH=/tmp/owl-rehearsal/playwright`.
Temporary Owl servers and all capture browsers were stopped after the take.

## Live evidence next

Use the consolidated return queue at the top of `docs/HANDOFF.md`: survey
copy/audience/distribution owner first. The single live checklist records
approved Android/Home Screen iPhone receipts and human-labeled photo evaluation.
Keep credentials in private secret cards/environment, never chat or recordings.
Reset clears push registrations; re-register after every reset.

## Full-clock rehearsal companion verification

`REHEARSAL.html` passed an actual 300.001-second offline technical run: the MP4
played 120.066–216.666s; slides transitioned at 240.001s and 275.001s. Captions and
stage visibility were visually reviewed. No page errors or external requests.
The log explicitly says no human speakers were present; actual spoken timing
still requires the team. To reproduce with the same Playwright/browser environment:

```bash
OWL_PLAYWRIGHT_MODULE=/path/to/playwright-core \
OWL_BROWSER_EXECUTABLE=/path/to/chromium \
node scripts/verify_rehearsal.cjs
```

This runs the five-minute clock in real time, opens only the local rehearsal
file, and closes its browser. Evidence defaults to gitignored test-results/playback.
No application server, live push, survey distribution or deployment is involved.
