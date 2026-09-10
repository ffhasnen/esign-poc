// Zero-dependency static file server for the WebView/iframe eSign repro.
// Run: node serve.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Own-app port: serves outer.html (stands in for whatever page IMobile loads
// first - its iframe now points at the real Flutter clone on CSP_PORT).
const OWN_PORT = 8787;
// Third-party port: serves popup.html (stands in for the Perfios/UIDAI eSign domain).
const THIRD_PARTY_PORT = 8788;
// CSP port: serves the REAL compiled Flutter web clone (csp-esign-clone/build/web) -
// same PerfiosEsign JS, same dart:js call chain as the actual app.
const CSP_PORT = 8789;

const OWN_ROOT = __dirname;
const CSP_ROOT = path.join(__dirname, '..', 'csp-esign-clone', 'build', 'web');

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon', '.otf': 'font/otf', '.ttf': 'font/ttf',
  '.wasm': 'application/wasm', '.svg': 'image/svg+xml',
};

function makeHandler(root, defaultFile) {
  return (req, res) => {
    let filePath = path.join(root, decodeURIComponent(req.url.split('?')[0]));
    if (req.url === '/') filePath = path.join(root, defaultFile);
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end('Not found: ' + req.url);
        return;
      }
      const ext = path.extname(filePath);
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      res.end(data);
    });
  };
}

http.createServer(makeHandler(OWN_ROOT, 'outer.html')).listen(OWN_PORT, '0.0.0.0', () => {
  console.log(`Own-app server running on port ${OWN_PORT} (outer.html)`);
});

http.createServer(makeHandler(OWN_ROOT, 'popup.html')).listen(THIRD_PARTY_PORT, '0.0.0.0', () => {
  console.log(`Third-party server running on port ${THIRD_PARTY_PORT} (popup.html, simulating the eSign provider's domain)`);
});

if (fs.existsSync(CSP_ROOT)) {
  http.createServer(makeHandler(CSP_ROOT, 'index.html')).listen(CSP_PORT, '0.0.0.0', () => {
    console.log(`CSP clone server running on port ${CSP_PORT} (real compiled Flutter web app, from csp-esign-clone/build/web)`);
  });
} else {
  console.log(`CSP clone not built yet - run "flutter build web" in csp-esign-clone/ to serve it on port ${CSP_PORT}`);
}

console.log('Reachable at:');
console.log(`  http://localhost:${OWN_PORT}/outer.html  (this machine)`);
const nets = os.networkInterfaces();
for (const name of Object.keys(nets)) {
  for (const net of nets[name]) {
    if (net.family === 'IPv4' && !net.internal) {
      console.log(`  http://${net.address}:${OWN_PORT}/outer.html  (use THIS one in the phone/Expo app, same WiFi/hotspot)`);
      console.log(`  Own-app origin for the app's "Server base URL" field:  http://${net.address}:${OWN_PORT}`);
    }
  }
}
