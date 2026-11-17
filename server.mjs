
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { Apinator } from '@apinator/server';
import { createClient } from '@supabase/supabase-js';

const required = [
  'APINATOR_APP_ID',
  'APINATOR_KEY',
  'APINATOR_SECRET',
  'SUPABASE_URL',
  'SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SECRET_KEY'
];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing environment variable: ${key}`);
  }
}

const realtime = new Apinator({
  appId: process.env.APINATOR_APP_ID,
  key: process.env.APINATOR_KEY,
  secret: process.env.APINATOR_SECRET,
  cluster: process.env.APINATOR_CLUSTER || 'eu'
});

const db = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  }
);

const authClient = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  }
);

const app = express();

app.use(cors({
  origin: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-ESF-User',
    'X-ESF-Name'
  ]
}));

app.use(express.json({ limit: '16kb' }));

app.get('/', (_req, res) => {
  res.type('text').send('EsF Online server is running!');
});

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'esf-online',
    region: process.env.APINATOR_CLUSTER || 'eu'
  });
});

// AUTH HELPERS

function cleanUsername(value) {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9_]/g, '')
    .slice(0, 18);
}

function usernameEmail(username) {
  return `${username.toLowerCase()}@accounts.esf.invalid`;
}

async function player(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ')
      ? header.slice(7)
      : '';

    if (!token) {
      return res.status(401).json({ error: 'Login required' });
    }

    const { data, error } = await db.auth.getUser(token);

    if (error || !data.user) {
      return res.status(401).json({ error: 'Invalid session' });
    }

    req.user = data.user;
    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Authentication failed' });
  }
}

// REGISTER

app.post('/api/auth/register', async (req, res) => {
  try {
    const username = cleanUsername(req.body?.username);
    const password = String(req.body?.password || '');

    if (username.length < 3) {
      return res.status(400).json({
        error: 'Username must have at least 3 characters'
      });
    }

    if (password.length < 8 || password.length > 72) {
      return res.status(400).json({
        error: 'Password must be 8-72 characters'
      });
    }

    const { data, error } = await db.auth.admin.createUser({
      email: usernameEmail(username),
      password,
      email_confirm: true,
      user_metadata: { username }
    });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    const { error: profileError } = await db
      .from('profiles')
      .upsert({
        id: data.user.id,
        username
      });

    if (profileError) {
      await db.auth.admin.deleteUser(data.user.id);
      return res.status(500).json({
        error: 'Profile creation failed'
      });
    }

    const { data: login, error: loginError } =
      await authClient.auth.signInWithPassword({
        email: usernameEmail(username),
        password
      });

    if (loginError) {
      return res.status(500).json({
        error: 'Account created. Please log in.'
      });
    }

    res.json({
      ok: true,
      username,
      user: login.user,
      session: login.session
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// LOGIN

app.post('/api/auth/login', async (req, res) => {
  try {
    const username = cleanUsername(req.body?.username);
    const password = String(req.body?.password || '');

    if (!username || !password) {
      return res.status(400).json({
        error: 'Username and password required'
      });
    }

    const { data, error } =
      await authClient.auth.signInWithPassword({
        email: usernameEmail(username),
        password
      });

    if (error) {
      return res.status(401).json({
        error: 'Wrong username or password'
      });
    }

    res.json({
      ok: true,
      username,
      user: data.user,
      session: data.session
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// CURRENT PLAYER

app.get('/api/auth/me', player, async (req, res) => {
  const { data, error } = await db
    .from('profiles')
    .select('id, username, created_at')
    .eq('id', req.user.id)
    .single();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json({ ok: true, profile: data });
});

// CREATE CLAN

app.post('/api/clans/create', player, async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim().slice(0, 24);
    const tag = String(req.body?.tag || '').trim().slice(0, 6);

    if (name.length < 3) {
      return res.status(400).json({
        error: 'Clan name must have at least 3 characters'
      });
    }

    const { data: clan, error } = await db
      .from('clans')
      .insert({
        name,
        tag,
        owner_id: req.user.id
      })
      .select()
      .single();

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    const { error: memberError } = await db
      .from('clan_members')
      .insert({
        clan_id: clan.id,
        user_id: req.user.id,
        role: 'owner'
      });

    if (memberError) {
      await db.from('clans').delete().eq('id', clan.id);
      return res.status(500).json({
        error: 'Clan membership creation failed'
      });
    }

    res.json({ ok: true, clan });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Clan creation failed' });
  }
});

// JOIN CLAN

app.post('/api/clans/join', player, async (req, res) => {
  try {
    const clanId = String(req.body?.clanId || '');

    const { data, error } = await db
      .from('clan_members')
      .insert({
        clan_id: clanId,
        user_id: req.user.id,
        role: 'member'
      })
      .select()
      .single();

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json({ ok: true, membership: data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Clan join failed' });
  }
});

// LIST CLANS

app.get('/api/clans', player, async (_req, res) => {
  const { data, error } = await db
    .from('clans')
    .select('id, name, tag, created_at')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json({ ok: true, clans: data });
});

// QUICK MATCHMAKING

app.post('/api/matchmaking/join', player, async (req, res) => {
  try {
    const mode = String(req.body?.mode || 'competitive')
      .slice(0, 24);

    const region = String(req.body?.region || 'eu')
      .slice(0, 12);

    const { error: queueError } = await db
      .from('matchmaking_queue')
      .upsert({
        user_id: req.user.id,
        mode,
        region
      }, { onConflict: 'user_id' });

    if (queueError) {
      return res.status(400).json({
        error: queueError.message
      });
    }

    const { data: queue, error } = await db
      .from('matchmaking_queue')
      .select('user_id, created_at')
      .eq('mode', mode)
      .eq('region', region)
      .order('created_at', { ascending: true })
      .limit(2);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    if (queue.length < 2) {
      return res.json({
        ok: true,
        status: 'waiting',
        message: 'Waiting for another player'
      });
    }

    const { data: match, error: matchError } = await db
      .from('matches')
      .insert({
        mode,
        status: 'waiting'
      })
      .select()
      .single();

    if (matchError) {
      return res.status(500).json({
        error: matchError.message
      });
    }

    const matchPlayers = queue.map((item, index) => ({
      match_id: match.id,
      user_id: item.user_id,
      team: index === 0 ? 'T' : 'CT'
    }));

    const { error: playersError } = await db
      .from('match_players')
      .insert(matchPlayers);

    if (playersError) {
      await db.from('matches').delete().eq('id', match.id);
      return res.status(500).json({
        error: playersError.message
      });
    }

    await db
      .from('matchmaking_queue')
      .delete()
      .in('user_id', queue.map(item => item.user_id));

    res.json({
      ok: true,
      status: 'matched',
      match
    });
  } catch (err) {
    console.error('Matchmaking error:', err);
    res.status(500).json({
      error: 'Matchmaking failed'
    });
  }
});

// LEAVE MATCHMAKING

app.post('/api/matchmaking/leave', player, async (req, res) => {
  const { error } = await db
    .from('matchmaking_queue')
    .delete()
    .eq('user_id', req.user.id);

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json({ ok: true });
});

// APINATOR ROOM AUTH - PRESERVED

app.post('/api/realtime/auth', (req, res) => {
  try {
    const { socket_id, channel_name } = req.body || {};

    if (
      typeof socket_id !== 'string' ||
      typeof channel_name !== 'string' ||
      !/^presence-esf-[A-Z0-9]{4,8}$/.test(channel_name)
    ) {
      return res.status(400).json({ error: 'Invalid room' });
    }

    const userId = String(req.get('x-esf-user') || '')
      .replace(/[^a-zA-Z0-9_-]/g, '')
      .slice(0, 80);

    const name = String(req.get('x-esf-name') || 'Oyuncu')
      .replace(/[<>\r\n]/g, '')
      .trim()
      .slice(0, 18) || 'Oyuncu';

    if (!userId) {
      return res.status(400).json({
        error: 'Missing player id'
      });
    }

    const channel_data = JSON.stringify({
      user_id: userId,
      user_info: { name }
    });

    const auth = realtime.authenticateChannel(
      socket_id,
      channel_name,
      channel_data
    );

    res.json(auth);
  } catch (err) {
    console.error('Channel auth failed:', err);
    res.status(500).json({
      error: 'Channel authorization failed'
    });
  }
});

const port = Number(process.env.PORT || 3000);

app.listen(port, '0.0.0.0', () => {
  console.log(`EsF online server listening on ${port}`);
});
