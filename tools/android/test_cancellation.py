#!/usr/bin/env python3
"""Run the native cancellation paths with deterministic, device-free Java fakes."""

import os
from pathlib import Path
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[2]
NATIVE = ROOT / "android/app/src/main/java/dev/voyage/workbench"


class CancellationTest(unittest.TestCase):
    def test_native_stop_paths(self):
        service = (NATIVE / "AgentService.java").read_text()
        host = (NATIVE / "Host.java").read_text()
        template = (Path(__file__).parent / "cancellation/AgentCancellationHarness.java.in").read_text()
        methods = {
            "SERVICE_START": service.split(" public int onStartCommand", 1)[1].split(" void command", 1)[0],
            "SERVICE_COMMAND": service.split(" void command", 1)[1].split(" void ensureTaskRunning", 1)[0],
            "SERVICE_ENSURE": service.split(" void ensureTaskRunning", 1)[1].split(" void login", 1)[0],
            "SERVICE_RUN": service.split(" void run(Intent intent)", 1)[1].split('if(t.has("route")', 1)[0],
            "HOST_START": host.split(" void start", 1)[1].split(" Object request", 1)[0],
            "HOST_STOP": host.split(' case "stopAgent":', 1)[1].split('\n case ', 1)[0],
        }
        for marker, body in methods.items():
            template = template.replace("@" + marker + "@", body)
        java_home = Path(os.environ.get("JAVA_HOME", Path.home() / ".local/share/voyage-android/jdk"))
        with tempfile.TemporaryDirectory(prefix="voyage-cancellation-") as directory:
            source = Path(directory) / "AgentCancellationHarness.java"
            source.write_text(template)
            subprocess.run([str(java_home / "bin/javac"), "-d", directory,
                            str(NATIVE / "AgentTaskTarget.java"), str(source)], check=True)
            result = subprocess.run([str(java_home / "bin/java"), "-cp", directory,
                                     "dev.voyage.workbench.AgentCancellationHarness"],
                                    check=True, text=True, capture_output=True)
            print(result.stdout, end="")


if __name__ == "__main__":
    unittest.main()
