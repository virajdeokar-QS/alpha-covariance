/**
 * Alpha Covariance Desk · private read-only market gateway
 * Access authenticates allowed emails at the edge; this Worker independently
 * checks the signed application JWT before serving ANY asset or API response.
 * No paper orders or personal information are stored at this stage.
 */
const SYMBOLS = Object.freeze(['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT']);
const INTERVALS = new Set(['1m', '5m', '15m', '1h']);
const FEED = 'https://data-api.binance.vision/api/v3';
let certsCache = { at: 0, data: null };

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8',
    'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' }
});

function decodeBase64Url(part) {
  const normalized = part.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(normalized + '='.repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, ch => ch.charCodeAt(0));
}
function parseSegment(part) {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(part)));
}

async function validateAccessJwt(request, env) {
  // Required: both variables must be set (fail closed on missing setup).
  const team = String(env.ACCESS_TEAM_DOMAIN || '').replace(/\/$/, '');
  const audience = String(env.ACCESS_AUD || '');
  if (!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(team) || !audience) {
    throw new Error('private access is not configured');
  }
  const jwt = request.headers.get('cf-access-jwt-assertion');
  if (!jwt || jwt.length > 10000) throw new Error('Access assertion missing');
  const parts = jwt.split('.');
  if (parts.length !== 3) throw new Error('Invalid assertion');
  const header = parseSegment(parts[0]);
  const payload = parseSegment(parts[1]);
  const now = Math.floor(Date.now() / 1000);
  if (header.alg !== 'RS256' || !header.kid || payload.iss !== team ||
      !(Array.isArray(payload.aud) ? payload.aud.includes(audience) : payload.aud === audience) ||
      !Number.isFinite(payload.exp) || payload.exp <= now ||
      !Number.isFinite(payload.iat) || payload.iat > now + 60 ||
      (payload.nbf !== undefined && payload.nbf > now + 60)) {
    throw new Error('Invalid assertion claims');
  }
  if (!certsCache.data || Date.now() - certsCache.at > 5 * 60 * 1000) {
    const response = await fetch(`${team}/cdn-cgi/access/certs`, { signal: AbortSignal.timeout(6000) });
    if (!response.ok) throw new Error('Signing keys unavailable');
    const data = await response.json();
    if (!Array.isArray(data.keys)) throw new Error('Unexpected signing keys');
    certsCache = { data: data.keys, at: Date.now() };
  }
  let jwk = certsCache.data.find(k => k.kid === header.kid && k.kty === 'RSA');
  // Refresh immediately on key rotation.
  if (!jwk) {
    certsCache.at = 0;
    const response = await fetch(`${team}/cdn-cgi/access/certs`, { signal: AbortSignal.timeout(6000) });
    if (!response.ok) throw new Error('Signing keys unavailable');
    const data = await response.json();
    certsCache = { data: data.keys || [], at: Date.now() };
    jwk = certsCache.data.find(k => k.kid === header.kid && k.kty === 'RSA');
  }
  if (!jwk) throw new Error('Signing key not found');
  const key = await crypto.subtle.importKey('jwk', jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const bytes = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  const good = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, decodeBase64Url(parts[2]), bytes);
  if (!good) throw new Error('Bad assertion signature');
  return { email: typeof payload.email === 'string' ? payload.email : 'Approved researcher' };
}

async function getExchange(path) {
  const upstream = await fetch(`${FEED}/${path}`, {
    headers: { 'accept': 'application/json' },
    signal: AbortSignal.timeout(6500),
  });
  if (!upstream.ok) throw new Error(`Exchange feed HTTP ${upstream.status}`);
  return upstream.json();
}
const finitePositive = v => Number.isFinite(Number(v)) && Number(v) > 0;
function validOHLC(k) {
  if (!Array.isArray(k) || k.length < 7) return null;
  const [ts, o, h, l, c, v, closeTs] = k;
  if (![o, h, l, c].every(finitePositive) ||
      !Number.isFinite(Number(v)) || Number(v) < 0 ||
      !Number.isFinite(Number(ts))) return null;
  if (Number(h) < Math.max(Number(o), Number(c)) || Number(l) > Math.min(Number(o), Number(c))) return null;
  return { t: Number(ts), o: Number(o), h: Number(h), l: Number(l), c: Number(c),
    v: Number(v), closed: Number(closeTs) < Date.now() };
}

