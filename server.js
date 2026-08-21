const http = require('http');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const port = Number(process.env.PORT || 3000);
const airwallexBaseUrl = process.env.AIRWALLEX_BASE_URL || 'https://api.sandbox.airwallex.com';
const airwallexClientId = process.env.AIRWALLEX_CLIENT_ID || '';
const airwallexApiKey = process.env.AIRWALLEX_API_KEY || '';
const airwallexApiVersion = process.env.AIRWALLEX_API_VERSION || '2026-07-17';
let accessToken = null;
let accessTokenExpiresAt = 0;
const types = {
  '.html': 'text/html; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8'
};

async function getAirwallexToken() {
  if (accessToken && Date.now() < accessTokenExpiresAt - 60_000) return accessToken;
  if (!airwallexClientId || !airwallexApiKey) throw new Error('Airwallex credentials are not configured');
  const response = await fetch(`${airwallexBaseUrl}/api/v1/authentication/login`, {
    method: 'POST',
    headers: { 'x-client-id': airwallexClientId, 'x-api-key': airwallexApiKey }
  });
  const data = await response.json();
  if (!response.ok || !data.token) throw new Error(data.message || 'Airwallex authentication failed');
  accessToken = data.token;
  accessTokenExpiresAt = data.expires_at ? Date.parse(data.expires_at) : Date.now() + 25 * 60_000;
  return accessToken;
}

async function createPaymentLink(order) {
  const token = await getAirwallexToken();
  const response = await fetch(`${airwallexBaseUrl}/api/v1/pa/payment_links/create`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'x-api-version': airwallexApiVersion
    },
    body: JSON.stringify({
      reusable: false,
      title: `Soluna · ${order.label}`,
      amount: order.price,
      currency: 'USD',
      collectable_shopper_info: { message: true }
    })
  });
  const data = await response.json();
  if (!response.ok || !data.url) throw new Error(data.message || 'Airwallex payment link creation failed');
  return data;
}

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/api/create-payment-link') {
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', async () => {
      try {
        const body = JSON.parse(raw || '{}');
        const offers = {
          '1 Amethyst Tree': 59,
          '2 Amethyst Trees': 99,
          'Gift Edition': 79
        };
        const price = offers[body.label];
        if (!price || Number(body.price) !== price) throw new Error('Invalid offer');
        const link = await createPaymentLink({ label: body.label, price });
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ url: link.url }));
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ error: error.message }));
      }
    });
    return;
  }
  const requestPath = decodeURIComponent((req.url || '/').split('?')[0]);
  const relative = requestPath === '/' ? 'lucky-crystal-landing.html' : requestPath.replace(/^\/+/, '');
  const file = path.resolve(root, relative);
  if (!file.startsWith(root + path.sep)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  fs.stat(file, (error, info) => {
    if (error || !info.isFile()) {
      res.writeHead(404);
      return res.end('Not found');
    }
    res.writeHead(200, { 'Content-Type': types[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Soluna landing page listening on ${port}`);
});
