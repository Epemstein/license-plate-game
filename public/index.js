// === FIREBASE ===
const firebaseConfig = {
  apiKey: "AIzaSyBEa4aJf-cB25uzvEXdpNf1bG5kOOL5PXs",
  authDomain: "license-plate-game-2ea96.firebaseapp.com",
  databaseURL: "https://license-plate-game-2ea96-default-rtdb.firebaseio.com",
  projectId: "license-plate-game-2ea96",
  storageBucket: "license-plate-game-2ea96.firebasestorage.app",
  messagingSenderId: "247985429580",
  appId: "1:247985429580:web:4927cee2ca3581b569a8e9",
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const database = firebase.database();
let gameMode = "practice";
let currentUser = null;
let currentViewingDate = null; // Track which date we're viewing

auth.onAuthStateChanged((user) => {
  console.log(user);
  currentUser = user;
  const signInBtn = document.getElementById("signInBtn");
  const userInfo = document.getElementById("userInfo");
  if (user) {
    signInBtn.style.display = "none";
    document.getElementById("authPlaceholder").style.display = "none";
    userInfo.style.display = "block";
    document.getElementById("userName").textContent =
      user.displayName || user.email;
  } else {
    document.getElementById("authPlaceholder").style.display = "none";
    signInBtn.style.display = "inline-block";
    userInfo.style.display = "none";
  }
});

function getTodayString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(d.getDate()).padStart(2, "0")}`;
}

async function signInWithGoogle() {
  try {
    await auth.signInWithPopup(new firebase.auth.GoogleAuthProvider());
    return true;
  } catch (e) {
    alert("Sign in failed: " + e.message);
    return false;
  }
}

async function checkIfPlayedToday() {
  return false;
  if (!currentUser) return false;
  const t = getTodayString();
  const s1 = await database.ref(`scores/${t}/${currentUser.uid}`).once("value");
  if (s1.exists()) return true;
  const s2 = await database
    .ref(`started/${t}/${currentUser.uid}`)
    .once("value");
  return s2.exists();
}

async function saveScore(time, solved, skipped) {
  if (!currentUser || gameMode !== "daily") return;
  const today = getTodayString();

  // Prepare game history for saving
  const historyData = gameHistory.map((entry) => ({
    plate: entry.plate,
    word: entry.word,
    skipped: entry.skipped || false,
    thinkingSeconds: Math.floor(entry.thinkingSeconds * 10) / 10,
    penaltySeconds: entry.penaltySeconds || 0,
  }));

  await database.ref(`scores/${today}/${currentUser.uid}`).set({
    userId: currentUser.uid,
    userName: currentUser.displayName,
    totalTime: Math.floor(time * 10) / 10,
    solved: solved,
    skipped: skipped,
    timestamp: Date.now(),
    history: historyData,
  });

  // Refresh leaderboard to unlock View buttons and Compare button
  displayLeaderboard(today);
}

// Load a specific player's run history (only when View is clicked)
async function loadPlayerHistory(userId, dateStr) {
  const ref = database.ref(`scores/${dateStr}/${userId}`);
  const snapshot = await ref.once("value");
  if (!snapshot.exists()) return null;
  return snapshot.val();
}

async function loadLeaderboard(dateStr) {
  const ref = database.ref(`scores/${dateStr}`);
  const snapshot = await ref.once("value");
  if (!snapshot.exists()) return [];

  const arr = [];
  const rawData = snapshot.val();

  // Process each user's score WITHOUT including history
  for (const userId in rawData) {
    const data = rawData[userId];
    // DON'T include history to prevent cheating via console
    arr.push({
      userId: data.userId,
      userName: data.userName,
      totalTime: data.totalTime,
      solved: data.solved,
      skipped: data.skipped,
      timestamp: data.timestamp,
      // history is intentionally excluded
    });
  }

  arr.sort((a, b) => a.totalTime - b.totalTime);

  // Only log count, not actual data
  return arr;
}

// Toggle comparison table
function toggleCompareTable() {
  const btn = document.getElementById("compareRunsBtn");

  // Don't do anything if button is disabled (locked)
  if (btn.disabled) {
    return;
  }

  const container = document.getElementById("comparisonTableContainer");
  if (container.style.display === "none") {
    container.style.display = "block";
    btn.textContent = "Hide Comparison";
    buildComparisonTable();
  } else {
    container.style.display = "none";
    btn.textContent = "Compare All Runs";
  }
}
window.toggleCompareTable = toggleCompareTable;

// Get color based on time (gradient)
function getTimeColor(seconds) {
  if (seconds <= 1.5) return "#22c55e"; // green (under 1.5s)
  if (seconds >= 30) return "#ef4444"; // dark red (30s+)

  if (seconds <= 6) {
    // Green to white (1.5s → 6s)
    const ratio = (seconds - 1.5) / 4.5;
    const r = Math.round(34 + (255 - 34) * ratio);
    const g = Math.round(197 + (255 - 197) * ratio);
    const b = Math.round(94 + (255 - 94) * ratio);
    return `rgb(${r},${g},${b})`;
  } else {
    // White to red (6s → 30s)
    const ratio = (seconds - 6) / 24;
    const r = 255;
    const g = Math.round(255 - (255 - 68) * ratio);
    const b = Math.round(255 - (255 - 68) * ratio);
    return `rgb(${r},${g},${b})`;
  }
}

// Build comparison table
async function buildComparisonTable() {
  const contentEl = document.getElementById("comparisonTable");
  contentEl.innerHTML = "Loading comparison...";

  try {
    // Use the date currently being viewed, not always today
    const dateStr = currentViewingDate || getTodayString();
    console.log("Building comparison for date:", dateStr);
    const scores = await loadLeaderboard(dateStr);

    if (scores.length === 0) {
      contentEl.innerHTML =
        '<p style="text-align:center;color:#6b7280;">No data available</p>';
      return;
    }

    // Load full history for each player on-demand
    const playersData = [];
    let maxPlates = 0;

    for (const score of scores) {
      const playerData = await loadPlayerHistory(score.userId, dateStr);
      if (playerData && playerData.history && playerData.history.length > 0) {
        maxPlates = Math.max(maxPlates, playerData.history.length);
        playersData.push({
          name: score.userName,
          time: score.totalTime,
          history: playerData.history,
        });
      }
    }

    if (playersData.length === 0) {
      contentEl.innerHTML =
        '<p style="text-align:center;color:#6b7280;">No detailed history available</p>';
      return;
    }

    // Collect all plate names in order
    const plateNames = [];
    for (let i = 0; i < maxPlates; i++) {
      let plateName = "—";
      for (const player of playersData) {
        if (i < player.history.length && player.history[i].plate) {
          plateName = player.history[i].plate;
          break;
        }
      }
      plateNames.push(plateName);
    }

    // Build table
    let html =
      '<div style="max-height:620px;overflow:auto;"><table style="border-collapse:collapse;font-size:0.9rem;">';

    // Calculate statistics for each plate first
    const plateStats = [];
    for (let i = 0; i < maxPlates; i++) {
      let totalTime = 0;
      let count = 0;
      let skipCount = 0;

      playersData.forEach((player) => {
        if (i < player.history.length) {
          count++;
          const entry = player.history[i];
          const time = entry.skipped
            ? (entry.thinkingSeconds || 0) + entry.penaltySeconds
            : entry.thinkingSeconds;
          totalTime += time;
          if (entry.skipped) skipCount++;
        }
      });

      const avgTime = count > 0 ? (totalTime / count).toFixed(1) : "—";
      const skipRate = count > 0 ? Math.round((skipCount / count) * 100) : 0;
      plateStats.push({ avgTime, skipRate });
    }

    // Header row with plate names and stats
    html +=
      '<thead style="position:sticky;top:0;z-index:15;background:#f3f4f6;box-shadow:0 2px 4px rgba(0,0,0,0.1);"><tr style="background:#f3f4f6;">';
    html +=
      '<th style="padding:8px;text-align:left;position:sticky;left:0;background:#f3f4f6;z-index:20;min-width:120px;">Player</th>';
    for (let i = 0; i < maxPlates; i++) {
      const stats = plateStats[i];
      const skipColor =
        stats.skipRate > 50
          ? "#dc2626"
          : stats.skipRate > 25
          ? "#f59e0b"
          : "#16a34a";
      html += `<th style="padding:8px;text-align:center;min-width:100px;">`;
      html += `<div onclick="openWordsModal('${plateNames[i]}')" style="font-weight:bold;font-size:1rem;cursor:pointer;display:inline-block;" title="Click to see all viable words">${plateNames[i]}</div>`;
      html += `<div style="font-size:0.75rem;color:#6b7280;margin-top:2px;">Avg: ${stats.avgTime}s</div>`;
      html += `<div style="font-size:0.75rem;color:${skipColor};margin-top:1px;">Skip: ${stats.skipRate}%</div>`;
      html += `</th>`;
    }
    html += "</tr></thead><tbody>";

    // Player rows
    playersData.forEach((player, idx) => {
      const bg = idx % 2 === 0 ? "#fff" : "#f9fafb";

      html += `<tr style="background:${bg};">`;
      html += `<td style="padding:12px;font-weight:bold;position:sticky;left:0;background:${bg};z-index:5;white-space:nowrap;">${
        player.name
      }<br><span style="font-size:0.85rem;color:#6b7280;">(${player.time.toFixed(
        1
      )}s)</span></td>`;

      // Combined word + time cells with gradient
      for (let i = 0; i < maxPlates; i++) {
        if (i < player.history.length) {
          const entry = player.history[i];
          const word = entry.skipped ? "❌" : entry.word;

          // Calculate total time (thinking + penalty for skips)
          const totalTime = entry.skipped
            ? (entry.thinkingSeconds || 0) + entry.penaltySeconds
            : entry.thinkingSeconds;

          const displayTime = entry.skipped
            ? `${totalTime.toFixed(1)}s`
            : `${totalTime.toFixed(1)}s`;

          // Skip cells get black background, others get gradient color
          const bgColor = entry.skipped ? "#000000" : getTimeColor(totalTime);
          const textColor = entry.skipped
            ? "#ffffff"
            : totalTime > 15
            ? "#fff"
            : "#000";

          // Tooltip info
          const tooltip = entry.skipped
            ? `Skipped\nThinking: ${(entry.thinkingSeconds || 0).toFixed(
                1
              )}s\nPenalty: +${
                entry.penaltySeconds
              }s\nTotal: ${totalTime.toFixed(1)}s`
            : `Word: ${entry.word}\nTime: ${totalTime.toFixed(1)}s`;

          html += `<td style="padding:8px;text-align:center;background:${bgColor};color:${textColor};border:2px solid #fff;" title="${tooltip}">`;
          html += `<div style="font-weight:600;font-size:0.9rem;">${word}</div>`;
          html += `<div style="font-size:0.85rem;margin-top:2px;">${displayTime}</div>`;
          html += `</td>`;
        } else {
          html += `<td style="padding:8px;background:#f3f4f6;border:2px solid #fff;"></td>`;
        }
      }
      html += "</tr>";
    });

    // Stats are now in the header, so remove these rows

    html += "</tbody></table>";
    contentEl.innerHTML = html;
  } catch (error) {
    console.error("Error building comparison:", error);
    contentEl.innerHTML =
      '<p style="text-align:center;color:#dc2626;">Error loading comparison</p>';
  }
}

async function displayLeaderboard(dateStr) {
  // displayLeaderboard called
  currentViewingDate = dateStr; // Track the date we're viewing

  // Declare these at function level so they're accessible everywhere
  let userHasPlayed = false;
  let isPastDate = false;

  // Auto-collapse comparison table when date changes
  const comparisonContainer = document.getElementById(
    "comparisonTableContainer"
  );
  const compareBtn = document.getElementById("compareRunsBtn");
  if (comparisonContainer && comparisonContainer.style.display === "block") {
    comparisonContainer.style.display = "none";
    if (compareBtn) compareBtn.textContent = "Compare All Runs";
  }

  document.getElementById(
    "leaderboardDate"
  ).textContent = `Daily Challenge - ${dateStr}`;
  document.getElementById("leaderboardContent").innerHTML = "Loading...";
  try {
    const scores = await loadLeaderboard(dateStr);
    if (!scores.length) {
      document.getElementById("leaderboardContent").innerHTML =
        '<p style="text-align:center;color:#6b7280;padding:20px;">No scores for this date</p>';
      return;
    }
    // Calculate these ONCE before the loop
    userHasPlayed =
      currentUser && scores.some((score) => score.userId === currentUser.uid);
    isPastDate = dateStr !== getTodayString();

    let h =
      '<table style="width:100%;border-collapse:collapse;"><thead><tr style="background:#f3f4f6;">';
    h +=
      '<th style="padding:8px;">Rank</th><th style="padding:8px;">Player</th><th style="padding:8px;text-align:right;">Time</th><th style="padding:8px;text-align:center;">Details</th></tr></thead><tbody>';
    scores.forEach((s, i) => {
      const bg = i === 0 ? "#fef3c7" : i % 2 ? "#fff" : "#f9fafb"; // Gold for 1st, alternating grey for rest
      h += `<tr style="background:${bg};"><td style="padding:8px;font-weight:bold;">#${
        i + 1
      }</td><td style="padding:8px;">${
        s.userName
      }</td><td style="padding:8px;text-align:right;font-weight:600;">${s.totalTime.toFixed(
        1
      )}s</td>`;
      // Use the userHasPlayed value calculated before the loop
      if (userHasPlayed || isPastDate) {
        h += `<td style="padding:8px;text-align:center;"><button onclick="viewPlayerRun('${
          s.userId
        }','${dateStr}','${s.userName.replace(/'/g, "'")}',${s.totalTime},${
          s.solved || 0
        },${
          s.skipped || 0
        })" style="padding:4px 12px;cursor:pointer;background:#9370db;color:white;border:1px solid #7d5bbe;border-radius:4px;">View</button></td>`;
      } else {
        h += `<td style="padding:8px;text-align:center;"><span style="color:#9ca3af;font-size:0.85rem;">🔒 Complete daily to unlock</span></td>`;
      }
      h += `</tr>`;
    });
    h += "</tbody></table>";
    document.getElementById("leaderboardContent").innerHTML = h;
  } catch (e) {
    console.error("Leaderboard error:", e);
    document.getElementById("leaderboardContent").innerHTML =
      '<p style="text-align:center;color:#dc2626;padding:20px;">Error loading</p>';
  }

  // Update Compare button state (grey out if locked) - AFTER try/catch
  try {
    const compareBtn = document.getElementById("compareRunsBtn");
    console.log("=== COMPARE BUTTON STATE ===");
    console.log("currentUser:", currentUser ? currentUser.uid : "null");
    console.log("userHasPlayed:", userHasPlayed);
    console.log("isPastDate:", isPastDate);

    if (userHasPlayed || isPastDate) {
      // Unlocked
      compareBtn.disabled = false;
      compareBtn.style.background = "#9370db";
      compareBtn.style.cursor = "pointer";
      compareBtn.style.opacity = "1";
      compareBtn.textContent = "Compare All Runs";
      console.log("→ Button UNLOCKED");
    } else {
      // Locked
      compareBtn.disabled = true;
      compareBtn.style.background = "#9ca3af";
      compareBtn.style.cursor = "not-allowed";
      compareBtn.style.opacity = "0.6";
      compareBtn.textContent = "🔒 Complete Daily to Compare";
      console.log("→ Button LOCKED");
    }
  } catch (btnError) {
    console.error("Button state error:", btnError);
  }
}
// === END FIREBASE ===

