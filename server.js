// server.js - Enhanced Express Web App for Topdeck.gg Points Calculator with API Key, Multi-Bracket Support, Autocomplete
// Run with: node server.js

import express from 'express';
import fetch from 'node-fetch';

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ---- CONFIG ----
// Set your API key here or via environment variable
const API_KEY = process.env.TOPDECK_API_KEY || "YOUR_API_KEY_HERE";

// ---- Utility: Calculate point changes ----
function calculateOutcomes(players, username) {
  const stakes = players.map((p) => p.points * 0.07);
  const totalPool = stakes.reduce((a, b) => a + b, 0);
  const youIndex = players.findIndex((p) => p.username === username);
  const yourStake = stakes[youIndex];

  return {
    win: totalPool - yourStake,
    loss: -yourStake,
    draw: totalPool / 4 - yourStake,
  };
}

// ---- Fetch Tournament Wrapper ----
async function fetchTournament(id) {
  return fetch(`https://api.topdeck.gg/v2/tournaments/Vj6FWrItL4z50jpYo7tH` , {
    headers: { "X-Api-Key": API_KEY }
  }).then(r => r.json());
}

// ---- Autocomplete Player Search ----
app.get('/api/players', async (req, res) => {
  const { q } = req.query;
  if (!q) return res.json([]);

  try {
    // Search by name across tournaments
    const searchRes = await fetch(`https://api.topdeck.gg/v2/players?search=${encodeURIComponent(q)}`, {
      headers: { "X-Api-Key": API_KEY }
    });
    const data = await searchRes.json();
    res.json(data.players || []);
  } catch (e) {
    res.json([]);
  }
});

// ---- Multi-Bracket Calculation Endpoint ----
app.post('/api/calc', async (req, res) => {
  const { urls, username } = req.body;
  if (!urls || !username) return res.json({ error: 'Missing URLs or username' });

  const results = [];

  try {
    for (const url of urls) {
      const id = url.split('/').pop();
      const data = await fetchTournament(id);
      const pods = data.rounds?.[0]?.pods || [];

      let yourPod = null;
      for (const pod of pods) {
        if (pod.players.some((p) => p.username === username)) {
          yourPod = pod;
          break;
        }
      }

      if (!yourPod) {
        results.push({ url, error: 'User not found in this bracket.' });
        continue;
      }

      const players = yourPod.players.map((p) => ({
        username: p.username,
        points: p.points,
      }));

      const outcomes = calculateOutcomes(players, username);
      results.push({ url, pod: players, outcomes });
    }

    res.json(results);
  } catch (err) {
    console.error(err);
    res.json({ error: 'Failed to fetch data or calculate outcomes.' });
  }
});

// ---- Simulation Endpoint ----
app.post('/api/simulate', (req, res) => {
  const { players } = req.body; // [{ username, points }, ...]
  if (!players || players.length !== 4)
    return res.json({ error: 'You must provide exactly 4 players.' });

  const results = {};

  for (const p of players) {
    const outcomes = calculateOutcomes(players, p.username);
    results[p.username] = outcomes;
  }

  res.json({ players, results });
});

// ---- Frontend ----
app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html>
<head>
<title>Topdeck Points Calculator</title>
</head>
<body>
  <h1>Topdeck Points Calculator</h1>

  <label>Autocomplete Player Search:</label><br>
  <input type="text" id="playerSearch" placeholder="Type name..."><br>
  <ul id="suggestions"></ul>

  <form id="calcForm">
    <label>Bracket URLs (one per line):</label><br>
    <textarea id="urls" rows="4" cols="60"></textarea><br><br>
    <label>Your Username:</label><br>
    <input type="text" id="username" required><br><br>
    <button type="submit">Calculate</button>
  </form>

  <pre id="output"></pre>

  <script>
    // Autocomplete search
    const search = document.getElementById('playerSearch');
    const suggestions = document.getElementById('suggestions');
    let timer;

    search.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const q = search.value;
        if (!q) return suggestions.innerHTML = list
          .map(p => '<li>' + p.username + '</li>')
          .join('')('');
      }, 300);
    });

    // Submit Calculator
    document.getElementById('calcForm').addEventListener('submit', async (e) => {
      e.preventDefault();

      const urls = document.getElementById('urls').value.split(/
+/).filter(x => x.trim());
      const username = document.getElementById('username').value;

      const res = await fetch('/api/calc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls, username })
      });
      const data = await res.json();

      document.getElementById('output').textContent = JSON.stringify(data, null, 2);
    });
  </script>
</body>
</html>`);
});

app.listen(3000, () => console.log('Running on http://localhost:3000'));

