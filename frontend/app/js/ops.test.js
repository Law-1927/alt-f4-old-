'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const OPS = require('./ops.js');

test('normalizes and deduplicates custom resolved-part labels', () => {
    assert.deepEqual(
        OPS.normalizeResolvedParts(' Front   bumper ; hood, FRONT BUMPER\n'),
        ['Front bumper', 'hood'],
    );
});

test('counts each resolved part once per completed appointment', () => {
    const counts = OPS.countResolvedParts([
        { status: 'Completed', resolved_parts: ['Hood', 'hood', 'Front bumper'] },
        { status: 'Completed', resolved_parts: ['hood'] },
        { status: 'Ongoing', resolved_parts: ['Hood'] },
    ]);

    assert.deepEqual(counts, [
        { label: 'Hood', count: 2 },
        { label: 'Front bumper', count: 1 },
    ]);
});
