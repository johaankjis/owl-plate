"""Exercise the real web app behind loopback TLS without publishing a deployment."""

import argparse
import ssl
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import httpx


def serve(cert: str, key: str, port: int, web_port: int) -> None:
    """Keep local verification on loopback; never imply this certificate is public trust."""

    class Proxy(BaseHTTPRequestHandler):
        def forward(self) -> None:
            """Retain same-origin behavior while testing TLS only on loopback."""
            size = int(self.headers.get("Content-Length", "0"))
            if size > 11 * 1024 * 1024:
                self.send_error(413)
                return
            body = self.rfile.read(size) if size else None
            headers = {
                k: v
                for k, v in self.headers.items()
                if k.lower() not in {"host", "connection", "accept-encoding", "content-length"}
            }
            headers["X-Forwarded-Proto"] = "https"
            with httpx.Client(timeout=70, trust_env=False) as client:
                response = client.request(
                    self.command,
                    f"http://127.0.0.1:{web_port}{self.path}",
                    content=body,
                    headers=headers,
                )
            self.send_response(response.status_code)
            for k, v in response.headers.items():
                if k.lower() not in {
                    "transfer-encoding",
                    "connection",
                    "content-encoding",
                    "content-length",
                }:
                    self.send_header(k, v)
            self.send_header("Content-Length", str(len(response.content)))
            self.end_headers()
            self.wfile.write(response.content)

        do_GET = do_POST = do_PATCH = do_PUT = do_OPTIONS = forward

        def log_message(self, format: str, *args: object) -> None:
            """Avoid recording survey request details or device addresses during checks."""

    server = ThreadingHTTPServer(("127.0.0.1", port), Proxy)
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.load_cert_chain(cert, key)
    server.socket = context.wrap_socket(server.socket, server_side=True)
    print(f"Local TLS review: https://localhost:{port}; not a public demo URL", flush=True)
    try:
        server.serve_forever()
    finally:
        server.server_close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cert", required=True)
    parser.add_argument("--key", required=True)
    parser.add_argument("--port", type=int, default=3443)
    parser.add_argument("--web-port", type=int, default=3017)
    args = parser.parse_args()
    serve(args.cert, args.key, args.port, args.web_port)
