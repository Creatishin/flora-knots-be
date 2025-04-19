const rateLimit = require('express-rate-limit');

const RateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 2, // limit to 2 requests per minute
  message: { message: 'Too many requests, please try again later.' }
});

module.exports = { RateLimiter };