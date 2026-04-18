const path = require('path');

// Cloud Run (and most production runtimes) set PORT=8080.
// Our API server already respects process.env.PORT, so make `npm start`
// run the API by default.

const scriptName = process.env.BB_DATABASE_URL ? 'api-server-pg.js' : 'api-server.js';

// eslint-disable-next-line import/no-dynamic-require, global-require
require(path.join(__dirname, scriptName));
