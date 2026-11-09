#!/usr/bin/env python3
"""Package the installable plugin without runtime data or downloaded audio."""
import hashlib
import json
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

root = Path(__file__).resolve().parent.parent
manifest = json.loads((root / "plugin.json").read_text())
json.loads((root / "locales/zh-CN.json").read_text())
files = ["plugin.json", manifest["main"], "locales/zh-CN.json", "README.md", "LICENSE"]
output = root / "artifacts/plugin.zip"
output.parent.mkdir(exist_ok=True)
with ZipFile(output, "w", compression=ZIP_DEFLATED) as archive:
    for name in files:
        archive.write(root / name, name)
digest = hashlib.sha256(output.read_bytes()).hexdigest()
(output.parent / "plugin.zip.sha256").write_text(f"{digest}  plugin.zip\n")
print(json.dumps({"file": str(output), "version": manifest["version"], "sha256": digest}, indent=2))
