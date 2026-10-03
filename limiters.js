'use strict';

const rateLimit = require('express-rate-limit');

function limiter(windowMs, limit, message) {
  return rateLimit({
    windowMs: windowMs,
    limit: limit,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: { message: message } }
  });
}

const MINUTE = 60 * 1000;

module.exports = {
  api: limiter(15 * MINUTE, 300, 'Too many requests. Please slow down and try again shortly.'),
  createComplaint: limiter(60 * MINUTE, 10, 'You have submitted too many complaints. Please try again later.'),
  vote: limiter(10 * MINUTE, 60, 'Too many votes in a short time. Please try again later.'),
  login: limiter(15 * MINUTE, 10, 'Too many login attempts. Please try again later.')
};