// --------- GLOBAL STATE ---------
let WORDS = [];
let DICTIONARY = new Set();
let dictionaryReady = false;

let PLATE_DIFFICULTY = null;
let difficultyReady = false;

let ALL_PLATES = [];
let platesReady = false;

let VERY_EASY_PLATES = [];
let EASY_PLATES = [];
let MEDIUM_PLATES = [];
let DIFFICULT_PLATES = [];
let HARD_PLATES = [];
let VERY_HARD_PLATES = [];
let IMPOSSIBLE_PLATES = [];

let usedPlates = new Set();
let currentPlate = null;

let gameStarted = false;
let gameOver = false;
let solvedCount = 0;
let startTime = null;
let penaltySeconds = 0;
let timerIntervalId = null;

let skipCount = 0;
let plateLocked = false;

let gameHistory = [];

let currentWordsModalMatches = [];
let currentWordsModalPlate = null;
let currentWordsModalSortMode = "alpha";

// DOM refs
const plateEl = document.getElementById("plate");
const difficultyLabelEl = document.getElementById("difficultyLabel");
const viableCountLabelEl = document.getElementById("viableCountLabel");
const wordInputEl = document.getElementById("wordInput");
const resultEl = document.getElementById("result");
const debugEl = document.getElementById("debug");
const timerDisplayEl = document.getElementById("timerDisplay");
const progressDisplayEl = document.getElementById("progressDisplay");
const historyBodyEl = document.getElementById("historyBody");
const historyEmptyEl = document.getElementById("historyEmpty");
const startButtonEl = document.getElementById("startButton");
const checkButtonEl = document.getElementById("checkButton");
const skipButtonEl = document.getElementById("skipButton");
const endButtonEl = document.getElementById("endButton");
const chartButtonEl = document.getElementById("chartButton");

