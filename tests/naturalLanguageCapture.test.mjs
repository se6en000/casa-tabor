import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseNaturalLanguageCapture } from '../src/utils/naturalLanguageCapture.ts';

describe('Natural Language Capture Parser', () => {
  const referenceNow = new Date('2026-08-20T10:00:00'); // Thursday Aug 20, 2026 10:00 AM local
  const mockFamily = [
    { id: 'mem_1', name: 'Jake', color_hex: '#2563eb' },
    { id: 'mem_2', name: 'Kelly', color_hex: '#ec4899' },
    { id: 'mem_3', name: 'Julian', color_hex: '#10b981' },
    { id: 'mem_4', name: 'Chloe', color_hex: '#8b5cf6' },
  ];

  it('correctly parses timed event with day and time', () => {
    const result = parseNaturalLanguageCapture(
      'Tennis with Arthur Friday at 9am',
      { now: referenceNow, familyMembers: mockFamily }
    );

    assert.equal(result.intent, 'event');
    assert.equal(result.title.toLowerCase().includes('tennis'), true);
    assert.ok(result.startDate);
    assert.equal(result.startDate.getHours(), 9);
    assert.equal(result.allDay, false);
  });

  it('correctly extracts tomorrow morning to 9:00 AM', () => {
    const result = parseNaturalLanguageCapture(
      'Contractor walkthrough tomorrow morning',
      { now: referenceNow, familyMembers: mockFamily }
    );

    assert.equal(result.intent, 'event');
    assert.equal(result.title.toLowerCase().includes('contractor walkthrough'), true);
    assert.ok(result.startDate);
    assert.equal(result.startDate.getHours(), 9);
    assert.equal(result.allDay, false);
  });

  it('correctly extracts tomorrow afternoon to 2:00 PM (14:00)', () => {
    const result = parseNaturalLanguageCapture(
      'Dentist appointment tomorrow afternoon for Chloe',
      { now: referenceNow, familyMembers: mockFamily }
    );

    assert.equal(result.intent, 'event');
    assert.equal(result.title.toLowerCase().includes('dentist'), true);
    assert.equal(result.startDate.getHours(), 14);
    assert.equal(result.matchedMembers.some(m => m.name === 'Chloe'), true);
  });

  it('classifies reminder / chore without time as all-day reminder', () => {
    const result = parseNaturalLanguageCapture(
      'Pick up dry cleaning on Thursday',
      { now: referenceNow, familyMembers: mockFamily }
    );

    assert.equal(result.intent, 'reminder');
    assert.equal(result.title.toLowerCase().includes('dry cleaning'), true);
    assert.equal(result.allDay, true);
  });

  it('classifies grocery buying intent', () => {
    const result = parseNaturalLanguageCapture(
      'Buy organic honeycrisp apples and almond milk',
      { now: referenceNow, familyMembers: mockFamily }
    );

    assert.equal(result.intent, 'grocery');
    assert.equal(result.title.toLowerCase().includes('honeycrisp apples'), true);
  });

  it('identifies family members mentioned with "for <Name>" or "with <Name>"', () => {
    const result = parseNaturalLanguageCapture(
      'Soccer practice for Julian at 4:30pm',
      { now: referenceNow, familyMembers: mockFamily }
    );

    assert.equal(result.intent, 'event');
    assert.equal(result.matchedMembers.length, 1);
    assert.equal(result.matchedMembers[0].name, 'Julian');
    assert.equal(result.startDate.getHours(), 16);
    assert.equal(result.startDate.getMinutes(), 30);
  });
});
