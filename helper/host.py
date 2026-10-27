"""Windows native-messaging host. No dependencies, network, hooks, or focus changes."""
import ctypes as C
from ctypes import wintypes as W
import json
import os
import queue
import struct
import sys
import threading
import time

if os.name != 'nt':
    raise SystemExit('Windows only')
import msvcrt
msvcrt.setmode(sys.stdin.fileno(), os.O_BINARY)
msvcrt.setmode(sys.stdout.fileno(), os.O_BINARY)
u = C.WinDLL('user32', use_last_error=True)
k = C.WinDLL('kernel32', use_last_error=True)

class Placement(C.Structure):
    _fields_ = [('length', W.UINT), ('flags', W.UINT), ('showCmd', W.UINT),
                ('ptMinPosition', W.POINT), ('ptMaxPosition', W.POINT), ('rcNormalPosition', W.RECT)]

CALLBACK = C.WINFUNCTYPE(W.BOOL, W.HWND, W.LPARAM)
u.EnumWindows.argtypes = [CALLBACK, W.LPARAM]
u.GetWindowTextW.argtypes = [W.HWND, W.LPWSTR, C.c_int]
u.GetWindowThreadProcessId.argtypes = [W.HWND, C.POINTER(W.DWORD)]
u.GetAncestor.argtypes = [W.HWND, W.UINT]
u.GetAncestor.restype = W.HWND
u.WindowFromPoint.argtypes = [W.POINT]
u.WindowFromPoint.restype = W.HWND
u.GetCursorPos.argtypes = [C.POINTER(W.POINT)]
u.IsWindow.argtypes = [W.HWND]
u.IsWindowVisible.argtypes = [W.HWND]
u.GetWindowPlacement.argtypes = [W.HWND, C.POINTER(Placement)]
u.SetWindowPlacement.argtypes = [W.HWND, C.POINTER(Placement)]
u.GetForegroundWindow.restype = W.HWND
u.SetForegroundWindow.argtypes = [W.HWND]
u.SetForegroundWindow.restype = W.BOOL
u.keybd_event.argtypes = [W.BYTE, W.BYTE, W.DWORD, C.c_size_t]
VK_F = 0x46
KEYUP = 0x0002

def native_toggle(item):
    """Experimental foreground-only YouTube 'f' shortcut, with focus restore."""
    if not (u.IsWindow(item['hwnd']) and identity(item['hwnd']) == item['pid']):
        return False, 'Window binding expired'
    old = u.GetForegroundWindow()
    target = item['hwnd']
    # Do not inject keys while another application is focused: Windows may
    # refuse restoration, and cross-window input could hit the wrong target.
    if old != target:
        return False, 'YouTube Vivaldi window must be foreground (no focus stealing)'
    u.keybd_event(VK_F, 0, 0, 0)
    u.keybd_event(VK_F, 0, KEYUP, 0)
    return True, ''

k.OpenProcess.argtypes = [W.DWORD, W.BOOL, W.DWORD]
k.OpenProcess.restype = W.HANDLE
k.QueryFullProcessImageNameW.argtypes = [W.HANDLE, W.DWORD, W.LPWSTR, C.POINTER(W.DWORD)]
k.CloseHandle.argtypes = [W.HANDLE]
try:
    u.SetProcessDpiAwarenessContext.argtypes = [C.c_void_p]
    u.SetProcessDpiAwarenessContext(C.c_void_p(-4))
except AttributeError:
    pass

def identity(hwnd):
    pid = W.DWORD()
    u.GetWindowThreadProcessId(hwnd, C.byref(pid))
    handle = k.OpenProcess(0x1000, False, pid.value)
    if not handle:
        return None
    try:
        path, size = C.create_unicode_buffer(32768), W.DWORD(32768)
        if not k.QueryFullProcessImageNameW(handle, 0, path, C.byref(size)):
            return None
        if os.path.basename(path.value).lower() not in ('vivaldi.exe', 'chrome.exe', 'msedge.exe'):
            return None
        return pid.value
    finally:
        k.CloseHandle(handle)

def find_window(token):
    matches = []
    @CALLBACK
    def visit(hwnd, _):
        title = C.create_unicode_buffer(4096)
        u.GetWindowTextW(hwnd, title, 4096)
        if token in title.value and u.IsWindowVisible(hwnd):
            pid = identity(hwnd)
            if pid:
                matches.append((hwnd, pid))
        return True
    u.EnumWindows(visit, 0)
    return matches[0] if len(matches) == 1 else None

def write(message):
    payload = json.dumps(message, separators=(',', ':')).encode('utf-8')
    sys.stdout.buffer.write(struct.pack('<I', len(payload)) + payload)
    sys.stdout.buffer.flush()

