"""Framework multipart buffering must honor the same no-disk promise as the service."""

import tempfile

from starlette import formparsers

from services.api.tests.pickup.test_pickup_routes import held, photo


def test_large_multipart_photo_never_rolls_to_disk(feed_client, monkeypatch) -> None:
    """Catch the framework's normal 1 MiB rollover, which service mocks cannot see."""
    opened = []

    def memory_file(*args, **kwargs):
        stream = tempfile.SpooledTemporaryFile(*args, **kwargs)  # noqa: SIM115 - parser closes it
        opened.append(stream)
        return stream

    monkeypatch.setattr(formparsers, "SpooledTemporaryFile", memory_file)
    headers, _, claim_id = held(feed_client)
    response = photo(
        feed_client, headers, claim_id, file=("large.png", b"x" * (2 * 1024 * 1024), "image/png")
    )
    assert response.status_code == 200
    assert opened and all(not stream._rolled and stream.closed for stream in opened)


def test_multipart_envelope_is_bounded_without_disk_spill(feed_client, monkeypatch) -> None:
    """Reject excessive bodies during parsing, before any provider or disk write."""
    opened = []

    def memory_file(*args, **kwargs):
        stream = tempfile.SpooledTemporaryFile(*args, **kwargs)  # noqa: SIM115 - parser closes it
        opened.append(stream)
        return stream

    monkeypatch.setattr(formparsers, "SpooledTemporaryFile", memory_file)
    headers, _, claim_id = held(feed_client)
    response = photo(
        feed_client, headers, claim_id, file=("large.png", b"x" * (11 * 1024 * 1024), "image/png")
    )
    assert response.status_code == 413
    assert response.json()["detail"]["code"] == "photo_too_large"
    assert all(not stream._rolled and stream.closed for stream in opened)
