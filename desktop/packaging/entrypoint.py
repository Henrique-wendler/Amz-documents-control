"""Thin launcher, with diagnostics even if a bundled dependency fails to import."""
import json
import os
from pathlib import Path
import sys
import traceback


def launch() -> int:
    try:
        from amazon_agro.app.main import main
        return main()
    except Exception as error:
        if "--smoke-test" in sys.argv:
            root = Path(sys.argv[sys.argv.index("--smoke-test") + 1]).resolve()
            if root.exists():
                # configure_smoke deliberately rejects reuse of an existing directory.
                return 1
            root.mkdir(parents=True)
            (root / "report.json").write_text(json.dumps({"ok": False,
                "error": f"{type(error).__name__}: {error}"}), encoding="utf-8")
        else:
            root = Path(os.environ.get("LOCALAPPDATA", str(Path.home()))) / "AmazonAgro"
            root.mkdir(parents=True, exist_ok=True)
        (root / "startup-error.log").write_text(traceback.format_exc(), encoding="utf-8")
        if "--smoke-test" in sys.argv and getattr(sys, "frozen", False):
            import ctypes
            kernel = ctypes.WinDLL("kernel32", use_last_error=True)
            kernel.GetModuleHandleW.restype = ctypes.c_void_p
            details = []
            for name in ("Qt6Core.dll", "pyside6.abi3.dll", "shiboken6.abi3.dll",
                         "MSVCP140.dll", "VCRUNTIME140.dll", "icuuc.dll"):
                handle = kernel.GetModuleHandleW(name)
                buffer = ctypes.create_unicode_buffer(32768)
                kernel.GetModuleFileNameW(ctypes.c_void_p(handle), buffer, len(buffer))
                details.append(f"{name}: {buffer.value if handle else 'not loaded'}")
            (root / "dll-diagnostic.log").write_text("\n".join(details), encoding="utf-8")
        if "--smoke-test" not in sys.argv and sys.platform == "win32":
            import ctypes
            ctypes.windll.user32.MessageBoxW(None,
                "Não foi possível iniciar o Amazon Agro Propostas. Os detalhes foram registrados no log de inicialização em LOCALAPPDATA\\AmazonAgro.",
                "Amazon Agro Propostas", 0x10)
        return 1


if __name__ == "__main__":
    raise SystemExit(launch())
