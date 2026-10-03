'use strict';

const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const limiters = require('../limiters');
const { CATEGORIES, LOCALITIES, STATUSES, SEVERITIES } = require('../constants');
const { validateNewComplaint } = require('../validate');

const router = express.Router();

// The browser generates a random id once and sends it as X-Voter-Id, so one person
// can upvote a report only once without needing an account.
const VOTER_ID = /^[A-Za-z0-9_-]{16,64}$/;

function voterIdFrom(req) {
  const value = req.get('x-voter-id');
  return value && VOTER_ID.test(value) ? value : null;
}

function present(complaint, voterId) {
  const voters = db.data().votes[complaint.id] || [];
  return Object.assign({}, complaint, { voted: !!voterId && voters.indexOf(voterId) !== -1 });
}

function filterParam(value) {
  return typeof value === 'string' && value !== '' && value !== 'all' ? value : null;
}

function intParam(value, fallback, min, max) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

router.get('/meta', function (req, res) {
  res.json({ categories: CATEGORIES, localities: LOCALITIES, statuses: STATUSES, severities: SEVERITIES });
});

router.get('/complaints', function (req, res) {
  const category = filterParam(req.query.category);
  const locality = filterParam(req.query.locality);
  const status = filterParam(req.query.status);
  const needle = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase().slice(0, 100) : '';
  const sort = req.query.sort === 'new' ? 'new' : 'votes';
  const page = intParam(req.query.page, 1, 1, 100000);
  const limit = intParam(req.query.limit, 20, 1, 100);
  const voterId = voterIdFrom(req);

  const matches = db.data().complaints.filter(function (c) {
    return (!category || c.category === category) &&
           (!locality || c.locality === locality) &&
           (!status || c.status === status) &&
           (!needle || (c.title + ' ' + c.description).toLowerCase().indexOf(needle) !== -1);
  });

  matches.sort(function (a, b) {
    if (sort === 'new') return b.createdAt - a.createdAt;
    return b.votes - a.votes || b.createdAt - a.createdAt;
  });

  const start = (page - 1) * limit;
  res.json({
    items: matches.slice(start, start + limit).map(function (c) { return present(c, voterId); }),
    total: matches.length,
    page: page,
    limit: limit
  });
});

router.get('/complaints/:id', function (req, res) {
  const complaint = db.data().complaints.find(function (c) { return c.id === req.params.id; });
  if (!complaint) return res.status(404).json({ error: { message: 'Complaint not found.' } });
  res.json(present(complaint, voterIdFrom(req)));
});

router.post('/complaints', limiters.createComplaint, async function (req, res, next) {
  try {
    const result = validateNewComplaint(req.body);
    if (Object.keys(result.errors).length) {
      return res.status(400).json({ error: { message: 'Please fix the highlighted fields.', fields: result.errors } });
    }
    const now = Date.now();
    const complaint = Object.assign({
      id: crypto.randomUUID(),
      votes: 0,
      status: 'open',
      note: '',
      createdAt: now,
      updatedAt: now
    }, result.value);

    db.data().complaints.unshift(complaint);
    await db.save();
    res.status(201).json(present(complaint, voterIdFrom(req)));
  } catch (err) {
    next(err);
  }
});

// Toggles the caller's upvote. Send it again to remove the vote.
router.post('/complaints/:id/vote', limiters.vote, async function (req, res, next) {
  try {
    const voterId = voterIdFrom(req);
    if (!voterId) {
      return res.status(400).json({ error: { message: 'A valid X-Voter-Id header (16 to 64 letters, digits, - or _) is required.' } });
    }
    const state = db.data();
    const complaint = state.complaints.find(function (c) { return c.id === req.params.id; });
    if (!complaint) return res.status(404).json({ error: { message: 'Complaint not found.' } });

    const voters = state.votes[complaint.id] || (state.votes[complaint.id] = []);
    const index = voters.indexOf(voterId);
    if (index === -1) {
      voters.push(voterId);
      complaint.votes += 1;
    } else {
      voters.splice(index, 1);
      complaint.votes = Math.max(0, complaint.votes - 1);
    }
    await db.save();
    res.json({ id: complaint.id, votes: complaint.votes, voted: index === -1 });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
