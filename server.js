require('dotenv').config();
const express = require('express');
const session = require('express-session');
const expressLayouts = require('express-ejs-layouts');
const path = require('path');
const { initDb } = require('./db/database');

const authRoutes = require('./routes/auth');
const articleRoutes = require('./routes/articles');

const app = express();
const PORT = process.env.PORT || 3000;

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layout');
app.set('layout extractScripts', true);

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Body parsing
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Session
app.use(session({
  secret: process.env.SESSION_SECRET || 'skyblog_secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 } // 1 week
}));

// Make user available in all templates + voteButtons helper
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;

  // Helper: render vote buttons HTML for an article
  res.locals.voteButtons = function(article, user) {
    const up   = article.upvote_count   || 0;
    const down = article.downvote_count || 0;
    if (!user) {
      return `<a href="/login" class="vote-btn-guest">👍 ${up}</a><a href="/login" class="vote-btn-guest">👎 ${down}</a>`;
    }
    const upActive   = article.userVote === 1  ? ' vote-active-up'   : '';
    const downActive = article.userVote === -1 ? ' vote-active-down' : '';
    return `<button class="vote-btn${upActive}"   data-id="${article.id}" data-val="1"  onclick="vote(this)">👍 <span>${up}</span></button>` +
           `<button class="vote-btn${downActive}" data-id="${article.id}" data-val="-1" onclick="vote(this)">👎 <span>${down}</span></button>`;
  };

  next();
});

// Populate sidebar data for all requests
app.use((req, res, next) => {
  try {
    const db = require('./db/database').getDb();
    const stats_rows = db.prepare('SELECT key, value FROM site_stats').all();
    const stats = {};
    stats_rows.forEach(r => stats[r.key] = r.value);
    stats.article_count = db.prepare('SELECT COUNT(*) as c FROM articles').get().c;
    stats.last_article = db.prepare('SELECT MAX(updated_at) as m FROM articles').get().m;
    res.locals.stats = stats;
    res.locals.sidebarPhotos = db.prepare('SELECT * FROM photos ORDER BY id DESC LIMIT 18').all();
  } catch (e) {
    res.locals.stats = { visits: 0, article_count: 0, created_at: null, last_article: null };
    res.locals.sidebarPhotos = [];
  }
  next();
});

// Visit counter middleware (only on GET /)
app.use((req, res, next) => {
  if (req.method === 'GET' && req.path === '/') {
    const db = require('./db/database').getDb();
    db.prepare("UPDATE site_stats SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT) WHERE key = 'visits'").run();
  }
  next();
});

// Routes
app.use('/', authRoutes);
app.use('/', articleRoutes);

// 404
app.use((req, res) => {
  res.status(404).render('error', { message: 'Page non trouvée', code: 404 });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('error', { message: 'Erreur interne du serveur', code: 500 });
});

// Start
initDb();
app.listen(PORT, () => {
  console.log(`✨ Skyblog lancé sur http://localhost:${PORT}`);
});
