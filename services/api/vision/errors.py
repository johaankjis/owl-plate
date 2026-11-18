"""Fail-closed vision errors that name the provider but never leak internals."""


class VisionUnavailable(RuntimeError):
    """Carry the provider-specific human message for a fail-closed vision request.

    The message is what the API returns to the host, so it must name the provider
    and contain no key, URL or response body.
    """

    def __init__(self, message: str) -> None:
        super().__init__(message)