commands = queue.Queue()
def read_exact(n):
    data = b''
    while len(data) < n:
        chunk = sys.stdin.buffer.read(n - len(data))
        if not chunk:
            raise EOFError()
        data += chunk
    return data

def reader():
    try:
        while True:
            size = struct.unpack('<I', read_exact(4))[0]
            if size > 65536:
                break
            commands.put(json.loads(read_exact(size)))
    except (EOFError, ValueError, OSError):
        pass
    finally:
        commands.put(None)

def main():
    windows, guards, motion_arms = {}, {}, {}
    threading.Thread(target=reader, daemon=True).start()
    write({'type': 'hello', 'version': 1})
    def valid(item):
        return u.IsWindow(item['hwnd']) and identity(item['hwnd']) == item['pid']
    def inside(item):
        point = W.POINT()
        if not u.GetCursorPos(C.byref(point)):
            return None, None
        root = u.GetAncestor(u.WindowFromPoint(point), 2)
        return root == item['hwnd'], (point.x, point.y)
    try:
        while True:
            try:
                m = commands.get(timeout=0.04)
            except queue.Empty:
                m = {}
            if m is None:
                break
            request = m.get('requestId')
            kind, wid = m.get('type'), m.get('windowId')
            ok, extra = False, {}
            if kind == 'bind' and isinstance(wid, int) and isinstance(m.get('token'), str) and m['token'].startswith('AFS-'):
                found = None
                for _ in range(15):
                    found = find_window(m['token'])
                    if found:
                        break
                    time.sleep(0.05)
                if found:
                    windows[wid] = {'hwnd': found[0], 'pid': found[1], 'inside': None, 'point': None}
                    ok = True
            elif kind in ('check', 'guard') and wid in windows and valid(windows[wid]):
                item = windows[wid]
                over, _ = inside(item)
                extra['inside'] = over
                ok = over is not None
                if kind == 'guard':
                    p = Placement()
                    p.length = C.sizeof(p)
                    ok = ok and (not over or m.get('allowInside') is True) and bool(u.GetWindowPlacement(item['hwnd'], C.byref(p)))
                    if ok and wid not in guards:
                        guards[wid] = (item.copy(), p)
            elif kind == 'native-toggle' and wid in windows and valid(windows[wid]):
                ok, extra['reason'] = native_toggle(windows[wid])
            elif kind == 'arm-motion' and wid in windows and valid(windows[wid]):
                pos = W.POINT()
                ok = bool(u.GetCursorPos(C.byref(pos)))
                if ok:
                    motion_arms[wid] = (pos.x, pos.y)
            elif kind == 'release':
                guards.pop(wid, None)
                motion_arms.pop(wid, None)
                ok = True
            elif kind == 'forget':
                windows.pop(wid, None)
                guards.pop(wid, None)
                motion_arms.pop(wid, None)
                ok = True
            if request:
                write(dict({'requestId': request, 'ok': ok}, **extra))
            for wid, item in list(windows.items()):
                if not valid(item):
                    windows.pop(wid, None)
                    guards.pop(wid, None)
                    motion_arms.pop(wid, None)
                    continue
                over, point = inside(item)
                # Mouse motion anywhere after an explicitly armed idle session.
                # No coordinates are persisted or sent to the browser.
                if wid in motion_arms and point is not None:
                    origin = motion_arms[wid]
                    if abs(point[0] - origin[0]) + abs(point[1] - origin[1]) >= 8:
                        motion_arms.pop(wid, None)
                        write({'type': 'idle-motion', 'windowId': wid})
                # Fullscreen resizing under a stationary cursor is not a pointer return.
                if over is not None and (item['point'] is None or point != item['point']):
                    if over and item['point'] is not None:
                        dx = abs(point[0] - item['point'][0])
                        dy = abs(point[1] - item['point'][1])
                        if dx + dy >= 2:
                            write({'type': 'window-motion', 'windowId': wid})
                    if over != item['inside']:
                        initial = item['inside'] is None
                        item['inside'] = over
                        write({'type': 'pointer', 'windowId': wid, 'inside': over, 'initial': initial})
                    item['point'] = point
    finally:
        # Extension disable, update, crash, browser exit, or native port closure.
        for item, p in guards.values():
            if valid(item):
                # SW_SHOWNOACTIVATE / SW_SHOWMAXIMIZED can activate; use async placement
                # and preserve the current foreground window by avoiding any focus API.
                p.flags |= 4  # WPF_ASYNCWINDOWPLACEMENT
                u.SetWindowPlacement(item['hwnd'], C.byref(p))

if __name__ == '__main__':
    main()
