"""Run from the project root: python helper/test_protocol.py"""
import json
from pathlib import Path
import struct
import subprocess
import sys
import unittest

class ProtocolTest(unittest.TestCase):
    def test_handshake_check_and_clean_disconnect(self):
        proc = subprocess.Popen([sys.executable, '-u', str(Path(__file__).with_name('host.py'))], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        request = json.dumps({'type': 'check', 'windowId': 999999, 'requestId': 'test'}).encode()
        stdout, stderr = proc.communicate(struct.pack('<I', len(request)) + request, timeout=5)
        self.assertEqual(proc.returncode, 0, stderr.decode())
        messages = []
        while stdout:
            n = struct.unpack('<I', stdout[:4])[0]
            messages.append(json.loads(stdout[4:4+n]))
            stdout = stdout[4+n:]
        self.assertEqual(messages[0], {'type': 'hello', 'version': 1})
        self.assertEqual(messages[1], {'requestId': 'test', 'ok': False})

    def test_oversized_message_closes(self):
        proc = subprocess.Popen([sys.executable, '-u', str(Path(__file__).with_name('host.py'))], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        _, stderr = proc.communicate(struct.pack('<I', 10000000), timeout=5)
        self.assertEqual(proc.returncode, 0, stderr.decode())

if __name__ == '__main__':
    unittest.main()
