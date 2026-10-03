'use strict';

const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const config = require('../config');
const limiters = require('../limiters');
const { hashPinSync, verifyPin, signAdminToken } = require('../security');

const router = express.Router();

// Verified against when the locality is unknown, so response time does not reveal
// which localities have an admin account.
const DUMMY_HASH = hashPinSync(crypto.randomBytes(8).toString('hex'));

router.post('/login', limiters.login, async function (req, res, next) {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const locality = body.locality;
    const pin = body.pin;
    if (typeof locality !== 'string' || typeof pin !== 'string' || pin.length === 0 || pin.length > 64) {
      return res.status(400).json({ error: { message: 'Locality and PIN are required.' } });
    }

    const admin = db.data().admins.find(function (a) { return a.locality === locality; });
    const ok = await verifyPin(pin, admin ? admin.pinHash : DUMMY_HASH);
    if (!admin || !ok) {
      return res.status(401).json({ error: { message: 'Invalid locality or PIN.' } });
    }

    res.json({ token: signAdminToken(admin.locality), locality: admin.locality, expiresIn: config.jwtTtl });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
