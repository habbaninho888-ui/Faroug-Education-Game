from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from functools import partial
class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *args): pass
ThreadingHTTPServer(('0.0.0.0', 4173), partial(Handler, directory='app')).serve_forever()
