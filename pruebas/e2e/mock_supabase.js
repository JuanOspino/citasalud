// Emulador mínimo de Supabase para pruebas E2E locales:
// /rest/v1 -> PostgREST (puerto 3000), /auth/v1 -> GoTrue simulado.
const http = require('http');
const crypto = require('crypto');
const { Pool } = require('pg');

const SECRET = 'super-secret-jwt-token-with-at-least-32-characters-long';
const pool = new Pool({ connectionString: 'postgres://postgres:pg@127.0.0.1/citas' });

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function jwt(payload) {
  const h = b64({ alg: 'HS256', typ: 'JWT' });
  const p = b64(payload);
  const s = crypto.createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url');
  return `${h}.${p}.${s}`;
}
function verify(token) {
  const [h, p, s] = (token || '').split('.');
  if (!s) return null;
  const ok = crypto.createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url') === s;
  return ok ? JSON.parse(Buffer.from(p, 'base64url')) : null;
}
const userObj = (u) => ({ id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email, user_metadata: u.raw_user_meta_data || {}, app_metadata: {}, created_at: new Date().toISOString() });
function session(u) {
  const now = Math.floor(Date.now() / 1000);
  const access_token = jwt({ sub: u.id, role: 'authenticated', aud: 'authenticated', email: u.email, exp: now + 3600, iat: now, session_id: crypto.randomUUID() });
  return { access_token, token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, refresh_token: crypto.randomUUID(), user: userObj(u) };
}
const refreshTokens = new Map();

function readBody(req) {
  return new Promise((r) => { let d = ''; req.on('data', (c) => (d += c)); req.on('end', () => r(d)); });
}
function send(res, code, obj) {
  res.writeHead(code, { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*' });
  res.end(obj === undefined ? '' : JSON.stringify(obj));
}

http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204);
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/rest/v1')) {
    const body = await readBody(req);
    const headers = { ...req.headers };
    delete headers.host;
    const auth = headers.authorization || '';
    // La anon key del front no es JWT válido en este emulador: se trata como anónimo.
    if (!verify(auth.replace(/^Bearer /i, ''))) headers.authorization = `Bearer ${jwt({ role: 'anon', exp: Math.floor(Date.now() / 1000) + 3600 })}`;
    const p = http.request({ host: '127.0.0.1', port: 3000, path: req.url.replace('/rest/v1', '') || '/', method: req.method, headers }, (pr) => {
      const h = { ...pr.headers, 'access-control-allow-origin': '*', 'access-control-expose-headers': '*' };
      res.writeHead(pr.statusCode, h);
      pr.pipe(res);
    });
    p.end(body);
    return;
  }
  if (url.pathname.startsWith('/auth/v1')) {
    const body = await readBody(req).then((b) => (b ? JSON.parse(b) : {}));
    const path = url.pathname.replace('/auth/v1', '');
    try {
      if (path === '/token' && url.searchParams.get('grant_type') === 'password') {
        const { rows } = await pool.query('select id, email, raw_user_meta_data from auth.users where email=$1 and encrypted_password = extensions.crypt($2, encrypted_password)', [body.email, body.password]);
        if (!rows[0]) return send(res, 400, { error: 'invalid_grant', error_description: 'Invalid login credentials', code: 'invalid_credentials', msg: 'Invalid login credentials' });
        const s = session(rows[0]); refreshTokens.set(s.refresh_token, rows[0]); return send(res, 200, s);
      }
      if (path === '/token' && url.searchParams.get('grant_type') === 'refresh_token') {
        const u = refreshTokens.get(body.refresh_token);
        if (!u) return send(res, 400, { error: 'invalid_grant', msg: 'Invalid Refresh Token' });
        const s = session(u); refreshTokens.set(s.refresh_token, u); return send(res, 200, s);
      }
      if (path === '/signup') {
        const id = crypto.randomUUID();
        try {
          await pool.query(`insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new)
            values ('00000000-0000-0000-0000-000000000000',$1,'authenticated','authenticated',$2,extensions.crypt($3, extensions.gen_salt('bf')),now(),'{}',$4,now(),now(),'','','','')`, [id, body.email, body.password, body.data || {}]);
        } catch (e) {
          if (/users_email_key/.test(e.message)) return send(res, 422, { code: 'user_already_exists', msg: 'User already registered' });
          return send(res, 500, { code: 'unexpected_failure', msg: 'Database error saving new user' });
        }
        const s = session({ id, email: body.email, raw_user_meta_data: body.data }); refreshTokens.set(s.refresh_token, { id, email: body.email });
        return send(res, 200, s);
      }
      if (path === '/user') {
        const c = verify((req.headers.authorization || '').replace(/^Bearer /i, ''));
        if (!c || !c.sub) return send(res, 401, { msg: 'invalid JWT' });
        const { rows } = await pool.query('select id,email,raw_user_meta_data from auth.users where id=$1', [c.sub]);
        return send(res, 200, userObj(rows[0]));
      }
      if (path === '/logout') return send(res, 204);
      if (path === '/recover') return send(res, 200, {});
      return send(res, 404, { msg: 'not mocked: ' + path });
    } catch (e) {
      console.error(e); return send(res, 500, { msg: e.message });
    }
  }
  send(res, 404, {});
}).listen(54321, () => console.log('mock supabase on 54321'));