async function marketAPI(url) {
  if (url.pathname === '/api/status') {
    return json({ authenticated: true, service: 'alpha-covariance-desk', market_feed: 'Binance spot public market data', storage: 'not configured', trading: 'disabled' });
  }
  if (url.pathname === '/api/markets') {
    const symbols = encodeURIComponent(JSON.stringify(SYMBOLS));
    const raw = await getExchange(`ticker/24hr?symbols=${symbols}`);
    if (!Array.isArray(raw)) throw new Error('Unexpected exchange ticker response');
    const tickers = raw.filter(row => SYMBOLS.includes(row.symbol) && finitePositive(row.lastPrice)).map(row => ({
      symbol: row.symbol,
      price: Number(row.lastPrice),
      change24h: Number.isFinite(Number(row.priceChangePercent)) ? Number(row.priceChangePercent) : null,
      exchangeCloseTime: Number(row.closeTime) || null,
    }));
    if (tickers.length !== SYMBOLS.length) throw new Error('Incomplete market snapshot');
    return json({ source: 'Binance Spot', receivedAt: new Date().toISOString(), tickers });
  }
  if (url.pathname === '/api/candles') {
    const symbol = url.searchParams.get('symbol') || '';
    const interval = url.searchParams.get('interval') || '1m';
    if (!SYMBOLS.includes(symbol) || !INTERVALS.has(interval)) return json({ error: 'Unsupported symbol or interval' }, 400);
    const raw = await getExchange(`klines?symbol=${symbol}&interval=${interval}&limit=240`);
    if (!Array.isArray(raw)) throw new Error('Unexpected exchange candles response');
    const candles = raw.map(validOHLC);
    if (!candles.length || candles.some(k => k === null)) throw new Error('Invalid candle data');
    for (let i = 1; i < candles.length; i++) if (candles[i].t <= candles[i - 1].t) throw new Error('Non-monotonic timestamps');
    return json({ source: 'Binance Spot', symbol, interval, receivedAt: new Date().toISOString(), candles });
  }
  return json({ error: 'Not found' }, 404);
}

export default {
  async fetch(request, env) {
    // Never serve any private content from the default workers.dev hostname.
    const url = new URL(request.url);
    if (url.hostname !== 'desk.alphacovariance.com') return new Response('Not found', { status: 404 });
    try {
      const user = await validateAccessJwt(request, env);
      if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405 });
      if (url.pathname === '/api/whoami') return json({ email: user.email });
      if (url.pathname.startsWith('/api/')) {
        try { return await marketAPI(url); }
        catch (error) { return json({ error: 'Live market feed unavailable', detail: String(error.message).slice(0, 120) }, 502); }
      }
      const path = url.pathname === '/' ? '/index.html' : url.pathname;
      const assetRequest = new Request(new URL(path + url.search, url.origin), request);
      const file = await env.ASSETS.fetch(assetRequest);
      const headers = new Headers(file.headers);
      headers.set('cache-control', 'private, no-store');
      headers.set('x-content-type-options', 'nosniff');
      headers.set('referrer-policy', 'no-referrer');
      headers.set('x-frame-options', 'DENY');
      headers.set('content-security-policy', "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; font-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'");
      return new Response(file.body, { status: file.status, headers });
    } catch (error) {
      return new Response('Research desk access denied. Check Cloudflare Access configuration.', {
        status: 403,
        headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }
      });
    }
  }
};
