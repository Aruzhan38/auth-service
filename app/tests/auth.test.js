const request = require('supertest');
const app = require('../index');

// ─── Mock DB and Redis to avoid real connections in tests ─────────────────────
jest.mock('../config/db', () => ({
  pool: {
    query: jest.fn(),
  },
  connectDB: jest.fn(),
}));

jest.mock('../config/redis', () => ({
  redisClient: {
    setEx: jest.fn(),
    get: jest.fn(),
    del: jest.fn(),
  },
  connectRedis: jest.fn(),
}));

const { pool } = require('../config/db');
const { redisClient } = require('../config/redis');

// ─── /register ────────────────────────────────────────────────────────────────
describe('POST /api/auth/register', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should return 201 on valid registration', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [] }) 
      .mockResolvedValueOnce({ rows: [] }); 

    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'test@example.com', password: 'password123', name: 'Test User' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('userId');
    expect(res.body.message).toBe('User registered successfully');
  });

  it('should return 400 if fields are missing', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'test@example.com' });

    expect(res.status).toBe(400);
  });

  it('should return 409 if email already exists', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ id: 'existing-id' }] });

    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'test@example.com', password: 'password123', name: 'Test' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Email already registered');
  });

  it('should return 400 for invalid email format', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'not-an-email', password: 'password123', name: 'Test' });

    expect(res.status).toBe(400);
  });

  it('should return 400 for password under 8 characters', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'test@example.com', password: 'short', name: 'Test' });

    expect(res.status).toBe(400);
  });
});

// ─── /login ───────────────────────────────────────────────────────────────────
describe('POST /api/auth/login', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should return 401 for unknown email', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'password123' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid credentials');
  });

  it('should return 400 if fields are missing', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com' });

    expect(res.status).toBe(400);
  });
});

// ─── /verify ──────────────────────────────────────────────────────────────────
describe('GET /api/auth/verify', () => {
  it('should return 401 if no token is provided', async () => {
    const res = await request(app).get('/api/auth/verify');
    expect(res.status).toBe(401);
  });

  it('should return 401 for invalid token', async () => {
    const res = await request(app)
      .get('/api/auth/verify')
      .set('Authorization', 'Bearer invalidtoken');

    expect(res.status).toBe(401);
  });
});

// ─── /health ──────────────────────────────────────────────────────────────────
describe('GET /health', () => {
  it('should return 200 with status ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});