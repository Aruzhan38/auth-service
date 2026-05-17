const { createClient } = require('redis');

const redisClient = createClient({
  socket: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
  },
  password: process.env.REDIS_PASSWORD || undefined,
});

redisClient.on('error', (err) => console.error('[REDIS] Error:', err.message));
redisClient.on('connect', () => console.log('[REDIS] Connected'));

async function connectRedis() {
  try {
    await redisClient.connect();
  } catch (err) {
    console.error('[REDIS] Connection failed:', err.message);
    process.exit(1);
  }
}

module.exports = { redisClient, connectRedis };