const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getDb } = require('../db/database');

const router = express.Router();

// Multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../public/uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e6);
    cb(null, unique + path.extname(file.originalname));
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Seules les images sont autorisées'));
  }
});

function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}

// GET / — Article feed
router.get('/', (req, res) => {
  const db = getDb();
  const page = parseInt(req.query.page) || 1;
  const sort = ['oldest', 'recent', 'comments', 'upvotes', 'downvotes'].includes(req.query.sort)
    ? req.query.sort : 'oldest';
  const perPage = 10;
  const offset = (page - 1) * perPage;

  const orderBy = {
    oldest:   'a.created_at ASC',
    recent:   'a.created_at DESC',
    comments: 'comment_count DESC, a.created_at DESC',
    upvotes:  'upvote_count DESC, a.created_at DESC',
    downvotes:'downvote_count DESC, a.created_at DESC'
  }[sort];

  const total = db.prepare('SELECT COUNT(*) as c FROM articles').get().c;
  const articles = db.prepare(`
    SELECT a.*, u.username as author_name,
      (SELECT COUNT(*) FROM comments c WHERE c.article_id = a.id) as comment_count,
      (SELECT COUNT(*) FROM votes v WHERE v.article_id = a.id AND v.value = 1)  as upvote_count,
      (SELECT COUNT(*) FROM votes v WHERE v.article_id = a.id AND v.value = -1) as downvote_count
    FROM articles a
    JOIN users u ON a.author_id = u.id
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?
  `).all(perPage, offset);

  articles.forEach(article => {
    article.photos = db.prepare('SELECT * FROM photos WHERE article_id = ? ORDER BY position ASC').all(article.id);
    // Current user's vote on this article
    if (req.session.user) {
      const v = db.prepare('SELECT value FROM votes WHERE article_id = ? AND user_id = ?').get(article.id, req.session.user.id);
      article.userVote = v ? v.value : 0;
    } else {
      article.userVote = 0;
    }
  });

  const flash = req.session.flash;
  delete req.session.flash;

  res.render('index', {
    articles,
    page,
    sort,
    totalPages: Math.ceil(total / perPage),
    flash,
    title: 'Blog des Jumelles'
  });
});

// GET /article/new
router.get('/article/new', requireLogin, (req, res) => {
  res.render('article-form', { article: null, error: null, title: 'Nouvel article' });
});

// POST /article/new
router.post('/article/new', requireLogin, upload.array('photos', 20), (req, res) => {
  const { title, content } = req.body;

  if (!title || !title.trim()) {
    return res.render('article-form', { article: null, error: 'Le titre est requis.', title: 'Nouvel article' });
  }

  const db = getDb();
  const result = db.prepare(
    'INSERT INTO articles (title, content, author_id) VALUES (?, ?, ?)'
  ).run(title.trim(), content || '', req.session.user.id);

  const articleId = result.lastInsertRowid;

  if (req.files && req.files.length > 0) {
    req.files.forEach((file, i) => {
      db.prepare('INSERT INTO photos (article_id, filename, caption, position) VALUES (?, ?, ?, ?)')
        .run(articleId, file.filename, '', i);
    });
  }

  req.session.flash = { type: 'success', msg: 'Article publié ! 🎉' };
  res.redirect('/');
});

// GET /article/:id
router.get('/article/:id', (req, res) => {
  const db = getDb();
  const article = db.prepare(`
    SELECT a.*, u.username as author_name,
      (SELECT COUNT(*) FROM votes v WHERE v.article_id = a.id AND v.value = 1)  as upvote_count,
      (SELECT COUNT(*) FROM votes v WHERE v.article_id = a.id AND v.value = -1) as downvote_count
    FROM articles a
    JOIN users u ON a.author_id = u.id
    WHERE a.id = ?
  `).get(req.params.id);

  if (!article) return res.status(404).render('error', { message: 'Article introuvable', code: 404 });

  article.photos = db.prepare('SELECT * FROM photos WHERE article_id = ? ORDER BY position ASC').all(article.id);
  article.comments = db.prepare(`
    SELECT c.*, u.username as author_name
    FROM comments c
    JOIN users u ON c.author_id = u.id
    WHERE c.article_id = ?
    ORDER BY c.created_at ASC
  `).all(article.id);

  if (req.session.user) {
    const v = db.prepare('SELECT value FROM votes WHERE article_id = ? AND user_id = ?').get(article.id, req.session.user.id);
    article.userVote = v ? v.value : 0;
  } else {
    article.userVote = 0;
  }

  const flash = req.session.flash;
  delete req.session.flash;

  res.render('article', { article, flash, title: article.title });
});

// GET /article/:id/edit
router.get('/article/:id/edit', requireLogin, (req, res) => {
  const db = getDb();
  const article = db.prepare('SELECT * FROM articles WHERE id = ?').get(req.params.id);
  if (!article) return res.status(404).render('error', { message: 'Article introuvable', code: 404 });

  const user = req.session.user;
  if (article.author_id !== user.id && !user.is_admin) {
    return res.status(403).render('error', { message: 'Accès refusé', code: 403 });
  }

  article.photos = db.prepare('SELECT * FROM photos WHERE article_id = ? ORDER BY position ASC').all(article.id);
  res.render('article-form', { article, error: null, title: "Modifier l'article" });
});