const wordsModalBackdropEl = document.getElementById("wordsModalBackdrop");
const wordsModalTitleEl = document.getElementById("wordsModalTitle");
const wordsModalStatusEl = document.getElementById("wordsModalStatus");
const wordsModalListEl = document.getElementById("wordsModalList");
const wordsModalCloseBtnEl = document.getElementById("wordsModalCloseBtn");
const wordsModalCloseBtnBottomEl = document.getElementById(
  "wordsModalCloseBtnBottom"
);
const wordsSortAlphaBtnEl = document.getElementById("wordsSortAlphaBtn");
const wordsSortLengthBtnEl = document.getElementById("wordsSortLengthBtn");

const chartModalBackdropEl = document.getElementById("chartModalBackdrop");
const chartModalCloseBtnEl = document.getElementById("chartModalCloseBtn");
const chartModalCloseBtnBottomEl = document.getElementById(
  "chartModalCloseBtnBottom"
);
const resultsChartCanvas = document.getElementById("resultsChart");
let resultsChart = null;

// --------- LOADING ---------
async function loadDictionary() {
  try {
    const res = await fetch("words.txt");
    const text = await res.text();

    WORDS = [];
    DICTIONARY = new Set();

    for (const line of text.split(/\r?\n/)) {
      const w = line.trim().toLowerCase();
      if (!w) continue;
      if (!/^[a-z]+$/.test(w)) continue;
      if (w.length < 3) continue;

      WORDS.push(w);
      DICTIONARY.add(w.toUpperCase());
    }

    dictionaryReady = true;
    debugEl.textContent = `Loaded ${WORDS.length.toLocaleString()} words.`;

    tryBuildPlateList();
  } catch (err) {
    console.error(err);
    resultEl.textContent = "Failed to load words.txt.";
    resultEl.style.color = "red";
  }
}

async function loadDifficulty() {
  try {
    const res = await fetch("plate_difficulty.json");
    PLATE_DIFFICULTY = await res.json();
    difficultyReady = true;

    tryBuildPlateList();
  } catch (err) {
    console.warn("Difficulty JSON not loaded:", err);
    PLATE_DIFFICULTY = null;
    difficultyReady = false;
  } finally {
    maybeEnableStart();
  }
}

function tryBuildPlateList() {
  if (!dictionaryReady || !PLATE_DIFFICULTY || platesReady) return;

  const all = [];

  const ve = [];
  const e = [];
  const m = [];
  const d = [];
  const h = [];
  const vh = [];
  const im = [];

  for (const plate of Object.keys(PLATE_DIFFICULTY)) {
    const entry = PLATE_DIFFICULTY[plate];

    if (DICTIONARY.has(plate)) continue;

    let diff =
      entry && typeof entry.difficulty === "number" ? entry.difficulty : 50;

    all.push(plate);

    if (diff <= 10) {
      ve.push(plate);
    } else if (diff <= 34) {
      e.push(plate);
    } else if (diff <= 49) {
      m.push(plate);
    } else if (diff <= 79) {
      d.push(plate);
    } else if (diff <= 88) {
      h.push(plate);
    } else if (diff <= 96) {
      vh.push(plate);
    } else {
      im.push(plate);
    }
  }

  ALL_PLATES = all;
  VERY_EASY_PLATES = ve;
  EASY_PLATES = e;
  MEDIUM_PLATES = m;
  DIFFICULT_PLATES = d;
  HARD_PLATES = h;
  VERY_HARD_PLATES = vh;
  IMPOSSIBLE_PLATES = im;

  platesReady = true;

  debugEl.textContent += ` | ${ALL_PLATES.length.toLocaleString()} plates`;

  maybeEnableStart();
}

function maybeEnableStart() {
  const ready = dictionaryReady && difficultyReady && platesReady;
  startButtonEl.disabled = !ready;
}

// --------- PLATE MATCHING ---------
function getPlateMatchIndices(plate, word) {
  let i = 0;
  let indices = [];
  for (let j = 0; j < word.length; j++) {
    if (i == plate.length) {
      break;
    }
    if (word[j] == plate[i]) {
      indices.push(j);
      i++;
      continue;
    }
    if (plate.slice(i + 1).indexOf(word[j]) >= 0) {
      return false;
    }
  }

  if (i == plate.length) {
    return indices;
  }

  return null;
}

function wordMatchesPlate(plate, word) {
  return !!getPlateMatchIndices(plate, word);
}

function computeJsViableCount(plate) {
  if (!dictionaryReady || !plate) return 0;
  let count = 0;
  for (const w of WORDS) {
    if (wordMatchesPlate(plate, w)) {
      count++;
    }
  }
  return count;
}

// --------- PLATE SELECTION ---------
const TOTAL_PLATES = 10;

const VERY_EASY_PROB = 0.4; // 0–10
const EASY_PROB = 0.2; // 11–34
const MEDIUM_PROB = 0.15; // 35–49
const DIFFICULT_PROB = 0.15; // 50–79
const HARD_PROB = 0.05; // 80–88
const VERY_HARD_PROB = 0.03; // 89–96
const IMPOSSIBLE_PROB = 0.01; // 97–100

const BAND_NAMES = [
  "very_easy",
  "easy",
  "medium",
  "difficult",
  "hard",
  "very_hard",
  "impossible",
];

function seededRandom(seed) {
  let v = seed;
  return () => {
    v = (v * 9301 + 49297) % 233280;
    return v / 233280;
  };
}

function generatePlates(rng, max) {
  if (!platesReady || !ALL_PLATES.length) return [];

  // Use weighted difficulty selection like the original game
  const dailyPlates = [];
  const usedPlates = new Set();

  while (dailyPlates.length < max && usedPlates.size < ALL_PLATES.length) {
    // Pick a difficulty band using the same probabilities as the game
    let band = choosePrimaryBand(rng);

    // Get all plates in this band that haven't been used
    const bandPlates = ALL_PLATES.filter((plate) => {
      if (usedPlates.has(plate)) return false;
      const diff =
        PLATE_DIFFICULTY && PLATE_DIFFICULTY[plate]
          ? PLATE_DIFFICULTY[plate].difficulty
          : null;
      if (!diff) return false;

      if (band === "very_easy" && diff >= 0 && diff <= 10) return true;
      if (band === "easy" && diff >= 11 && diff <= 34) return true;
      if (band === "medium" && diff >= 35 && diff <= 49) return true;
      if (band === "difficult" && diff >= 50 && diff <= 79) return true;
      if (band === "hard" && diff >= 80 && diff <= 88) return true;
      if (band === "very_hard" && diff >= 89 && diff <= 96) return true;
      if (band === "impossible" && diff >= 97 && diff <= 100) return true;
      return false;
    });

    // Pick a random plate from this band
    if (bandPlates.length > 0) {
      const idx = Math.floor(rng() * bandPlates.length);
      const chosen = bandPlates[idx];
      dailyPlates.push(chosen);
      usedPlates.add(chosen);
    }
  }

  return dailyPlates;
}

function generateDailyPlates(dateStr) {
  // TODO: this is susceptible to finagling with the local date
  const seed = dateStr.split("-").reduce((a, v) => a + parseInt(v), 0);
  const rng = seededRandom(seed);
  return generatePlates(rng, 200);
}

