'use strict';

const crypto = require('crypto');
const { promisify } = require('util');
const jwt = require('jsonwebtoken');
const config = require('./config');

const scrypt = promisify(crypto.scrypt);

// PINs are stored as "scrypt$<salt hex>$<hash hex>", never in plain text.
function hashPinSync(pin) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(pin), salt, 32);
  return 'scrypt$' + salt.toString('hex') + '$' + hash.toString('hex');
}

async function verifyPin(pin, stored) {
  const parts = String(stored).split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const salt = Buffer.from(parts[1], 'hex');
  const expected = Buffer.from(parts[2], 'hex');
  const actual = await scrypt(String(pin), salt, expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

function signAdminToken(locality) {
  return jwt.sign({ role: 'admin', locality: locality }, config.jwtSecret, {
    algorithm: 'HS256',
    expiresIn: config.jwtTtl
  });
}

function unauthorized(res) {
  return res.status(401).json({ error: { message: 'Authentication required.' } });
}

// Express middleware: only valid admin tokens pass. Sets req.admin = { locality }.
function requireAdmin(req, res, next) {
  const header = req.get('authorization') || '';
  const parts = header.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return unauthorized(res);
  try {
    const claims = jwt.verify(parts[1], config.jwtSecret, { algorithms: ['HS256'] });
    if (claims.role !== 'admin' || typeof claims.locality !== 'string') return unauthorized(res);
    req.admin = { locality: claims.locality };
    return next();
  } catch (err) {
    return unauthorized(res);
  }
}

module.exports = { hashPinSync, verifyPin, signAdminToken, requireAdmin };
