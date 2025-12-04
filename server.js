// server.js - Full Topdeck.gg Points Calculator with Simulation & Autocomplete
import express from 'express';
import fetch from 'node-fetch';

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const API_KEY = process.env.TOPDECK_API_KEY || "58b30368-7c26-4ac8-bf80-af1026f8ad29";

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

// ---- Fetch Tournament ----
async function fetchTournament(id) {
  return fetch(`https://api.topdeck.gg/v2/tournaments/${id}`, {
    headers: { "X-Api-Key": API_KEY }
  }).then(r => r.json());
}

// ---- Autocomplete Player Search ----
app.get('/api/players', async (req, res) => {
  const { q } = req.query;
  if (!q) return res.json([]);

  try {
    const searchRes = await fetch(`https://api.topdeck.gg/v2/players?search=${encodeURIComponent(q)}`, {
      headers: { "X-Api-Key": API_KEY }
    });
    const data = await searchRes.json();
    res.json(data.players || []);
  } catch (e) {
    res.json([]);
  }
});

// ---- Multi-Bracket Calculation ----
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

      const players = yourPod.players.map((p) => ({ username: p.username, points: p.points }));
      const outcomes = calculateOutcomes(players, username);
      results.push({ url, pod: players, outcomes });
    }
    res.json(results);
  } catch (err) {
    console.error(err);
    res.json({ error: 'Failed to fetch data or calculate outcomes.' });
  }
});

// ---- Simulation of Custom Pod ----
app.post('/api/simulate', async (req, res) => {
  const { tournamentId, usernames } = req.body;
  if (!usernames || usernames.length !== 4) return res.json({ error: 'You must provide exactly 4 usernames.' });

  try {
    const data = await fetchTournament(tournamentId);
    const allPlayers = [];
    data.rounds?.forEach(r => r.pods?.forEach(pod => pod.players.forEach(p => allPlayers.push({ username: p.username, points: p.points }))));

    const selectedPlayers = usernames.map(u => {
      const player = allPlayers.find(p => p.username === u);
      if (!player) throw new Error(`Player ${u} not found in tournament`);
      return player;
    });

    const results = {};
    selectedPlayers.forEach(p => {
      results[p.username] = calculateOutcomes(selectedPlayers, p.username);
    });

    res.json({ pod: selectedPlayers, results });
  } catch (err) {
    console.error(err);
    res.json({ error: 'Failed to simulate pod: ' + err.message });
  }
});

// ---- Frontend ----
app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
<title>Topdeck Points Calculator</title>
</head>
<body>
<h1>Topdeck Points Calculator</h1>

<label>Autocomplete Player Search:</label><br>
<input type="text" id="playerSearch" placeholder="Type name..."><ul id="suggestions"></ul><br>

<form id="calcForm">
<label>Bracket URLs (one per line):</label><br>
<textarea id="urls" rows="4" cols="60"></textarea><br><br>
<label>Your Username:</label><br>
<input type="text" id="username" required><br><br>
<button type="submit">Calculate</button>
</form>
<pre id="output"></pre>

<label>Simulate Custom Pod:</label><br>
Tournament ID: <input type="text" id="simTournamentId"><br>
Player 1: <input type="text" class="simPlayer" id="simPlayer1" placeholder="Start typing..."><ul class="suggestions" id="simSuggestions1"></ul><br>
Player 2: <input type="text" class="simPlayer" id="simPlayer2" placeholder="Start typing..."><ul class="suggestions" id="simSuggestions2"></ul><br>
Player 3: <input type="text" class="simPlayer" id="simPlayer3" placeholder="Start typing..."><ul class="suggestions" id="simSuggestions3"></ul><br>
Player 4: <input type="text" class="simPlayer" id="simPlayer4" placeholder="Start typing..."><ul class="suggestions" id="simSuggestions4"></ul><br>
<button id="simulateBtn">Simulate Pod</button>
<pre id="simulateOutput"></pre>

<script>
// Autocomplete for general player search
const search = document.getElementById('playerSearch');
const suggestions = document.getElementById('suggestions');
let timer;
search.addEventListener('input', () => {
  clearTimeout(timer);
  timer = setTimeout(async () => {
    const q = search.value;
    if (!q) return suggestions.innerHTML = '';
    const list = await fetch('/api/players?q=' + encodeURIComponent(q)).then(r => r.json());
    suggestions.innerHTML = list.map(p => '<li>' + p.username + '</li>').join('');
  }, 300);
});

// Submit Calculator
document.getElementById('calcForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const urls = document.getElementById('urls').value.split(/\n+/).filter(x => x.trim());
  const username = document.getElementById('username').value;
  const res = await fetch('/api/calc', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({urls, username}) });
  const data = await res.json();
  document.getElementById('output').textContent = JSON.stringify(data, null, 2);
});

// Setup autocomplete for simulated pod
async function fetchPlayerSuggestions(query) {
  const res = await fetch('/api/players?q=' + encodeURIComponent(query));
  return await res.json();
}
function setupAutocomplete(inputId, suggestionId) {
  const input = document.getElementById(inputId);
  const suggestionList = document.getElementById(suggestionId);
  let timer;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const q = input.value;
      if (!q) return suggestionList.innerHTML = '';
      const list = await fetchPlayerSuggestions(q);
      suggestionList.innerHTML = list.map(p => '<li class="simItem" data-name="'+p.username+'">'+p.username+'</li>').join('');
      document.querySelectorAll('#'+suggestionId+' .simItem').forEach(item => {
        item.addEventListener('click', () => { input.value = item.dataset.name; suggestionList.innerHTML = ''; });
      });
    }, 300);
  });
}
['simPlayer1','simPlayer2','simPlayer3','simPlayer4'].forEach((id, idx) => setupAutocomplete(id, 'simSuggestions'+(idx+1)));

// Simulate Pod
document.getElementById('simulateBtn').addEventListener('click', async () => {
  const tournamentId = document.getElementById('simTournamentId').value;
  const usernames = ['simPlayer1','simPlayer2','simPlayer3','simPlayer4'].map(id => document.getElementById(id).value.trim());
  if (usernames.some(u=>!u)){ alert('All 4 players must be selected.'); return; }
  const res = await fetch('/api/simulate', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ tournamentId, usernames }) });
  const data = await res.json();
  document.getElementById('simulateOutput').textContent = JSON.stringify(data, null, 2);
});
</script>

</body>
</html>
`);
});

app.listen(3000, () => console.log('Running on http://localhost:3000'));


