'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const S = require('./slots.js');

const shop = {
    CLOSED_WEEKDAYS: [0],
    OPEN_HOUR: 9,
    CLOSE_HOUR: 18,
    SLOT_STEP_MINS: 30,
    TZ_OFFSET: '+08:00',
};

test('marks the current and earlier appointment starts unavailable', () => {
    const now = new Date('2026-01-05T09:00:00+08:00');
    const result = S.buildSlots({
        date: '2026-01-05',
        durationMins: 60,
        shop,
        booked: [],
        now,
    });

    assert.equal(result.slots[0].status, 'past');
    assert.equal(result.slots[1].status, 'free');
});

test('blocks every slot that overlaps a saved appointment', () => {
    const result = S.buildSlots({
        date: '2026-01-05',
        durationMins: 60,
        shop,
        booked: [{
            starts_at: '2026-01-05T09:30:00+08:00',
            ends_at: '2026-01-05T10:30:00+08:00',
        }],
        now: new Date('2026-01-05T08:00:00+08:00'),
    });

    assert.equal(result.slots[0].status, 'booked');
    assert.equal(result.slots[1].status, 'booked');
    assert.equal(result.slots[2].status, 'booked');
    assert.equal(result.slots[3].status, 'free');
});

test('returns no slots on a closed day', () => {
    const result = S.buildSlots({
        date: '2026-01-04',
        durationMins: 60,
        shop,
        booked: [],
        now: new Date('2026-01-03T08:00:00+08:00'),
    });

    assert.equal(result.closed, true);
    assert.deepEqual(result.slots, []);
});

test('accepts only dates inside the inclusive booking window', () => {
    const today = '2026-01-05';
    const lastBookableDay = S.addDays(today, 60);

    assert.equal(S.isWithinBookingWindow(today, today, 60), true);
    assert.equal(S.isWithinBookingWindow(lastBookableDay, today, 60), true);
    assert.equal(S.isWithinBookingWindow(S.addDays(today, -1), today, 60), false);
    assert.equal(S.isWithinBookingWindow('2024-01-01', today, 60), false);
    assert.equal(S.isWithinBookingWindow(S.addDays(today, 61), today, 60), false);
});

test('formats Manila today as an ISO date across a UTC day boundary', () => {
    assert.equal(S.todayInManila(new Date('2026-11-26T16:30:00Z')), '2026-11-27');
});
