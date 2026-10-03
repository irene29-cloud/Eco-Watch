'use strict';

/* Tiny JSON-file database.
 * - The whole dataset lives in memory and is written back atomically (temp file + rename).
 * - Fine for a demo or a small deployment. For real traffic, swap this module for
 *   PostgreSQL/MongoDB while keeping the same data() / save() surface used by the routes.
 */

const fsp = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const config = require('./config');
const { LOCALITIES } = require('./constants');
const { hashPinSync } = require('./security');

let state = null;
let writeChain = Promise.resolve();

function seedComplaints() {
  const now = Date.now();
  const day = 86400000;
  const make = function (fields) {
    return Object.assign({ id: crypto.randomUUID(), note: '', updatedAt: fields.createdAt }, fields);
  };
  return [
    make({ title: 'Garbage heap near the bus stand', category: 'Illegal dumping', locality: 'Downtown',
      severity: 'medium', description: 'Waste has piled up for over a week and stray animals are scattering it onto the road.',
      reporter: 'Anita', lat: 12.9763, lng: 77.5929, votes: 14, status: 'open', createdAt: now - 2 * day }),
    make({ title: 'Dark smoke from factory chimney at night', category: 'Air pollution', locality: 'Industrial Estate',
      severity: 'high', description: 'Thick black smoke every night after 10 pm. Residents report coughing and eye irritation.',
      reporter: 'Ravi', lat: 12.9352, lng: 77.6245, votes: 31, status: 'in_progress',
      note: 'Inspection scheduled with the pollution board.', createdAt: now - 5 * day }),
    make({ title: 'Foam and chemical smell in the river', category: 'Water pollution', locality: 'Riverside',
      severity: 'high', description: 'White foam floating downstream and a strong chemical odour near the bridge.',
      reporter: 'Anonymous', lat: 12.9501, lng: 77.5702, votes: 22, status: 'open', createdAt: now - 1 * day }),
    make({ title: 'Loudspeakers past midnight', category: 'Noise', locality: 'Old Town',
      severity: 'low', description: 'Event hall plays amplified music until 2 am on weekdays.',
      reporter: 'Meera', lat: 12.9667, lng: 77.5833, votes: 6, status: 'resolved',
      note: 'Operator warned and fined.', createdAt: now - 9 * day })
  ];
}

function save() {
  const snapshot = JSON.stringify(state);
  writeChain = writeChain.catch(function () {}).then(async function () {
    const tmp = config.dataFile + '.tmp';
    await fsp.writeFile(tmp, snapshot);
    await fsp.rename(tmp, config.dataFile);
  });
  return writeChain;
}

async function init() {
  await fsp.mkdir(path.dirname(config.dataFile), { recursive: true });

  try {
    state = JSON.parse(await fsp.readFile(config.dataFile, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }

  let dirty = false;
  if (!state) {
    state = { version: 1, complaints: config.seedDemoData ? seedComplaints() : [], votes: {}, admins: [] };
    dirty = true;
  }
  state.complaints = state.complaints || [];
  state.votes = state.votes || {};

  if (!state.admins || state.admins.length === 0) {
    if (!config.adminDefaultPin) {
      throw new Error('Set ADMIN_DEFAULT_PIN so the initial admin accounts can be created.');
    }
    state.admins = LOCALITIES.map(function (locality) {
      return { locality: locality, pinHash: hashPinSync(config.adminDefaultPin) };
    });
    dirty = true;
  }

  if (dirty) await save();
}

function data() {
  if (!state) throw new Error('Database not initialised. Call init() first.');
  return state;
}

module.exports = { init: init, data: data, save: save, flush: function () { return writeChain; } };
