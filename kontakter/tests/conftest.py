"""Delad testkonfiguration: gör projektets moduler importerbara och pekar om
scraperns katalog-sidoeffekter (os.makedirs på import) till en temp-katalog."""
import os
import sys
import atexit
import shutil

_HERE = os.path.dirname(__file__)
_ROOT = os.path.join(_HERE, "..")

# Modulerna ligger i scraper/, export/ och verify/ — lägg dem på importvägen.
for sub in ("scraper", "export", "verify"):
    sys.path.insert(0, os.path.abspath(os.path.join(_ROOT, sub)))

# Scraper output is isolated beneath the repo for tests; no public /tmp directory is used.
_TEST_ROOT = os.path.abspath(os.path.join(_ROOT, "scraper", ".test-output"))
shutil.rmtree(_TEST_ROOT, ignore_errors=True)
atexit.register(shutil.rmtree, _TEST_ROOT, ignore_errors=True)
os.environ["QUILL_SCRAPER_TEST_MODE"] = "1"
os.environ.setdefault("LOG_DIR", "./logs")
os.environ.setdefault("OUTPUT_DIR", "./output")

# Kontaktlistor och källkataloger ligger aldrig i repot; testerna läser exemplen.
os.environ.setdefault("CONTACT_SOURCES_DIR", os.path.abspath(os.path.join(_ROOT, "sources.example")))
