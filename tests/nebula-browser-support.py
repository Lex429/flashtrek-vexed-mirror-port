"""Read-only conditions and optional worker profiling shared by fog checks."""
import ctypes
import hashlib
import json
import os


def power_status():
    if os.name != 'nt':
        return None
    class Status(ctypes.Structure):
        _fields_ = [('ac', ctypes.c_ubyte), ('flag', ctypes.c_ubyte),
                    ('percent', ctypes.c_ubyte), ('reserved', ctypes.c_ubyte),
                    ('seconds', ctypes.c_uint32), ('fullSeconds', ctypes.c_uint32)]
    status = Status()
    if ctypes.windll.kernel32.GetSystemPowerStatus(ctypes.byref(status)):
        return {'onAC': status.ac == 1, 'batteryPercent': status.percent}
    return None


def source_hashes(root):
    return {str(file.relative_to(root)).replace('\\', '/'): hashlib.sha256(file.read_bytes()).hexdigest()
            for folder in ['html-games/broken-mirror-port', 'html-games/flashtrek-broken-mirror']
            for file in (root / folder).rglob('*') if file.suffix in ['.js', '.html']}


def worker_profile(browser, page):
    session = browser.new_browser_cdp_session()
    targets = session.send('Target.getTargets')['targetInfos']
    target = next(t for t in targets if t['type'] == 'worker' and 'nebula-material-worker.js' in t['url'])
    attached = session.send('Target.attachToTarget', {'targetId': target['targetId'], 'flatten': False})['sessionId']
    answers = {}
    number = 0

    def received(event):
        if event.get('sessionId') == attached:
            message = json.loads(event['message'])
            if 'id' in message:
                answers[message['id']] = message
    session.on('Target.receivedMessageFromTarget', received)

    def call(method):
        nonlocal number
        number += 1
        request = number
        session.send('Target.sendMessageToTarget', {'sessionId': attached, 'message': json.dumps({'id': request, 'method': method})})
        for _ in range(200):
            if request in answers:
                result = answers.pop(request)
                if 'error' in result:
                    raise RuntimeError(result['error'])
                return result.get('result', {})
            page.wait_for_timeout(10)
        raise RuntimeError('Worker profiler response timeout: ' + method)

    call('Profiler.enable')
    call('Profiler.start')

    def stop():
        result = call('Profiler.stop')
        session.send('Target.detachFromTarget', {'sessionId': attached})
        session.detach()
        return result['profile']
    return stop
