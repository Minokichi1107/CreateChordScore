"""UD-2: the local server must listen on 127.0.0.1 only and refuse foreign Host/Origin.

Starts a copy of server.py in a temp directory (port 8767 must be free), so the real
./analysis folder is never touched.

    python3 -m unittest discover -s scripts -p "test_server_local_only.py" -v
"""
import http.client
import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8767
PID = "9aeea4ec-5deb-41fe-ab17-00045378f64f"


def lan_ip():
    """A non-loopback IPv4 address of this machine, or None."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("192.0.2.1", 9))  # no packet is sent for UDP connect
        ip = s.getsockname()[0]
        s.close()
        return None if ip.startswith("127.") else ip
    except OSError:
        return None


def request(method, path, headers=None, body=None, host="127.0.0.1"):
    conn = http.client.HTTPConnection(host, PORT, timeout=5)
    conn.putrequest(method, path, skip_host=True, skip_accept_encoding=True)
    hdrs = {"Host": f"localhost:{PORT}"}
    hdrs.update(headers or {})
    data = body.encode() if isinstance(body, str) else body
    if data is not None:
        hdrs["Content-Length"] = str(len(data))
    for k, v in hdrs.items():
        if v is not None:
            conn.putheader(k, v)
    conn.endheaders(data)
    resp = conn.getresponse()
    out = (resp.status, dict(resp.getheaders()), resp.read())
    conn.close()
    return out


class LocalOnlyServerTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp(prefix="ccs-server-")
        shutil.copy(os.path.join(ROOT, "server.py"), cls.tmp)
        with open(os.path.join(cls.tmp, "index.html"), "w") as f:
            f.write("<html>ok</html>")
        os.makedirs(os.path.join(cls.tmp, "analysis"))
        cls.proc = subprocess.Popen([sys.executable, "server.py"], cwd=cls.tmp,
                                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, stdin=subprocess.DEVNULL)
        for _ in range(60):
            try:
                socket.create_connection(("127.0.0.1", PORT), timeout=0.5).close()
                return
            except OSError:
                time.sleep(0.25)
        raise RuntimeError("server did not start (is port 8767 in use?)")

    @classmethod
    def tearDownClass(cls):
        cls.proc.kill()
        cls.proc.wait()
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def payload(self, marker):
        return json.dumps({"version": 1, "projectId": PID, "generatedAt": "2026-11-05T00:00:00.000Z",
                           "raw": {"chords": [], "marker": marker}, "repairRule": None})

    def test_binds_to_loopback_only(self):
        socket.create_connection(("127.0.0.1", PORT), timeout=2).close()
        ip = lan_ip()
        if ip is None:
            self.skipTest("no non-loopback IPv4 address on this machine")
        with self.assertRaises(OSError):
            socket.create_connection((ip, PORT), timeout=2).close()

    def test_local_pages_and_files_are_served(self):
        status, headers, body = request("GET", "/index.html")
        self.assertEqual(status, 200)
        self.assertIn(b"ok", body)
        for host in (f"localhost:{PORT}", f"127.0.0.1:{PORT}"):
            self.assertEqual(request("GET", "/index.html", {"Host": host})[0], 200, host)

    def test_foreign_host_header_is_refused(self):
        for host in (f"evil.example:{PORT}", "192.168.0.10:8767", "localhost"):
            self.assertEqual(request("GET", "/index.html", {"Host": host})[0], 403, host)

    def test_foreign_origin_cannot_read_or_write(self):
        evil = {"Origin": "http://evil.example"}
        self.assertEqual(request("GET", "/index.html", evil)[0], 403)
        self.assertEqual(request("OPTIONS", "/save-analysis", evil)[0], 403)
        status, _, _ = request("POST", "/save-analysis", {**evil, "Content-Type": "application/json"}, self.payload("evil"))
        self.assertEqual(status, 403)
        self.assertEqual(os.listdir(os.path.join(self.tmp, "analysis")), [], "nothing may be written")

    def test_local_read_write_roundtrip(self):
        ok = {"Origin": f"http://localhost:{PORT}", "Content-Type": "application/json"}
        status, headers, _ = request("POST", "/save-analysis", ok, self.payload("local"))
        self.assertEqual(status, 200)
        self.assertEqual(headers.get("Access-Control-Allow-Origin"), f"http://localhost:{PORT}")
        status, _, body = request("GET", f"/analysis/{PID}.json")
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body)["raw"]["marker"], "local")

    def test_no_wildcard_cors(self):
        for origin in (None, f"http://localhost:{PORT}"):
            _, headers, _ = request("GET", "/index.html", {"Origin": origin} if origin else {})
            self.assertNotEqual(headers.get("Access-Control-Allow-Origin"), "*")
        _, headers, _ = request("GET", "/index.html")
        self.assertNotIn("Access-Control-Allow-Origin", headers)


if __name__ == "__main__":
    unittest.main()
