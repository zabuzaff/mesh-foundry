"""Run the local Curls fit and matched renders from exact CLI file pins."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("pins", type=Path, help="JSON with project, conceptRevision, prototypeRevision and files")
parser.add_argument("output", type=Path)
parser.add_argument("--setback", type=float, required=True)
parser.add_argument("--nose-relief", type=float, required=True)
args = parser.parse_args()
pins = json.loads(args.pins.read_text())
files = pins["files"]
for kind in ("blend", "model", "image"):
    entry = files[kind]
    path = Path(entry["path"]).resolve()
    if hashlib.sha256(path.read_bytes()).hexdigest() != entry["hash"]:
        parser.error(f"SHA-256 mismatch for {kind}")
    entry["path"] = str(path)

scripts = Path(__file__).resolve().parent
blender = os.environ.get("MESH_FOUNDRY_BLENDER", "blender")
output = args.output.resolve()
output.mkdir()
fit = output / "fit"

def run(script, *arguments):
    subprocess.run(
        [blender, "-b", "--disable-autoexec", "-t", "4", "--python-exit-code", "1",
         "--python", str(scripts / script), "--", *map(str, arguments)],
        check=True,
    )

run("fit-glasses.py", files["blend"]["path"], files["image"]["path"], fit,
    "--source-sha256", files["blend"]["hash"], "--concept-sha256", files["image"]["hash"],
    "--setback", args.setback, "--nose-relief", args.nose_relief)
before, after = output / "before", output / "after"
before.mkdir()
after.mkdir()
run("render-reference.py", files["model"]["path"], before, "comparison")
run("render-reference.py", fit / "kairo-curls.glb", after, before / "resolved.json")
if (before / "resolved.json").read_bytes() != (after / "resolved.json").read_bytes():
    raise RuntimeError("Comparison framing differs")
report = json.loads((fit / "fit.json").read_text())
report["pins"] = pins
(output / "report.json").write_text(json.dumps(report, indent=2) + "\n")
