'use strict';

require('dotenv').config();

const express = require('express');
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');

const required = [
  'ADMIN_USERNAME',
  'ADMIN_PASSWORD',
  'SESSION_SECRET',
  'SUPABASE_URL',
  'SUPABASE_SECRET_KEY'
];

const missing = required.filter(k => !process.env[k]);

if (missing.length) {
  console.error(`Missing required environment variables: ${missing.join(', ')}`);
  console.error('Set them in your hosting dashboard or .env file. Do not commit .env.');
  process.exit(1);
}

if (process.env.SESSION_SECRET.length < 32) {
  console.error('SESSION_SECRET must be at least 32 characters.');
  process.exit(1);
}

const app = express();

const SUPABASE_URL = process.env.SUPABASE_URL.replace(/\/$/, '');
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

async function supabaseRequest(method, endpoint, body) {
  const headers = {
    apikey: SUPABASE_SECRET_KEY,
    Authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
    'Content-Type': 'application/json'
  };

  if (method === 'POST' && endpoint.startsWith('content?on_conflict=')) {
    headers.Prefer = 'resolution=merge-duplicates,return=minimal';
  } else {
    headers.Prefer = 'return=minimal';
  }

  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/${endpoint}`,
    {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    }
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    console.error('Supabase error:', response.status, detail);
    throw new Error(`Supabase request failed (${response.status})`);
  }

  return response;
}

const adminPasswordHash = bcrypt.hashSync(
  process.env.ADMIN_PASSWORD,
  12
);

app.disable('x-powered-by');

app.set(
  'trust proxy',
  process.env.TRUST_PROXY === '1' ? 1 : false
);

app.use(
  helmet({
    contentSecurityPolicy: false
  })
);

app.use(
  express.json({
    limit: '20mb'
  })
);

const SESSION_COOKIE = 'gmit_admin_session';

const SESSION_MAX_AGE =
  2 * 60 * 60 * 1000;

function signSession(username, expiresAt) {
  const payload = Buffer
    .from(
      JSON.stringify({
        username,
        expiresAt
      }),
      'utf8'
    )
    .toString('base64url');

  const signature = crypto
    .createHmac(
      'sha256',
      process.env.SESSION_SECRET
    )
    .update(payload)
    .digest('base64url');

  return `${payload}.${signature}`;
}

function verifySession(token) {
  try {
    const [payload, signature] =
      String(token || '').split('.');

    if (!payload || !signature) {
      return null;
    }

    const expected = crypto
      .createHmac(
        'sha256',
        process.env.SESSION_SECRET
      )
      .update(payload)
      .digest('base64url');

    const a = Buffer.from(signature);
    const b = Buffer.from(expected);

    if (
      a.length !== b.length ||
      !crypto.timingSafeEqual(a, b)
    ) {
      return null;
    }

    const data = JSON.parse(
      Buffer
        .from(payload, 'base64url')
        .toString('utf8')
    );

    if (
      data.username !==
      process.env.ADMIN_USERNAME
    ) {
      return null;
    }

    if (
      !Number.isFinite(data.expiresAt) ||
      data.expiresAt < Date.now()
    ) {
      return null;
    }

    return data;
  } catch {
    return null;
  }
}

function getCookie(req, name) {
  const raw = req.headers.cookie || '';

  for (const part of raw.split(';')) {
    const [key, ...rest] =
      part.trim().split('=');

    if (key === name) {
      return decodeURIComponent(
        rest.join('=')
      );
    }
  }

  return null;
}

function setSessionCookie(
  res,
  token,
  maxAge = SESSION_MAX_AGE
) {
  const secure =
    process.env.NODE_ENV === 'production'
      ? '; Secure'
      : '';

  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; Max-Age=${Math.floor(maxAge / 1000)}; Path=/; HttpOnly; SameSite=Strict${secure}`
  );
}

