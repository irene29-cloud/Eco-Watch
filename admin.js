'use strict';

const express = require('express');
const db = require('../db');
const { requireAdmin } = require('../security');
const { STATUSES } = require('../constants');
const { validateAdminUpdate } = require('../validate');

const router = express.Router();

// Every route below needs a valid admin token, and an admin only ever sees or changes
// complaints in the locality their token was issued for.
router.use(requireAdmin);

function inLocality(req) {
  return db.data().complaints.filter(function (c) { return c.locality === req.admin.locality; });
}

router.get('/complaints', function (req, res) {
  const status = typeof req.query.status === 'string' && STATUSES.indexOf(req.query.status) !== -1
    ? req.query.status : null;
  const items = inLocality(req)
    .filter(function (c) { return !status || c.status === status; })
    .sort(function (a, b) { return b.votes - a.votes || b.createdAt - a.createdAt; });
  res.json({ locality: req.admin.locality, items: items, total: items.length });
});

router.get('/stats', function (req, res) {
  const mine = inLocality(req);
  const count = function (s) { return mine.filter(function (c) { return c.status === s; }).length; };
  res.json({
    locality: req.admin.locality,
    total: mine.length,
    open: count('open'),
    in_progress: count('in_progress'),
    resolved: count('resolved')
  });
});

router.patch('/complaints/:id', async function (req, res, next) {
  try {
    const complaint = db.data().complaints.find(function (c) { return c.id === req.params.id; });
    if (!complaint) return res.status(404).json({ error: { message: 'Complaint not found.' } });
    if (complaint.locality !== req.admin.locality) {
      return res.status(403).json({ error: { message: 'You can only update complaints in your own locality.' } });
    }

    const result = validateAdminUpdate(req.body);
    if (Object.keys(result.errors).length) {
      return res.status(400).json({ error: { message: 'Invalid update.', fields: result.errors } });
    }

    Object.assign(complaint, result.value, { updatedAt: Date.now() });
    await db.save();
    res.json(complaint);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
