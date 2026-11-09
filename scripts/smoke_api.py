"""Exercise the released model over a real localhost HTTP connection."""
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import time
from urllib.error import URLError
from urllib.request import Request, urlopen

root = Path(__file__).resolve().parents[1]
cache = root / ".cache"
cache.mkdir(exist_ok=True)
with socket.socket() as sock:
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
env = dict(os.environ, PYTHONPATH=str(root / "src"))
with (cache / "api-smoke.log").open("w") as log:
    server = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "wine_lab.api:app", "--host", "127.0.0.1", "--port", str(port)],
        cwd=root, env=env, stdout=log, stderr=subprocess.STDOUT,
    )
    try:
        origin = f"http://127.0.0.1:{port}"
        for _ in range(60):
            try:
                with urlopen(origin + "/health", timeout=2) as response:
                    assert json.load(response)["status"] == "ok"
                break
            except (URLError, TimeoutError):
                if server.poll() is not None:
                    raise RuntimeError("API server exited; inspect .cache/api-smoke.log")
                time.sleep(.25)
        else:
            raise TimeoutError("API startup exceeded 15 seconds")
        body = (root / "examples/request.json").read_bytes()
        request = Request(origin + "/predict", data=body, headers={"Content-Type": "application/json"})
        with urlopen(request, timeout=10) as response:
            payload = json.load(response)
        assert len(payload["predictions"]) == 1
        assert isinstance(payload["predictions"][0]["predicted_quality"], float)
        summary = {"transport": "real localhost HTTP", "status": "passed", "response": payload}
        (root / "reports/http_smoke.json").write_text(json.dumps(summary, indent=2) + "\n")
        print(json.dumps(summary, indent=2))
    finally:
        server.terminate()
        try:
            server.wait(timeout=5)
        except subprocess.TimeoutExpired:
            server.kill()
            server.wait(timeout=5)