// POST /article/:id/edit
router.post('/article/:id/edit', requireLogin, upload.array('photos', 20), (req, res) => {
  const db = getDb();
  const article = db.prepare('SELECT * FROM articles WHERE id = ?').get(req.params.id);
  if (!article) return res.status(404).render('error', { message: 'Article introuvable', code: 404 });

  const user = req.session.user;
  if (article.author_id !== user.id && !user.is_admin) {
    return res.status(403).render('error', { message: 'Accès refusé', code: 403 });
  }

  const { title, content } = req.body;
  const deletePhotos = req.body['delete_photos[]'] || [];
  
  // Ensure deletePhotos is an array
  const deletePhotosArray = Array.isArray(deletePhotos) ? deletePhotos : (deletePhotos ? [deletePhotos] : []);

  if (!title || !title.trim()) {
    article.photos = db.prepare('SELECT * FROM photos WHERE article_id = ? ORDER BY position ASC').all(article.id);
    return res.render('article-form', { article, error: 'Le titre est requis.', title: "Modifier l'article" });
  }

  db.prepare("UPDATE articles SET title = ?, content = ?, updated_at = datetime('now') WHERE id = ?")
    .run(title.trim(), content || '', article.id);

  if (deletePhotosArray.length > 0) {
    deletePhotosArray.forEach(photoId => {
      const photo = db.prepare('SELECT * FROM photos WHERE id = ? AND article_id = ?').get(photoId, article.id);
      if (photo) {
        const filePath = path.join(__dirname, '../public/uploads', photo.filename);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        db.prepare('DELETE FROM photos WHERE id = ?').run(photoId);
      }
    });
  }

  if (req.files && req.files.length > 0) {
    const existingCount = db.prepare('SELECT COUNT(*) as c FROM photos WHERE article_id = ?').get(article.id).c;
    req.files.forEach((file, i) => {
      db.prepare('INSERT INTO photos (article_id, filename, caption, position) VALUES (?, ?, ?, ?)')
        .run(article.id, file.filename, '', existingCount + i);
    });
  }

  req.session.flash = { type: 'success', msg: 'Article modifié !' };
  res.redirect('/article/' + article.id);
});

// POST /article/:id/delete
router.post('/article/:id/delete', requireLogin, (req, res) => {
  const db = getDb();
  const article = db.prepare('SELECT * FROM articles WHERE id = ?').get(req.params.id);
  if (!article) return res.status(404).render('error', { message: 'Article introuvable', code: 404 });

  const user = req.session.user;
  if (article.author_id !== user.id && !user.is_admin) {
    return res.status(403).render('error', { message: 'Accès refusé', code: 403 });
  }

  const photos = db.prepare('SELECT * FROM photos WHERE article_id = ?').all(article.id);
  photos.forEach(photo => {
    const filePath = path.join(__dirname, '../public/uploads', photo.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  });

  db.prepare('DELETE FROM articles WHERE id = ?').run(article.id);

  req.session.flash = { type: 'success', msg: 'Article supprimé.' };
  res.redirect('/');
});

// POST /article/:id/comment
router.post('/article/:id/comment', requireLogin, (req, res) => {
  const { content } = req.body;
  if (!content || !content.trim()) {
    req.session.flash = { type: 'error', msg: 'Le commentaire ne peut pas être vide.' };
    return res.redirect('/article/' + req.params.id);
  }

  const db = getDb();
  const article = db.prepare('SELECT id FROM articles WHERE id = ?').get(req.params.id);
  if (!article) return res.status(404).render('error', { message: 'Article introuvable', code: 404 });

  db.prepare('INSERT INTO comments (article_id, author_id, content) VALUES (?, ?, ?)')
    .run(article.id, req.session.user.id, content.trim());

  req.session.flash = { type: 'success', msg: 'Commentaire ajouté ! 💬' };
  res.redirect('/article/' + req.params.id + '#comments');
});

// POST /comment/:id/delete
router.post('/comment/:id/delete', requireLogin, (req, res) => {
  const db = getDb();
  const comment = db.prepare('SELECT * FROM comments WHERE id = ?').get(req.params.id);
  if (!comment) return res.status(404).render('error', { message: 'Commentaire introuvable', code: 404 });

  const user = req.session.user;
  if (comment.author_id !== user.id && !user.is_admin) {
    return res.status(403).render('error', { message: 'Accès refusé', code: 403 });
  }

  db.prepare('DELETE FROM comments WHERE id = ?').run(comment.id);

  req.session.flash = { type: 'success', msg: 'Commentaire supprimé.' };
  res.redirect('/article/' + comment.article_id + '#comments');
});

// POST /article/:id/vote — AJAX, returns JSON
router.post('/article/:id/vote', requireLogin, (req, res) => {
  const value = parseInt(req.body.value);
  if (value !== 1 && value !== -1) return res.status(400).json({ error: 'Valeur invalide' });

  const db = getDb();
  const article = db.prepare('SELECT id FROM articles WHERE id = ?').get(req.params.id);
  if (!article) return res.status(404).json({ error: 'Article introuvable' });

  const userId = req.session.user.id;
  const existing = db.prepare('SELECT * FROM votes WHERE article_id = ? AND user_id = ?').get(article.id, userId);

  if (existing) {
    if (existing.value === value) {
      // Same vote → toggle off
      db.prepare('DELETE FROM votes WHERE id = ?').run(existing.id);
    } else {
      // Opposite vote → update
      db.prepare('UPDATE votes SET value = ? WHERE id = ?').run(value, existing.id);
    }
  } else {
    db.prepare('INSERT INTO votes (article_id, user_id, value) VALUES (?, ?, ?)').run(article.id, userId, value);
  }

  const upvotes   = db.prepare('SELECT COUNT(*) as c FROM votes WHERE article_id = ? AND value = 1').get(article.id).c;
  const downvotes = db.prepare('SELECT COUNT(*) as c FROM votes WHERE article_id = ? AND value = -1').get(article.id).c;
  const current   = db.prepare('SELECT value FROM votes WHERE article_id = ? AND user_id = ?').get(article.id, userId);

  res.json({ upvotes, downvotes, userVote: current ? current.value : 0 });
});

module.exports = router;
