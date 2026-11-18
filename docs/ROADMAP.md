# ROADMAP.md

From Wednesday morning to Friday noon. Update checkboxes as work lands.

## Wednesday: prove the risky parts, then the core

Morning (prove before building)
* [ ] Push hello world: one phone (Android) and one iPhone (Home Screen) receive an FCM web push from the deployed web app
* [ ] Vision test: 10 food photos through Gemini with the JSON schema; servings within plus or minus 2 on most
* [ ] Entra test: sign in with a KSU account. If "Need admin approval," set `AUTH_MODE=email_code`
* [ ] Launch the survey (see DATA.md)

Afternoon and night
* [ ] Repo scaffold matching AGENTS.md, Makefile, `.env.example`, lint, CI for tests
* [ ] DB models and seed (buildings, simulated students, personas)
* [ ] `POST /drops` with vision, host review page
* [ ] Dispatch engine with all required tests from DISPATCH.md
* [ ] Publish sends wave 1 pushes to persona phones

Goal by end of Wednesday: photo in, right phones buzz.

## Thursday: complete the loop and the story

* [ ] Claims, declines, 10 minute holds
* [ ] Scheduler: expiry, next wave, wider ring
* [ ] Dispatch screen with deck.gl map, H3 rings, reasons
* [ ] Student onboarding: sign in, allergens, diets, alerts, iPhone Home Screen guide
* [ ] Vision eval set and `make eval`; numbers into the deck
* [ ] Privacy and safety: host checklist, minimal lock screen text, photo deletion
* [ ] Close survey, chart results
* [ ] Twilio SMS fallback
* [ ] Deck (PowerPoint) following DEMO.md
* [ ] Record the demo video
* [ ] Rehearse three times with real phones
* [ ] Codebase cleanup pass for Nudox: README, docstrings, no dead code, tests green

## Friday

* [ ] Submit deck and video before 12:00 PM
* [ ] `make demo` on both laptops, charge every phone, test pushes on venue Wi Fi
* [ ] Pitch 5:30 to 8:30 PM

## Cut order if behind

Cut from the top first:
1. Meal swipe matching (mention as next step)
2. Bedrock fallback provider
3. Twilio SMS fallback
4. Entra sign in (use email code or demo mode)
5. Learned show rate (keep fixed r = 0.6)

Never cut: photo to vision estimate, allergen hard filter, just enough wave sizing, real phone pushes, widening second wave, dispatch screen with reasons, survey data, measured vision accuracy.
