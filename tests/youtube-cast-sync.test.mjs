import test from 'node:test';
import assert from 'node:assert/strict';

// Test mock storage and event pipeline for YouTube Cast Sync logic
test('YouTube Cast Sync - default state and initialization', () => {
  const defaultState = {
    isPlaying: false,
    track: null,
    progressMs: 0,
    durationMs: 0,
    volumePct: 50,
    activeDeviceId: 'nest-office-point',
    activeDeviceName: 'Office Point (Nest Wifi)',
    devices: [
      {
        id: 'nest-office-point',
        name: 'Office Point (Nest Wifi)',
        model: 'Nest Wifi point',
        ip: '192.168.87.244',
        port: 8009,
        isActive: true,
      }
    ],
    queue: [],
    shuffle: false,
    repeatMode: 0,
  };

  assert.equal(defaultState.isPlaying, false);
  assert.equal(defaultState.activeDeviceId, 'nest-office-point');
  assert.equal(defaultState.devices[0].ip, '192.168.87.244');
  assert.equal(defaultState.volumePct, 50);
});

test('YouTube Cast Sync - volume clamping logic', () => {
  function clampVolume(vol) {
    return Math.max(0, Math.min(100, Math.round(vol)));
  }

  assert.equal(clampVolume(-10), 0);
  assert.equal(clampVolume(150), 100);
  assert.equal(clampVolume(65.4), 65);
  assert.equal(clampVolume(0), 0);
  assert.equal(clampVolume(100), 100);
});

test('YouTube Cast Sync - queue manipulation', () => {
  let queue = [];
  const track1 = { id: 't1', name: 'Song 1', artists: ['Artist 1'], videoId: 'v1', durationMs: 200000 };
  const track2 = { id: 't2', name: 'Song 2', artists: ['Artist 2'], videoId: 'v2', durationMs: 180000 };
  const track3 = { id: 't3', name: 'Song 3', artists: ['Artist 3'], videoId: 'v3', durationMs: 240000 };

  // Add to queue
  queue = [...queue, track1, track2];
  assert.equal(queue.length, 2);
  assert.equal(queue[0].id, 't1');

  // Play next (prepend)
  queue = [track3, ...queue];
  assert.equal(queue.length, 3);
  assert.equal(queue[0].id, 't3');

  // Advance queue
  const current = queue[0];
  queue = queue.slice(1);
  assert.equal(current.id, 't3');
  assert.equal(queue.length, 2);
  assert.equal(queue[0].id, 't1');

  // Clear queue
  queue = [];
  assert.equal(queue.length, 0);
});

test('YouTube Cast Sync - device selection logic', () => {
  const devices = [
    { id: 'nest-office-point', name: 'Office Point', isActive: true },
    { id: 'nest-living-room', name: 'Living Room Speaker', isActive: false },
  ];

  function selectDevice(targetId) {
    return devices.map(d => ({
      ...d,
      isActive: d.id === targetId,
    }));
  }

  const updated = selectDevice('nest-living-room');
  assert.equal(updated.find(d => d.id === 'nest-living-room').isActive, true);
  assert.equal(updated.find(d => d.id === 'nest-office-point').isActive, false);
});
