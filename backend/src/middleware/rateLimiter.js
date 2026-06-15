const rateLimiters = {};

function rateLimit(key, maxRequests, windowMs) {
    return (req, res, next) => {
        const clientKey = `${key}:${req.ip}`;
        const now = Date.now();

        if (!rateLimiters[clientKey]) {
            rateLimiters[clientKey] = { count: 1, resetTime: now + windowMs };
            return next();
        }

        const limiter = rateLimiters[clientKey];
        if (now > limiter.resetTime) {
            limiter.count = 1;
            limiter.resetTime = now + windowMs;
            return next();
        }

        limiter.count++;
        if (limiter.count > maxRequests) {
            return res.status(429).json({
                success: false,
                error: `Rate limit exceeded. Max ${maxRequests} requests per ${windowMs / 1000}s.`
            });
        }
        next();
    };
}

// Cleanup stale entries every 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const key of Object.keys(rateLimiters)) {
        if (now > rateLimiters[key].resetTime) delete rateLimiters[key];
    }
}, 5 * 60 * 1000);

module.exports = { rateLimit };
