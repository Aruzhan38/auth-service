const client = require('prom-client');

// ─── HTTP Request Duration Histogram ─────────────────────────────────────────
// Core SLI: measures latency of every endpoint
const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
});

// ─── HTTP Request Counter ─────────────────────────────────────────────────────
// Tracks total requests — used to calculate error rate
const httpRequestTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
});

// ─── Login Success Counter ────────────────────────────────────────────────────
// SLI: login success rate = loginSuccess / (loginSuccess + loginFailure)
const loginSuccessTotal = new client.Counter({
  name: 'auth_login_success_total',
  help: 'Total number of successful logins',
  labelNames: ['email'],
});

// ─── Login Failure Counter ────────────────────────────────────────────────────
const loginFailureTotal = new client.Counter({
  name: 'auth_login_failure_total',
  help: 'Total number of failed login attempts',
  labelNames: ['reason'],
});

// ─── Registration Counter ─────────────────────────────────────────────────────
const registrationTotal = new client.Counter({
  name: 'auth_registration_total',
  help: 'Total number of registration attempts',
  labelNames: ['status'],
});

// ─── Token Verification Duration ──────────────────────────────────────────────
// SLI: token verification latency (target: p95 < 100ms)
const tokenVerificationDuration = new client.Histogram({
  name: 'auth_token_verification_duration_seconds',
  help: 'Duration of JWT token verification',
  labelNames: ['status'],
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25],
});

// ─── Active Users Gauge ───────────────────────────────────────────────────────
const activeSessionsGauge = new client.Gauge({
  name: 'auth_active_sessions_total',
  help: 'Number of currently active user sessions in Redis',
});

module.exports = {
  httpRequestDuration,
  httpRequestTotal,
  loginSuccessTotal,
  loginFailureTotal,
  registrationTotal,
  tokenVerificationDuration,
  activeSessionsGauge,
};