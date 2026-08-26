#!/usr/bin/env node
/**
 * Casa Tabor - Local Development Google Cast Bridge
 * Simulates and tests the Google Cast Relay on local macOS/Linux development environments.
 */

import { spawn } from 'node:child_process';
import http from 'node:http';

const PORT = 5891;

let activeState = {
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
};

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === '/api/cast/status' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(activeState));
    return;
  }

  if (req.url === '/api/cast/devices' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(activeState.devices));
    return;
  }

  if (req.url === '/api/cast/command' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const { action } = payload;
        console.log(`[DevCastBridge] Received action: ${action}`, payload);

        if (action === 'cast:play') {
          activeState.isPlaying = true;
          activeState.track = payload.track || {
            id: payload.videoId,
            name: payload.title || 'YouTube Music Track',
            artists: [payload.artist || 'Artist'],
            album: payload.album || 'Single',
            albumArtUrl: payload.albumArtUrl || '',
            durationMs: payload.durationMs || 240000,
            videoId: payload.videoId,
          };
          activeState.progressMs = 0;
          activeState.durationMs = activeState.track.durationMs;
        } else if (action === 'cast:pause') {
          activeState.isPlaying = false;
        } else if (action === 'cast:resume') {
          activeState.isPlaying = true;
        } else if (action === 'cast:stop') {
          activeState.isPlaying = false;
          activeState.track = null;
          activeState.progressMs = 0;
        } else if (action === 'cast:seek') {
          activeState.progressMs = payload.positionMs || 0;
        } else if (action === 'cast:set_volume') {
          activeState.volumePct = Math.max(0, Math.min(100, payload.volumePct ?? 50));
        } else if (action === 'cast:queue_add') {
          if (payload.track) activeState.queue.push(payload.track);
        } else if (action === 'cast:queue_clear') {
          activeState.queue = [];
        } else if (action === 'cast:select_device') {
          activeState.activeDeviceId = payload.deviceId;
          activeState.devices = activeState.devices.map(d => ({
            ...d,
            isActive: d.id === payload.deviceId,
          }));
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, state: activeState }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: String(err) }));
      }
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not Found' }));
});

server.listen(PORT, () => {
  console.log(`[DevCastBridge] Local Cast Development Bridge running on http://localhost:${PORT}`);
});
