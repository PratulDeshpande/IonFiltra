/**
 * Safe boolean parser.
 * Handles: true, false, 1, 0, "true", "false", "1", "0"
 * Returns null for null/undefined (preserves missing fields)
 */
function toBool(val) {
    if (val === undefined || val === null) return null;
    if (typeof val === 'boolean') return val;
    if (typeof val === 'number') return val !== 0;
    if (typeof val === 'string') return val === 'true' || val === '1';
    return Boolean(val);
}

/**
 * Safe number parser.
 * Preserves null/undefined instead of coercing to 0.
 * @param {*} val - Value to parse
 * @param {number|null} fallback - Default if val is null/undefined/NaN
 */
function toNum(val, fallback = null) {
    if (val === undefined || val === null) return fallback;
    const num = Number(val);
    return isNaN(num) ? fallback : num;
}

module.exports = { toBool, toNum };
