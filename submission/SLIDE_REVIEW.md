# Slide review — November 18, 2026

All seven slides from `Owl_Plate_Pitch.pptx` were rendered with LibreOffice
7.4.7 to `evidence/slides/Owl_Plate_Pitch.pdf` and 1600×901 PNGs. The manager
visually inspected every slide individually after the edits below, as well as
an initial contact sheet. The PDF embeds DejaVu Sans, substituted for the deck's
Aptos. Native PowerPoint and venue-projector checks remain pending; the PDF is
the fixed-layout backup for font differences. No claims of a live rehearsal
or audience readability test are implied.

| Slide | Visual review | Evidence wording / timing |
|---|---|---|
| 1 — Owl Plate | Pass: clear title, high contrast, no clipping | Synthetic accounts and fixture footer visible; 0:00–0:15 |
| 2 — A short window to share | Pass: all three lines readable, generous spacing | Survey explicitly pending, actual n=0; 0:15–1:00 |
| 3 — Photo → review → invite | Pass: subtitle and all four lines fit | Allergen estimate notice visible; fixture footer distinguishes intended Gemini path from this rehearsal; 1:00–2:00 |
| 4 — The first wave | Pass: six persona lines fit above footer | Simulated personas; B “is skipped” avoids a safety guarantee; 2:00–3:00 demo cue |
| 5 — Hold one. Widen the search. | Pass: all lines fit without wrap/clipping | 60-second demo expiry and transactional claims stated accurately; 3:00–4:00 demo cue |
| 6 — Built to explain and rehearse | Pass: architecture line and four bullets readable | Says FCM adapter; does not claim physical receipt; 4:00–4:35 |
| 7 — Next: verify the evidence | Pass: all next steps visible | Device receipt, measured vision, survey and policy still pending; 4:35–5:00 |

Edits made this rehearsal:

- All seven slide footers now say **FIXTURE VISION / SIMULATED ALERTS / LIVE EVIDENCE PENDING**, at 12pt instead of the previous 10pt draft footer.
- Slide 4 subtitle: “B stays safe” → **“B is skipped.”**
- No statistics, measured vision values, partnerships or live push claims added.
- Generator `scripts/build_deck.py` and editable PowerPoint regenerated together.

Verification: seven editable slides, nonempty speaker notes on all seven,
all shape bounds inside slide dimensions, valid archive, successful PDF rendering.
Titles 38pt, subtitles 27pt, body 22pt (slide 4: 20pt), footer 12pt. At the
review resolution, body/labels were legible and no text collided with footer.

Timing: speaker-note allocations sum to exactly 300 seconds. The cue sheet's
spoken problem/solution/architecture sections contain 100/102/105 words;
at 115 words/minute they take about 52/53/55 seconds before pauses. The selected
natural-expiry browser run took 97.027 seconds, leaving roughly 23 seconds in
the two-minute demonstration block. Narration must overlap the actions and wait.
These are a measured automated demo and estimated speech timings, **not a timed
human five-minute pitch**. Thursday evening still needs the three human runs and
actual teammate handoffs in `PITCH_SCRIPT.md`.
