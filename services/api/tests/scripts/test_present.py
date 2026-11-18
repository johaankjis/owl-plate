"""Keep the live-vision launcher honest about credentials before starting anything."""

import pytest

from scripts import present


@pytest.fixture
def isolated_env(tmp_path, monkeypatch):
    """Point the launcher at an empty private root so real credentials never leak in."""
    monkeypatch.setattr(present, "ROOT", tmp_path)
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.delenv("GEMINI_MODEL", raising=False)
    return tmp_path


def test_missing_key_exits_with_private_setup_message(isolated_env) -> None:
    with pytest.raises(SystemExit) as exc_info:
        present.resolve_gemini_credentials()
    message = str(exc_info.value)
    assert "GEMINI_API_KEY=..." in message
    assert str(isolated_env / ".env") in message
    assert "gitignored" in message
    assert "export GEMINI_API_KEY=..." in message


def test_key_is_read_from_gitignored_dotenv(isolated_env) -> None:
    (isolated_env / ".env").write_text("GEMINI_API_KEY=from-dotenv\nGEMINI_MODEL=chosen-model\n")
    api_key, model = present.resolve_gemini_credentials()
    assert api_key == "from-dotenv"
    assert model == "chosen-model"


def test_shell_export_wins_and_model_gets_confirmed_default(isolated_env, monkeypatch) -> None:
    (isolated_env / ".env").write_text("GEMINI_API_KEY=from-dotenv\n")
    monkeypatch.setenv("GEMINI_API_KEY", "from-shell")
    api_key, model = present.resolve_gemini_credentials()
    assert api_key == "from-shell"
    assert model == present.DEFAULT_GEMINI_MODEL


def test_gemini_mode_sets_provider_and_credentials(isolated_env, monkeypatch) -> None:
    monkeypatch.setenv("GEMINI_API_KEY", "from-shell")
    env = present.vision_environment("gemini")
    assert env == {
        "VISION_PROVIDER": "gemini",
        "GEMINI_API_KEY": "from-shell",
        "GEMINI_MODEL": present.DEFAULT_GEMINI_MODEL,
    }


def test_fixture_mode_is_unchanged_and_needs_no_key(isolated_env) -> None:
    assert present.vision_environment("fixture") == {"VISION_PROVIDER": "fixture"}
