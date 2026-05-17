const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { collectDefaultMetrics, register } = require('prom-client');

const authRoutes = require('./routes/auth');
const { httpRequestDuration, httpRequestTotal } = require('./middleware/metrics');
const { connectDB } = require('./config/db');
const { connectRedis } = require('./config/redis');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Security & Parsing ───────────────────────────────────────────────────────
app.use(helmet());
app.use(cors());
app.use(express.json());

// ─── Prometheus Metrics Middleware ────────────────────────────────────────────
collectDefaultMetrics(); // CPU, memory, event loop lag, etc.

app.use((req, res, next) => {
  const end = httpRequestDuration.startTimer();
  res.on('finish', () => {
    end({
      method: req.method,
      route: req.route?.path || req.path,
      status_code: res.statusCode,
    });
    httpRequestTotal.inc({
      method: req.method,
      route: req.route?.path || req.path,
      status_code: res.statusCode,
    });
  });
  next();
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Prometheus Metrics Endpoint ──────────────────────────────────────────────
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(`[ERROR] ${err.message}`);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
  });
});

// ─── Start Server ─────────────────────────────────────────────────────────────
async function start() {
  await connectDB();
  await connectRedis();
  app.listen(PORT, () => {
    console.log(`[AUTH SERVICE] Running on port ${PORT}`);
  });
}

start();

module.exports = app;