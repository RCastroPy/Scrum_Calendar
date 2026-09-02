import importlib.util
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def _load_build_module():
    path = ROOT / "scripts" / "build_vercel_frontend.py"
    spec = importlib.util.spec_from_file_location("build_vercel_frontend", path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def test_vercel_config_is_valid_and_proxies_render():
    config = json.loads((ROOT / "vercel.json").read_text(encoding="utf-8"))

    assert config["outputDirectory"] == ".vercel-static"
    assert config["redirects"][0]["destination"] == "/ui/index.html"
    assert config["rewrites"][0]["destination"].startswith(
        "https://scrumia-api-rcastropy.onrender.com/"
    )


def test_websocket_base_requires_an_absolute_http_url():
    module = _load_build_module()

    assert module.websocket_base("https://api.example.com/") == "wss://api.example.com"
    assert module.websocket_base("http://localhost:8000") == "ws://localhost:8000"


def test_runtime_config_is_injected_before_app_script():
    module = _load_build_module()
    html = '<body><script src="./app.js?v=1"></script></body>'

    result = module.inject_runtime_config(html)

    assert result.index("runtime-config.js") < result.index("app.js?v=1")
