PYTHON ?= .venv/bin/python
RUFF ?= .venv/bin/ruff

.PHONY: setup seed dev test lint types eval demo smoke deck present present-live present-openrouter present-zima present-live-zima present-openrouter-zima demo-reset campus
setup:
	test -x $(PYTHON) || uv venv --python 3.11 .venv
	uv pip install --python $(PYTHON) -e '.[dev,submission]'
	cd apps/web && npm ci

seed:
	AUTH_MODE=demo DEMO_MODE=true VISION_PROVIDER=fixture NOTIFICATION_PROVIDER=log $(PYTHON) -m scripts.demo --reset

demo: seed

dev:
	$(PYTHON) -m scripts.dev

test:
	$(PYTHON) -m pytest
	$(PYTHON) -m unittest discover -s data/eval -p 'test_*.py'
	$(PYTHON) -m unittest discover -s data/campus -p 'test_*.py'
	$(PYTHON) -m unittest discover -s prototypes/itcan/tests -p 'test_*.py'
	cd apps/web && npm test

campus:
	$(PYTHON) data/campus/validate_marietta.py
	$(PYTHON) -m unittest discover -s data/campus -p 'test_*.py'

lint:
	$(RUFF) check services scripts data/eval data/campus
	$(RUFF) format --check services scripts data/eval data/campus
	cd apps/web && npm run lint

types:
	$(PYTHON) -m scripts.export_openapi
	cd apps/web && npx --yes openapi-typescript@7.10.1 openapi.json -o lib/api.generated.ts
	cd apps/web && npx prettier --write openapi.json lib/api.generated.ts

eval:
	$(PYTHON) data/eval/run.py --fixtures

smoke:
	AUTH_MODE=demo DEMO_MODE=true VISION_PROVIDER=fixture NOTIFICATION_PROVIDER=log $(PYTHON) -m scripts.demo --verify

deck:
	$(PYTHON) scripts/build_deck.py

present:
	$(PYTHON) -m scripts.present

present-live:
	$(PYTHON) -m scripts.present --vision gemini

present-openrouter:
	$(PYTHON) -m scripts.present --vision openrouter

present-zima:
	PRESENT_HOST=0.0.0.0 $(PYTHON) -m scripts.present

present-live-zima:
	PRESENT_HOST=0.0.0.0 $(PYTHON) -m scripts.present --vision gemini

present-openrouter-zima:
	PRESENT_HOST=0.0.0.0 $(PYTHON) -m scripts.present --vision openrouter

demo-reset:
	$(PYTHON) -m scripts.present --reset-only

.PHONY: verify-feed rehearse-seeded
verify-feed:
	OWL_WEB_URL=http://127.0.0.1:3027 node scripts/verify_campus_feed.cjs

rehearse-seeded:
	OWL_WEB_URL=http://127.0.0.1:3027 OWL_API_URL=http://127.0.0.1:8027 node scripts/rehearse_demo.cjs

.PHONY: verify-pickup
verify-pickup:
	OWL_WEB_URL=http://127.0.0.1:3027 node scripts/verify_pickup_routes.cjs

.PHONY: verify-pickup-mobile
verify-pickup-mobile:
	OWL_WEB_URL=http://127.0.0.1:3027 node scripts/verify_pickup_mobile.cjs

.PHONY: verify-map
verify-map:
	OWL_WEB_URL=http://127.0.0.1:3027 node scripts/verify_campus_map.cjs

.PHONY: verify-pantry-routes verify-pantry-ui
verify-pantry-routes:
	OWL_WEB_URL=http://127.0.0.1:3027 node scripts/verify_pantry_routes.cjs

verify-pantry-ui:
	OWL_WEB_URL=http://127.0.0.1:3027 node scripts/verify_pantry_ui.cjs

.PHONY: verify-operations
verify-operations:
	OWL_WEB_URL=http://127.0.0.1:3027 node scripts/verify_operations_routes.cjs

.PHONY: verify-operations-ui
verify-operations-ui:
	OWL_WEB_URL=http://127.0.0.1:3027 node scripts/verify_operations_ui.cjs

.PHONY: recording-dataset
recording-dataset:
	$(PYTHON) -m scripts.load_recording_dataset --confirm-replace-demo-data