function getBandPool(bandName) {
  switch (bandName) {
    case "very_easy":
      return VERY_EASY_PLATES;
    case "easy":
      return EASY_PLATES;
    case "medium":
      return MEDIUM_PLATES;
    case "difficult":
      return DIFFICULT_PLATES;
    case "hard":
      return HARD_PLATES;
    case "very_hard":
      return VERY_HARD_PLATES;
    case "impossible":
      return IMPOSSIBLE_PLATES;
    default:
      return [];
  }
}

function choosePrimaryBand(rng) {
  const r = rng();
  let threshold = 0;

  threshold += VERY_EASY_PROB;
  if (r < threshold) return "very_easy";

  threshold += EASY_PROB;
  if (r < threshold) return "easy";

  threshold += MEDIUM_PROB;
  if (r < threshold) return "medium";

  threshold += DIFFICULT_PROB;
  if (r < threshold) return "difficult";

  threshold += HARD_PROB;
  if (r < threshold) return "hard";

  threshold += VERY_HARD_PROB;
  if (r < threshold) return "very_hard";

  return "impossible";
}

// --------- DIFFICULTY ---------
function classifyDifficulty(score) {
  if (score >= 80) return "diff-hard";
  if (score >= 40) return "diff-med";
  return "diff-easy";
}

function updateDifficultyDisplay(plate) {
  if (!PLATE_DIFFICULTY || !PLATE_DIFFICULTY[plate]) {
    difficultyLabelEl.textContent = "Difficulty: —";
    difficultyLabelEl.className = "difficulty diff-med";
  } else {
    const entry = PLATE_DIFFICULTY[plate];
    const diff = entry.difficulty;
    if (!diff || diff <= 0) {
      difficultyLabelEl.textContent = "Difficulty: —";
      difficultyLabelEl.className = "difficulty diff-med";
    } else {
      difficultyLabelEl.textContent = `Difficulty: ${diff} / 100`;
      difficultyLabelEl.className = "difficulty " + classifyDifficulty(diff);
    }
  }

  if (!dictionaryReady || !plate) {
    viableCountLabelEl.textContent = "";
  } else {
    const jsCount = computeJsViableCount(plate);
    viableCountLabelEl.textContent = `${jsCount.toLocaleString()} viable words`;
  }
}

function getPlateDifficultyScore(plate) {
  if (!PLATE_DIFFICULTY || !PLATE_DIFFICULTY[plate]) return null;
  const d = PLATE_DIFFICULTY[plate].difficulty;
  if (!d || d <= 0) return null;
  return d;
}

// --------- TIMER / GAME STATE ---------
function getPromiseFromEvent(item, event, callback) {
  return new Promise((resolve) => {
    const listener = (e) => {
      item.removeEventListener(event, listener);
      callback(e);
      resolve();
    };
    item.addEventListener(event, listener);
  });
}

async function beginNewRun() {
  const ready = dictionaryReady && difficultyReady && platesReady;
  if (!ready) {
    resultEl.textContent = "Still loading…";
    resultEl.style.color = "red";
    return;
  }

  if (ALL_PLATES.length === 0) {
    resultEl.textContent = "No viable plates to start the game.";
    resultEl.style.color = "red";
    return;
  }

  gameStarted = true;
  gameOver = false;

  currentPlate = null;
  plateLocked = false;
  usedPlates = new Set();
  gameHistory = [];
  chartButtonEl.style.display = "none";

  if (timerIntervalId) clearInterval(timerIntervalId);
  timerIntervalId = null;

  plateEl.textContent = "---";
  difficultyLabelEl.textContent = "Difficulty: —";
  difficultyLabelEl.className = "difficulty diff-med";
  viableCountLabelEl.textContent = "";
  timerDisplayEl.textContent = "Time: 0.0 s";

  resultEl.textContent = "";
  resultEl.style.color = "";
  wordInputEl.value = "";

  checkButtonEl.disabled = false;
  skipButtonEl.disabled = false;
  endButtonEl.disabled = false;
  wordInputEl.disabled = false;
  wordInputEl.readOnly = false;

  while (historyBodyEl.firstChild) {
    historyBodyEl.removeChild(historyBodyEl.firstChild);
  }
  historyEmptyEl.style.display = "block";

  // Show difficulty bar when game starts
  document.getElementById("difficultyLabel").style.display = "block";

  startTime = performance.now();
  timerIntervalId = setInterval(updateTimer, 100);

  document.getElementById("dailyChallengeBtn").disabled = true;
  document.getElementById("practiceBtn").disabled = true;
  document.getElementById("endlessBtn").disabled = true;

  switch (gameMode) {
    case "daily":
      await playDaily();
      break;

    case "practice":
      await playPractice();
      break;

    case "endless":
      await playEndless();
      break;
  }

  gameOver = true;
  gameStarted = false;
  plateLocked = true;
  currentPlate = null;
  plateEl.textContent = "---";
  updateDifficultyDisplay(null);

  if (timerIntervalId) {
    clearInterval(timerIntervalId);
    timerIntervalId = null;
  }

  wordInputEl.blur();
  wordInputEl.value = "";

  checkButtonEl.disabled = true;
  skipButtonEl.disabled = true;
  endButtonEl.disabled = true;
  wordInputEl.disabled = true;
  wordInputEl.readOnly = true;

  chartButtonEl.style.display = "inline-block";
  document.getElementById("dailyChallengeBtn").disabled = false;
  document.getElementById("practiceBtn").disabled = false;
  document.getElementById("endlessBtn").disabled = false;
}

async function playDaily() {
  if (!currentUser) {
    return;
  }

  const date = new Date();
  let seed = date.getDate() + date.getMonth() * 100 + date.getFullYear() * 1000;

  let rng = seededRandom(seed);
  let plates = generatePlates(rng, 2);

  let idx = 0;
  let solved = 0;
  let nextPenalty = 5;

  // Update buttons
  startButtonEl.style.display = "none";
  skipButtonEl.textContent = `Skip +${nextPenalty}s`;
  progressDisplayEl.textContent = `Solved: ${solved} / ${TOTAL_PLATES}`;

  {
    {
      /* // Save started flag to Firebase
        database.ref(`started/${getTodayString()}/${currentUser.uid}`).set({
            userName: currentUser.displayName || currentUser.email,
            timestamp: Date.now(),
            started: true
        });
        
        window.onbeforeunload = e => {
            if (gameStarted && !gameOver && gameMode==='daily') {
                e.preventDefault();
                return 'Leave? Daily attempt will be used!';
            }
        }; */
    }
  }

  while (solved < TOTAL_PLATES) {
    const chosen = plates[idx];
    currentPlate = chosen;
    plateEl.textContent = chosen;
    resultEl.textContent = "";
    plateLocked = false;
    checkButtonEl.disabled = false;
    skipButtonEl.disabled = false;
    wordInputEl.disabled = false;
    wordInputEl.readOnly = false;
    let plateStartTime = performance.now();
    updateDifficultyDisplay(chosen);
    wordInputEl.value = "";
    wordInputEl.focus();

    // Check if we've run out of plates
    if (idx >= plates.length) {
      console.log("generating more plates...");
      seed *= 10;
      let rng = seededRandom(seed);
      plates.push(...generatePlates(rng, 200));
      continue;
    }

    let exit = false;
    let word = "";
    let matchIndices = null;
    let skip = false;
    let penalty = 0;
    let penaltyLabel = "";
    while (!exit) {
      await getPromiseFromEvent(window, "action", (e) => {
        switch (e.detail.action) {
          case "submitWord":
            word = wordInputEl.value.trim();
            let [ok, indices, reason] = checkWord(currentPlate, word);
            matchIndices = indices;

            if (ok) {
              solved++;
              progressDisplayEl.textContent = `Solved: ${solved} / ${TOTAL_PLATES}`;
              exit = true;
            }

            resultEl.innerHTML = `${ok ? "✅" : "❌"} ${reason}`;
            resultEl.style.color = ok ? "green" : "red";
            break;

          case "skipWord":
            exit = true;
            skip = true;
            penalty = nextPenalty;
            penaltyLabel = `Skipped (+${penalty}s)`;

            nextPenalty += 5;
            skipButtonEl.textContent = `Skip +${nextPenalty}s`;
            break;
        }
      });
    }

    let thinkingSeconds = (performance.now() - plateStartTime) / 1000;

    gameHistory.push({
      plate: currentPlate,
      word,
      skipped: skip,
      thinkingSeconds,
      penaltySeconds: penalty,
    });

    addToHistoryWithAnimation(
      currentPlate,
      skip ? penaltyLabel : word,
      matchIndices,
      PLATE_DIFFICULTY[currentPlate].difficulty,
      `${thinkingSeconds.toFixed(1)}s`
    );

    idx++;
  }

  console.log("Ending game - solved 10!");

  const baseElapsedSec = (performance.now() - startTime) / 1000;
  const totalSec = baseElapsedSec + penaltySeconds;

  {
    {
      /* if (currentUser) saveScore(totalSec,solvedCount,skipCount); */
    }
  }
  window.onbeforeunload = null;

  resultEl.textContent = `🏁 Finished! Time: ${totalSec.toFixed(1)} s`;
  resultEl.style.color = "green";
  startButtonEl.textContent = "Play again";
}

