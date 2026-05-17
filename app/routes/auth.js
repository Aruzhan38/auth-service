const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { pool } = require('../config/db');
const { redisClient } = require('../config/redis');
const {
  loginSuccessTotal,
  loginFailureTotal,
  registrationTotal,
  tokenVerificationDuration,
} = require('../middleware/metrics');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';
const BCRYPT_ROUNDS = 12;

// ─── POST /api/auth/register ──────────────────────────────────────────────────
// Creates a new user with hashed password
router.post('/register', async (req, res, next) => {
  try {
    const { email, password, name } = req.body;

    // Input validation
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'email, password, and name are required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Check duplicate
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length > 0) {
      registrationTotal.inc({ status: 'duplicate' });
      return res.status(409).json({ error: 'Email already registered' });
    }

    // Hash password & insert
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const userId = uuidv4();

    await pool.query(
      'INSERT INTO users (id, email, name, password_hash, created_at) VALUES ($1, $2, $3, $4, NOW())',
      [userId, email.toLowerCase(), name, passwordHash]
    );

    registrationTotal.inc({ status: 'success' });

    return res.status(201).json({
      message: 'User registered successfully',
      userId,
    });
  } catch (err) {
    registrationTotal.inc({ status: 'error' });
    next(err);
  }
});

// ─── POST /api/auth/login ─────────────────────────────────────────────────────
// Validates credentials and returns a signed JWT
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      loginFailureTotal.inc({ reason: 'missing_fields' });
      return res.status(400).json({ error: 'email and password are required' });
    }

    // Fetch user
    const result = await pool.query(
      'SELECT id, email, name, password_hash FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      loginFailureTotal.inc({ reason: 'user_not_found' });
      // Use generic message to avoid user enumeration
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];

    // Verify password
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      loginFailureTotal.inc({ reason: 'wrong_password' });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Issue JWT
    const token = jwt.sign(
      { userId: user.id, email: user.email, name: user.name },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    // Cache token in Redis (for fast verify + future revocation)
    await redisClient.setEx(`token:${user.id}`, 3600, token);

    loginSuccessTotal.inc({ email: 'redacted' });

    return res.status(200).json({
      message: 'Login successful',
      token,
      user: { id: user.id, email: user.email, name: user.name },
    });
  } catch (err) {
    loginFailureTotal.inc({ reason: 'server_error' });
    next(err);
  }
});

// ─── GET /api/auth/verify ─────────────────────────────────────────────────────
// Validates a JWT token — this is the key SLI endpoint
router.get('/verify', async (req, res, next) => {
  const end = tokenVerificationDuration.startTimer();
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      end({ status: 'missing_token' });
      return res.status(401).json({ error: 'Authorization header missing or malformed' });
    }

    const token = authHeader.split(' ')[1];

    // Verify JWT signature and expiry
    const decoded = jwt.verify(token, JWT_SECRET);

    // Check Redis cache (fast path — confirms token is still active)
    const cached = await redisClient.get(`token:${decoded.userId}`);
    if (!cached) {
      end({ status: 'expired_or_revoked' });
      return res.status(401).json({ error: 'Token expired or revoked' });
    }

    end({ status: 'valid' });
    return res.status(200).json({
      valid: true,
      user: { userId: decoded.userId, email: decoded.email, name: decoded.name },
    });
  } catch (err) {
    end({ status: 'invalid' });
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    next(err);
  }
});

// ─── POST /api/auth/logout ────────────────────────────────────────────────────
// Revokes token by removing from Redis
router.post('/logout', async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization header missing' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    await redisClient.del(`token:${decoded.userId}`);

    return res.status(200).json({ message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;