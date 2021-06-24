#!/usr/bin/env python
#
# Small web server that serves pocketsphinx.wasm with the correct MIME type
#

from http.server import SimpleHTTPRequestHandler
import socketserver

PORT = 8000

SimpleHTTPRequestHandler.extensions_map['.wasm'] = 'application/wasm'
with socketserver.TCPServer(("", PORT), SimpleHTTPRequestHandler) as httpd:
    print("Serving on port {}".format(PORT))
    httpd.serve_forever()
