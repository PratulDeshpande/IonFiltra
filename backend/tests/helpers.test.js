const { toBool, toNum } = require('../src/helpers');

describe('Helper Functions', () => {
    describe('toBool', () => {
        it('preserves null and undefined', () => {
            expect(toBool(null)).toBeNull();
            expect(toBool(undefined)).toBeNull();
        });
        it('handles booleans', () => {
            expect(toBool(true)).toBe(true);
            expect(toBool(false)).toBe(false);
        });
        it('handles numbers', () => {
            expect(toBool(1)).toBe(true);
            expect(toBool(0)).toBe(false);
            expect(toBool(2)).toBe(true);
        });
        it('handles strings', () => {
            expect(toBool('true')).toBe(true);
            expect(toBool('false')).toBe(false);
            expect(toBool('1')).toBe(true);
            expect(toBool('0')).toBe(false);
        });
    });

    describe('toNum', () => {
        it('preserves null and undefined by returning fallback', () => {
            expect(toNum(null)).toBeNull();
            expect(toNum(undefined)).toBeNull();
            expect(toNum(null, 0)).toBe(0);
        });
        it('parses numbers correctly', () => {
            expect(toNum('123')).toBe(123);
            expect(toNum(45.6)).toBe(45.6);
        });
        it('returns fallback for NaN', () => {
            expect(toNum('abc')).toBeNull();
            expect(toNum('abc', 0)).toBe(0);
        });
    });
});
