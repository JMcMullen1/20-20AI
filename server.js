// 20/20 course AI assistant: a small server that serves the chat page and passes messages to the Claude API.
// Uses the official Anthropic SDK. Needs Node 18 or later.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { courses } = require('./prompts');
const Anthropic = require('@anthropic-ai/sdk');

// ---------- settings (from environment variables) ----------
const env = (k, d) => (process.env[k] !== undefined && process.env[k] !== '' ? process.env[k] : d);
loadDotEnv();
const PORT = Number(env('PORT', 8080));
const API_KEY = env('ANTHROPIC_API_KEY', '');
const MODEL = env('MODEL', 'claude-opus-5-5');
const EFFORT = env('EFFORT', 'low');                         // low = quick, chatty replies
const ACCESS_CODE = env('ACCESS_CODE', '');                 // shared course code; leave blank for no code
const APP_NAME = env('APP_NAME', '20/20 Course AI');
const MAX_TOKENS = Number(env('MAX_TOKENS', 4000));          // length cap per reply
const PER_MINUTE = Number(env('PER_MINUTE', 12));           // messages per person (IP) per minute
const DAILY_CAP = Number(env('DAILY_CAP', 1500));           // messages per day across everyone
const MOCK = env('MOCK', '') === '1' || !API_KEY;           // no key = demo mode with canned replies
const client = MOCK ? null : new Anthropic({ apiKey: API_KEY });
const MAX_TURNS = 30, MAX_CHARS = 6000;

// ---------- simple usage limits ----------
const hits = new Map(); let day = today(), dayCount = 0;
function today() { return new Date().toISOString().slice(0, 10); }
function allow(ip) {
  if (today() !== day) { day = today(); dayCount = 0; }
  if (dayCount >= DAILY_CAP) return 'The course assistant has reached its daily limit. Please let your trainer know.';
  const now = Date.now(), list = (hits.get(ip) || []).filter(t => now - t < 60000);
  if (list.length >= PER_MINUTE) return 'Slow down a little: too many messages in the last minute. Try again shortly.';
  list.push(now); hits.set(ip, list); dayCount++; return null;
}

// ---------- helpers ----------
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'application/javascript', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
function send(res, code, body, type = 'application/json') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}
function readBody(req, limit = 200000) {
  return new Promise((ok, fail) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > limit) { fail(new Error('too big')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => ok(Buffer.concat(chunks).toString('utf8'))); req.on('error', fail);
  });
}
function codeOk(req) { return !ACCESS_CODE || req.headers['x-access-code'] === ACCESS_CODE; }
function clientIp(req) { return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress; }

// ---------- routes ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (req.method === 'GET' && url.pathname === '/api/config') {
      const c = courses[url.searchParams.get('course')] || courses.awareness;
      const list = Object.entries(courses).map(([key, x]) => ({ key, label: x.label, caseName: x.caseName, short: x.short }));
      return send(res, 200, { appName: APP_NAME, course: c.label, caseName: c.caseName, starters: c.starters, courses: list, needsCode: !!ACCESS_CODE, demo: MOCK });
    }
    if (req.method === 'POST' && url.pathname === '/api/check') {
      return send(res, codeOk(req) ? 200 : 401, { ok: codeOk(req) });
    }
    if (req.method === 'POST' && url.pathname === '/api/chat') return chat(req, res);
    if (req.method === 'GET') return serveStatic(url.pathname, res);
    send(res, 404, { error: 'Not found' });
  } catch (e) { console.error(e); if (!res.headersSent) send(res, 500, { error: 'Something went wrong.' }); }
});

function serveStatic(p, res) {
  const file = path.join(__dirname, 'public', p === '/' ? 'index.html' : path.normalize(p).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(path.join(__dirname, 'public'))) return send(res, 403, 'Forbidden', 'text/plain');
  fs.readFile(file, (err, data) => err ? send(res, 404, 'Not found', 'text/plain') : send(res, 200, data, TYPES[path.extname(file)] || 'application/octet-stream'));
}

async function chat(req, res) {
  if (!codeOk(req)) return send(res, 401, { error: 'Please enter the course access code.' });
  const limited = allow(clientIp(req)); if (limited) return send(res, 429, { error: limited });
  let body; try { body = JSON.parse(await readBody(req)); } catch { return send(res, 400, { error: 'Bad request.' }); }
  const course = courses[body.course] || courses.awareness;
  const msgs = Array.isArray(body.messages) ? body.messages.slice(-MAX_TURNS) : [];
  const clean = msgs.filter(m => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .map(m => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }));
  while (clean.length && clean[0].role !== 'user') clean.shift();
  if (!clean.length || clean[clean.length - 1].role !== 'user') return send(res, 400, { error: 'No message to answer.' });

  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  if (MOCK) return mockReply(clean[clean.length - 1].content, course, res);

  try {
    const stream = client.beta.messages.stream({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: [{ type: 'text', text: course.system, cache_control: { type: 'ephemeral' } }],
      messages: clean,
      output_config: { effort: EFFORT },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',                                   // if Claude declines, a fallback model answers instead
    });
    for await (const ev of stream) {
      if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') res.write(ev.delta.text);
    }
    const final = await stream.finalMessage();
    if (final.stop_reason === 'refusal') res.write("\n\nI can't help with that one. Try asking about the case study instead.");
    else if (final.stop_reason === 'max_tokens') res.write('\n\n[Reply cut short. Ask me to continue.]');
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) console.error('Claude API key rejected: check ANTHROPIC_API_KEY.');
    else if (e instanceof Anthropic.RateLimitError) console.error('Claude API rate limit hit.');
    else if (e instanceof Anthropic.APIConnectionError) console.error('Could not reach the Claude API:', e.message);
    else if (e instanceof Anthropic.APIError) console.error('Claude API error', e.status, e.message);
    else console.error(e);
    res.write('\n[The assistant could not reply just now. Please try again, or tell your trainer.]');
  }
  res.end();
}

// Demo replies so the page can be tried without an API key.
async function mockReply(text, course, res) {
  const reply = `This is demo mode, so I'm not connected to Claude yet. Add an API key on the server and I'll answer properly using ${course.caseName}.\n\nYou asked: "${text.slice(0, 160)}"`;
  for (const word of reply.split(/(\s+)/)) { res.write(word); await new Promise(r => setTimeout(r, 12)); }
  res.end();
}

function loadDotEnv() {
  try { fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split('\n').forEach(l => { const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ''); }); } catch {}
}

server.listen(PORT, () => console.log(`${APP_NAME} running on port ${PORT}${MOCK ? ' (demo mode: no API key set)' : ''}`));
