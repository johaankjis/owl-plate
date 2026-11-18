# Two-minute survey: food after campus events

**Approval needed first:** standalone web form at `/survey` on the assigned Owl Plate HTTPS origin. Proposed audience: KSU students approached directly in person by Johaan or one named teammate. Share the dedicated survey QR or link only after approval. No Discord or group-channel distribution. Nothing has been distributed; **n=0**. Public link/QR await Vercel/API deployment approval and origin assignment.


The final form is implemented at `apps/web/app/survey/page.tsx` for Johaan to review before collection/distribution. Participation is voluntary; do not collect names, emails, IDs, CARE status, phone numbers or precise locations. Skip any question. Do not publish raw free text. This survey is project research, not a KSU service or promise of food.

1. Which campus are you usually on? Kennesaw / Marietta / Both / Prefer not to say
2. In the past month, how often did money or time lead you to skip a meal? Never / Once or twice / Weekly / More than weekly / Prefer not to say
3. Have you seen leftover food from a campus event get thrown away? Yes / No / Unsure
4. Have you heard about free leftover food too late to get any? Yes / No / Unsure
5. Before this survey, had you heard of KSU CARE Services pantries? Yes / No / Unsure
6. Would you choose to receive alerts when free food is available nearby? Yes / Maybe / No
7. If you host events, what usually happens to leftovers? Taken home / Thrown away / Posted in a group / Other / I do not host
8. Optional: What would make a leftover-food alert useful? Please do not include identifying information.

Copy-ready distribution text (not sent):

> We’re building Owl Plate for the AI Club hackathon: a host photographs leftover event food, reviews an estimate, and invites nearby students who can eat it. Help us understand campus needs with a voluntary two-minute anonymous survey: [FORM LINK]. Skip any question; please don’t enter names or personal details. We’ll report aggregate counts with the number of responses. This is a student prototype, not an official KSU service.

Proposed close: Thursday evening. Collection remains disabled (`SURVEY_ENABLED=false`) until Johaan approves. Store raw export locally under gitignored `data/survey/`. Report answered n for each item, counts, percentages, collection window and convenience-sample limits. Do not imply this sample estimates campus prevalence. Current actual responses: **n = 0; not collected**. No result belongs on the deck until collected.


Final sharing plan for approval:

1. Johaan or his named teammate invites KSU students directly in person, without
   pressure, using the exact invitation above and a standalone survey QR/link.
2. No Discord posts, group-channel posts, bulk messages or mailing lists.
3. No account/sign-in or student identifier requested. Participation/each answer
   is voluntary. Optional feedback is capped at 500 characters with the displayed
   instruction not to include identifying information.
4. Review form preview first; publish/open collection only after approval. Test
   preview receipts never save or count. Count actual submissions, not inferred
   unique people. Report per-question answered n and convenience-sample limits.
5. Store raw data/export privately. The form has no public results page. No
   public survey response count is shown; current actual count stays n=0.