function clearSessionCookie(res) {
  const secure =
    process.env.NODE_ENV === 'production'
      ? '; Secure'
      : '';

  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=; Max-Age=0; Path=/; HttpOnly; SameSite=Strict${secure}`
  );
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error:
      'Terlalu banyak percobaan login. Coba lagi 15 menit.'
  }
});

const requireAdmin = (req, res, next) => {
  if (
    verifySession(
      getCookie(req, SESSION_COOKIE)
    )
  ) {
    return next();
  }

  return res
    .status(401)
    .json({
      error: 'Login admin diperlukan.'
    });
};

const reservedKeys = new Set([
  'gmit_kharisma_admin_session_v1'
]);

app.post(
  '/api/login',
  loginLimiter,
  async (req, res) => {
    const username =
      String(req.body?.username || '');

    const password =
      String(req.body?.password || '');

    const validUser =
      username.length ===
        process.env.ADMIN_USERNAME.length &&
      crypto.timingSafeEqual(
        Buffer.from(username),
        Buffer.from(
          process.env.ADMIN_USERNAME
        )
      );

    const validPass =
      await bcrypt.compare(
        password,
        adminPasswordHash
      );

    if (!validUser || !validPass) {
      return res
        .status(401)
        .json({
          error:
            'Username atau password salah.'
        });
    }

    const expiresAt =
      Date.now() + SESSION_MAX_AGE;

    setSessionCookie(
      res,
      signSession(
        username,
        expiresAt
      )
    );

    res.json({
      ok: true
    });
  }
);

app.get('/api/me', (req, res) => {
  res.json({
    authenticated: Boolean(
      verifySession(
        getCookie(
          req,
          SESSION_COOKIE
        )
      )
    )
  });
});

app.post('/api/logout', (req, res) => {
  clearSessionCookie(res);

  res.json({
    ok: true
  });
});

app.get(
  '/api/content',
  async (req, res) => {
    try {
      const response =
        await supabaseRequest(
          'GET',
          'content?select=key,value'
        );

      const rows =
        await response.json();

      const content = {};

      rows.forEach(row => {
        content[row.key] = row.value;
      });

      res.set(
        'Cache-Control',
        'no-store'
      );

      res.json({
        content
      });
    } catch (err) {
      console.error(err);

      res
        .status(500)
        .json({
          error:
            'Gagal membaca database.'
        });
    }
  }
);

app.put(
  '/api/content/:key',
  requireAdmin,
  async (req, res) => {
    const key =
      String(req.params.key || '');

    const value =
      req.body?.value;

    if (
      !/^[a-zA-Z0-9_:-]{1,160}$/.test(
        key
      ) ||
      reservedKeys.has(key)
    ) {
      return res
        .status(400)
        .json({
          error:
            'Kunci data tidak valid.'
        });
    }

    if (
      typeof value !== 'string' ||
      Buffer.byteLength(
        value,
        'utf8'
      ) >
        15 * 1024 * 1024
    ) {
      return res
        .status(413)
        .json({
          error:
            'Ukuran data tidak valid atau terlalu besar.'
        });
    }

    try {
      await supabaseRequest(
        'POST',
        'content?on_conflict=key',
        [
          {
            key,
            value
          }
        ]
      );

      res.json({
        ok: true
      });
    } catch (err) {
      console.error(err);

      res
        .status(500)
        .json({
          error:
            'Gagal menyimpan data.'
        });
    }
  }
);

app.delete(
  '/api/content/:key',
  requireAdmin,
  async (req, res) => {
    const key =
      String(req.params.key || '');

    if (
      !/^[a-zA-Z0-9_:-]{1,160}$/.test(
        key
      ) ||
      reservedKeys.has(key)
    ) {
      return res
        .status(400)
        .json({
          error:
            'Kunci data tidak valid.'
        });
    }

    try {
      await supabaseRequest(
        'DELETE',
        `content?key=eq.${encodeURIComponent(key)}`
      );

      res.json({
        ok: true
      });
    } catch (err) {
      console.error(err);

      res
        .status(500)
        .json({
          error:
            'Gagal menghapus data.'
        });
    }
  }
);

app.get(
  '/api/health',
  (_req, res) => {
    res.json({
      ok: true
    });
  }
);

app.use(
  express.static(
    __dirname,
    {
      index: 'index.html',
      extensions: ['html']
    }
  )
);

app.use(
  (
    err,
    _req,
    res,
    _next
  ) => {
    console.error(err);

    res
      .status(500)
      .json({
        error:
          'Terjadi kesalahan pada server.'
      });
  }
);

if (require.main === module) {
  const port =
    Number(
      process.env.PORT || 3000
    );

  app.listen(
    port,
    '0.0.0.0',
    () => {
      console.log(
        `Website running on port ${port}`
      );
    }
  );
}

module.exports = app;