async function playPractice() {
  let plates = generatePlates(Math.random, 200);
  let idx = 0;
  let solved = 0;
  let nextPenalty = 5;

  // Update buttons
  startButtonEl.textContent = "Restart game";
  skipButtonEl.textContent = `Skip +${nextPenalty}s`;
  progressDisplayEl.textContent = `Solved: ${solved} / ${TOTAL_PLATES}`;

  while (solved < TOTAL_PLATES) {
    const chosen = plates[idx];
    currentPlate = chosen;
    plateEl.textContent = chosen;
    resultEl.textContent = "";
    plateLocked = false;
    checkButtonEl.disabled = false;
    skipButtonEl.disabled = false;
    wordInputEl.disabled = false;
    wordInputEl.readOnly = false;
    let plateStartTime = performance.now();
    updateDifficultyDisplay(chosen);
    wordInputEl.value = "";
    wordInputEl.focus();

    // Check if we've run out of plates
    if (idx >= plates.length) {
      console.log("generating more plates...");
      plates.push(...generatePlates(Math.random, 200));
      continue;
    }

    let exit = false;
    let word = "";
    let matchIndices = null;
    let skip = false;
    let penalty = 0;
    let penaltyLabel = "";
    while (!exit) {
      await getPromiseFromEvent(window, "action", (e) => {
        switch (e.detail.action) {
          case "submitWord":
            word = wordInputEl.value.trim();
            let [ok, indices, reason] = checkWord(currentPlate, word);
            matchIndices = indices;

            if (ok) {
              solved++;
              progressDisplayEl.textContent = `Solved: ${solved} / ${TOTAL_PLATES}`;
              exit = true;
            }

            resultEl.innerHTML = `${ok ? "✅" : "❌"} ${reason}`;
            resultEl.style.color = ok ? "green" : "red";
            break;

          case "skipWord":
            exit = true;
            skip = true;
            penalty = nextPenalty;
            penaltyLabel = `Skipped (+${penalty}s)`;

            nextPenalty += 5;
            skipButtonEl.textContent = `Skip +${nextPenalty}s`;
            break;
        }
      });
    }

    let thinkingSeconds = (performance.now() - plateStartTime) / 1000;

    gameHistory.push({
      plate: currentPlate,
      word,
      skipped: skip,
      thinkingSeconds,
      penaltySeconds: penalty,
    });

    addToHistoryWithAnimation(
      currentPlate,
      skip ? penaltyLabel : word,
      matchIndices,
      PLATE_DIFFICULTY[currentPlate].difficulty,
      `${thinkingSeconds.toFixed(1)}s`
    );

    idx++;
  }

  const baseElapsedSec = (performance.now() - startTime) / 1000;
  const totalSec = baseElapsedSec + penaltySeconds;

  resultEl.textContent = `🏁 Finished! Time: ${totalSec.toFixed(1)} s`;
  resultEl.style.color = "green";
}

async function playH2H() {
  if (!currentUser) {
    return;
  }

  const date = new Date();
  let seed = date.getDate() + date.getMonth() * 100 + date.getFullYear() * 1000;

  let rng = seededRandom(seed);
  let plates = generatePlates(rng, 2);

  let idx = 0;
  let solved = 0;
  let nextPenalty = 5;

  // Update buttons
  startButtonEl.style.display = "none";
  skipButtonEl.textContent = `Skip +${nextPenalty}s`;
  progressDisplayEl.textContent = `Solved: ${solved} / ${TOTAL_PLATES}`;

  {
    {
      /* // Save started flag to Firebase
        database.ref(`started/${getTodayString()}/${currentUser.uid}`).set({
            userName: currentUser.displayName || currentUser.email,
            timestamp: Date.now(),
            started: true
        });
        
        window.onbeforeunload = e => {
            if (gameStarted && !gameOver && gameMode==='daily') {
                e.preventDefault();
                return 'Leave? Daily attempt will be used!';
            }
        }; */
    }
  }

  while (solved < TOTAL_PLATES) {
    const chosen = plates[idx];
    currentPlate = chosen;
    plateEl.textContent = chosen;
    resultEl.textContent = "";
    plateLocked = false;
    checkButtonEl.disabled = false;
    skipButtonEl.disabled = false;
    wordInputEl.disabled = false;
    wordInputEl.readOnly = false;
    let plateStartTime = performance.now();
    updateDifficultyDisplay(chosen);
    wordInputEl.value = "";
    wordInputEl.focus();

    // Check if we've run out of plates
    if (idx >= plates.length) {
      console.log("generating more plates...");
      seed *= 10;
      let rng = seededRandom(seed);
      plates.push(...generatePlates(rng, 200));
      continue;
    }

    let exit = false;
    let word = "";
    let matchIndices = null;
    let skip = false;
    let penalty = 0;
    let penaltyLabel = "";
    while (!exit) {
      await getPromiseFromEvent(window, "action", (e) => {
        switch (e.detail.action) {
          case "submitWord":
            word = wordInputEl.value.trim();
            let [ok, indices, reason] = checkWord(currentPlate, word);
            matchIndices = indices;

            if (ok) {
              solved++;
              progressDisplayEl.textContent = `Solved: ${solved} / ${TOTAL_PLATES}`;
              exit = true;
            }

            resultEl.innerHTML = `${ok ? "✅" : "❌"} ${reason}`;
            resultEl.style.color = ok ? "green" : "red";
            break;

          case "skipWord":
            exit = true;
            skip = true;
            penalty = nextPenalty;
            penaltyLabel = `Skipped (+${penalty}s)`;

            nextPenalty += 5;
            skipButtonEl.textContent = `Skip +${nextPenalty}s`;
            break;
        }
      });
    }

    let thinkingSeconds = (performance.now() - plateStartTime) / 1000;

    gameHistory.push({
      plate: currentPlate,
      word,
      skipped: skip,
      thinkingSeconds,
      penaltySeconds: penalty,
    });

    addToHistoryWithAnimation(
      currentPlate,
      skip ? penaltyLabel : word,
      matchIndices,
      PLATE_DIFFICULTY[currentPlate].difficulty,
      `${thinkingSeconds.toFixed(1)}s`
    );

    idx++;
  }

  console.log("Ending game - solved 10!");

  const baseElapsedSec = (performance.now() - startTime) / 1000;
  const totalSec = baseElapsedSec + penaltySeconds;

  {
    {
      /* if (currentUser) saveScore(totalSec,solvedCount,skipCount); */
    }
  }
  window.onbeforeunload = null;

  resultEl.textContent = `🏁 Finished! Time: ${totalSec.toFixed(1)} s`;
  resultEl.style.color = "green";
  startButtonEl.textContent = "Play again";
}

