PYTHON := .venv/bin/python
RUFF := .venv/bin/ruff

.PHONY: setup seed dev test lint types eval demo smoke deck
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

lint:
	$(RUFF) check services scripts data/eval
	$(RUFF) format --check services scripts data/eval
	cd apps/web && npm run lint

types:
	$(PYTHON) -m scripts.export_openapi
	cd apps/web && npx --yes openapi-typescript@7.10.1 openapi.json -o lib/api.generated.ts

eval:
	$(PYTHON) data/eval/run.py --fixtures

smoke:
	AUTH_MODE=demo DEMO_MODE=true VISION_PROVIDER=fixture NOTIFICATION_PROVIDER=log $(PYTHON) -m scripts.demo --verify

deck:
	$(PYTHON) scripts/build_deck.py
