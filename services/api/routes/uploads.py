"""Keep photo multipart parsing bounded and in memory before FastAPI reads the form."""

from collections.abc import AsyncIterator, Awaitable, Callable

from fastapi import HTTPException, Request, Response
from fastapi.routing import APIRoute
from starlette.formparsers import MultiPartException, MultiPartParser

# One 10 MiB image plus bounded multipart metadata. The image validator owns the
# exact photo limit; this envelope prevents buffering arbitrary request bodies.
MAX_MULTIPART_BYTES = 10 * 1024 * 1024 + 64 * 1024


class UploadBodyTooLarge(MultiPartException):
    """Let Starlette close any partially parsed form before returning our error."""


class MemoryPhotoParser(MultiPartParser):
    """Never spill a bounded photo request to a temporary file on disk."""

    spool_max_size = MAX_MULTIPART_BYTES + 1


class MemoryPhotoRoute(APIRoute):
    """Populate the normal request form cache using a bounded, memory-only parser."""

    def get_route_handler(self) -> Callable[[Request], Awaitable[Response]]:
        """Preserve FastAPI validation/OpenAPI while replacing upload storage only."""
        handler = super().get_route_handler()

        async def memory_form_handler(request: Request) -> Response:
            if request.headers.get("content-type", "").startswith("multipart/form-data"):

                async def bounded_stream() -> AsyncIterator[bytes]:
                    received = 0
                    async for chunk in request.stream():
                        received += len(chunk)
                        if received > MAX_MULTIPART_BYTES:
                            raise UploadBodyTooLarge("Photo request exceeds the upload limit.")
                        yield chunk

                parser = MemoryPhotoParser(
                    request.headers, bounded_stream(), max_files=1, max_fields=2
                )
                try:
                    # Request.form() uses this cache, and FastAPI closes the form
                    # after handling the request, including validation failures.
                    request._form = await parser.parse()
                except UploadBodyTooLarge:
                    raise HTTPException(
                        413, detail={"code": "photo_too_large", "message": "Photo exceeds 10 MiB."}
                    ) from None
                except MultiPartException:
                    raise HTTPException(
                        422, detail={"code": "invalid_photo", "message": "Use one JPEG or PNG."}
                    ) from None
                try:
                    return await handler(request)
                finally:
                    await request._form.close()
            return await handler(request)

        return memory_form_handler
