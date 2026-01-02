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
let challengeMode = null;
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

async function saveScore(time, solved, skipped, history) {
  if (!currentUser || gameMode !== "daily") return;
  const today = getTodayString();

  // Prepare game history for saving
  const historyData = history.map((entry) => ({
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

  for (let e of document.getElementsByClassName("gameModeButton")) {
    e.disabled = true;
  }
  startTime = performance.now();
  timerIntervalId = setInterval(updateTimer, 100);

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

    case "challenge":
      await playChallenge(challengeMode);
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
  for (let e of document.getElementsByClassName("gameModeButton")) {
    e.disabled = false;
  }
}

async function playTimed(plates, genMorePlates) {
  let idx = 0;
  let solved = 0;
  let skipped = 0;
  let nextPenalty = 5;

  // Update buttons
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
      plates.push(...genMorePlates());
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
            skipped++;
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

  resultEl.textContent = `🏁 Finished! Time: ${totalSec.toFixed(1)} s`;
  resultEl.style.color = "green";
  startButtonEl.textContent = "Play again";

  return [totalSec, solved, skipped, gameHistory];
}

async function playDaily() {
  if (!currentUser) {
    return;
  }

  // Save started flag to Firebase
  // database.ref(`started/${getTodayString()}/${currentUser.uid}`).set({
  //   userName: currentUser.displayName || currentUser.email,
  //   timestamp: Date.now(),
  //   started: true,
  // });

  // window.onbeforeunload = (e) => {
  //   if (gameStarted && !gameOver && gameMode === "daily") {
  //     e.preventDefault();
  //     return "Leave? Daily attempt will be used!";
  //   }
  // };

  const date = new Date();
  let seed = date.getDate() + date.getMonth() * 100 + date.getFullYear() * 1000;

  let rng = seededRandom(seed);
  let plates = generatePlates(rng, 2);

  let genMorePlates = () => {
    seed *= 10;
    let rng = seededRandom(seed);
    return generatePlates(rng, 200);
  };

  startButtonEl.style.display = "none";

  let [totalSec, solved, skipped, history] = await playTimed(
    plates,
    genMorePlates
  );

  // if (currentUser) saveScore(totalSec, solved, skipped, history);
  window.onbeforeunload = null;
}

async function playPractice() {
  let plates = generatePlates(Math.random, 200);
  let genMorePlates = () => {
    return generatePlates(Math.random, 200);
  };
  startButtonEl.textContent = "Restart game";

  await playTimed(plates, genMorePlates);
}

async function playChallenge() {
  startButtonEl.style.display = "none";

  switch (challengeMode) {
    case "h2h":
      if (!currentChallengeId) {
        currentChallengeId = await createChallengeWithOpponent(pendingOpponent);
      }
      break;

    case "open":
      alert("Not implemented");
      return;
  }

  let challenge = await checkChallenge(currentChallengeId);
  if (!challenge) {
    return;
  }

  let [totalSec, solved, skipped, history] = await playTimed(challenge.plateSequence, () =>
    alert("BUG! Not enough plates")
  );

  await saveChallengeResult(
    currentChallengeId,
    totalSec,
    solved,
    skipped,
    history
  );
  
  currentChallengeId = null;
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
function renderWordsList(sortMode) {
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
      cancelPendingChallenge();

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
      for (let e of document.getElementsByClassName("gameModeButton")) {
        e.style.borderBottom = "none";
      }
      document.getElementById("dailyChallengeBtn").style.borderBottom =
        "5px solid #92400e";

      // Update banner
      const mi = document.getElementById("modeIndicator");
      mi.textContent = "Daily Challenge - 1 attempt per day";
      mi.style.background = "#fef3c7";
      mi.style.color = "#92400e";

      document.getElementById("game-status-panel").style.display =
        "inline-block";
      document.getElementById("h2h-panel").style.display = "none";

      // Show Start Game button
      startButtonEl.textContent = "Start Game";
      startButtonEl.style.display = "inline-block";
      endButtonEl.style.display = "none";
    });

  document.getElementById("practiceBtn").addEventListener("click", () => {
    cancelPendingChallenge();

    // Set mode
    gameMode = "practice";

    for (let e of document.getElementsByClassName("gameModeButton")) {
      e.style.borderBottom = "none";
    }
    document.getElementById("practiceBtn").style.borderBottom =
      "5px solid #6b21a8";

    // Update banner
    const mi = document.getElementById("modeIndicator");
    mi.textContent = "Practice Mode - Unlimited attempts";
    mi.style.background = "#f3e8ff";
    mi.style.color = "#6b21a8";

    document.getElementById("game-status-panel").style.display = "inline-block";
    document.getElementById("h2h-panel").style.display = "none";

    // Show Start Game button
    const startBtn = document.getElementById("startButton");
    startBtn.textContent = "Start Game";
    startBtn.style.display = "inline-block";
    endButtonEl.style.display = "none";
  });

  document.getElementById("h2hBtn").addEventListener("click", () => {
    // Set mode
    gameMode = "challenge";

    for (let e of document.getElementsByClassName("gameModeButton")) {
      e.style.borderBottom = "none";
    }
    document.getElementById("h2hBtn").style.borderBottom =
      "5px solid #840000ff";

    // Update banner
    const mi = document.getElementById("modeIndicator");
    mi.textContent = "Challenge mode - Challenge an opponent";
    mi.style.background = "#a60000ff";
    mi.style.color = "#ffffffff";

    document.getElementById("game-status-panel").style.display = "none";
    document.getElementById("h2h-panel").style.display = "inline-block";

    // Show Start Game button
    const startBtn = document.getElementById("startButton");
    startBtn.textContent = "Start Challenge";
    startBtn.style.display = "none";
    endButtonEl.style.display = "none";
  });

  document.getElementById("endlessBtn").addEventListener("click", () => {
    cancelPendingChallenge();

    // Set mode
    gameMode = "endless";

    for (let e of document.getElementsByClassName("gameModeButton")) {
      e.style.borderBottom = "none";
    }
    document.getElementById("endlessBtn").style.borderBottom =
      "5px solid #020069ff";

    // Update banner
    const mi = document.getElementById("modeIndicator");
    mi.textContent = "Endless mode - play forever";
    mi.style.background = "#cae4ffff";
    mi.style.color = "#020069ff";

    document.getElementById("game-status-panel").style.display = "inline-block";
    document.getElementById("h2h-panel").style.display = "none";

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

// ========== HEAD-TO-HEAD FEATURE ==========
let currentChallengeId = null;
let challengeStartTime = null;
let pendingOpponent = null;
const CHALLENGE_TIMEOUT = 2000; // 2000 seconds

// Create Challenge button
document
  .getElementById("createChallengeBtn")
  .addEventListener("click", async function () {
    if (!currentUser) {
      alert("Please sign in to create challenges");
      return;
    }

    try {
      const usersSnapshot = await database.ref("users").once("value");
      const users = usersSnapshot.val();

      if (!users) {
        alert("No other users found");
        return;
      }

      const userList = Object.entries(users)
        .filter(([uid, data]) => uid !== currentUser.uid)
        .map(([uid, data]) => ({
          uid,
          name: data.displayName || data.email || "Unknown",
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

      if (userList.length === 0) {
        alert("No other users found");
        return;
      }

      // Show opponent selection modal
      showOpponentModal(userList);
    } catch (error) {
      console.error("Error loading users:", error);
      alert("Error loading users: " + error.message);
    }
  });

// Create Open Challenge button
document
  .getElementById("createOpenChallengeBtn")
  .addEventListener("click", async function () {
    if (!currentUser) {
      alert("Please sign in to create challenges");
      return;
    }

    // Ask for optional label
    const label = prompt(
      "Who are you challenging? This is just for your reference."
    );

    // If user clicks Cancel on prompt, stop
    if (label === null) {
      return;
    }

    try {
      const challengeId = database.ref("challenges").push().key;
      const plateSequence = generateChallengeSequence();

      if (plateSequence.length < 100) {
        alert("Error generating plates");
        return;
      }

      const opponentName =
        label && label.trim() ? label.trim() : "Open Challenge";

      await database.ref(`challenges/${challengeId}`).set({
        createdBy: currentUser.uid,
        creatorName: currentUser.displayName || currentUser.email,
        challengedUser: null, // Open challenge - no specific user
        opponentName: opponentName,
        isOpen: true,
        plateSequence: plateSequence,
        createdAt: Date.now(),
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
        status: "pending",
        results: {},
      });

      // Copy link to clipboard
      const challengeUrl = `${window.location.origin}${window.location.pathname}?challenge=${challengeId}`;
      try {
        await navigator.clipboard.writeText(challengeUrl);
        alert(
          `Open challenge created${
            label && label.trim() ? ` for "${label.trim()}"` : ""
          }! Link copied to clipboard.`
        );
      } catch (err) {
        alert(`Open challenge created! Share this link:\n${challengeUrl}`);
      }

      loadH2HChallenges();
    } catch (error) {
      console.error("Error creating open challenge:", error);
      alert("Error creating open challenge: " + error.message);
    }
  });

// Show opponent selection modal
function showOpponentModal(userList) {
  const modal = document.getElementById("opponentModalBackdrop");
  const listContainer = document.getElementById("opponentList");
  const searchInput = document.getElementById("opponentSearchInput");

  // Render user list
  function renderUserList(filter = "") {
    const filtered = filter
      ? userList.filter((u) =>
          u.name.toLowerCase().startsWith(filter.toLowerCase())
        )
      : userList;

    if (filtered.length === 0) {
      listContainer.innerHTML =
        '<p style="text-align:center;color:#9ca3af;padding:20px;">No users found</p>';
      return;
    }

    listContainer.innerHTML = filtered
      .map(
        (user) => `
                <div 
                    class="opponent-item" 
                    data-uid="${user.uid}"
                    style="padding:12px 16px;cursor:pointer;border-bottom:1px solid #f3f4f6;transition:background 0.2s;"
                    onmouseover="this.style.background='#f9fafb'"
                    onmouseout="this.style.background='white'"
                >
                    <div style="font-weight:500;color:#1f2937;">${user.name}</div>
                </div>
            `
      )
      .join("");

    // Add click handlers
    document.querySelectorAll(".opponent-item").forEach((item) => {
      item.addEventListener("click", function () {
        const uid = this.dataset.uid;
        const user = userList.find((u) => u.uid === uid);
        modal.classList.remove("show");
        searchInput.value = "";
        prepareChallenge(user);
      });
    });
  }

  // Search functionality
  searchInput.value = "";
  searchInput.oninput = (e) => renderUserList(e.target.value);

  renderUserList();
  modal.classList.add("show");
  searchInput.focus();
}

// Modal close handlers
document
  .getElementById("opponentModalCloseBtn")
  .addEventListener("click", () => {
    document.getElementById("opponentModalBackdrop").classList.remove("show");
    document.getElementById("opponentSearchInput").value = "";
  });

document
  .getElementById("opponentModalBackdrop")
  .addEventListener("click", (e) => {
    if (e.target.id === "opponentModalBackdrop") {
      document.getElementById("opponentModalBackdrop").classList.remove("show");
      document.getElementById("opponentSearchInput").value = "";
    }
  });

// H2H Comparison Modal
document
  .getElementById("h2hComparisonCloseBtn")
  .addEventListener("click", () => {
    document
      .getElementById("h2hComparisonModalBackdrop")
      .classList.remove("show");
  });

document
  .getElementById("h2hComparisonModalBackdrop")
  .addEventListener("click", (e) => {
    if (e.target.id === "h2hComparisonModalBackdrop") {
      document
        .getElementById("h2hComparisonModalBackdrop")
        .classList.remove("show");
    }
  });

// Check for abandoned challenges when user logs in
if (currentUser) {
  checkAbandonedChallenges(currentUser.uid);
}

// Prepare challenge (don't create yet - wait for Start button)
function prepareChallenge(opponent) {
  pendingOpponent = opponent;
  challengeMode = opponent ? "h2h" : "open";

  // Update banner with back button embedded
  document.getElementById("challenging-player-indicator").style.display =
    "flex";
  document.getElementById("challenging-player-text").textContent = opponent
    ? `⚔️ Challenging ${opponent.name}`
    : "⚔️ Issuing open challenge";
  document.getElementById("game-status-panel").style.display = "inline-block";
  document.getElementById("h2h-panel").style.display = "none";

  // Show Start Challenge button with pulse animation
  const startBtn = document.getElementById("startButton");
  startBtn.textContent = "Start Challenge";
  startBtn.style.display = "inline-block";
  startBtn.classList.add("pulse-button");

  // Scroll to top
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// Cancel pending challenge
cancelPendingChallenge = function (showChallengePanel) {
  pendingOpponent = null;

  document.getElementById("challenging-player-indicator").style.display =
    "none";

  for (let e of document.getElementsByClassName("gameModeButton")) {
    e.disabled = false;
  }

  if (showChallengePanel) {
    document.getElementById("game-status-panel").style.display = "none";
    document.getElementById("h2h-panel").style.display = "inline-block";
  }
};
window.cancelPendingChallenge = cancelPendingChallenge;

/** Create challenge with pending opponent (called when Start Challenge is clicked).
Returns the challenge ID */
async function createChallengeWithOpponent(opponent) {
  try {
    const challengeId = database.ref("challenges").push().key;
    const plateSequence = generatePlates(Math.random, 200);

    if (plateSequence.length < 100) {
      alert("Error generating plates");
      return;
    }

    await database.ref(`challenges/${challengeId}`).set({
      createdBy: currentUser.uid,
      creatorName: currentUser.displayName || currentUser.email,
      challengedUser: opponent.uid,
      opponentName: opponent.name,
      plateSequence: plateSequence,
      createdAt: Date.now(),
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, // 1 week
      status: "pending",
      results: {},
    });

    return challengeId;
  } catch (error) {
    console.error("Error creating challenge:", error);
    alert("Error creating challenge: " + error.message);
  }
}

/**
 * Gets a challenge by its ID and checks whether it's playable. May update the challenge
 * to claim it if it's an open challenge issued by someone else.
 * @param {*} challengeId 
 * @returns The challenge object, or undefined if the challenge is not playable
 */
async function checkChallenge(challengeId) {
  if (!currentUser) {
    alert("Please sign in to play challenges");
    return;
  }

  const challengeSnapshot = await database
    .ref(`challenges/${challengeId}`)
    .once("value");
  let challenge = challengeSnapshot.val();

  if (!challenge) {
    alert("Challenge not found");
    return;
  }

  // Check if this is an open challenge (handle both null and undefined)
  const isOpenChallenge =
    challenge.isOpen === true &&
    (challenge.challengedUser === null ||
      challenge.challengedUser === undefined);

  // Validate that current user can play this challenge
  const isCreator = challenge.createdBy === currentUser.uid;
  const isChallenged = challenge.challengedUser === currentUser.uid;

  if (!isCreator && !isChallenged && !isOpenChallenge) {
    alert(
      "This challenge is not for you. You can only play challenges that you created or that were sent to you."
    );
    return;
  }

  // If open challenge, claim it for this user
  if (isOpenChallenge && !isCreator) {
    try {
      challenge = await database.ref(`challenges/${challengeId}`).update({
        challengedUser: currentUser.uid,
        opponentName: currentUser.displayName || currentUser.email,
        isOpen: false,
        claimedAt: Date.now(),
      });
    } catch (error) {
      console.error("Error claiming challenge:", error);
      alert("Error claiming challenge");
      return;
    }
  }

  const userResult = challenge.results && challenge.results[currentUser.uid];
  if (userResult && (userResult.status === "DNF" || userResult.time)) {
    alert("You have already completed this challenge");
    return;
  }

  if (userResult && userResult.status === "in_progress") {
    alert("You already started this challenge and it was marked as Abandoned");
    return;
  }

  return challenge;
}

// Load H2H challenges
async function loadH2HChallenges() {
  if (!currentUser) {
    document.getElementById("incomingChallenges").innerHTML =
      '<p style="color:#9ca3af;text-align:center;">Sign in to see challenges</p>';
    document.getElementById("outgoingChallenges").innerHTML =
      '<p style="color:#9ca3af;text-align:center;">Sign in to see challenges</p>';
    document.getElementById("h2hResults").innerHTML =
      '<p style="color:#9ca3af;text-align:center;">Sign in to see results</p>';
    return;
  }

  try {
    const challengesSnapshot = await database.ref("challenges").once("value");
    const allChallenges = challengesSnapshot.val() || {};

    // Clean up expired challenges and check for completion
    const now = Date.now();
    const activeChallenges = {};

    for (const [id, challenge] of Object.entries(allChallenges)) {
      if (
        challenge.expiresAt &&
        challenge.expiresAt < now &&
        challenge.status !== "completed"
      ) {
        await database.ref(`challenges/${id}`).remove();
      } else {
        // Check if challenge should be marked as completed
        if (challenge.status !== "completed" && challenge.results) {
          const creatorResult = challenge.results[challenge.createdBy];
          const challengedResult = challenge.results[challenge.challengedUser];

          if (
            creatorResult &&
            challengedResult &&
            (creatorResult.status === "completed" ||
              creatorResult.status === "DNF") &&
            (challengedResult.status === "completed" ||
              challengedResult.status === "DNF")
          ) {
            // If both abandoned, delete the challenge
            if (
              creatorResult.status === "DNF" &&
              challengedResult.status === "DNF"
            ) {
              await database.ref(`challenges/${id}`).remove();
              console.log("Both players abandoned - challenge deleted:", id);
              continue; // Skip adding to activeChallenges
            } else {
              // Otherwise mark as completed
              await database.ref(`challenges/${id}`).update({
                status: "completed",
                completedAt: Date.now(),
              });
              challenge.status = "completed";
              challenge.completedAt = Date.now();
            }
          }
        }
        activeChallenges[id] = challenge;
      }
    }

    displayIncomingChallenges(activeChallenges);
    displayOutgoingChallenges(activeChallenges);
    displayH2HResults(activeChallenges);
  } catch (error) {
    console.error("Error loading H2H challenges:", error);
  }
}

function displayIncomingChallenges(allChallenges) {
  const container = document.getElementById("incomingChallenges");

  const incoming = Object.entries(allChallenges).filter(([id, c]) => {
    if (c.challengedUser !== currentUser.uid) return false;
    if (c.status === "completed") return false;

    // Only show if creator has already played
    const creatorResult = c.results && c.results[c.createdBy];
    return (
      creatorResult && (creatorResult.time || creatorResult.status === "DNF")
    );
  });

  // Update notification badge
  const badge = document.getElementById("h2hNotificationBadge");
  if (incoming.length > 0) {
    badge.textContent = incoming.length;
    badge.style.display = "block";
  } else {
    badge.style.display = "none";
  }

  if (incoming.length === 0) {
    container.innerHTML =
      '<p style="color:#9ca3af;text-align:center;">No incoming challenges</p>';
    return;
  }

  // Sort by creation date (newest first)
  incoming.sort((a, b) => (b[1].createdAt || 0) - (a[1].createdAt || 0));

  let html = "";
  incoming.forEach(([id, challenge]) => {
    const myResult = challenge.results && challenge.results[currentUser.uid];

    // Format date
    const createdDate = challenge.createdAt
      ? new Date(challenge.createdAt).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })
      : "Unknown";

    let statusText = "";
    if (myResult && myResult.status === "DNF") {
      statusText = 'You: <span style="color:#ef4444;">Abandoned</span>';
    } else if (myResult && myResult.time) {
      statusText = `You: ${myResult.time.toFixed(1)}s`;
    } else {
      statusText = "";
    }

    const canPlay =
      !myResult ||
      (!myResult.time &&
        myResult.status !== "DNF" &&
        myResult.status !== "in_progress");
    // Can only decline if you haven't started at all (no result exists)
    const canDecline = !myResult;

    html += `
                <div style="display:flex;align-items:center;padding:12px;border-bottom:1px solid #f3f4f6;gap:15px;">
                    <div style="min-width:140px;">
                        <div style="font-size:0.85rem;color:#6b7280;">${createdDate}</div>
                    </div>
                    <span style="flex:1;"><strong>${
                      challenge.creatorName
                    }</strong> challenged you${
      statusText ? " — " + statusText : ""
    }</span>
                    ${
                      canPlay
                        ? `<button onclick="playChallenge('${id}')" style="padding:6px 16px;background:#9370db;color:white;border:none;border-radius:4px;cursor:pointer;">Play Now</button>`
                        : ""
                    }
                    ${
                      canDecline
                        ? `<button onclick="declineChallenge('${id}')" style="padding:6px 16px;background:#ef4444;color:white;border:none;border-radius:4px;cursor:pointer;">Decline</button>`
                        : ""
                    }
                </div>
            `;
  });

  container.innerHTML = html;
}

function displayOutgoingChallenges(allChallenges) {
  const container = document.getElementById("outgoingChallenges");

  const outgoing = Object.entries(allChallenges).filter(
    ([id, c]) => c.createdBy === currentUser.uid && c.status !== "completed"
  );

  if (outgoing.length === 0) {
    container.innerHTML =
      '<p style="color:#9ca3af;text-align:center;">No outgoing challenges</p>';
    return;
  }

  // Sort by creation date (newest first)
  outgoing.sort((a, b) => (b[1].createdAt || 0) - (a[1].createdAt || 0));

  let html = "";
  outgoing.forEach(([id, challenge]) => {
    const myResult = challenge.results && challenge.results[currentUser.uid];
    const theirResult =
      challenge.results && challenge.results[challenge.challengedUser];

    // Format date
    const createdDate = challenge.createdAt
      ? new Date(challenge.createdAt).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })
      : "Unknown";

    // Check if open challenge
    const isOpen = challenge.isOpen && challenge.challengedUser === null;
    const opponentDisplay = isOpen
      ? '<strong>Open Challenge</strong> <span style="color:#10b981;font-size:0.85rem;">(unclaimed)</span>'
      : `<strong>${challenge.opponentName}</strong>`;

    let statusText = "";
    if (myResult && myResult.status === "DNF") {
      statusText = 'You: <span style="color:#ef4444;">Abandoned</span>';
    } else if (myResult && myResult.time) {
      statusText = `You: ${myResult.time.toFixed(1)}s`;
    } else {
      statusText = "";
    }

    const challengeUrl = `${window.location.origin}${window.location.pathname}?challenge=${id}`;
    const canPlay =
      !myResult ||
      (!myResult.time &&
        myResult.status !== "DNF" &&
        myResult.status !== "in_progress");
    const canCancel = canPlay; // Can cancel if you haven't played yet

    html += `
                <div style="display:flex;align-items:center;padding:12px;border-bottom:1px solid #f3f4f6;gap:15px;">
                    <button onclick="copyToClipboard('${challengeUrl}')" style="padding:6px 16px;background:#6b7280;color:white;border:none;border-radius:4px;cursor:pointer;flex-shrink:0;">Copy Link</button>
                    <div style="min-width:140px;">
                        <div style="font-size:0.85rem;color:#6b7280;">${createdDate}</div>
                    </div>
                    <span style="flex:1;">You vs. ${opponentDisplay}${
      statusText ? " — " + statusText : ""
    }</span>
                    ${
                      canPlay
                        ? `<button onclick="playChallenge('${id}')" style="padding:6px 16px;background:#9370db;color:white;border:none;border-radius:4px;cursor:pointer;">Play Now</button>`
                        : ""
                    }
                    ${
                      canCancel
                        ? `<button onclick="cancelChallenge('${id}')" style="padding:6px 16px;background:#ef4444;color:white;border:none;border-radius:4px;cursor:pointer;">Cancel</button>`
                        : ""
                    }
                </div>
            `;
  });

  container.innerHTML = html;
}

// View H2H Comparison
window.viewH2HComparison = async function (challengeId) {
  try {
    console.log("viewH2HComparison called with challengeId:", challengeId);
    console.log("currentUser:", currentUser);

    if (!currentUser) {
      alert("Please sign in to view challenges");
      return;
    }

    const snapshot = await database
      .ref(`challenges/${challengeId}`)
      .once("value");
    const challenge = snapshot.val();

    console.log("Challenge data:", challenge);

    if (!challenge) {
      alert("Challenge not found");
      return;
    }

    const isCreator = challenge.createdBy === currentUser.uid;
    const myName = currentUser.displayName || currentUser.email;
    const opponentName = isCreator
      ? challenge.opponentName
      : challenge.creatorName;
    const opponentId = isCreator
      ? challenge.challengedUser
      : challenge.createdBy;

    const myResult = challenge.results && challenge.results[currentUser.uid];
    const theirResult = challenge.results && challenge.results[opponentId];

    console.log("My result:", myResult);
    console.log("Their result:", theirResult);

    // Update title
    document.getElementById(
      "h2hComparisonTitle"
    ).textContent = `${myName} vs ${opponentName}`;

    // Build unified comparison table
    const content = document.getElementById("h2hComparisonContent");

    if (!myResult || !theirResult) {
      content.innerHTML =
        '<p style="text-align:center;color:#6b7280;">Incomplete challenge data</p>';
      document
        .getElementById("h2hComparisonModalBackdrop")
        .classList.add("show");
      return;
    }

    // Get histories (should be same length for H2H)
    const myHistory = myResult.history || [];
    const theirHistory = theirResult.history || [];
    const maxLength = Math.max(myHistory.length, theirHistory.length);

    console.log("My history length:", myHistory.length);
    console.log("Their history length:", theirHistory.length);
    console.log("My stored time:", myResult.time);
    console.log("Their stored time:", theirResult.time);

    let tableRows = "";
    let myTotalTime = 0;
    let theirTotalTime = 0;

    for (let i = 0; i < maxLength; i++) {
      const myEntry = myHistory[i];
      const theirEntry = theirHistory[i];

      const plate = myEntry?.plate || theirEntry?.plate || "—";

      // Helper function for time-based gradient color
      function getTimeCellColor(seconds) {
        if (seconds <= 0) return "#f3f4f6"; // Gray for no entry
        if (seconds <= 1.5) return "#22c55e"; // Green (under 1.5s)
        if (seconds >= 30) return "#ef4444"; // Dark red (30s+)

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

      // My cell content
      let myCell = "";
      let myTime = 0;
      let myCellBg = "#f3f4f6";
      if (myEntry) {
        // Always add thinking time + penalty time
        const thinkingTime = myEntry.thinkingSeconds || 0;
        const penaltyTime = myEntry.penaltySeconds || 0;
        myTime = thinkingTime + penaltyTime;

        if (myEntry.skipped) {
          // Skipped plates: show X with total time
          myCell = `
                            <div style="font-size:1.1rem;font-weight:600;color:#fff;margin-bottom:4px;">✗</div>
                            <div style="font-size:0.9rem;color:#fff;">${myTime.toFixed(
                              1
                            )}s</div>
                        `;
          myCellBg = "#000000";
        } else {
          // Valid words: show word with total time
          myCellBg = getTimeCellColor(thinkingTime);
          myCell = `
                            <div style="font-size:0.95rem;font-weight:600;color:#000;margin-bottom:4px;">${
                              myEntry.word || "—"
                            }</div>
                            <div style="font-size:0.8rem;color:#000;">${myTime.toFixed(
                              1
                            )}s</div>
                        `;
        }
        myTotalTime += myTime;
      } else {
        myCell = '<div style="font-size:1rem;color:#9ca3af;">—</div>';
      }

      // Their cell content
      let theirCell = "";
      let theirTime = 0;
      let theirCellBg = "#f3f4f6";
      if (theirEntry) {
        // Always add thinking time + penalty time
        const thinkingTime = theirEntry.thinkingSeconds || 0;
        const penaltyTime = theirEntry.penaltySeconds || 0;
        theirTime = thinkingTime + penaltyTime;

        if (theirEntry.skipped) {
          // Skipped plates: show X with total time
          theirCell = `
                            <div style="font-size:1.1rem;font-weight:600;color:#fff;margin-bottom:4px;">✗</div>
                            <div style="font-size:0.9rem;color:#fff;">${theirTime.toFixed(
                              1
                            )}s</div>
                        `;
          theirCellBg = "#000000";
        } else {
          // Valid words: show word with total time
          theirCellBg = getTimeCellColor(thinkingTime);
          theirCell = `
                            <div style="font-size:0.95rem;font-weight:600;color:#000;margin-bottom:4px;">${
                              theirEntry.word || "—"
                            }</div>
                            <div style="font-size:0.8rem;color:#000;">${theirTime.toFixed(
                              1
                            )}s</div>
                        `;
        }
        theirTotalTime += theirTime;
      } else {
        theirCell = '<div style="font-size:1rem;color:#9ca3af;">—</div>';
      }

      // Differential cell - always white background, colored text
      const diff = myTime - theirTime;
      let diffCell = "";
      if (myEntry && theirEntry && myTime > 0 && theirTime > 0) {
        if (Math.abs(diff) < 0.05) {
          diffCell =
            '<div style="font-size:0.95rem;font-weight:600;color:#6b7280;">0.0s</div>';
        } else if (diff < 0) {
          // Faster = green text
          diffCell = `<div style="font-size:0.95rem;font-weight:700;color:#16a34a;">${diff.toFixed(
            1
          )}s</div>`;
        } else {
          // Slower = red text
          diffCell = `<div style="font-size:0.95rem;font-weight:700;color:#dc2626;">+${diff.toFixed(
            1
          )}s</div>`;
        }
      } else {
        diffCell = '<div style="font-size:1rem;color:#9ca3af;">—</div>';
      }

      tableRows += `
                    <tr>
                        <td style="padding:12px 8px;font-weight:700;font-size:0.9rem;background:#f9fafb;border-right:2px solid #e5e7eb;text-align:center;">${plate}</td>
                        <td style="padding:10px 8px;background:${myCellBg};border-right:2px solid #e5e7eb;text-align:center;">${myCell}</td>
                        <td style="padding:10px 8px;background:${theirCellBg};border-right:2px solid #e5e7eb;text-align:center;">${theirCell}</td>
                        <td style="padding:10px 8px;background:#ffffff;text-align:center;">${diffCell}</td>
                    </tr>
                `;
    }

    console.log("Calculated myTotalTime:", myTotalTime);
    console.log("Calculated theirTotalTime:", theirTotalTime);

    // Determine win/loss/tie
    const finalDiff = myTotalTime - theirTotalTime;
    let resultText = "";
    let headerBg = "#e5e7eb";
    let finalDiffText = "";
    let finalDiffColor = "#6b7280";

    if (myResult.status === "DNF" && theirResult.status === "DNF") {
      resultText = "Both Abandoned";
      headerBg = "#e5e7eb";
    } else if (myResult.status === "DNF") {
      resultText = "Loss";
      headerBg = "#fca5a5";
      finalDiffText = "Abandoned";
    } else if (theirResult.status === "DNF") {
      resultText = "Win";
      headerBg = "#86efac";
      finalDiffText = "Opponent Abandoned";
    } else if (Math.abs(finalDiff) < 0.05) {
      resultText = "Tie";
      finalDiffText = "0.0s";
    } else if (finalDiff < 0) {
      resultText = "Win";
      headerBg = "#86efac";
      finalDiffText = `${finalDiff.toFixed(1)}s`;
      finalDiffColor = "#16a34a";
    } else {
      resultText = "Loss";
      headerBg = "#fca5a5";
      finalDiffText = `+${finalDiff.toFixed(1)}s`;
      finalDiffColor = "#dc2626";
    }

    // Format completed date
    const completedDate = challenge.completedAt
      ? new Date(challenge.completedAt).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : "Unknown";

    const myStatus =
      myResult.status === "DNF" ? "Abandoned" : `${myTotalTime.toFixed(1)}s`;
    const theirStatus =
      theirResult.status === "DNF"
        ? "Abandoned"
        : `${theirTotalTime.toFixed(1)}s`;

    // Update modal title with stats
    document.getElementById("h2hComparisonTitle").innerHTML = `
                <div style="font-size:1.1rem;font-weight:700;">${resultText} vs ${opponentName}</div>
                <div style="font-size:0.85rem;font-weight:400;margin-top:4px;">${completedDate} • ${myStatus} vs ${theirStatus} • Margin: ${finalDiffText}</div>
            `;
    document.querySelector(
      "#h2hComparisonModalBackdrop .modal-header"
    ).style.background = headerBg;

    content.innerHTML = `
                <div style="overflow-x:auto;">
                    <table style="width:100%;border-collapse:collapse;background:white;border:2px solid #e5e7eb;">
                        <thead>
                            <tr style="background:#e5e7eb;">
                                <th style="padding:10px 8px;text-align:center;font-weight:700;font-size:0.9rem;border-right:2px solid #e5e7eb;width:12%;">Plate</th>
                                <th style="padding:10px 8px;text-align:center;font-weight:700;font-size:0.9rem;border-right:2px solid #e5e7eb;width:32%;">${myName}</th>
                                <th style="padding:10px 8px;text-align:center;font-weight:700;font-size:0.9rem;border-right:2px solid #e5e7eb;width:32%;">${opponentName}</th>
                                <th style="padding:10px 8px;text-align:center;font-weight:700;font-size:0.9rem;width:24%;">Diff</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${tableRows}
                            <tr style="border-top:3px solid #9370db;">
                                <td style="padding:12px 8px;font-weight:700;font-size:0.9rem;background:#f3f4f6;border-right:2px solid #e5e7eb;text-align:center;">TOTAL</td>
                                <td style="padding:10px 8px;background:#e5e7eb;border-right:2px solid #e5e7eb;text-align:center;font-weight:600;font-size:0.95rem;">${myStatus}</td>
                                <td style="padding:10px 8px;background:#e5e7eb;border-right:2px solid #e5e7eb;text-align:center;font-weight:600;font-size:0.95rem;">${theirStatus}</td>
                                <td style="padding:10px 8px;background:#ffffff;text-align:center;">
                                    <div style="font-size:1rem;font-weight:700;color:${finalDiffColor};">${finalDiffText}</div>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            `;

    // Show modal
    document.getElementById("h2hComparisonModalBackdrop").classList.add("show");
  } catch (error) {
    console.error("Error loading challenge comparison:", error);
    alert("Error loading challenge data");
  }
};

function displayH2HResults(allChallenges) {
  const container = document.getElementById("h2hResults");

  const completed = Object.entries(allChallenges).filter(([id, c]) => {
    if (c.status !== "completed") return false;

    // Filter out challenges where both players abandoned (already deleted by loadH2HChallenges)
    const creatorResult = c.results && c.results[c.createdBy];
    const challengedResult = c.results && c.results[c.challengedUser];

    if (
      creatorResult &&
      challengedResult &&
      creatorResult.status === "DNF" &&
      challengedResult.status === "DNF"
    ) {
      return false; // Don't display (should already be deleted)
    }

    return true;
  });

  if (completed.length === 0) {
    container.innerHTML =
      '<p style="color:#9ca3af;text-align:center;">No completed challenges</p>';
    return;
  }

  completed.sort((a, b) => (b[1].completedAt || 0) - (a[1].completedAt || 0));

  let html = `
            <table style="width:100%;border-collapse:collapse;">
                <thead>
                    <tr style="background:#f9fafb;border-bottom:2px solid #e5e7eb;">
                        <th style="padding:12px 8px;text-align:left;font-weight:600;">Completed</th>
                        <th style="padding:12px 8px;text-align:left;font-weight:600;">Opponent</th>
                        <th style="padding:12px 8px;text-align:center;font-weight:600;">Your Time</th>
                        <th style="padding:12px 8px;text-align:center;font-weight:600;">Their Time</th>
                        <th style="padding:12px 8px;text-align:center;font-weight:600;">Result</th>
                        <th style="padding:12px 8px;text-align:center;font-weight:600;">Action</th>
                    </tr>
                </thead>
                <tbody>
        `;

  completed.forEach(([id, challenge]) => {
    const isCreator = challenge.createdBy === currentUser.uid;
    const opponentId = isCreator
      ? challenge.challengedUser
      : challenge.createdBy;
    const opponentName = isCreator
      ? challenge.opponentName
      : challenge.creatorName;

    // Format completion date
    const completedDate = challenge.completedAt
      ? new Date(challenge.completedAt).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })
      : "Unknown";

    const myResult = challenge.results && challenge.results[currentUser.uid];
    const theirResult = challenge.results && challenge.results[opponentId];

    let myTimeText = "—";
    let theirTimeText = "—";
    let resultText = "";
    let resultColor = "";

    if (myResult) {
      myTimeText =
        myResult.status === "DNF"
          ? '<span style="color:#ef4444;">Abandoned</span>'
          : myResult.time
          ? myResult.time.toFixed(1) + "s"
          : "—";
    }

    if (theirResult) {
      theirTimeText =
        theirResult.status === "DNF"
          ? '<span style="color:#ef4444;">Abandoned</span>'
          : theirResult.time
          ? theirResult.time.toFixed(1) + "s"
          : "—";
    }

    if (myResult && theirResult) {
      const myDNF = myResult.status === "DNF";
      const theirDNF = theirResult.status === "DNF";

      if (myDNF && theirDNF) {
        resultText = "Both Abandoned";
        resultColor = "#6b7280";
      } else if (myDNF) {
        resultText = "❌ Loss";
        resultColor = "#ef4444";
      } else if (theirDNF) {
        resultText = "🏆 Win";
        resultColor = "#10b981";
      } else if (myResult.time && theirResult.time) {
        const diff = myResult.time - theirResult.time;
        if (diff < -0.05) {
          resultText = `🏆 Win (+${Math.abs(diff).toFixed(1)}s)`;
          resultColor = "#10b981";
        } else if (diff > 0.05) {
          resultText = `❌ Loss (-${diff.toFixed(1)}s)`;
          resultColor = "#ef4444";
        } else {
          resultText = "🤝 Tie";
          resultColor = "#6b7280";
        }
      }
    }

    html += `
                <tr style="border-bottom:1px solid #f3f4f6;">
                    <td style="padding:12px 8px;font-size:0.85rem;color:#6b7280;">${completedDate}</td>
                    <td style="padding:12px 8px;font-weight:500;">${opponentName}</td>
                    <td style="padding:12px 8px;text-align:center;">${myTimeText}</td>
                    <td style="padding:12px 8px;text-align:center;">${theirTimeText}</td>
                    <td style="padding:12px 8px;text-align:center;color:${resultColor};font-weight:600;">${resultText}</td>
                    <td style="padding:12px 8px;text-align:center;">
                        <button onclick="viewH2HComparison('${id}')" style="padding:6px 16px;background:#9370db;color:white;border:none;border-radius:4px;cursor:pointer;font-size:0.9rem;">View</button>
                    </td>
                </tr>
            `;
  });

  html += "</tbody></table>";
  container.innerHTML = html;
}

window.copyToClipboard = function (text) {
  navigator.clipboard
    .writeText(text)
    .then(() => {
      alert("Challenge link copied to clipboard!");
    })
    .catch((err) => {
      console.error("Failed to copy:", err);
      alert("Failed to copy link");
    });
};

window.declineChallenge = async function (challengeId) {
  console.log("declineChallenge called for:", challengeId);
  console.log("currentChallengeId:", currentChallengeId);
  console.log("gameStarted:", gameStarted);
  console.log("gameOver:", gameOver);

  // Check if challenge is active (you're currently playing it)
  if (currentChallengeId === challengeId && gameStarted && !gameOver) {
    alert("Cannot decline a challenge while playing it!");
    return;
  }

  // Check if you've already started this challenge
  try {
    const snapshot = await database
      .ref(`challenges/${challengeId}/results/${currentUser.uid}`)
      .once("value");
    const myResult = snapshot.val();
    console.log("My result from Firebase:", myResult);
    if (myResult) {
      alert("Cannot decline a challenge you have already started!");
      return;
    }
  } catch (error) {
    console.error("Error checking challenge status:", error);
  }

  if (!confirm("Are you sure you want to decline this challenge?")) return;

  try {
    await database.ref(`challenges/${challengeId}`).remove();
    loadH2HChallenges();
  } catch (error) {
    console.error("Error declining challenge:", error);
    alert("Failed to decline challenge");
  }
};

window.cancelChallenge = async function (challengeId) {
  // Check if challenge is active (you're currently playing it)
  if (currentChallengeId === challengeId && gameStarted && !gameOver) {
    alert("Cannot cancel a challenge while playing it!");
    return;
  }

  // Check if you've already started this challenge
  try {
    const snapshot = await database
      .ref(`challenges/${challengeId}/results/${currentUser.uid}`)
      .once("value");
    const myResult = snapshot.val();
    if (myResult) {
      alert("Cannot cancel a challenge you have already started!");
      return;
    }
  } catch (error) {
    console.error("Error checking challenge status:", error);
  }

  if (!confirm("Are you sure you want to cancel this challenge?")) return;

  try {
    await database.ref(`challenges/${challengeId}`).remove();
    loadH2HChallenges();
  } catch (error) {
    console.error("Error canceling challenge:", error);
    alert("Failed to cancel challenge");
  }
};

async function saveChallengeResult(
  challengeId,
  time,
  solved,
  skipped,
  history
) {
  if (!currentUser || !challengeId || gameMode !== "h2h_challenge") return;

  const historyData = history.map((entry) => ({
    plate: entry.plate,
    word: entry.word,
    skipped: entry.skipped || false,
    thinkingSeconds: Math.floor(entry.thinkingSeconds * 10) / 10,
    penaltySeconds: entry.penaltySeconds || 0,
  }));

  await database
    .ref(`challenges/${challengeId}/results/${currentUser.uid}`)
    .set({
      time: Math.floor(time * 10) / 10,
      solved: solved,
      skipped: skipped,
      completedAt: Date.now(),
      history: historyData,
      status: "completed",
    });

  const challengeSnapshot = await database
    .ref(`challenges/${challengeId}`)
    .once("value");
  const challenge = challengeSnapshot.val();

  if (challenge && challenge.results) {
    const creatorResult = challenge.results[challenge.createdBy];
    const challengedResult = challenge.results[challenge.challengedUser];

    if (
      creatorResult &&
      challengedResult &&
      (creatorResult.status === "completed" ||
        creatorResult.status === "DNF") &&
      (challengedResult.status === "completed" ||
        challengedResult.status === "DNF")
    ) {
      await database.ref(`challenges/${challengeId}`).update({
        status: "completed",
        completedAt: Date.now(),
      });
    }
  }

  challengeStartTime = null;
  gameMode = "practice";

  // Reload H2H challenges to update the display
  setTimeout(() => {
    loadH2HChallenges();
  }, 500);
}

async function checkAbandonedChallenges(userId) {
  try {
    const challengesSnapshot = await database.ref("challenges").once("value");
    const allChallenges = challengesSnapshot.val() || {};

    for (const [challengeId, challenge] of Object.entries(allChallenges)) {
      const userResult = challenge.results && challenge.results[userId];

      if (
        userResult &&
        userResult.status === "in_progress" &&
        !userResult.time
      ) {
        await database
          .ref(`challenges/${challengeId}/results/${userId}`)
          .update({
            status: "DNF",
            completedAt: Date.now(),
          });

        // Re-fetch challenge to get updated results
        const updatedSnapshot = await database
          .ref(`challenges/${challengeId}`)
          .once("value");
        const updatedChallenge = updatedSnapshot.val();

        if (updatedChallenge && updatedChallenge.results) {
          const creatorResult =
            updatedChallenge.results[updatedChallenge.createdBy];
          const challengedResult =
            updatedChallenge.results[updatedChallenge.challengedUser];

          if (
            creatorResult &&
            challengedResult &&
            (creatorResult.status === "completed" ||
              creatorResult.status === "DNF") &&
            (challengedResult.status === "completed" ||
              challengedResult.status === "DNF")
          ) {
            await database.ref(`challenges/${challengeId}`).update({
              status: "completed",
              completedAt: Date.now(),
            });
          }
        }
      }
    }
  } catch (error) {
    console.error("Error checking abandoned challenges:", error);
  }
}
// ========== END HEAD-TO-HEAD FEATURE ==========
