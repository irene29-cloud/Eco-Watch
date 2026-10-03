'use strict';

const { CATEGORIES, LOCALITIES, STATUSES, SEVERITIES } = require('./constants');

// Strip control characters (keeps newlines and tabs), then trim. Non-strings return null.
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
function text(value) {
  return typeof value === 'string' ? value.replace(CONTROL, '').trim() : null;
}

function validNumber(value, min, max) {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

// Rules mirror the frontend form so both sides agree.
function validateNewComplaint(body) {
  const b = body && typeof body === 'object' ? body : {};
  const errors = {};

  const title = text(b.title);
  if (title === null || title.length < 5 || title.length > 90) {
    errors.title = 'Title must be 5 to 90 characters.';
  }

  if (CATEGORIES.indexOf(b.category) === -1) errors.category = 'Choose a valid category.';
  if (LOCALITIES.indexOf(b.locality) === -1) errors.locality = 'Choose a valid locality.';

  const severity = b.severity === undefined ? 'medium' : b.severity;
  if (SEVERITIES.indexOf(severity) === -1) errors.severity = 'Severity must be low, medium or high.';

  const description = text(b.description);
  if (description === null || description.length < 15 || description.length > 800) {
    errors.description = 'Description must be 15 to 800 characters.';
  }

  let reporter = 'Anonymous';
  if (b.reporter !== undefined && b.reporter !== null && b.reporter !== '') {
    const r = text(b.reporter);
    if (r === null || r.length > 60) errors.reporter = 'Name must be at most 60 characters.';
    else if (r) reporter = r;
  }

  if (!validNumber(b.lat, -90, 90)) errors.lat = 'Latitude must be a number between -90 and 90.';
  if (!validNumber(b.lng, -180, 180)) errors.lng = 'Longitude must be a number between -180 and 180.';

  return {
    errors: errors,
    value: {
      title: title, category: b.category, locality: b.locality, severity: severity,
      description: description, reporter: reporter, lat: b.lat, lng: b.lng
    }
  };
}

function validateAdminUpdate(body) {
  const b = body && typeof body === 'object' ? body : {};
  const errors = {};
  const value = {};

  if (b.status !== undefined) {
    if (STATUSES.indexOf(b.status) === -1) errors.status = 'Status must be open, in_progress or resolved.';
    else value.status = b.status;
  }
  if (b.note !== undefined) {
    const note = text(b.note);
    if (note === null || note.length > 200) errors.note = 'Note must be at most 200 characters.';
    else value.note = note;
  }
  if (Object.keys(errors).length === 0 && Object.keys(value).length === 0) {
    errors.body = 'Provide a status and/or a note.';
  }
  return { errors: errors, value: value };
}

module.exports = { validateNewComplaint, validateAdminUpdate };
