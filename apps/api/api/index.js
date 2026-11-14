// Vercel function: delegates every request to the compiled Nest app.
module.exports = require('../dist/serverless.js').default;