async function playEndless() {
  let plates = generatePlates(Math.random, 1);
  let idx = 0;
  let solved = 0;

  // Update buttons
  startButtonEl.textContent = "Restart game";
  skipButtonEl.textContent = `Skip`;
  progressDisplayEl.textContent = `Solved: ${solved}`;

  while (true) {
    const chosen = plates[idx];
    currentPlate = chosen;
    plateEl.textContent = chosen;
    resultEl.textContent = "";
    plateLocked = false;
    checkButtonEl.disabled = false;
    skipButtonEl.disabled = false;
    wordInputEl.disabled = false;
    wordInputEl.readOnly = false;
    let plateStartTime = performance.now();
    updateDifficultyDisplay(chosen);
    wordInputEl.value = "";
    wordInputEl.focus();

    // Check if we've run out of plates
    if (idx >= plates.length) {
      console.log("generating more plates...");
      plates.push(...generatePlates(Math.random, 200));
      continue;
    }

    let exit = false;
    let word = "";
    let matchIndices = null;
    let skip = false;
    let endGame = false;
    while (!exit) {
      await getPromiseFromEvent(window, "action", (e) => {
        switch (e.detail.action) {
          case "submitWord":
            word = wordInputEl.value.trim();
            let [ok, indices, reason] = checkWord(currentPlate, word);
            matchIndices = indices;

            if (ok) {
              solved++;
              progressDisplayEl.textContent = `Solved: ${solved}`;
              exit = true;
            }

            resultEl.innerHTML = `${ok ? "✅" : "❌"} ${reason}`;
            resultEl.style.color = ok ? "green" : "red";
            break;

          case "skipWord":
            exit = true;
            skip = true;
            break;

          case "endGame":
            exit = true;
            endGame = true;
            break;
        }
      });
    }

    if (endGame) break;

    let thinkingSeconds = (performance.now() - plateStartTime) / 1000;

    gameHistory.push({
      plate: currentPlate,
      word,
      skipped: skip,
      thinkingSeconds,
      penaltySeconds: 0,
    });

    addToHistoryWithAnimation(
      currentPlate,
      skip ? "Skipped" : word,
      matchIndices,
      PLATE_DIFFICULTY[currentPlate].difficulty,
      `${thinkingSeconds.toFixed(1)}s`
    );

    idx++;
  }
}

function updateTimer() {
  if (!gameStarted || !startTime) return;
  const baseElapsedSec = (performance.now() - startTime) / 1000;
  const totalSec = baseElapsedSec + penaltySeconds;
  timerDisplayEl.textContent = "Time: " + totalSec.toFixed(1) + " s";
}

// --------- FLOATING LABELS & HISTORY ---------
function createFloatingLabel(text, fromRect, toRect, extraClass) {
  const el = document.createElement("div");
  el.textContent = text;
  el.className = "float-label " + (extraClass || "");

  const startX = fromRect.left + fromRect.width / 2;
  const startY = fromRect.top + fromRect.height / 2;
  const endX = toRect.left + toRect.width / 2;
  const endY = toRect.top + toRect.height / 2;

  el.style.left = startX + "px";
  el.style.top = startY + "px";

  document.body.appendChild(el);

  requestAnimationFrame(() => {
    el.style.left = endX + "px";
    el.style.top = endY + "px";
    el.style.opacity = "0";
  });

  return el;
}

function addPlateCellClickHandler(plateTd, plate) {
  plateTd.classList.add("clickable-plate");
  plateTd.title = "Click to see all viable words";
  plateTd.addEventListener("click", () => {
    openWordsModal(plate);
  });
}

function addToHistoryWithAnimation(
  plate,
  word,
  matchIndices,
  diffScore,
  timeLabel
) {
  if (!plate || !word) {
    return;
  }

  historyEmptyEl.style.display = "none";

  const row = document.createElement("tr");
  row.style.opacity = "0";

  const plateTd = document.createElement("td");
  const wordTd = document.createElement("td");
  const timeTd = document.createElement("td");
  const diffTd = document.createElement("td");

  plateTd.textContent = plate;

  if (Array.isArray(matchIndices) && matchIndices.length > 0) {
    const set = new Set(matchIndices);
    let html = "";
    for (let i = 0; i < word.length; i++) {
      const ch = word[i];
      if (set.has(i)) {
        html += `<span class="plate-letter-highlight">${ch}</span>`;
      } else {
        html += ch;
      }
    }
    wordTd.innerHTML = html;
  } else {
    wordTd.textContent = word;
  }

  timeTd.textContent = timeLabel || "—";

  if (diffScore === null || diffScore <= 0) {
    diffTd.textContent = "—";
  } else {
    diffTd.textContent = diffScore;
    diffTd.className = classifyDifficulty(diffScore);
  }

  row.appendChild(plateTd);
  row.appendChild(wordTd);
  row.appendChild(timeTd);
  row.appendChild(diffTd);

  if (historyBodyEl.firstChild) {
    historyBodyEl.insertBefore(row, historyBodyEl.firstChild);
  } else {
    historyBodyEl.appendChild(row);
  }

  while (historyBodyEl.rows.length > 30) {
    historyBodyEl.removeChild(historyBodyEl.lastChild);
  }

  addPlateCellClickHandler(plateTd, plate);

  const plateFrom = plateEl.getBoundingClientRect();
  const wordFrom = wordInputEl.getBoundingClientRect();
  const plateTo = plateTd.getBoundingClientRect();
  const wordTo = wordTd.getBoundingClientRect();
  const diffTo = diffTd.getBoundingClientRect();

  const plateClone = createFloatingLabel(
    plate,
    plateFrom,
    plateTo,
    "float-label-plate"
  );
  const wordClone = createFloatingLabel(
    word,
    wordFrom,
    wordTo,
    "float-label-word"
  );
  const diffText =
    diffScore === null || diffScore <= 0 ? "—" : String(diffScore);
  const diffClone = createFloatingLabel(
    diffText,
    plateFrom,
    diffTo,
    "float-label-diff"
  );

  const animDuration = 400;
  setTimeout(() => {
    row.style.opacity = "1";

    [plateClone, wordClone, diffClone].forEach((clone) => {
      if (clone && clone.parentNode) clone.parentNode.removeChild(clone);
    });
  }, animDuration);
}

// --------- WORDS MODAL (SORTING) ---------
function renderWordsList(sortMode,) {
  wordsModalListEl.innerHTML = "";

  const plate = currentWordsModalPlate;
  if (
    !plate ||
    !currentWordsModalMatches ||
    currentWordsModalMatches.length === 0
  ) {
    wordsModalListEl.textContent = "(no viable words found)";
    return;
  }

  const arr = [...currentWordsModalMatches];

  if (sortMode === "alpha") {
    arr.sort((a, b) => a.localeCompare(b));
  } else {
    arr.sort((a, b) => {
      const lenDiff = a.length - b.length;
      return lenDiff !== 0 ? lenDiff : a.localeCompare(b);
    });
  }

  const frag = document.createDocumentFragment();
  for (const w of arr) {
    const line = document.createElement("div");
    line.className = "words-list-item";

    const indices = getPlateMatchIndices(plate, w) || [];

    let html = "";
    for (let i = 0; i < w.length; i++) {
      const ch = w[i];
      if (indices.indexOf(i) >= 0) {
        html += `<span class="plate-letter-highlight">${ch}</span>`;
      } else {
        html += ch;
      }
    }

    line.innerHTML = html;
    frag.appendChild(line);
  }

  wordsModalListEl.appendChild(frag);
}

function openWordsModal(plate) {
  if (!dictionaryReady) return;

  wordsModalTitleEl.textContent = `Plate: ${plate}`;
  wordsModalStatusEl.textContent = "Finding viable words…";

  currentWordsModalPlate = plate.toLowerCase();
  currentWordsModalMatches = [];

  wordsModalBackdropEl.classList.add("show");

  const matches = [];
  for (const w of WORDS) {
    if (wordMatchesPlate(currentWordsModalPlate, w)) {
      matches.push(w);
    }
  }

  matches.sort();
  currentWordsModalMatches = matches;

  const countFromScan = matches.length;
  wordsModalStatusEl.textContent = `${countFromScan.toLocaleString()} viable words`;

  renderWordsList(currentWordsModalSortMode, matches);
}

function closeWordsModal() {
  wordsModalBackdropEl.classList.remove("show");
}

// Global function to close run details modal
function closeRunDetailsModal() {
  const backdrop = document.getElementById("runDetailsModalBackdrop");
  if (backdrop) {
    backdrop.classList.remove("show");
  }
}
window.closeRunDetailsModal = closeRunDetailsModal;

