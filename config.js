'use strict';

const path = require('path');
const crypto = require('crypto');
require('dotenv').config();

const env = process.env.NODE_ENV || 'development';
const isProd = env === 'production';

function must(name) {
  const value = process.env[name];
  if (!value) throw new Error('Missing required environment variable ' + name);
  return value;
}

function bool(value, fallback) {
  if (value === undefined || value === '') return fallback;
  return String(value).toLowerCase() === 'true';
}

function parseTrustProxy(value) {
  if (!value) return undefined;
  if (value === 'true') return true;
  const n = Number(value);
  return Number.isInteger(n) ? n : value;
}

var jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  if (isProd) must('JWT_SECRET');
  jwtSecret = crypto.randomBytes(32).toString('hex');
  console.warn('[config] JWT_SECRET is not set. Using a temporary secret; admin sessions reset on restart.');
}

module.exports = {
  env: env,
  isProd: isProd,
  port: Number(process.env.PORT) || 3000,
  jwtSecret: jwtSecret,
  jwtTtl: process.env.JWT_TTL || '8h',
  adminDefaultPin: process.env.ADMIN_DEFAULT_PIN || (isProd ? null : '1234'),
  corsOrigins: (process.env.CORS_ORIGIN || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean),
  frontendDir: path.resolve(process.env.FRONTEND_DIR || path.join(__dirname, '..', '..', 'frontend')),
  dataFile: path.resolve(process.env.DATA_FILE || path.join(__dirname, '..', 'data', 'db.json')),
  seedDemoData: bool(process.env.SEED_DEMO_DATA, !isProd),
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY)
};
