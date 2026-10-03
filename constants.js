'use strict';

// Keep these in sync with the lists in the frontend (app.js).
module.exports = {
  CATEGORIES: [
    'Air pollution', 'Water pollution', 'Noise', 'Illegal dumping',
    'Waste burning', 'Deforestation', 'Industrial discharge', 'Other'
  ],
  LOCALITIES: ['Downtown', 'Riverside', 'Industrial Estate', 'Old Town', 'Lakeview', 'Hillcrest'],
  STATUSES: ['open', 'in_progress', 'resolved'],
  SEVERITIES: ['low', 'medium', 'high']
};