// --------- MISMATCH EXPLANATION ---------
function explainPlateMismatch(plate, word) {
  const plateUpper = plate.toUpperCase();
  const wordUpper = word.toUpperCase();

  const missing = [];
  for (const ch of plateUpper) {
    if (!wordUpper.includes(ch)) {
      if (!missing.includes(ch)) missing.push(ch);
    }
  }

  if (missing.length > 0) {
    const missingList = missing.join(", ");
    const letterWord = missing.length === 1 ? "letter" : "letters";
    return (
      `"${word}" doesn't work for <strong>${plateUpper}</strong>.<br>` +
      `It's missing the ${letterWord}: <strong>${missingList}</strong>.`
    );
  }

  const firstOccurrences = [];
  for (const ch of plateUpper) {
    const idx = wordUpper.indexOf(ch);
    if (idx !== -1) {
      firstOccurrences.push({ ch, idx });
    }
  }

  firstOccurrences.sort((a, b) => a.idx - b.idx);
  const wordOrder = firstOccurrences.map((x) => x.ch).join(" \u2192 ");
  const plateOrder = plateUpper.split("").join(" \u2192 ");
  const lettersList = plateUpper.split("").join(", ");

  return (
    `"${word}" doesn't work for <strong>${plateUpper}</strong>.<br>` +
    `In your word, the first <strong>${lettersList}</strong> appear in this order: <strong>${wordOrder}</strong>.<br>` +
    `The plate <strong>${plateUpper}</strong> requires them in this order: <strong>${plateOrder}</strong>.`
  );
}

// --------- CHART ---------
function buildChart() {
  if (!gameHistory.length) return;

  const labels = [];
  const thinkingData = [];
  const penaltyData = [];
  const cumulativeData = [];
  const platesForChart = [];

  let runningTotal = 0;

  for (const entry of gameHistory) {
    const plate = entry.plate;
    platesForChart.push(plate);

    let labelText;
    if (entry.skipped) {
      labelText = `${plate} — skipped`;
    } else {
      labelText = `${plate} — "${entry.word}"`;
    }
    labels.push(labelText);

    const think = entry.thinkingSeconds != null ? entry.thinkingSeconds : 0;
    const pen = entry.penaltySeconds != null ? entry.penaltySeconds : 0;

    thinkingData.push(think);
    penaltyData.push(pen);

    runningTotal += think + pen;
    cumulativeData.push(runningTotal);
  }

  const ctx = resultsChartCanvas.getContext("2d");

  resultsChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          type: "bar",
          label: "Thinking time (s)",
          data: thinkingData,
          backgroundColor: "rgba(59, 130, 246, 0.8)",
          stack: "time",
        },
        {
          type: "bar",
          label: "Skip penalty (s)",
          data: penaltyData,
          backgroundColor: "rgba(220, 38, 38, 0.8)",
          stack: "time",
        },
        {
          type: "line",
          label: "Cumulative time (s)",
          data: cumulativeData,
          borderColor: "rgba(15, 23, 42, 0.9)",
          backgroundColor: "rgba(15, 23, 42, 0.5)",
          tension: 0.25,
          pointRadius: 3,
          pointHoverRadius: 4,
          fill: false,
          yAxisID: "y",
        },
      ],
      _plates: platesForChart,
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "bottom",
        },
        tooltip: {
          callbacks: {
            title: function (items) {
              if (!items || !items.length) return "";
              const idx = items[0].dataIndex;
              const plate = resultsChart.config.data._plates[idx];
              const entry = gameHistory[idx];
              if (entry.skipped) {
                return `${plate} — skipped`;
              }
              return `${plate} — "${entry.word}"`;
            },
            label: function (context) {
              const label = context.dataset.label || "";
              const value = context.parsed.y;
              return `${label}: ${value.toFixed(1)}s`;
            },
          },
        },
      },
      scales: {
        x: {
          stacked: true,
          grid: {
            display: false,
            drawBorder: false,
          },
          ticks: {
            autoSkip: false,
            maxRotation: 45,
            minRotation: 0,
          },
        },
        y: {
          stacked: true,
          title: {
            display: true,
            text: "Seconds",
          },
          grid: {
            display: false,
            drawBorder: false,
          },
        },
      },
      onClick: (evt, elements) => {
        if (!elements.length) return;
        const index = elements[0].index;
        const plate = resultsChart.config.data._plates[index];
        openWordsModal(plate);
      },
    },
  });
}

function openChartModal() {
  if (!gameHistory.length) return;

  if (resultsChart) {
    resultsChart.destroy();
    resultsChart = null;
  }

  buildChart();
  chartModalBackdropEl.classList.add("show");
}

function closeChartModal() {
  chartModalBackdropEl.classList.remove("show");
}

// --------- ACTIONS ---------
function checkWord(plate, rawWord) {
  if (!rawWord) return [false, null, ""];

  if (!DICTIONARY.has(rawWord.toUpperCase())) {
    return [false, null, `"${rawWord}" is not in the dictionary`];
  }

  const matchIndices = getPlateMatchIndices(plate, rawWord);
  if (!matchIndices) {
    return [false, null, explainPlateMismatch(plate, rawWord)];
  }

  return [true, matchIndices, `"${rawWord}" matches ${plate}`];
}

// --------- INIT ---------
startButtonEl.disabled = true;
endButtonEl.style.display = "none";
chartButtonEl.style.display = "none";

startButtonEl.addEventListener("click", beginNewRun);
checkButtonEl.addEventListener("click", () => {
  window.dispatchEvent(
    new CustomEvent("action", {
      detail: {
        action: "submitWord",
      },
    })
  );
});
skipButtonEl.addEventListener("click", () => {
  window.dispatchEvent(
    new CustomEvent("action", {
      detail: {
        action: "skipWord",
      },
    })
  );
});
chartButtonEl.addEventListener("click", openChartModal);
endButtonEl.addEventListener("click", () => {
  window.dispatchEvent(
    new CustomEvent("action", {
      detail: {
        action: "endGame",
      },
    })
  );
});

wordInputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    window.dispatchEvent(
      new CustomEvent("action", {
        detail: {
          action: e.altKey ? "skipWord" : "submitWord",
        },
      })
    );
  }
});

wordsModalCloseBtnEl.addEventListener("click", closeWordsModal);
wordsModalCloseBtnBottomEl.addEventListener("click", closeWordsModal);
wordsModalBackdropEl.addEventListener("click", (e) => {
  if (e.target === wordsModalBackdropEl) {
    closeWordsModal();
  }
});

chartModalCloseBtnEl.addEventListener("click", closeChartModal);
chartModalCloseBtnBottomEl.addEventListener("click", closeChartModal);
chartModalBackdropEl.addEventListener("click", (e) => {
  if (e.target === chartModalBackdropEl) {
    closeChartModal();
  }
});

