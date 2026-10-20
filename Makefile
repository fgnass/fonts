# The data pipeline: `make` builds everything in public/data/ that is out of
# date. Every step depends on its input data and on its own script, so a
# changed script runs again with all steps after it. Shared code (src/shape.js,
# scripts/glyph.mjs) is no prerequisite: after a change there, run the steps
# that need it with `make -W <script>` (see README.md).
#
# Steps with a directory as output write a stamp file to data/.stamps/.
# The network downloads and the DINOv2 skeleton embeddings (hours on a CPU)
# run only when their inputs change, not when their scripts change.

NODE := node
PY := uv run --quiet
STAMPS := data/.stamps
METRICS := data/metrics
PUB := public/data

PARTS := base width caps ornate form stroke-fill connected distinct recognize

.PHONY: all download refresh index embeddings metrics
.DELETE_ON_ERROR:

all: $(PUB)/fonts.json $(STAMPS)/topology $(STAMPS)/embeddings $(PUB)/style.bin \
	$(PUB)/metrics.json $(PUB)/tech.json $(PUB)/ligatures.json

# Downloads new Google Fonts families. Changes data/manifest.json, so all later steps run again.
download:
	$(NODE) scripts/download.mjs

# Downloads the files of the known families again (for example after new characters in src/chars.js).
refresh:
	$(NODE) scripts/download.mjs --refresh

data/manifest.json:
	$(NODE) scripts/download.mjs

index: $(PUB)/fonts.json $(STAMPS)/topology
embeddings: $(STAMPS)/embeddings
metrics: $(PUB)/metrics.json

$(STAMPS):
	mkdir -p $@

# Skeletons

$(PUB)/fonts.json: data/manifest.json scripts/build-index.mjs scripts/medial.mjs
	$(NODE) scripts/build-index.mjs

$(STAMPS)/topology: data/manifest.json scripts/build-topology.mjs scripts/glyph-topology.mjs | $(STAMPS)
	$(NODE) scripts/build-topology.mjs
	touch $@

# Embeddings

$(STAMPS)/emb-skel: data/manifest.json | $(STAMPS)
	$(NODE) scripts/embed.mjs --skeleton
	touch $@

$(STAMPS)/embeddings: $(STAMPS)/emb-skel scripts/pack-embeddings.py
	$(PY) scripts/pack-embeddings.py
	touch $@

data/emb-style.f32: data/manifest.json scripts/embed-style.mjs
	$(NODE) scripts/embed-style.mjs

$(PUB)/style.bin: data/emb-style.f32 scripts/pack-style.py
	$(PY) scripts/pack-style.py

# Metrics: one part per script in data/metrics/ (see scripts/metrics.mjs)

$(STAMPS)/variants: data/manifest.json | $(STAMPS)
	$(NODE) scripts/download-variants.mjs
	touch $@

$(METRICS)/base.json: data/manifest.json $(STAMPS)/variants scripts/measure.mjs
	$(NODE) scripts/measure.mjs

$(METRICS)/width.json: data/manifest.json scripts/measure-width.py
	$(PY) scripts/measure-width.py

$(METRICS)/caps.json: $(PUB)/fonts.json scripts/caps.mjs
	$(NODE) scripts/caps.mjs

$(METRICS)/ornate.json: data/manifest.json scripts/ornate.mjs
	$(NODE) scripts/ornate.mjs

$(METRICS)/form.json: data/manifest.json $(METRICS)/base.json scripts/form.mjs
	$(NODE) scripts/form.mjs

$(METRICS)/stroke-fill.json: data/manifest.json scripts/stroke-fill.mjs
	$(NODE) scripts/stroke-fill.mjs

$(METRICS)/connected.json: data/manifest.json $(METRICS)/caps.json scripts/connected.mjs
	$(NODE) scripts/connected.mjs

$(METRICS)/distinct.json: $(PUB)/fonts.json scripts/distinct.mjs
	$(NODE) scripts/distinct.mjs

$(METRICS)/recognize.json: $(STAMPS)/emb-skel $(PUB)/fonts.json $(METRICS)/distinct.json scripts/recognize.py
	$(PY) scripts/recognize.py

$(PUB)/metrics.json: $(PARTS:%=$(METRICS)/%.json) scripts/merge-metrics.mjs scripts/metrics.mjs
	$(NODE) scripts/merge-metrics.mjs

# Technical data from the full font files

$(PUB)/tech.json: data/manifest.json scripts/tech.py
	$(PY) scripts/tech.py

$(PUB)/ligatures.json: data/manifest.json scripts/extract-ligatures.py
	$(PY) scripts/extract-ligatures.py
