import pytest

import sources


def test_sources_dir_accepts_an_operator_configured_external_directory(monkeypatch, tmp_path):
    monkeypatch.setenv("CONTACT_SOURCES_DIR", str(tmp_path))
    assert sources.sources_dir() == tmp_path.resolve()


def test_sources_dir_rejects_unexpected_directories_inside_repository(monkeypatch):
    monkeypatch.setenv("CONTACT_SOURCES_DIR", str(sources.REPO_ROOT / "docs"))
    with pytest.raises(SystemExit, match="utanför repot"):
        sources.sources_dir()


def test_sources_load_rejects_path_segments_in_source_name():
    with pytest.raises(ValueError, match="källnamn"):
        sources.load("../secrets")
