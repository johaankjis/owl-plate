# PRIVACY_SAFETY.md

Rules for student dignity, privacy and food safety. These are product requirements, not nice to haves.

## Dignity

* Every alert looks the same whether or not the student is prioritized.
* Prioritization (CARE tier) is set only by CARE staff through an admin role. Students cannot see their own tier in the app, and nothing in the UI hints at it.
* Hosts never see who was invited or who claimed. They see counts only ("6 of 8 claimed").
* Pickup needs no ID or proof. The student just shows up.
* No leaderboards, badges or public activity related to receiving food.

## Privacy

* Sign in proves KSU membership. We store a hash of the KSU email, a display name and preferences. No student ID number, no schedule details beyond chosen buildings.
* Location is coarse (building or H3 cell) and short lived (check ins expire after 2 hours). No GPS tracking, no location history beyond 7 days of aggregate counts.
* Push tokens and phone numbers are encrypted at rest.
* Lock screen notifications show minimal text. Details load after the app opens.
* Photos go to S3 with a 24 hour lifecycle deletion rule. Photos must show food only; the host screen reminds them not to photograph people.
* Allergen and diet preferences are used only for filtering and never shown to anyone else.
* Simulated students in the demo are clearly fake and labeled.

## Food safety

* Owl Plate does not judge whether food is safe to eat. Hosts confirm a short checklist before publishing:
  * Food has been kept covered and at a safe temperature
  * Food was served within the last 2 hours (TODO(verify) against KSU and county guidance)
  * Food is untouched (not from individual plates)
* Every drop shows "Offered in good faith by the host. Allergens are AI estimates; confirm with the host."
* Default drop expiry is 45 minutes from publish. Hosts can shorten it, not extend past 2 hours.
* Allergen detection is an estimate. We never say "allergen free." If vision confidence is low, the drop is tagged with all common allergens until the host clears them.
* TODO(verify): KSU's policy on redistributing leftover catered food, and whether KSU Dining or catering contracts restrict it. Do not claim KSU approval in the pitch until verified.

## Abuse and misuse

* Rate limit drops per host and claims per student.
* Students who claim and never show repeatedly get lower reliability in ranking, not a ban.
* Hosts can report a no show crowd or misuse; admins can pause a host.

## What we say if asked

"We designed for dignity first: nobody can tell who was prioritized, hosts never see names, and location is coarse and temporary. Allergens are estimates and we say so on every alert. Food safety stays with the host under KSU's rules, and the app makes them confirm before posting."
