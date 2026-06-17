const express = require('express');
const bcrypt = require('bcryptjs');
const { getDb } = require('../db/database');

const router = express.Router();

// GET /login
router.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/');
  res.render('login', { error: null, title: 'Connexion' });
});

// POST /login
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.render('login', { error: 'Veuillez remplir tous les champs.', title: 'Connexion' });
  }

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username.trim());

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.render('login', { error: 'Identifiants incorrects.', title: 'Connexion' });
  }

  req.session.user = { id: user.id, username: user.username, is_admin: user.is_admin };
  req.session.save(() => res.redirect('/'));
});

// GET /register
router.get('/register', (req, res) => {
  if (req.session.user) return res.redirect('/');
  res.render('register', { error: null, title: 'Inscription' });
});

// POST /register
router.post('/register', (req, res) => {
  const { username, password, confirm } = req.body;

  if (!username || !password || !confirm) {
    return res.render('register', { error: 'Veuillez remplir tous les champs.', title: 'Inscription' });
  }
  if (password !== confirm) {
    return res.render('register', { error: 'Les mots de passe ne correspondent pas.', title: 'Inscription' });
  }
  if (username.trim().length < 3) {
    return res.render('register', { error: "Le pseudo doit faire au moins 3 caractères.", title: 'Inscription' });
  }
  if (password.length < 6) {
    return res.render('register', { error: 'Le mot de passe doit faire au moins 6 caractères.', title: 'Inscription' });
  }

  const db = getDb();
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username.trim());
  if (existing) {
    return res.render('register', { error: 'Ce pseudo est déjà pris.', title: 'Inscription' });
  }

  const hash = bcrypt.hashSync(password, 10);
  db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(username.trim(), hash);

  const newUser = db.prepare('SELECT * FROM users WHERE username = ?').get(username.trim());
  req.session.user = { id: newUser.id, username: newUser.username, is_admin: newUser.is_admin };
  req.session.save(() => res.redirect('/'));
});

// POST /logout
router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

module.exports = router;