// Highlight plate letters in a word
function highlightPlateInWord(plate, word) {
  const upperWord = word.toUpperCase();
  const upperPlate = plate.toUpperCase();
  let result = "";
  let plateIndex = 0;

  for (let i = 0; i < word.length; i++) {
    if (
      plateIndex < upperPlate.length &&
      upperWord[i] === upperPlate[plateIndex]
    ) {
      result += `<span style="color:#16a34a;font-weight:700;">${word[i]}</span>`;
      plateIndex++;
    } else {
      result += `<span style="color:#000000;">${word[i]}</span>`;
    }
  }

  return result;
}
// View player run details
async function viewPlayerRun(
  userId,
  dateString,
  userName,
  totalTime,
  solved,
  skipped
) {
  const backdrop = document.getElementById("runDetailsModalBackdrop");
  const titleEl = document.getElementById("runDetailsModalTitle");
  const contentEl = document.getElementById("runDetailsContent");

  titleEl.textContent = `${userName}'s Run`;
  contentEl.innerHTML = "Loading...";
  backdrop.classList.add("show");

  try {
    const snapshot = await database
      .ref(`scores/${dateString}/${userId}`)
      .once("value");
    const data = snapshot.val();

    if (!data || !data.history || data.history.length === 0) {
      contentEl.innerHTML = `
                    <p style="text-align:center;color:#6b7280;padding:20px;">
                        <strong>Summary Stats:</strong><br>
                        Total Time: ${totalTime.toFixed(1)}s<br>
                        Solved: ${solved}<br>
                        Skipped: ${skipped}<br><br>
                        <em>Detailed breakdown not available (run completed before this feature was added)</em>
                    </p>`;
      return;
    }

    let html = `<p style="margin-bottom:16px;"><strong>Total Time:</strong> ${totalTime.toFixed(
      1
    )}s | <strong>Solved:</strong> ${data.solved} | <strong>Skipped:</strong> ${
      data.skipped
    }</p>`;
    html +=
      '<table style="width:100%;border-collapse:collapse;"><thead><tr style="background:#f3f4f6;">';
    html += '<th style="padding:8px;text-align:left;">Plate</th>';
    html += '<th style="padding:8px;text-align:left;">Word / Penalty</th>';
    html +=
      '<th style="padding:8px;text-align:right;">Time</th></tr></thead><tbody>';

    data.history.forEach((entry, idx) => {
      const bg = idx % 2 === 0 ? "#f9fafb" : "#fff";
      html += `<tr style="background:${bg};">`;
      html += `<td style="padding:8px;font-weight:600;">${entry.plate}</td>`;

      if (entry.skipped) {
        html += `<td style="padding:8px;color:#f59e0b;">+${entry.penaltySeconds}s (skipped)</td>`;
        html += `<td style="padding:8px;text-align:right;">${entry.thinkingSeconds.toFixed(
          1
        )}s (+${entry.penaltySeconds}s)</td>`;
      } else {
        // Highlight the plate letters in the word
        const highlightedWord = highlightPlateInWord(entry.plate, entry.word);
        html += `<td style="padding:8px;color:#16a34a;">${highlightedWord}</td>`;
        html += `<td style="padding:8px;text-align:right;">${entry.thinkingSeconds.toFixed(
          1
        )}s</td>`;
      }

      html += "</tr>";
    });

    html += "</tbody></table>";
    contentEl.innerHTML = html;
  } catch (error) {
    console.error("Error loading run details:", error);
    contentEl.innerHTML =
      '<p style="text-align:center;color:#dc2626;">Failed to load run details</p>';
  }
}

window.viewPlayerRun = viewPlayerRun; // Make it globally accessible for onclick

// Global function for Load button
function loadSelectedDate() {
  const v = document.getElementById("leaderboardDatePicker").value;
  if (v) {
    console.log("Loading date:", v);
    displayLeaderboard(v);
  } else {
    console.log("No date selected");
  }
}
window.loadSelectedDate = loadSelectedDate;

// Global function for Today button (backup)
function loadTodayScores() {
  console.log("=== TODAY BUTTON CLICKED ===");
  const t = getTodayString();
  const picker = document.getElementById("leaderboardDatePicker");
  if (picker) picker.value = t;
  displayLeaderboard(t);
}
window.loadTodayScores = loadTodayScores;

// === FIREBASE EVENT HANDLERS ===
// Wait for page to fully load before attaching event listeners
window.addEventListener("DOMContentLoaded", function () {
  document
    .getElementById("dailyChallengeBtn")
    .addEventListener("click", async () => {
      // Check if game data is loaded
      if (
        !platesReady ||
        !dictionaryReady ||
        !ALL_PLATES ||
        ALL_PLATES.length === 0
      ) {
        alert(
          "Game data is still loading... Please wait a moment and try again."
        );
        return;
      }

      // Sign in if needed
      if (!currentUser && !(await signInWithGoogle())) return;

      // Check if already played today
      if (await checkIfPlayedToday()) {
        alert(
          "You already played today's challenge! Come back tomorrow, or try Practice Mode."
        );
        return;
      }

      gameMode = "daily";

      // Set mode
      document.getElementById("dailyChallengeBtn").style.borderBottom =
        "5px solid #92400e";
      document.getElementById("practiceBtn").style.borderBottom = "none";
      document.getElementById("endlessBtn").style.borderBottom = "none";

      // Update banner
      const mi = document.getElementById("modeIndicator");
      mi.textContent = "Daily Challenge - 1 attempt per day";
      mi.style.background = "#fef3c7";
      mi.style.color = "#92400e";

      // Show Start Game button
      startButtonEl.textContent = "Start Game";
      startButtonEl.style.display = "inline-block";
      endButtonEl.style.display = "none";
    });

  document.getElementById("practiceBtn").addEventListener("click", () => {
    // Set mode
    gameMode = "practice";

    document.getElementById("dailyChallengeBtn").style.borderBottom = "none";
    document.getElementById("practiceBtn").style.borderBottom =
      "5px solid #6b21a8";
    document.getElementById("endlessBtn").style.borderBottom = "none";

    // Update banner
    const mi = document.getElementById("modeIndicator");
    mi.textContent = "Practice Mode - Unlimited attempts";
    mi.style.background = "#f3e8ff";
    mi.style.color = "#6b21a8";

    // Show Start Game button
    const startBtn = document.getElementById("startButton");
    startBtn.textContent = "Start Game";
    startBtn.style.display = "inline-block";
    endButtonEl.style.display = "none";
  });

  document.getElementById("endlessBtn").addEventListener("click", () => {
    // Set mode
    gameMode = "endless";

    document.getElementById("dailyChallengeBtn").style.borderBottom = "none";
    document.getElementById("practiceBtn").style.borderBottom = "none";
    document.getElementById("endlessBtn").style.borderBottom =
      "5px solid #020069ff";

    // Update banner
    const mi = document.getElementById("modeIndicator");
    mi.textContent = "Endless mode - play forever";
    mi.style.background = "#cae4ffff";
    mi.style.color = "#020069ff";

    // Show Start Game button
    const startBtn = document.getElementById("startButton");
    startBtn.textContent = "Start Game";
    startBtn.style.display = "inline-block";
    endButtonEl.style.display = "inline-block";
  });

  // Rules button and modal
  const rulesBtnElement = document.getElementById("rulesBtn");
  console.log("Rules button element:", rulesBtnElement);
  if (rulesBtnElement) {
    rulesBtnElement.addEventListener("click", () => {
      console.log("Rules clicked!");
      const modal = document.getElementById("rulesModalBackdrop");
      console.log("Modal element:", modal);
      if (modal) {
        modal.classList.add("show");
        console.log("Modal should be visible now");
      } else {
        console.error("Modal not found!");
      }
    });
  } else {
    console.error("Rules button not found!");
  }

  // Close rules modal - X button
  document
    .getElementById("rulesModalCloseBtn")
    .addEventListener("click", () => {
      document.getElementById("rulesModalBackdrop").classList.remove("show");
    });

  // Close rules modal - Got it button
  document
    .getElementById("rulesModalCloseBtnBottom")
    .addEventListener("click", () => {
      document.getElementById("rulesModalBackdrop").classList.remove("show");
    });

  // Close rules modal - click outside
  document
    .getElementById("rulesModalBackdrop")
    .addEventListener("click", (e) => {
      if (e.target.id === "rulesModalBackdrop") {
        document.getElementById("rulesModalBackdrop").classList.remove("show");
      }
    });

  document.getElementById("leaderboardBtn").addEventListener("click", () => {
    console.log("Leaderboard clicked!");
    const t = getTodayString();
    document.getElementById("leaderboardDatePicker").value = t;
    document.getElementById("leaderboardDatePicker").max = t;
    displayLeaderboard(t);
    document
      .getElementById("leaderboardContent")
      .scrollIntoView({ behavior: "smooth", block: "nearest" });
  });
  document
    .getElementById("loadLeaderboardBtn")
    .addEventListener("click", () => {
      const v = document.getElementById("leaderboardDatePicker").value;
      if (v) displayLeaderboard(v);
    });
  document
    .getElementById("todayLeaderboardBtn")
    .addEventListener("click", () => {
      const t = getTodayString();
      document.getElementById("leaderboardDatePicker").value = t;
      displayLeaderboard(t);
    });
  document
    .getElementById("signOutBtn")
    .addEventListener("click", () => auth.signOut());
});

loadDictionary();
loadDifficulty();

// Auto-load today's leaderboard when page is fully loaded
window.addEventListener("load", function () {
  setTimeout(function () {
    try {
      const today = getTodayString();
      const datePicker = document.getElementById("leaderboardDatePicker");
      if (datePicker) {
        datePicker.value = today;
        datePicker.max = today;
        displayLeaderboard(today);
        // Auto-loaded
      }
    } catch (error) {
      console.error("Error auto-loading leaderboard:", error);
    }
  }, 500); // Wait 2 seconds for Firebase to connect
});
