
    // === TAB SWITCHING ===
    function switchTab(tabName) {
        // Hide all tabs
        document.getElementById('gameTab').classList.remove('active');
        document.getElementById('leaderboardTab').classList.remove('active');
        document.getElementById('challengesTab').classList.remove('active');
        document.getElementById('profileTab').classList.remove('active');

        // Deactivate all tab buttons
        document.querySelectorAll('.tab-bar-item').forEach(btn => btn.classList.remove('active'));

        // Show selected tab
        document.getElementById(tabName + 'Tab').classList.add('active');

        // Activate button
        const buttons = document.querySelectorAll('.tab-bar-item');
        const tabMap = { game: 0, leaderboard: 1, challenges: 2, profile: 3 };
        buttons[tabMap[tabName]].classList.add('active');

        // On leaderboard tab, auto-load today
        if (tabName === 'leaderboard') {
            const t = getTodayString();
            const picker = document.getElementById('leaderboardDatePicker');
            if (picker) {
                picker.value = t;
                picker.max = t;
            }
            displayLeaderboard(t);
        }

        // On challenges tab, load challenges
        if (tabName === 'challenges') {
            loadH2HChallenges();
        }

        // On profile tab, update profile display
        if (tabName === 'profile') {
            updateProfileTab();
        }
    }
    window.switchTab = switchTab;

    // Leaderboard filter (global/friends stub)
    let leaderboardFilter = 'global';
    function setLeaderboardFilter(filter) {
        leaderboardFilter = filter;
        document.getElementById('lbGlobalBtn').classList.toggle('active', filter === 'global');
        document.getElementById('lbFriendsBtn').classList.toggle('active', filter === 'friends');
        // Re-render with current date
        const v = document.getElementById('leaderboardDatePicker').value;
        if (v) displayLeaderboard(v);
    }
    window.setLeaderboardFilter = setLeaderboardFilter;

    let cachedScores = [];

    // View my run shortcut
    function viewMyRun() {
        if (!currentUser || !currentViewingDate) return;
        const dateStr = currentViewingDate;
        const myScore = cachedScores.find(s => s.isMe || s.userId === currentUser.id);
        if (myScore) {
            viewPlayerRun(currentUser.id, dateStr, document.getElementById('userName').textContent || 'My Run',
                myScore.totalTime, Math.round(myScore.percentile||0), myScore.median||0, myScore.totalPlayers||0, myScore.rank||0);
        } else {
            viewPlayerRun(currentUser.id, dateStr, 'My Run', 0, 0, 0, 0, 0);
        }
    }
    window.viewMyRun = viewMyRun;

    // Update profile tab based on auth state
    function renderProfile(container, displayName, handle) {
        const initials = displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'P';
        container.innerHTML = `
            <div class="profile-avatar">${initials}</div>
            <div class="profile-name">${displayName}</div>
            ${handle ? `<div class="profile-handle">@${handle}</div>` : ''}
            <div id="profileStats" style="display:flex;justify-content:center;gap:0;margin:20px 0;background:#f9fafb;border-radius:12px;padding:12px 0;">
                <div style="flex:1;text-align:center;border-right:1px solid #e5e7eb;">
                    <div style="font-weight:700;font-size:1.1rem;" id="statDailies">--</div>
                    <div style="font-size:0.75rem;color:#6b7280;">dailies</div>
                </div>
                <div style="flex:1;text-align:center;border-right:1px solid #e5e7eb;">
                    <div style="font-weight:700;font-size:1.1rem;" id="statAvgTime">--</div>
                    <div style="font-size:0.75rem;color:#6b7280;">avg time</div>
                </div>
                <div style="flex:1;text-align:center;border-right:1px solid #e5e7eb;">
                    <div style="font-weight:700;font-size:1.1rem;" id="statBeat">--</div>
                    <div style="font-size:0.75rem;color:#6b7280;">beat</div>
                </div>
                <div style="flex:1;text-align:center;">
                    <div style="font-weight:700;font-size:1.1rem;" id="statOverall">--</div>
                    <div style="font-size:0.75rem;color:#6b7280;">overall</div>
                </div>
            </div>
            <button onclick="showHistoricalScores()" style="width:100%;padding:14px;background:#fbbf24;color:#92400e;border:none;border-radius:12px;font-size:1rem;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:space-between;">
                <span>Historical Scores</span><span>&#8250;</span>
            </button>
            <button class="profile-signout-btn" onclick="signOut()" style="margin-top:24px;">Sign Out</button>
        `;
        // Load stats asynchronously
        if (currentUser) loadProfileStats();
    }

    async function loadProfileStats(forceRefresh) {
        if (!currentUser) return;
        const cacheKey = 'profile_stats_' + currentUser.id;

        // Use cached stats if available and not forced refresh
        if (!forceRefresh) {
            try {
                const cached = JSON.parse(localStorage.getItem(cacheKey));
                if (cached) {
                    applyProfileStats(cached);
                    return;
                }
            } catch(e) {}
        }

        // Fetch fresh
        const stats = { dailies: '--', avgTime: '--', beat: '--', overall: '--' };
        try {
            const { data } = await sb.from('daily_runs')
                .select('total_seconds')
                .eq('user_id', currentUser.id)
                .not('total_seconds', 'is', null);
            if (data) {
                stats.dailies = data.length;
                if (data.length > 0) {
                    stats.avgTime = (data.reduce((s, r) => s + r.total_seconds, 0) / data.length).toFixed(2) + 's';
                }
            }
        } catch(e) {}

        try {
            const { data } = await sb.rpc('user_overall_stats', { p_user_id: currentUser.id });
            if (data && data.length) {
                const row = data[0];
                if (row.ratio != null) stats.beat = Math.round(row.ratio * 100) + '%';
                if (row.percentile_rank != null) stats.overall = 'Top ' + Math.round(100 - row.percentile_rank) + '%';
            }
        } catch(e) {}

        try { localStorage.setItem(cacheKey, JSON.stringify(stats)); } catch(e) {}
        applyProfileStats(stats);
    }

    function applyProfileStats(stats) {
        const el = (id) => document.getElementById(id);
        if (el('statDailies')) el('statDailies').textContent = stats.dailies;
        if (el('statAvgTime')) el('statAvgTime').textContent = stats.avgTime;
        if (el('statBeat')) el('statBeat').textContent = stats.beat;
        if (el('statOverall')) el('statOverall').textContent = stats.overall;
    }

    async function showHistoricalScores() {
        if (!currentUser) return;
        const container = document.getElementById('profileContent');
        const origHtml = container.innerHTML;

        container.innerHTML = '<p style="text-align:center;color:#6b7280;padding:20px;">Loading...</p>';

        try {
            const { data: runs } = await sb
                .from('daily_runs')
                .select('date, total_seconds')
                .eq('user_id', currentUser.id)
                .not('total_seconds', 'is', null)
                .order('date', { ascending: false });

            if (!runs || !runs.length) {
                container.innerHTML = `
                    <button onclick="updateProfileTab()" style="padding:8px 16px;border:none;background:#f3f4f6;border-radius:8px;cursor:pointer;margin-bottom:16px;">&larr; Back</button>
                    <p style="text-align:center;color:#6b7280;">No daily scores yet.</p>`;
                return;
            }

            // Get percentiles from leaderboard for each date
            let html = '<button onclick="updateProfileTab()" style="padding:8px 16px;border:none;background:#f3f4f6;border-radius:8px;cursor:pointer;margin-bottom:16px;">&larr; Back</button>';
            html += '<h3 style="margin:0 0 12px;">Historical Scores</h3>';

            for (const run of runs) {
                const dateDisplay = formatDateForDisplay(run.date);
                const time = run.total_seconds.toFixed(2);

                // Try to get percentile from cached leaderboard
                let pctText = '';
                const cacheKey = 'lb_' + run.date + '_' + currentUser.id;
                try {
                    const cached = JSON.parse(localStorage.getItem(cacheKey));
                    if (cached) {
                        const me = cached.find(s => s.isMe);
                        if (me && me.percentile != null) {
                            pctText = `Top ${Math.round(100 - me.percentile)}%`;
                        }
                    }
                } catch(e) {}

                html += `<div onclick="switchTab('leaderboard');setTimeout(()=>{document.getElementById('leaderboardDatePicker').value='${run.date}';displayLeaderboard('${run.date}');},100);viewPlayerRun('${currentUser.id}','${run.date}','My Run',${run.total_seconds},0,0,0,0)" style="display:flex;align-items:center;padding:12px;margin-bottom:4px;background:#f9fafb;border-radius:10px;cursor:pointer;">`;
                html += `<div style="flex:1;"><div style="font-weight:600;">${dateDisplay}</div></div>`;
                html += `<div style="text-align:right;"><div style="font-weight:700;color:#16a34a;">${time}s</div>`;
                if (pctText) html += `<div style="font-size:0.8rem;color:#6b7280;">${pctText}</div>`;
                html += `</div>`;
                html += `<div style="color:#9ca3af;margin-left:8px;">&#8250;</div>`;
                html += `</div>`;
            }

            container.innerHTML = html;
        } catch(e) {
            console.error('Error loading historical scores:', e);
            container.innerHTML = `
                <button onclick="updateProfileTab()" style="padding:8px 16px;border:none;background:#f3f4f6;border-radius:8px;cursor:pointer;margin-bottom:16px;">&larr; Back</button>
                <p style="text-align:center;color:#dc2626;">Error loading scores</p>`;
        }
    }
    window.showHistoricalScores = showHistoricalScores;

    function updateProfileTab() {
        console.log('updateProfileTab called, currentUser:', !!currentUser);
        const container = document.getElementById('profileContent');
        if (!container) return;
        if (currentUser) {
            // Show immediately with cached name
            const cachedName = document.getElementById('userName').textContent || currentUser.email || 'Player';
            renderProfile(container, cachedName, '');

            // Then load full profile from Supabase (non-blocking)
            sb.from('profiles')
                .select('display_name, handle')
                .eq('id', currentUser.id)
                .single()
                .then(({ data: profile, error }) => {
                    console.log('Profile loaded:', profile, error);
                    if (profile) {
                        const name = profile.display_name || currentUser.email || 'Player';
                        const handle = profile.handle || '';
                        document.getElementById('userName').textContent = name;
                        renderProfile(container, name, handle);
                    }
                })
                .catch(e => console.error('Profile load error:', e));
        } else {
            container.innerHTML = `
                <div style="margin-top:60px;">
                    <div style="font-size:3rem;margin-bottom:16px;">&#128100;</div>
                    <div style="font-size:1rem;color:#6b7280;margin-bottom:24px;">Sign in to save your scores and compete on the leaderboard.</div>
                    <button class="profile-signin-btn" onclick="signInWithApple()">
                        &#63743; Sign In with Apple
                    </button>
                </div>
            `;
        }
    }

    // === SUPABASE ===
    const SUPABASE_URL = 'https://ggbvtaegsnlimscmjirf.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdnYnZ0YWVnc25saW1zY21qaXJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5MTkwNTUsImV4cCI6MjA5MTQ5NTA1NX0.RRQA0fW02H6XKj7xKUTSnR9zrGbWuE2kSmspCeHCfyQ';
    const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // Capture referral from URL
    const urlRef = new URLSearchParams(window.location.search).get('ref');
    if (urlRef) localStorage.setItem('referredBy', urlRef);

    // Stub for removed Firebase
    const database = { ref: () => ({ set: async () => {}, once: async () => ({ exists: () => false, val: () => null }), push: () => ({ key: null }), remove: async () => {}, update: async () => {} }) };
    let gameMode = 'practice';
    let currentUser = null;
    let dailyPlateSequence = null;
    let currentViewingDate = null;
    let currentDailyRunId = null;

    // Words modal state
    let COMMON_WORDS = new Set();
    let PROFANITY = new Set();
    let wordsModalPlate = '';
    let wordsModalDate = '';
    let wordsModalViable = [];
    let wordsModalCommon = [];
    let wordsModalUsed = [];
    let wordsModalActiveTab = 'common';

    // Auth state listener — MUST NOT be async to avoid deadlocking Supabase client
    sb.auth.onAuthStateChange((event, session) => {
        console.log('Auth event:', event, 'session:', !!session);
        if (session?.user) {
            currentUser = session.user;
            document.getElementById('userName').textContent = session.user.email || 'Player';
            updateProfileTab();
            updateDailyBtnState();
            submitPendingPracticeStats();

            // Check if there's a challenge ID in the URL
            if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
                const urlParams = new URLSearchParams(window.location.search);
                const challengeId = urlParams.get('challenge');
                if (challengeId) {
                    setTimeout(() => { playH2HChallenge(challengeId); }, 500);
                }

                // Save referral attribution
                const ref = localStorage.getItem('referredBy');
                if (ref && event === 'SIGNED_IN') {
                    (async () => {
                        try {
                            // Look up referrer's user ID by handle
                            const { data: referrer } = await sb.from('profiles').select('id').eq('handle', ref).single();
                            if (referrer && referrer.id !== session.user.id) {
                                // Only set if not already set
                                const { data: myProfile } = await sb.from('profiles').select('referred_by').eq('id', session.user.id).single();
                                if (myProfile && !myProfile.referred_by) {
                                    await sb.from('profiles').update({ referred_by: referrer.id }).eq('id', session.user.id);
                                    console.log('[Referral] Attributed to', ref);
                                }
                            }
                            localStorage.removeItem('referredBy');
                        } catch (e) { console.warn('[Referral] Error:', e); }
                    })();
                }
            }
        } else {
            currentUser = null;
            updateProfileTab();
            updateDailyBtnState();
        }
    });

    function getTodayString() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    }

    function seededRandom(seed) {
        let v = seed;
        return () => { v = (v*9301+49297)%233280; return v/233280; };
    }

    function generateDailyPlates(dateStr) {
        const seed = dateStr.split('-').reduce((a,v)=>a+parseInt(v),0);
        const rng = seededRandom(seed);
        if (!platesReady || !ALL_PLATES.length) return [];

        // Daily uses difficulty=50 weights (same as iOS)
        const weights = weightsForDifficulty(50);
        const dailyPlates = [];
        const used = new Set();

        while (dailyPlates.length < 200 && used.size < ALL_PLATES.length) {
            const r = rng();
            let threshold = 0;
            let bandIdx = 0;
            for (let b = 0; b < weights.length; b++) {
                threshold += weights[b];
                if (r < threshold) { bandIdx = b; break; }
            }
            const bandName = H2H_BAND_NAMES_ORDERED[bandIdx];
            const pool = getBandPool(bandName);
            const remaining = pool.filter(p => !used.has(p));

            if (remaining.length > 0) {
                const idx = Math.floor(rng() * remaining.length);
                const chosen = remaining[idx];
                dailyPlates.push(chosen);
                used.add(chosen);
            }
        }

        return dailyPlates;
    }

    async function signInWithApple() {
        try {
            const { error } = await sb.auth.signInWithOAuth({
                provider: 'apple',
                options: { redirectTo: window.location.origin + window.location.pathname }
            });
            if (error) throw error;
            return true;
        } catch(e) {
            alert('Sign in failed: ' + e.message);
            return false;
        }
    }

    async function signOut() {
        if (!confirm('Are you sure you want to sign out?')) return;
        await sb.auth.signOut();
        currentUser = null;
        updateProfileTab();
    }
    window.signInWithApple = signInWithApple;
    window.signOut = signOut;

    let todaysDailyTime = null;

    async function checkIfPlayedToday() {
        if (!currentUser) return false;
        const t = getTodayString();
        try {
            const result = await Promise.race([
                sb.from('daily_runs').select('id, total_seconds').eq('user_id', currentUser.id).eq('date', t).limit(1),
                new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
            ]);
            const { data } = result;
            if (data && data.length > 0) {
                todaysDailyTime = data[0].total_seconds;
                return true;
            }
        } catch (e) {
            console.warn('checkIfPlayedToday error:', e);
        }
        return false;
    }

    async function updateDailyBtnState() {
        const btn = document.getElementById('dailyChallengeBtn');
        const practiceBtn = document.getElementById('practiceBtn');
        const practiceSettingsBtn = document.getElementById('practiceSettingsBtn');
        if (!currentUser) {
            btn.textContent = 'Sign in to play Daily';
            btn.style.background = '#e5e7eb';
            btn.style.color = '#9ca3af';
            btn.style.cursor = 'pointer';
            btn.disabled = false;
            btn.onclick = () => signInWithApple();
            practiceBtn.textContent = 'Sign in to Practice';
            practiceBtn.style.background = '#e5e7eb';
            practiceBtn.style.color = '#9ca3af';
            practiceBtn.style.cursor = 'pointer';
            practiceBtn.disabled = false;
            practiceBtn.onclick = () => signInWithApple();
            practiceSettingsBtn.style.display = 'none';
            return;
        }
        // Restore buttons
        btn.onclick = null;
        practiceBtn.onclick = null;
        practiceBtn.textContent = 'Practice Mode';
        practiceBtn.style.background = '#9370db';
        practiceBtn.style.color = '#ffffff';
        practiceBtn.style.cursor = 'pointer';
        practiceBtn.disabled = false;
        practiceSettingsBtn.style.display = '';
        const played = await checkIfPlayedToday();
        if (played && todaysDailyTime) {
            btn.textContent = `Daily Challenge: ${todaysDailyTime.toFixed(2)}s`;
            btn.style.background = '#e5e7eb';
            btn.style.color = '#9ca3af';
            btn.style.cursor = 'not-allowed';
            btn.disabled = true;
        } else {
            btn.textContent = 'Daily Challenge';
            btn.style.background = '#fbbf24';
            btn.style.color = '#92400e';
            btn.style.cursor = 'pointer';
            btn.disabled = false;
        }
    }

    async function saveScore(time, solved, skipped) {
        console.log('saveScore called:', { time, solved, skipped, gameMode, currentDailyRunId, historyLen: gameHistory.length });
        if (!currentUser || gameMode !== 'daily' || !currentDailyRunId) {
            console.log('saveScore skipped:', { hasUser: !!currentUser, gameMode, runId: currentDailyRunId });
            return;
        }
        const today = getTodayString();
        const totalSeconds = Math.floor(time * 100) / 100;

        await sb
            .from('daily_runs')
            .update({ total_seconds: totalSeconds, completed_at: new Date().toISOString() })
            .eq('id', currentDailyRunId);

        const entries = gameHistory.map((entry, idx) => ({
            run_id: currentDailyRunId,
            plate_index: idx,
            plate: entry.plate,
            word: entry.skipped ? null : (entry.word || '').toLowerCase(),
            thinking_seconds: Math.floor(entry.thinkingSeconds * 100) / 100,
            skipped: entry.skipped || false,
            penalty_seconds: entry.penaltySeconds || 0
        }));

        const { error: insertError } = await sb.from('daily_run_entries').insert(entries);
        if (insertError) {
            console.error('Failed to save run entries:', insertError);
            alert('Warning: your plate details may not have saved. Error: ' + insertError.message);
        } else {
            console.log('Saved', entries.length, 'run entries');
        }

        // Update daily button and refresh profile stats
        updateDailyBtnState();
        loadProfileStats(true);

        setTimeout(() => {
            displayLeaderboard(today);
        }, 500);
    }


    const playerHistoryCache = {};

    async function loadPlayerHistory(userId, dateStr) {
        const cacheKey = userId + '_' + dateStr;
        if (playerHistoryCache[cacheKey]) return playerHistoryCache[cacheKey];

        const { data: runs } = await sb
            .from('daily_runs')
            .select('id, total_seconds')
            .eq('user_id', userId)
            .eq('date', dateStr)
            .limit(1);
        if (!runs || !runs.length) return null;
        const run = runs[0];
        const { data: entries } = await sb
            .from('daily_run_entries')
            .select('*')
            .eq('run_id', run.id)
            .order('plate_index');
        const result = {
            totalTime: run.total_seconds,
            history: (entries || []).map(e => ({
                plate: e.plate,
                word: e.word,
                skipped: e.skipped,
                thinkingSeconds: e.thinking_seconds,
                penaltySeconds: e.penalty_seconds
            }))
        };
        playerHistoryCache[cacheKey] = result;
        return result;
    }

    function isDateSettled(dateStr) {
        return dateStr < getTodayString();
    }

    async function loadLeaderboard(dateStr) {
        const userId = currentUser ? currentUser.id : '00000000-0000-0000-0000-000000000000';
        // Check localStorage cache for settled dates
        const cacheKey = 'lb_' + dateStr + '_' + userId;
        if (isDateSettled(dateStr)) {
            const cached = localStorage.getItem(cacheKey);
            if (cached) {
                try { return JSON.parse(cached); } catch(e) {}
            }
        }
        const { data, error } = await sb.rpc('leaderboard_for_date', {
            p_date: dateStr,
            p_user_id: userId
        });
        if (!data || !data.length) return [];

        const result = data.map((row, idx) => ({
            userId: row.out_user_id,
            userName: row.out_display_name || (row.out_handle ? '@' + row.out_handle : 'Anonymous'),
            totalTime: row.out_total_seconds,
            solved: 10,
            skipped: 0,
            streak: row.out_streak,
            percentile: row.out_percentile,
            totalPlayers: row.out_total_players,
            median: row.out_median_seconds,
            rank: idx + 1,
            isMe: currentUser && row.out_user_id === currentUser.id,
            isFriend: row.out_is_friend || false
        }));
        // Cache settled dates
        if (isDateSettled(dateStr)) {
            try { localStorage.setItem(cacheKey, JSON.stringify(result)); } catch(e) {}
        }
        return result;
    }



    // Toggle comparison table
    function toggleCompareTable() {
        const btn = document.getElementById('compareRunsBtn');
        if (btn.disabled) return;

        const container = document.getElementById('comparisonTableContainer');
        if (container.style.display === 'none') {
            container.style.display = 'block';
            btn.textContent = 'Hide Comparison';
            buildComparisonTable();
        } else {
            container.style.display = 'none';
            btn.textContent = 'Compare All Runs';
        }
    }
    window.toggleCompareTable = toggleCompareTable;

    // Toggle plate stats modal
    function togglePlateStats() {
        const btn = document.getElementById('plateStatsBtn');
        if (btn.disabled) return;
        const backdrop = document.getElementById('plateStatsModalBackdrop');
        backdrop.classList.add('show');
        document.getElementById('plateStatsModalContent').innerHTML = '<p style="text-align:center;color:#6b7280;padding:20px;">Loading...</p>';
        buildPlateStats();
    }
    window.togglePlateStats = togglePlateStats;

    window.closePlateStatsModal = function() {
        document.getElementById('plateStatsModalBackdrop').classList.remove('show');
    };

    async function buildPlateStats() {
        const container = document.getElementById('plateStatsModalContent');
        container.innerHTML = '<p style="text-align:center;color:#6b7280;padding:20px;">Loading plate stats...</p>';

        const dateStr = currentViewingDate || getTodayString();

        try {
            // Fetch plates for this date
            const { data: dp } = await sb.from('daily_plates').select('plates').eq('date', dateStr).single();
            if (!dp || !dp.plates) {
                container.innerHTML = '<p style="text-align:center;color:#6b7280;">No plate data available</p>';
                return;
            }

            // Fetch all run entries for this date
            const { data: entries } = await sb
                .from('daily_run_entries')
                .select('plate_index, plate, word, skipped, thinking_seconds, penalty_seconds, run_id')
                .in('run_id', (await sb.from('daily_runs').select('id').eq('date', dateStr).not('total_seconds', 'is', null)).data?.map(r => r.id) || []);

            if (!entries || entries.length === 0) {
                container.innerHTML = '<p style="text-align:center;color:#6b7280;">No entries yet</p>';
                return;
            }

            // Find max plate index used
            const maxIdx = Math.max(...entries.map(e => e.plate_index)) + 1;
            const plates = dp.plates.slice(0, maxIdx);

            // Group entries by plate index
            const byPlate = {};
            entries.forEach(e => {
                if (!byPlate[e.plate_index]) byPlate[e.plate_index] = [];
                byPlate[e.plate_index].push(e);
            });

            let html = '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:0.85rem;margin-top:8px;">';
            html += '<thead><tr style="background:#f3f4f6;">';
            html += '<th style="padding:8px 10px;text-align:left;">#</th>';
            html += '<th style="padding:8px 10px;text-align:left;">Plate</th>';
            html += '<th style="padding:8px 10px;text-align:right;">Skip</th>';
            html += '<th style="padding:8px 10px;text-align:right;">Think</th>';
            html += '<th style="padding:8px 10px;text-align:right;">Total</th>';
            html += '<th style="padding:8px 10px;text-align:right;">Top Word</th>';
            html += '</tr></thead><tbody>';

            for (let i = 0; i < plates.length; i++) {
                const pe = byPlate[i] || [];
                const total = pe.length;
                const skipped = pe.filter(e => e.skipped).count;
                const skipCount = pe.filter(e => e.skipped).length;
                const skipPct = total > 0 ? Math.round(100 * skipCount / total) : 0;

                const validTimes = pe.filter(e => e.thinking_seconds <= 400);
                const thinkAvg = validTimes.length > 0 ? (validTimes.reduce((s, e) => s + e.thinking_seconds, 0) / validTimes.length).toFixed(1) : '--';
                const totalAvg = validTimes.length > 0 ? (validTimes.reduce((s, e) => s + e.thinking_seconds + (e.skipped ? e.penalty_seconds : 0), 0) / validTimes.length).toFixed(1) : '--';

                // Top word
                const wordCounts = {};
                pe.filter(e => !e.skipped && e.word).forEach(e => {
                    wordCounts[e.word] = (wordCounts[e.word] || 0) + 1;
                });
                const topWord = Object.entries(wordCounts).sort((a, b) => b[1] - a[1])[0];
                const topWordStr = topWord ? `${topWord[0]} (${Math.round(topWord[1] / total * 100)}%)` : '--';

                // Row color based on skip rate
                const t = Math.min(Math.max(skipPct, 0), 100) / 100;
                let red, green, opacity;
                if (t < 0.20) {
                    const f = t / 0.20;
                    red = f * 0.95;
                    green = 0.75 + f * 0.15;
                    opacity = 0.18 + f * 0.02;
                } else if (t < 0.50) {
                    const f = (t - 0.20) / 0.30;
                    red = 0.95 + f * 0.05;
                    green = 0.90 - f * 0.65;
                    opacity = 0.15 + f * 0.05;
                } else {
                    const f = (t - 0.50) / 0.50;
                    red = 1.0;
                    green = 0.25 - f * 0.20;
                    opacity = 0.20 + f * 0.12;
                }
                // Blend with white background to get solid color
                const rr = Math.round(255 + (red * 255 - 255) * opacity);
                const gg = Math.round(255 + (green * 255 - 255) * opacity);
                const bb = Math.round(255 * (1 - opacity));
                const bgColor = `rgb(${rr}, ${gg}, ${bb})`;

                html += `<tr style="background:${bgColor};" onclick="showViableWordsForPlate('${plates[i]}')" class="plate-stats-row">`;
                html += `<td style="padding:6px 10px;color:#9ca3af;">${i + 1}</td>`;
                html += `<td style="padding:6px 10px;"><strong style="font-family:monospace;">${plates[i]}</strong> <span style="font-size:0.75rem;color:#9ca3af;">${total}</span></td>`;
                html += `<td style="padding:6px 10px;text-align:right;">${total > 0 ? skipPct + '%' : '--'}</td>`;
                html += `<td style="padding:6px 10px;text-align:right;">${thinkAvg}</td>`;
                html += `<td style="padding:6px 10px;text-align:right;font-weight:500;">${totalAvg}</td>`;
                html += `<td style="padding:6px 10px;text-align:right;">${topWordStr}</td>`;
                html += '</tr>';
            }

            html += '</tbody></table></div>';
            container.innerHTML = html;
        } catch (e) {
            console.error('Plate stats error:', e);
            container.innerHTML = '<p style="text-align:center;color:#dc2626;">Error loading plate stats</p>';
        }
    }

    // Get color based on time (gradient)
    function getTimeColor(seconds) {
        if (seconds <= 1.5) return '#22c55e';
        if (seconds >= 30) return '#ef4444';

        if (seconds <= 6) {
            const ratio = (seconds - 1.5) / 4.5;
            const r = Math.round(34 + (255 - 34) * ratio);
            const g = Math.round(197 + (255 - 197) * ratio);
            const b = Math.round(94 + (255 - 94) * ratio);
            return `rgb(${r},${g},${b})`;
        } else {
            const ratio = (seconds - 6) / 24;
            const r = 255;
            const g = Math.round(255 - (255 - 68) * ratio);
            const b = Math.round(255 - (255 - 68) * ratio);
            return `rgb(${r},${g},${b})`;
        }
    }

    // Build comparison table
    async function buildComparisonTable() {
        const contentEl = document.getElementById('comparisonTable');
        contentEl.innerHTML = 'Loading comparison...';

        try {
            const dateStr = currentViewingDate || getTodayString();
            const scores = await loadLeaderboard(dateStr);

            if (scores.length === 0) {
                contentEl.innerHTML = '<p style="text-align:center;color:#6b7280;">No data available</p>';
                return;
            }

            const playersData = [];
            let maxPlates = 0;

            for (const score of scores) {
                const playerData = await loadPlayerHistory(score.userId, dateStr);
                if (playerData && playerData.history && playerData.history.length > 0) {
                    maxPlates = Math.max(maxPlates, playerData.history.length);
                    playersData.push({
                        name: score.userName,
                        time: score.totalTime,
                        history: playerData.history
                    });
                }
            }

            if (playersData.length === 0) {
                contentEl.innerHTML = '<p style="text-align:center;color:#6b7280;">No detailed history available</p>';
                return;
            }

            const plateNames = [];
            for (let i = 0; i < maxPlates; i++) {
                let plateName = '\u2014';
                for (const player of playersData) {
                    if (i < player.history.length && player.history[i].plate) {
                        plateName = player.history[i].plate;
                        break;
                    }
                }
                plateNames.push(plateName);
            }

            let html = '<div style="max-height:620px;overflow:auto;"><table style="border-collapse:collapse;font-size:0.9rem;">';

            const plateStats = [];
            for (let i = 0; i < maxPlates; i++) {
                let totalTime = 0;
                let count = 0;
                let skipCount = 0;

                playersData.forEach(player => {
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

                const avgTime = count > 0 ? (totalTime / count).toFixed(2) : '\u2014';
                const skipRate = count > 0 ? Math.round((skipCount / count) * 100) : 0;
                plateStats.push({ avgTime, skipRate });
            }

            html += '<thead style="position:sticky;top:0;z-index:15;background:#f3f4f6;box-shadow:0 2px 4px rgba(0,0,0,0.1);"><tr style="background:#f3f4f6;">';
            html += '<th style="padding:8px;text-align:left;position:sticky;left:0;background:#f3f4f6;z-index:20;min-width:120px;">Player</th>';
            for (let i = 0; i < maxPlates; i++) {
                const stats = plateStats[i];
                const skipColor = stats.skipRate > 50 ? '#dc2626' : stats.skipRate > 25 ? '#f59e0b' : '#16a34a';
                html += `<th style="padding:8px;text-align:center;min-width:100px;">`;
                html += `<div class="plate-name-clickable" onclick="showViableWordsForPlate('${plateNames[i]}')" style="font-weight:bold;font-size:1rem;cursor:pointer;display:inline-block;" title="Click to see all viable words">${plateNames[i]}</div>`;
                html += `<div style="font-size:0.75rem;color:#6b7280;margin-top:2px;">Avg: ${stats.avgTime}s</div>`;
                html += `<div style="font-size:0.75rem;color:${skipColor};margin-top:1px;">Skip: ${stats.skipRate}%</div>`;
                html += `</th>`;
            }
            html += '</tr></thead><tbody>';

            playersData.forEach((player, idx) => {
                const bg = idx % 2 === 0 ? '#fff' : '#f9fafb';

                html += `<tr style="background:${bg};">`;
                html += `<td style="padding:12px;font-weight:bold;position:sticky;left:0;background:${bg};z-index:5;white-space:nowrap;">${player.name}<br><span style="font-size:0.85rem;color:#6b7280;">(${player.time.toFixed(2)}s)</span></td>`;

                for (let i = 0; i < maxPlates; i++) {
                    if (i < player.history.length) {
                        const entry = player.history[i];
                        const word = entry.skipped ? '\u274C' : entry.word;

                        const totalTime = entry.skipped
                            ? (entry.thinkingSeconds || 0) + entry.penaltySeconds
                            : entry.thinkingSeconds;

                        const displayTime = `${totalTime.toFixed(2)}s`;

                        const bgColor = entry.skipped ? '#000000' : getTimeColor(totalTime);
                        const textColor = entry.skipped ? '#ffffff' : (totalTime > 15 ? '#fff' : '#000');

                        const tooltip = entry.skipped
                            ? `Skipped\nThinking: ${(entry.thinkingSeconds || 0).toFixed(2)}s\nPenalty: +${entry.penaltySeconds}s\nTotal: ${totalTime.toFixed(2)}s`
                            : `Word: ${entry.word}\nTime: ${totalTime.toFixed(2)}s`;

                        html += `<td style="padding:8px;text-align:center;background:${bgColor};color:${textColor};border:2px solid #fff;" title="${tooltip}">`;
                        html += `<div style="font-weight:600;font-size:0.9rem;">${word}</div>`;
                        html += `<div style="font-size:0.85rem;margin-top:2px;">${displayTime}</div>`;
                        html += `</td>`;
                    } else {
                        html += `<td style="padding:8px;background:#f3f4f6;border:2px solid #fff;"></td>`;
                    }
                }
                html += '</tr>';
            });

            html += '</tbody></table>';
            contentEl.innerHTML = html;

        } catch (error) {
            console.error('Error building comparison:', error);
            contentEl.innerHTML = '<p style="text-align:center;color:#dc2626;">Error loading comparison</p>';
        }
    }

    // Format date for display
    function formatDateForDisplay(dateStr) {
        const d = new Date(dateStr + 'T00:00:00');
        return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    }

    async function displayLeaderboard(dateStr) {
        currentViewingDate = dateStr;
        updateNavigationButtons();

        // Update date display
        const dateDisplay = document.getElementById('leaderboardDateDisplay');
        if (dateDisplay) {
            dateDisplay.textContent = formatDateForDisplay(dateStr);
        }

        // Auto-collapse comparison table when date changes
        const comparisonContainer = document.getElementById('comparisonTableContainer');
        const compareBtn = document.getElementById('compareRunsBtn');
        if (comparisonContainer && comparisonContainer.style.display === 'block') {
            comparisonContainer.style.display = 'none';
            if (compareBtn) compareBtn.textContent = 'Compare All Runs';
        }

        document.getElementById('leaderboardTitle').textContent = 'Leaderboard';
        document.getElementById('leaderboardContent').innerHTML = '<p style="text-align:center;color:#6b7280;padding:20px;">Loading...</p>';

        // Hide my run card initially
        document.getElementById('myRunRow').style.display = 'none';

        let userHasPlayed = false;
        let isPastDate = false;

        try {
            const scores = await loadLeaderboard(dateStr);
            if (!scores.length) {
                document.getElementById('leaderboardContent').innerHTML = '<p style="text-align:center;color:#6b7280;padding:20px;">No scores for this date</p>';
                return;
            }

            cachedScores = scores;
            userHasPlayed = currentUser && scores.some(score => score.userId === currentUser.id || score.isMe);
            isPastDate = dateStr !== getTodayString();

            // Show My Run card if user has played
            if (userHasPlayed) {
                const myScore = scores.find(s => s.isMe || s.userId === currentUser?.id);
                if (myScore) {
                    document.getElementById('myRunRow').style.display = 'flex';
                    document.getElementById('myRunTime').textContent = myScore.totalTime.toFixed(2) + 's';
                }
            }

            // Update tab counts
            const friendCount = scores.filter(s => s.isFriend || s.isMe).length;
            document.getElementById('lbGlobalBtn').textContent = `Global (${scores.length})`;
            document.getElementById('lbFriendsBtn').textContent = `Friends (${friendCount})`;

            // Filter by friends if needed
            let displayScores = scores;
            if (leaderboardFilter === 'friends') {
                displayScores = scores.filter(s => s.isFriend || s.isMe);
                if (displayScores.length === 0) {
                    document.getElementById('leaderboardContent').innerHTML = '<p style="text-align:center;color:#6b7280;padding:20px;">No friends have played this date</p>';
                    return;
                }
            }

            // Build list-style leaderboard
            let h = '';
            displayScores.forEach((s, i) => {
                const rank = i + 1;
                let rankDisplay;
                if (rank === 1) rankDisplay = '\uD83E\uDD47';
                else if (rank === 2) rankDisplay = '\uD83E\uDD48';
                else if (rank === 3) rankDisplay = '\uD83E\uDD49';
                else rankDisplay = rank + '.';

                const isMe = s.isMe || (currentUser && s.userId === currentUser.id);
                const meClass = isMe ? ' is-me' : '';

                // Streak display
                const streakHtml = s.streak && s.streak > 1 ? `<span class="lb-streak">\uD83D\uDD25${s.streak}</span>` : '';

                // Badges
                let badgeHtml = '';
                if (isMe) badgeHtml += '<span class="lb-badge lb-badge-you">You</span>';
                if (s.isFriend && !isMe) badgeHtml += '<span class="lb-badge lb-badge-friend">Friend</span>';

                // Time display
                let timeHtml;
                if (userHasPlayed || isPastDate) {
                    timeHtml = `<span class="lb-time">${s.totalTime.toFixed(2)}s</span>`;
                } else {
                    timeHtml = `<span class="lb-time blurred-score">${s.totalTime.toFixed(2)}s</span>`;
                }

                // Click handler — store score data for access in viewPlayerRun
                let clickAttr = '';
                if (userHasPlayed || isPastDate) {
                    clickAttr = `onclick="viewPlayerRun('${s.userId}','${dateStr}','${s.userName.replace(/'/g,"\\'")}',${s.totalTime},${Math.round(s.percentile||0)},${s.median||0},${s.totalPlayers||0},${s.rank||0})"`;
                }

                h += `<div class="lb-row${meClass}" ${clickAttr}>`;
                h += `<div class="lb-rank">${rankDisplay}</div>`;
                h += `<div class="lb-name"><span onclick="event.stopPropagation();openProfileModal('${s.userId}','${s.userName.replace(/'/g,"\\'")}')" style="cursor:pointer;">${s.userName}</span>${streakHtml}${badgeHtml}</div>`;
                h += timeHtml;
                if (userHasPlayed || isPastDate) {
                    h += `<div class="lb-chevron">&#8250;</div>`;
                } else {
                    h += `<div class="lb-locked">\uD83D\uDD12</div>`;
                }
                h += `</div>`;
            });

            document.getElementById('leaderboardContent').innerHTML = h;

        } catch(e) {
            console.error('Leaderboard error:', e);
            document.getElementById('leaderboardContent').innerHTML = '<p style="text-align:center;color:#dc2626;padding:20px;">Error loading</p>';
        }

        // Update Plate Stats button state
        try {
            const statsBtn = document.getElementById('plateStatsBtn');
            const canView = userHasPlayed || isPastDate;
            if (statsBtn) {
                statsBtn.disabled = !canView;
                statsBtn.style.cursor = canView ? 'pointer' : 'not-allowed';
                statsBtn.style.opacity = canView ? '1' : '0.6';
                statsBtn.style.background = canView ? 'rgba(37,99,235,0.08)' : '#f3f4f6';
                statsBtn.style.color = canView ? '#2563eb' : '#9ca3af';
                statsBtn.style.border = canView ? '1px solid rgba(37,99,235,0.25)' : '1px solid #e5e7eb';
                statsBtn.textContent = canView ? 'Plate Stats' : '\uD83D\uDD12 Complete Daily';
            }
            // Show row if user played or past date
            if (canView) {
                document.getElementById('myRunRow').style.display = 'flex';
            }
            // Close plate stats modal when switching dates
            document.getElementById('plateStatsModalBackdrop').classList.remove('show');
        } catch(btnError) {
            console.error('Button state error:', btnError);
        }
    }
    // === END FIREBASE ===

    // --------- CONFIG ---------
    const TOTAL_PLATES = 10;

    const VERY_EASY_PROB = 0.40;
    const EASY_PROB      = 0.20;
    const MEDIUM_PROB    = 0.15;
    const DIFFICULT_PROB = 0.15;
    const HARD_PROB      = 0.05;
    const VERY_HARD_PROB = 0.03;
    const IMPOSSIBLE_PROB= 0.01;

    // 8 bands matching iOS PlateDifficulty.swift (based on common/viable word counts)
    const BAND_NAMES = [
        "very_easy",    // 45+ common
        "easy",         // 20-44 common
        "medium_easy",  // 8-19 common
        "medium",       // 4-7 common
        "hard",         // 2-3 common
        "very_hard",    // 1 common
        "impossible",   // 0 common, 28+ viable
        "dead"          // 0 common, 1-27 viable
    ];

    // --------- GLOBAL STATE ---------
    let WORDS = [];
    let DICTIONARY = new Set();
    let dictionaryReady = false;

    let PLATE_DIFFICULTY = null;
    let difficultyReady = false;

    let ALL_PLATES = [];
    let platesReady = false;

    let VERY_EASY_PLATES = [];
    let EASY_PLATES      = [];
    let MEDIUM_EASY_PLATES = [];
    let MEDIUM_PLATES    = [];
    let HARD_PLATES      = [];
    let VERY_HARD_PLATES = [];
    let IMPOSSIBLE_PLATES= [];
    let DEAD_PLATES      = [];

    let usedPlates = new Set();
    let currentPlate = null;

    let practiceDifficulty = parseInt(localStorage.getItem('practiceDifficulty') || '50');
    let practiceTimed = localStorage.getItem('practiceTimed') !== 'false';

    // Sound effects & music
    let sfxEnabled = localStorage.getItem('sfxEnabled') !== 'false';
    let musicEnabled = localStorage.getItem('musicEnabled') !== 'false';
    let bgMusic;
    let audioCtx;
    let sfxBuffers = {};
    let audioUnlocked = false;

    async function initAudio() {
        if (audioCtx) return;
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const files = { correct: 'correct.mp3', wrong: 'wrong.mp3', skip: 'skip.mp3' };
        for (const [name, file] of Object.entries(files)) {
            try {
                const resp = await fetch(file);
                const buf = await resp.arrayBuffer();
                sfxBuffers[name] = await audioCtx.decodeAudioData(buf);
            } catch (e) { console.warn('Failed to load SFX:', name, e); }
        }
        bgMusic = new Audio('Klezmer.mp3');
        bgMusic.loop = true;
        bgMusic.volume = musicEnabled ? 0.3 : 0;
        bgMusic.play().catch(()=>{});
    }

    function unlockAudio() {
        if (audioUnlocked) return;
        audioUnlocked = true;
        initAudio();
        if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    }

    function playSFX(name) {
        if (!sfxEnabled || !audioCtx || !sfxBuffers[name]) return;
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const source = audioCtx.createBufferSource();
        source.buffer = sfxBuffers[name];
        const gain = audioCtx.createGain();
        gain.gain.value = 0.5;
        source.connect(gain);
        gain.connect(audioCtx.destination);
        source.start(0);
    }
    window.toggleMusic = function() {
        musicEnabled = !musicEnabled;
        localStorage.setItem('musicEnabled', musicEnabled);
        const btn = document.getElementById('musicToggleBtn');
        btn.textContent = musicEnabled ? '\u{1F50A}' : '\u{1F507}';
        if (bgMusic) bgMusic.volume = musicEnabled ? 0.3 : 0;
    };
    // Set initial icon
    setTimeout(() => {
        const btn = document.getElementById('musicToggleBtn');
        if (btn) btn.textContent = musicEnabled ? '\u{1F50A}' : '\u{1F507}';
    }, 0);

    let gameStarted = false;
    let gameOver = false;
    let solvedCount = 0;
    let startTime = null;
    let penaltySeconds = 0;
    let timerIntervalId = null;

    let skipCount = 0;
    let plateLocked = false;

    let gameModalMode = "start";
    let hasStartedOnce = false;

    let plateStartTime = null;
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
    const chartButtonEl = document.getElementById("chartButton");

    const gameModalBackdropEl = document.getElementById("gameModalBackdrop");
    const gameModalTitleEl = document.getElementById("gameModalTitle");
    const gameModalBodyEl = document.getElementById("gameModalBody");
    const gameModalPrimaryBtnEl = document.getElementById("gameModalPrimaryBtn");
    const gameModalSecondaryBtnEl = document.getElementById("gameModalSecondaryBtn");
    const gameModalCloseBtnEl = document.getElementById("gameModalCloseBtn");

    const wordsModalBackdropEl = document.getElementById("wordsModalBackdrop");
    const wordsModalTitleEl = document.getElementById("wordsModalTitle");
    const wordsModalStatusEl = document.getElementById("wordsModalStatus");
    const wordsModalListEl = document.getElementById("wordsModalList");
    const wordsModalCloseBtnEl = document.getElementById("wordsModalCloseBtn");
    const wordsModalCloseBtnBottomEl = document.getElementById("wordsModalCloseBtnBottom");
    const wordsSortAlphaBtnEl = document.getElementById("wordsSortAlphaBtn");
    const wordsSortLengthBtnEl = document.getElementById("wordsSortLengthBtn");

    const chartModalBackdropEl = document.getElementById("chartModalBackdrop");
    const chartModalCloseBtnEl = document.getElementById("chartModalCloseBtn");
    const chartModalCloseBtnBottomEl = document.getElementById("chartModalCloseBtnBottom");
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
            debugEl.textContent = '';

            tryBuildPlateList();
        } catch (err) {
            console.error(err);
            resultEl.textContent = "Failed to load words.txt.";
            resultEl.style.color = "red";
        }
    }

    async function loadDifficulty() {
        try {
            const res = await fetch("plate_analysis.json?v=1");
            PLATE_DIFFICULTY = await res.json();
            difficultyReady = true;

            tryBuildPlateList();
        } catch (err) {
            console.warn("plate_analysis.json not loaded:", err);
            PLATE_DIFFICULTY = null;
            difficultyReady = false;
        } finally {
            maybeEnableStart();
        }
    }

    function getBandForPlate(entry) {
        const common = entry.common || 0;
        const viable = entry.viable || 0;
        if (common >= 45) return "very_easy";
        if (common >= 20) return "easy";
        if (common >= 8) return "medium_easy";
        if (common >= 4) return "medium";
        if (common >= 2) return "hard";
        if (common >= 1) return "very_hard";
        if (viable >= 28) return "impossible";
        if (viable > 0) return "dead";
        return null; // unplayable
    }

    function tryBuildPlateList() {
        if (!dictionaryReady || !PLATE_DIFFICULTY || platesReady) return;

        const all = [];
        const ve = [], e = [], me = [], m = [], h = [], vh = [], im = [], de = [];

        for (const plate of Object.keys(PLATE_DIFFICULTY)) {
            const entry = PLATE_DIFFICULTY[plate];
            const band = getBandForPlate(entry);
            if (!band) continue; // skip unplayable

            all.push(plate);

            switch (band) {
                case "very_easy":   ve.push(plate); break;
                case "easy":        e.push(plate); break;
                case "medium_easy": me.push(plate); break;
                case "medium":      m.push(plate); break;
                case "hard":        h.push(plate); break;
                case "very_hard":   vh.push(plate); break;
                case "impossible":  im.push(plate); break;
                case "dead":        de.push(plate); break;
            }
        }

        ALL_PLATES         = all;
        VERY_EASY_PLATES   = ve;
        EASY_PLATES        = e;
        MEDIUM_EASY_PLATES = me;
        MEDIUM_PLATES      = m;
        HARD_PLATES        = h;
        VERY_HARD_PLATES   = vh;
        IMPOSSIBLE_PLATES  = im;
        DEAD_PLATES        = de;

        platesReady = true;
        console.log('Plate bands:', {ve:ve.length, e:e.length, me:me.length, m:m.length, h:h.length, vh:vh.length, im:im.length, de:de.length, total:all.length});
        maybeEnableStart();
    }

    function maybeEnableStart() {
        const ready = dictionaryReady && difficultyReady && platesReady;
        startButtonEl.disabled = !ready;

        if (gameModalMode === "start") {
            gameModalPrimaryBtnEl.disabled = !ready;
            gameModalPrimaryBtnEl.textContent = ready ? "Start Game" : "Loading...";
        }
    }

    // --------- PLATE MATCHING ---------
    function getPlateMatchIndices(plate, word) {
        plate = plate.toUpperCase();
        const upperWord = word.toUpperCase();

        let expectedPlateIndex = 0;
        const matchedIndices = [];

        for (let i = 0; i < upperWord.length; i++) {
            const ch = upperWord[i];

            // 1) Does this character match the next expected plate letter?
            if (expectedPlateIndex < plate.length && ch === plate[expectedPlateIndex]) {
                matchedIndices.push(i);
                expectedPlateIndex++;
                if (expectedPlateIndex === plate.length) {
                    return matchedIndices;
                }
                continue;
            }

            // 2) Does this character appear later in the plate? That's an
            //    out-of-order violation (e.g. "sloths" for plate "LOS" —
            //    the S shows up before the L).
            if (plate.slice(expectedPlateIndex).includes(ch)) {
                return null;
            }

            // 3) Letter is absent from remaining plate — harmless, skip.
        }
        return null;
    }

    function wordMatchesPlate(plate, word) {
        return getPlateMatchIndices(plate, word) !== null;
    }

    function computeJsViableCount(plate) {
        if (!dictionaryReady || !plate) return 0;
        let count = 0;
        for (const w of WORDS) {
            if (wordMatchesPlate(plate, w)) count++;
        }
        return count;
    }

    // --------- PLATE SELECTION ---------
    function getBandPool(bandName) {
        switch (bandName) {
            case "very_easy":   return VERY_EASY_PLATES;
            case "easy":        return EASY_PLATES;
            case "medium_easy": return MEDIUM_EASY_PLATES;
            case "medium":      return MEDIUM_PLATES;
            case "hard":        return HARD_PLATES;
            case "very_hard":   return VERY_HARD_PLATES;
            case "impossible":  return IMPOSSIBLE_PLATES;
            case "dead":        return DEAD_PLATES;
            default:            return [];
        }
    }

    function pickRandomPlateFromBand(bandName) {
        const poolRef = getBandPool(bandName);
        const remaining = poolRef.filter(p => !usedPlates.has(p));
        if (remaining.length === 0) return null;
        const idx = Math.floor(Math.random() * remaining.length);
        return remaining[idx];
    }

    // Piecewise linear weight system (ported from iOS PlateDifficulty.swift)
    // Maps difficulty slider 0-100 to weights across 8 bands using common/viable counts
    const H2H_CONTROL_POINTS = [0, 25, 50, 75, 90, 100];
    //                                s=0  s=25  s=50  s=75  s=90  s=100
    const H2H_BAND_WEIGHTS = [
        /* veryEasy   */             [42,   28,   20,    2,    0,    0],
        /* easy       */             [28,   24,   16,    2,    0,    0],
        /* mediumEasy */             [17,   20,   14,    4,    1,    0],
        /* medium     */             [ 8,   14,   17,   10,    3,    4],
        /* hard       */             [ 3,    8,   17,   20,   14,   18],
        /* veryHard   */             [ 1,    3,   10,   28,   38,   30],
        /* impossible */             [ 1,    2,    4,   26,   38,   35],
        /* dead       */             [ 0,    1,    2,    8,    6,   13],
    ];
    const H2H_BAND_NAMES_ORDERED = ["very_easy", "easy", "medium_easy", "medium", "hard", "very_hard", "impossible", "dead"];

    function weightsForDifficulty(difficulty) {
        const d = Math.min(100, Math.max(0, difficulty));
        const pts = H2H_CONTROL_POINTS;
        let i = 0;
        for (let j = 0; j < pts.length - 1; j++) {
            if (d >= pts[j]) i = j;
        }
        const t = (d - pts[i]) / (pts[i + 1] - pts[i]);
        const result = [];
        for (let bandIdx = 0; bandIdx < H2H_BAND_WEIGHTS.length; bandIdx++) {
            const w = H2H_BAND_WEIGHTS[bandIdx][i] + t * (H2H_BAND_WEIGHTS[bandIdx][i + 1] - H2H_BAND_WEIGHTS[bandIdx][i]);
            result.push(Math.max(0, w));
        }
        const total = result.reduce((a, b) => a + b, 0);
        if (total > 0) return result.map(w => w / total);
        return result;
    }

    function choosePrimaryBand() {
        // Use difficulty-based weights for practice mode
        if (gameMode === 'practice' && typeof practiceDifficulty === 'number') {
            const weights = weightsForDifficulty(practiceDifficulty);
            const r = Math.random();
            let threshold = 0;
            for (let b = 0; b < weights.length; b++) {
                threshold += weights[b];
                if (r < threshold) return H2H_BAND_NAMES_ORDERED[b];
            }
            return H2H_BAND_NAMES_ORDERED[H2H_BAND_NAMES_ORDERED.length - 1];
        }
        // Default fixed weights for daily mode
        const r = Math.random();
        let threshold = 0;
        threshold += VERY_EASY_PROB; if (r < threshold) return "very_easy";
        threshold += EASY_PROB; if (r < threshold) return "easy";
        threshold += MEDIUM_PROB; if (r < threshold) return "medium";
        threshold += DIFFICULT_PROB; if (r < threshold) return "difficult";
        threshold += HARD_PROB; if (r < threshold) return "hard";
        threshold += VERY_HARD_PROB; if (r < threshold) return "very_hard";
        return "impossible";
    }

    function pickRandomPlate() {
        console.log('=== pickRandomPlate called ===');
        console.log('gameMode:', gameMode, 'solvedCount:', solvedCount, 'usedPlates.size:', usedPlates ? usedPlates.size : 'null');
        if (!platesReady || !ALL_PLATES.length) {
            resultEl.textContent = "No plates available.";
            resultEl.style.color = "red";
            return;
        }
        if ((gameMode==='daily' || gameMode==='h2h_challenge' || gameMode==='practice') && dailyPlateSequence && dailyPlateSequence.length) {
            const idx = usedPlates.size;
            console.log('Using sequence mode! Index:', idx, 'Sequence length:', dailyPlateSequence.length);

            if (idx>=dailyPlateSequence.length) {
                resultEl.textContent = "Ran out of plates! This shouldn't happen. Please report this bug.";
                resultEl.style.color = "red";
                endGame();
                return;
            }

            console.log('Daily/H2H mode - solvedCount:', solvedCount, 'TOTAL_PLATES:', TOTAL_PLATES);
            if (solvedCount >= TOTAL_PLATES) {
                console.log('Ending game - solved 10!');
                endGame();
                return;
            }

            const chosen = dailyPlateSequence[idx];
            usedPlates.add(chosen);
            currentPlate = chosen;
            plateEl.textContent = chosen;
            resultEl.textContent = "";
            plateLocked = false;
            checkButtonEl.disabled = false;
            skipButtonEl.disabled = false;
            wordInputEl.disabled = false;
            wordInputEl.readOnly = false;
            plateStartTime = performance.now();
            updateDifficultyDisplay(chosen);
            wordInputEl.value = "";
            wordInputEl.focus();
            return;
        }
        if (usedPlates.size===ALL_PLATES.length) {
            resultEl.textContent = "Seen all plates!";
            resultEl.style.color = "red";
            endGame();
            return;
        }
        const primaryBand = choosePrimaryBand();
        const startIndex = BAND_NAMES.indexOf(primaryBand);
        const bandOrder = [];
        for (let i=0;i<BAND_NAMES.length;i++) bandOrder.push(BAND_NAMES[(startIndex+i)%BAND_NAMES.length]);
        let chosen = null;
        for (const band of bandOrder) { chosen = pickRandomPlateFromBand(band); if (chosen) break; }
        if (!chosen) {
            const remaining = ALL_PLATES.filter(p=>!usedPlates.has(p));
            if (!remaining.length) { resultEl.textContent = "No unused plates."; resultEl.style.color = "red"; endGame(); return; }
            chosen = remaining[Math.floor(Math.random()*remaining.length)];
        }
        usedPlates.add(chosen);
        const jsCount = computeJsViableCount(chosen);
        if (jsCount<=0) {
            if (usedPlates.size===ALL_PLATES.length) { resultEl.textContent = "No viable words."; resultEl.style.color = "red"; endGame(); return; }
            pickRandomPlate();
            return;
        }
        currentPlate = chosen;
        plateEl.textContent = chosen;
        resultEl.textContent = "";
        plateLocked = false;
        checkButtonEl.disabled = false;
        skipButtonEl.disabled = false;
        wordInputEl.disabled = false;
        wordInputEl.readOnly = false;
        plateStartTime = performance.now();
        updateDifficultyDisplay(chosen);
        wordInputEl.value = "";
        wordInputEl.focus();
    }

    // --------- DIFFICULTY ---------
    function classifyDifficulty(score) {
        if (score >= 80) return "diff-hard";
        if (score >= 40) return "diff-med";
        return "diff-easy";
    }

    function updateDifficultyDisplay(plate) {
        if (!PLATE_DIFFICULTY || !PLATE_DIFFICULTY[plate]) {
            difficultyLabelEl.textContent = "Difficulty: \u2014";
            difficultyLabelEl.className = "difficulty diff-med";
        } else {
            const entry = PLATE_DIFFICULTY[plate];
            const diff = entry.difficulty;
            if (!diff || diff <= 0) {
                difficultyLabelEl.textContent = "Difficulty: \u2014";
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
    function updateProgressDisplay() {
        progressDisplayEl.textContent = `Solved: ${solvedCount} / ${TOTAL_PLATES}`;
    }

    function updateSkipButtonLabel() {
        const nextPenalty = (skipCount + 1) * 5;
        skipButtonEl.textContent = `Skip +${nextPenalty}s`;
    }

    function showStartGameButton() {
        startButtonEl.textContent = "Start Game";
        const ready = dictionaryReady && difficultyReady && platesReady;
        startButtonEl.disabled = !ready;
        startButtonEl.style.opacity = ready ? '1' : '0.5';
        startButtonEl.style.cursor = ready ? 'pointer' : 'not-allowed';
    }

    function showRestartGameButton() {
        startButtonEl.textContent = "Restart game";
        startButtonEl.disabled = false;
        startButtonEl.style.opacity = '1';
        startButtonEl.style.cursor = 'pointer';
    }

    function hideMainStartButton() {
        startButtonEl.disabled = true;
        startButtonEl.style.opacity = '0.5';
        startButtonEl.style.cursor = 'not-allowed';
    }

    function showChartButton() {
        if (gameHistory.length > 0) {
            // chart button hidden in web version
        }
    }

    function hideChartButton() {
        chartButtonEl.style.display = "none";
    }

    function resetGameState() {
        gameStarted = false;
        gameOver = false;
        solvedCount = 0;
        const psBtn = document.getElementById('practiceStatsBtn2');
        const erBtn = document.getElementById('expectedRunBtn');
        if (psBtn) { psBtn.disabled = true; psBtn.style.opacity = '0.4'; }
        if (erBtn) { erBtn.disabled = true; erBtn.style.opacity = '0.4'; }
        window._lastExpectedData = null;
        startTime = null;
        penaltySeconds = 0;
        skipCount = 0;
        plateLocked = false;
        usedPlates = new Set();
        plateStartTime = null;
        gameHistory = [];
        updateSkipButtonLabel();
        hideChartButton();

        if (timerIntervalId) clearInterval(timerIntervalId);
        timerIntervalId = null;

        plateEl.textContent = "---";
        difficultyLabelEl.textContent = "Difficulty: \u2014";
        difficultyLabelEl.className = "difficulty diff-med";
        viableCountLabelEl.textContent = "";
        timerDisplayEl.textContent = "Time: 0.0 s";
        updateProgressDisplay();
        resultEl.textContent = "";
        resultEl.style.color = "";
        wordInputEl.value = "";

        checkButtonEl.disabled = false;
        skipButtonEl.disabled = false;
        wordInputEl.disabled = false;
        wordInputEl.readOnly = false;

        while (historyBodyEl.firstChild) {
            historyBodyEl.removeChild(historyBodyEl.firstChild);
        }
        historyEmptyEl.style.display = "block";
    }

    function showCountdown() {
        return new Promise(resolve => {
            const overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:2000;';
            const num = document.createElement('div');
            num.style.cssText = 'font-size:6rem;font-weight:800;color:white;font-family:system-ui;';
            overlay.appendChild(num);
            document.body.appendChild(overlay);

            let count = 3;
            num.textContent = count;
            const interval = setInterval(() => {
                count--;
                if (count <= 0) {
                    clearInterval(interval);
                    overlay.remove();
                    resolve();
                } else {
                    num.textContent = count;
                }
            }, 1000);
        });
    }

    async function beginNewRun() {
        startButtonEl.classList.remove('pulse-button');
        resetGameState();
        gameStarted = true;
        gameOver = false;

        // Scroll to plate on mobile
        if (window.innerWidth <= 768) {
            const carWrapper = document.querySelector('.car-wrapper');
            if (carWrapper) {
                carWrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }

        // 3, 2, 1 countdown
        await showCountdown();

        startTime = performance.now();
        timerIntervalId = setInterval(updateTimer, 50);
        updateProgressDisplay();

        if (gameMode === 'daily' || gameMode === 'h2h_challenge') {
            document.getElementById('dailyChallengeBtn').disabled = true;
            document.getElementById('practiceBtn').disabled = true;
        }

        if (gameMode === 'daily' || gameMode === 'h2h_challenge') {
            startButtonEl.disabled = true;
            startButtonEl.style.opacity = '0.5';
            startButtonEl.style.cursor = 'not-allowed';
        }

        // Precompute 200-plate sequence for practice mode
        if (gameMode === 'practice') {
            dailyPlateSequence = generateChallengeSequence(practiceDifficulty);
            console.log('[Practice] Precomputed', dailyPlateSequence.length, 'plates at difficulty', practiceDifficulty);
        }

        if (gameMode==='daily' && currentUser) {
            try {
                const { data } = await sb.rpc('start_daily_run', {
                    p_date: getTodayString()
                });
                if (data && data.length > 0) {
                    const run = data[0];
                    currentDailyRunId = run.run_id;
                    if (run.state === 'completed' || run.state === 'in_progress') {
                        alert('You have already played today!');
                        resetGameState();
                        return;
                    }
                }
            } catch (e) {
                console.error('Failed to start daily run:', e);
            }

            const { data: plateRow } = await sb
                .from('daily_plates')
                .select('plates')
                .eq('date', getTodayString())
                .single();
            if (plateRow) {
                dailyPlateSequence = plateRow.plates;
                plateSequenceIndex = 0;
            }

            window.onbeforeunload = e => {
                if (gameStarted && !gameOver && gameMode==='daily') {
                    e.preventDefault();
                    return 'Leave? Daily attempt will be used!';
                }
            };
        }

        if (gameMode === 'h2h_challenge') {
            window.onbeforeunload = e => {
                if (gameStarted && !gameOver && gameMode==='h2h_challenge') {
                    e.preventDefault();
                    return 'Leave? Your challenge attempt will be used!';
                }
            };
        }

        pickRandomPlate();
    }

    async function startGameFromModal() {
        const ready = dictionaryReady && difficultyReady && platesReady;
        if (!ready) {
            resultEl.textContent = "Still loading\u2026";
            resultEl.style.color = "red";
            return;
        }

        if (ALL_PLATES.length === 0) {
            resultEl.textContent = "No viable plates to start the game.";
            resultEl.style.color = "red";
            return;
        }

        closeGameModal();
        hideChartButton();

        hasStartedOnce = true;
        if (gameMode !== 'daily' && gameMode !== 'h2h_challenge') {
            showRestartGameButton();
        }

        await beginNewRun();
    }

    async function startOrRestartFromMain() {
        // Submit practice stats from previous run before restarting
        if (gameMode === 'practice' && gameHistory.length > 0) {
            submitPracticePlateStats();
        }
        practiceStatsSubmitted = false;
        unlockAudio();
        document.getElementById('practiceSettings').style.display = 'none';
        document.getElementById('practiceSettingsBtn').style.display = 'none';
        const ready = dictionaryReady && difficultyReady && platesReady;
        if (!ready) {
            resultEl.textContent = "Still loading\u2026";
            resultEl.style.color = "red";
            return;
        }

        if (ALL_PLATES.length === 0) {
            resultEl.textContent = "No viable plates to start the game.";
            resultEl.style.color = "red";
            return;
        }

        hasStartedOnce = true;
        if (gameMode !== 'daily' && gameMode !== 'h2h_challenge') {
            showRestartGameButton();
        }
        hideChartButton();

        await beginNewRun();
    }

    function updateTimer() {
        if (!gameStarted || !startTime) return;
        const baseElapsedSec = (performance.now() - startTime) / 1000;
        const totalSec = baseElapsedSec + penaltySeconds;
        if (gameMode === 'practice' && !practiceTimed) {
            timerDisplayEl.textContent = "UNTIMED";
        } else {
            timerDisplayEl.textContent = "Time: " + totalSec.toFixed(2) + " s";
        }

        // H2H timeout removed — handled server-side
    }

    function endGame() {
        if (gameOver) return;
        gameOver = true;
        gameStarted = false;
        plateLocked = true;

        // Enable practice buttons
        if (solvedCount >= 10) {
            const psBtn = document.getElementById('practiceStatsBtn2');
            const erBtn = document.getElementById('expectedRunBtn');
            if (psBtn) { psBtn.disabled = false; psBtn.style.opacity = '1'; }
            if (erBtn) { erBtn.disabled = false; erBtn.style.opacity = '1'; }
        }

        if (!startTime) return;

        const baseElapsedSec = (performance.now() - startTime) / 1000;
        const totalSec = baseElapsedSec + penaltySeconds;

        if (timerIntervalId) {
            clearInterval(timerIntervalId);
            timerIntervalId = null;
        }

        if (gameMode === 'practice' && !practiceTimed) {
            resultEl.textContent = `Finished! ${solvedCount} plates solved.`;
        } else {
            resultEl.textContent = `Finished! Time: ${totalSec.toFixed(2)} s`;
        }
        resultEl.style.color = "green";
        wordInputEl.blur();

        checkButtonEl.disabled = true;
        skipButtonEl.disabled = true;
        wordInputEl.disabled = true;
        wordInputEl.readOnly = true;

        openEndModal(totalSec);
        if (gameMode !== 'daily' && gameMode !== 'h2h_challenge') {
            showRestartGameButton();
        }
        showChartButton();
        document.getElementById('dailyChallengeBtn').disabled = false;
        document.getElementById('practiceBtn').disabled = false;
        document.getElementById('practiceSettingsBtn').style.display = '';
        window.onbeforeunload = null;

        if (currentUser) {
            if (gameMode === 'daily') {
                saveScore(totalSec, solvedCount, skipCount);
            } else if (gameMode === 'h2h_challenge' && currentH2HRunId) {
                saveChallengeResult(totalSec, solvedCount, skipCount);
            } else if (gameMode === 'practice') {
                submitPracticePlateStats();
            }
        }
    }

    function savePracticeStatsLocally() {
        console.log('[Practice] savePracticeStatsLocally called', { gameMode, histLen: gameHistory.length, submitted: practiceStatsSubmitted });
        if (gameMode !== 'practice' || gameHistory.length === 0 || practiceStatsSubmitted) {
            console.log('[Practice] savePracticeStatsLocally SKIPPED');
            return;
        }
        const data = gameHistory.map(entry => ({
            plate: entry.plate,
            skipped: entry.skipped || false,
            thinking_seconds: Math.floor((entry.thinkingSeconds || 0) * 100) / 100,
            word: entry.skipped ? null : (entry.word || null)
        }));
        localStorage.setItem('pendingPracticeStats', JSON.stringify(data));
    }

    let practiceStatsSubmitted = false;

    async function submitPracticePlateStats() {
        console.log('[Practice] submitPracticePlateStats called', { user: !!currentUser, histLen: gameHistory.length, submitted: practiceStatsSubmitted });
        if (!currentUser || gameHistory.length === 0 || practiceStatsSubmitted) {
            console.log('[Practice] submitPracticePlateStats SKIPPED');
            return;
        }
        practiceStatsSubmitted = true;
        localStorage.removeItem('pendingPracticeStats');
        console.log('[Practice] SUBMITTING to server...');
        try {
            const rows = gameHistory.map(entry => ({
                user_id: currentUser.id,
                plate: entry.plate,
                skipped: entry.skipped || false,
                thinking_seconds: Math.floor((entry.thinkingSeconds || 0) * 100) / 100,
                word: entry.skipped ? null : (entry.word || null)
            }));
            await sb.from('practice_plate_stats').insert(rows);
            console.log('[Practice] Submitted', rows.length, 'plate stats');
        } catch (e) {
            console.warn('[Practice] Stats submit error:', e);
        }
    }

    let pendingPracticeSubmitted = false;
    async function submitPendingPracticeStats() {
        console.log('[Practice] submitPendingPracticeStats called', { user: !!currentUser, hasPending: !!localStorage.getItem('pendingPracticeStats'), alreadyDone: pendingPracticeSubmitted });
        if (!currentUser || pendingPracticeSubmitted) return;
        const saved = localStorage.getItem('pendingPracticeStats');
        if (!saved) { console.log('[Practice] No pending stats'); return; }
        pendingPracticeSubmitted = true;
        localStorage.removeItem('pendingPracticeStats');
        try {
            const data = JSON.parse(saved);
            if (!data || data.length === 0) return;
            const rows = data.map(entry => ({
                user_id: currentUser.id,
                plate: entry.plate,
                skipped: entry.skipped,
                thinking_seconds: entry.thinking_seconds,
                word: entry.word || null
            }));
            await sb.from('practice_plate_stats').insert(rows);
            console.log('[Practice] Submitted', rows.length, 'pending plate stats from previous session');
        } catch (e) {
            console.warn('[Practice] Pending stats error:', e);
        }
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
            const source = (gameMode === 'practice' || gameMode === 'h2h_challenge') ? 'practice' : 'daily';
            showViableWordsForPlate(plate, gameStarted && !gameOver, source);
        });
    }

    function addToHistoryWithAnimation(
        plate, word, matchIndices, fromRectWord, diffScore, timeLabel, onComplete, seconds, isSkip
    ) {
        if (!plate || !word) {
            if (onComplete) onComplete();
            return;
        }

        historyEmptyEl.style.display = "none";

        const row = document.createElement("tr");
        row.style.opacity = "0";

        const plateTd = document.createElement("td");
        const wordTd = document.createElement("td");
        const timeTd = document.createElement("td");

        plateTd.textContent = plate;

        wordTd.textContent = word;

        if (gameMode === 'practice' && !practiceTimed) {
            timeTd.textContent = '';
        } else {
            timeTd.textContent = timeLabel || "\u2014";
        }

        // Apply background color based on time
        if (isSkip) {
            row.style.background = '#1f2937';
            row.style.color = '#fff';
            plateTd.style.color = '#ef4444';
            wordTd.style.color = '#ef4444';
            timeTd.style.color = '#ef4444';
        } else if (typeof seconds === 'number') {
            row.style.background = getTimeColor(seconds);
            if (seconds > 15) {
                row.style.color = '#fff';
            }
        }
        row.style.borderRadius = '8px';

        row.appendChild(plateTd);
        row.appendChild(wordTd);
        row.appendChild(timeTd);

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
        const wordFrom = fromRectWord || wordInputEl.getBoundingClientRect();
        const plateTo = plateTd.getBoundingClientRect();
        const wordTo = wordTd.getBoundingClientRect();

        const plateClone = createFloatingLabel(plate, plateFrom, plateTo, "float-label-plate");
        const wordClone = createFloatingLabel(word, wordFrom, wordTo, "float-label-word");

        if (typeof onComplete === "function") {
            onComplete();
        }

        const animDuration = 400;
        setTimeout(() => {
            row.style.opacity = "1";
            [plateClone, wordClone].forEach(clone => {
                if (clone && clone.parentNode) clone.parentNode.removeChild(clone);
            });
        }, animDuration);
    }

    // --------- WORDS MODAL (SORTING) ---------
    function setWordsSortMode(mode) {
        currentWordsModalSortMode = mode;

        if (wordsSortAlphaBtnEl && wordsSortLengthBtnEl) {
            if (mode === "alpha") {
                wordsSortAlphaBtnEl.classList.add("active");
                wordsSortLengthBtnEl.classList.remove("active");
            } else {
                wordsSortAlphaBtnEl.classList.remove("active");
                wordsSortLengthBtnEl.classList.add("active");
            }
        }

        if (window.currentViableWords) {
            displayViableWords(mode);
        } else {
            renderWordsList(mode);
        }
    }

    function renderWordsList(sortMode) {
        window.currentViableWords = null;
        window.currentPlateName = null;

        wordsModalListEl.innerHTML = "";

        const plate = currentWordsModalPlate;
        if (!plate || !currentWordsModalMatches || currentWordsModalMatches.length === 0) {
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
            const indexSet = new Set(indices);

            let html = "";
            for (let i = 0; i < w.length; i++) {
                const ch = w[i];
                if (indexSet.has(i)) {
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
        wordsModalStatusEl.textContent = "Finding viable words\u2026";

        currentWordsModalPlate = plate;
        currentWordsModalMatches = [];
        setWordsSortMode("alpha");

        wordsModalBackdropEl.classList.add("show");

        const matches = [];
        for (const w of WORDS) {
            if (wordMatchesPlate(plate, w)) {
                matches.push(w);
            }
        }

        matches.sort();
        currentWordsModalMatches = matches;

        const countFromScan = matches.length;
        wordsModalStatusEl.textContent =
            `${countFromScan.toLocaleString()} viable words`;

        renderWordsList(currentWordsModalSortMode);
    }

    function closeWordsModal() {
        wordsModalBackdropEl.classList.remove("show");
    }

    // --------- GAME MODAL ---------
    function openStartModal() {
        gameModalMode = "start";
        gameModalTitleEl.textContent = "Daily Challenge";
        gameModalBodyEl.innerHTML = `
            <p style="margin-bottom:1rem;">${gameMode==='daily'?'<strong>One attempt per day</strong> \u2013 do not exit or refresh mid-game.':'<strong>Practice Mode:</strong> Unlimited random plays!'}</p>
            <p><strong>How it works:</strong></p>
            <ul>
                <li>You will see plates one after another until you correctly solve <strong>${TOTAL_PLATES}</strong>.</li>
                <li>Enter a word that contains the three plate letters <em>in order</em> (not necessarily consecutively).</li>
                <li>The first instance of each letter must come in order.</li>
                <li>You can press <strong>Skip</strong>, but it adds an increasing time penalty: +5s, then +10s, +15s, ...</li>
                <li>Click any solved plate in the table to see <strong>all</strong> viable words for that plate.</li>
            </ul>
        `;

        const ready = dictionaryReady && difficultyReady && platesReady;
        gameModalPrimaryBtnEl.disabled = !ready;
        gameModalPrimaryBtnEl.textContent = ready ? "Start Game" : "Loading...";

        gameModalSecondaryBtnEl.style.display = "none";

        gameModalBackdropEl.classList.add("show");
    }

    function openEndModal(finalTimeSec) {
        gameModalMode = "end";
        gameModalTitleEl.textContent = "Run complete!";

        let expectedHtml = '';
        if (gameMode === 'practice') {
            expectedHtml = '<p id="expectedTimeText" style="color:#6b7280;">Calculating expected time...</p>';
            computeExpectedTime(finalTimeSec);
        }

        gameModalBodyEl.innerHTML = `
            <p>You solved <strong>${solvedCount}</strong> plates in
            <strong>${finalTimeSec.toFixed(2)} seconds</strong> (including skip penalties).</p>
            ${expectedHtml}
            ${gameMode === 'daily' ? '<p style="margin-top:1rem; color:#92400e; background:#fef3c7; padding:8px; border-radius:4px;"><strong>Daily Challenge Complete!</strong> Come back tomorrow for a new challenge.</p>' : ''}
            ${gameMode === 'h2h_challenge' ? '<p style="margin-top:1rem; color:#92400e; background:#fef3c7; padding:8px; border-radius:4px;"><strong>H2H Challenge Complete!</strong></p>' : ''}
        `;

        if (gameMode === 'daily' || gameMode === 'h2h_challenge') {
            gameModalPrimaryBtnEl.style.display = "none";
        } else {
            gameModalPrimaryBtnEl.disabled = false;
            gameModalPrimaryBtnEl.textContent = "Play again";
            gameModalPrimaryBtnEl.style.display = "inline-block";
        }

        gameModalSecondaryBtnEl.style.display = "inline-block";
        gameModalSecondaryBtnEl.textContent = "Plate Stats";

        gameModalBackdropEl.classList.add("show");
    }

    async function computeExpectedTime(actualTime) {
        // Use the full plate sequence (up to 200), not just the 10 played
        const plateSequence = dailyPlateSequence || gameHistory.map(e => e.plate);
        if (plateSequence.length === 0) return;

        try {
            // Fetch stats for all plates we might traverse (fetch more than 10 since skips mean we go further)
            const plateStats = {}; // plate -> { medianThink, skipRate }

            // Batch fetch: get data for first 50 plates (generous buffer for high skip rates)
            const platesToFetch = plateSequence.slice(0, 50);

            for (const plate of platesToFetch) {
                const [practiceRes, dailyRes, h2hRes] = await Promise.all([
                    sb.from('practice_plate_stats').select('thinking_seconds, skipped').eq('plate', plate),
                    sb.from('daily_run_entries').select('thinking_seconds, skipped').eq('plate', plate),
                    sb.from('h2h_run_entries').select('thinking_seconds, skipped').eq('plate', plate)
                ]);

                const allRows = [
                    ...(practiceRes.data || []),
                    ...(dailyRes.data || []),
                    ...(h2hRes.data || [])
                ].filter(r => r.thinking_seconds <= 400);

                if (allRows.length > 0) {
                    // Median thinking time (all players, including skips)
                    const times = allRows.map(r => r.thinking_seconds).sort((a, b) => a - b);
                    const mid = Math.floor(times.length / 2);
                    const median = times.length % 2 === 0 ? (times[mid - 1] + times[mid]) / 2 : times[mid];
                    const skipRate = allRows.filter(r => r.skipped).length / allRows.length;
                    plateStats[plate] = { medianThink: median, skipRate };
                }
            }

            // Walk through sequence until 10 solves
            let solves = 0;
            let skips = 0;
            let totalThinking = 0;
            let platesTraversed = 0;
            const breakdown = [];

            for (const plate of plateSequence) {
                const stats = plateStats[plate];
                if (!stats) continue;

                const solveContrib = 1 - stats.skipRate;
                const solvesNeeded = 10 - solves;

                if (solveContrib > 0 && solvesNeeded <= solveContrib) {
                    // This plate gets us to 10 — prorate it
                    const fraction = solvesNeeded / solveContrib;
                    totalThinking += stats.medianThink * fraction;
                    solves += solveContrib * fraction;
                    skips += stats.skipRate * fraction;
                    platesTraversed++;
                    breakdown.push({
                        plate,
                        medianThink: stats.medianThink * fraction,
                        skipRate: stats.skipRate,
                        fraction,
                        cumulSolves: solves,
                        cumulSkips: skips
                    });
                    break;
                }

                // Full plate
                totalThinking += stats.medianThink;
                solves += solveContrib;
                skips += stats.skipRate;
                platesTraversed++;
                breakdown.push({
                    plate,
                    medianThink: stats.medianThink,
                    skipRate: stats.skipRate,
                    fraction: 1,
                    cumulSolves: solves,
                    cumulSkips: skips
                });
            }

            // Calculate escalating skip penalty: 5 + 10 + 15 + ...
            let penalty = 0;
            let remainingSkips = skips;
            let penaltyLevel = 1;
            while (remainingSkips > 0) {
                const thisSkip = Math.min(remainingSkips, 1);
                penalty += thisSkip * (penaltyLevel * 5);
                remainingSkips -= thisSkip;
                penaltyLevel++;
            }

            const expectedTime = totalThinking + penalty;

            // Store for the Expected Run button
            window._lastExpectedData = { expectedTime, actualTime, totalThinking, penalty, skips, breakdown, platesTraversed };

            const el = document.getElementById('expectedTimeText');
            if (el && platesTraversed > 0) {
                const diff = actualTime - expectedTime;
                const absDiff = Math.abs(diff).toFixed(1);
                const faster = diff < 0;
                const color = faster ? '#16a34a' : '#dc2626';
                const word = faster ? 'faster' : 'slower';

                // Build breakdown table
                let bkHtml = '<div style="max-height:300px;overflow-y:auto;margin-top:8px;"><table style="width:100%;border-collapse:collapse;font-size:0.8rem;">';
                bkHtml += '<thead><tr style="background:#f3f4f6;"><th style="padding:4px 6px;text-align:left;">#</th><th style="padding:4px 6px;text-align:left;">Plate</th><th style="padding:4px 6px;text-align:right;">Median</th><th style="padding:4px 6px;text-align:right;">Skip Rate</th><th style="padding:4px 6px;text-align:right;">Solves</th><th style="padding:4px 6px;text-align:right;">Skips</th></tr></thead><tbody>';
                breakdown.forEach((b, i) => {
                    const isProrated = b.fraction < 1;
                    const rowStyle = isProrated ? 'border-bottom:1px solid #f0f0f0;background:#f9fafb;font-style:italic;' : 'border-bottom:1px solid #f0f0f0;';
                    bkHtml += `<tr style="${rowStyle}">`;
                    bkHtml += `<td style="padding:4px 6px;color:#9ca3af;">${i + 1}</td>`;
                    bkHtml += `<td style="padding:4px 6px;font-weight:600;font-family:monospace;">${b.plate}${isProrated ? ' <span style="font-size:0.7rem;color:#9ca3af;font-weight:400;">(' + Math.round(b.fraction * 100) + '%)</span>' : ''}</td>`;
                    bkHtml += `<td style="padding:4px 6px;text-align:right;">${b.medianThink.toFixed(1)}s</td>`;
                    bkHtml += `<td style="padding:4px 6px;text-align:right;">${Math.round(b.skipRate * 100)}%</td>`;
                    bkHtml += `<td style="padding:4px 6px;text-align:right;">${b.cumulSolves.toFixed(2)}</td>`;
                    bkHtml += `<td style="padding:4px 6px;text-align:right;">${b.cumulSkips.toFixed(2)}</td>`;
                    bkHtml += `</tr>`;
                });
                bkHtml += '</tbody></table>';
                bkHtml += `<div style="font-size:0.8rem;color:#6b7280;margin-top:6px;padding:6px;background:#f9fafb;border-radius:6px;">`;
                bkHtml += `Thinking: ${totalThinking.toFixed(1)}s + Penalty: ${penalty.toFixed(1)}s (${skips.toFixed(1)} skips) = <strong>${expectedTime.toFixed(1)}s</strong>`;
                bkHtml += `</div></div>`;

                el.innerHTML = `The expected time for this practice round was <a href="#" onclick="event.preventDefault();document.getElementById('expectedBreakdown').style.display=document.getElementById('expectedBreakdown').style.display==='none'?'block':'none';" style="font-weight:700;color:#2563eb;text-decoration:underline;">${expectedTime.toFixed(1)}s</a>.
                    <br><span style="color:${color};font-weight:600;">You were ${absDiff}s ${word} than expected.</span>
                    <div id="expectedBreakdown" style="display:none;">${bkHtml}</div>`;
            }
        } catch (e) {
            console.error('Expected time error:', e);
            const el = document.getElementById('expectedTimeText');
            if (el) el.style.display = 'none';
        }
    }

    function closeGameModal() {
        gameModalBackdropEl.classList.remove("show");
    }

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
            return `"${word}" doesn't work for <strong>${plateUpper}</strong>.<br>` +
                   `It's missing the ${letterWord}: <strong>${missingList}</strong>.`;
        }

        const firstOccurrences = [];
        for (const ch of plateUpper) {
            const idx = wordUpper.indexOf(ch);
            if (idx !== -1) {
                firstOccurrences.push({ ch, idx });
            }
        }

        firstOccurrences.sort((a, b) => a.idx - b.idx);
        const wordOrder = firstOccurrences.map(x => x.ch).join(" \u2192 ");
        const plateOrder = plateUpper.split("").join(" \u2192 ");
        const lettersList = plateUpper.split("").join(", ");

        return `"${word}" doesn't work for <strong>${plateUpper}</strong>.<br>` +
               `In your word, the first <strong>${lettersList}</strong> appear in this order: <strong>${wordOrder}</strong>.<br>` +
               `The plate <strong>${plateUpper}</strong> requires them in this order: <strong>${plateOrder}</strong>.`;
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
                labelText = `${plate} \u2014 skipped`;
            } else {
                labelText = `${plate} \u2014 "${entry.word}"`;
            }
            labels.push(labelText);

            const think = entry.thinkingSeconds != null ? entry.thinkingSeconds : 0;
            const pen   = entry.penaltySeconds != null ? entry.penaltySeconds : 0;

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
                        stack: "time"
                    },
                    {
                        type: "bar",
                        label: "Skip penalty (s)",
                        data: penaltyData,
                        backgroundColor: "rgba(220, 38, 38, 0.8)",
                        stack: "time"
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
                        yAxisID: "y"
                    }
                ],
                _plates: platesForChart
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: "bottom" },
                    tooltip: {
                        callbacks: {
                            title: function(items) {
                                if (!items || !items.length) return "";
                                const idx = items[0].dataIndex;
                                const plate = resultsChart.config.data._plates[idx];
                                const entry = gameHistory[idx];
                                if (entry.skipped) return `${plate} \u2014 skipped`;
                                return `${plate} \u2014 "${entry.word}"`;
                            },
                            label: function(context) {
                                const label = context.dataset.label || "";
                                const value = context.parsed.y;
                                return `${label}: ${value.toFixed(2)}s`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        stacked: true,
                        grid: { display: false, drawBorder: false },
                        ticks: { autoSkip: false, maxRotation: 45, minRotation: 0 }
                    },
                    y: {
                        stacked: true,
                        title: { display: true, text: "Seconds" },
                        grid: { display: false, drawBorder: false }
                    }
                },
                onClick: (evt, elements) => {
                    if (!elements.length) return;
                    const index = elements[0].index;
                    const plate = resultsChart.config.data._plates[index];
                    openWordsModal(plate);
                }
            }
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
    function checkWord() {
        const rawWord = wordInputEl.value.trim();
        if (!rawWord) return;

        if (!gameStarted) {
            resultEl.textContent = "Press Start to begin the game.";
            resultEl.style.color = "red";
            return;
        }
        if (gameOver) {
            resultEl.textContent = "Game over. Press Restart game to play again.";
            resultEl.style.color = "red";
            return;
        }
        if (plateLocked) return;

        if (rawWord.length < 4) {
            resultEl.textContent = "Words must be 4 or more letters.";
            resultEl.style.color = "red";
            playSFX('wrong');
            return;
        }

        if (PROFANITY.has(rawWord.toLowerCase())) {
            resultEl.textContent = "Not tolerated in a family game.";
            resultEl.style.color = "red";
            playSFX('wrong');
            return;
        }

        if (!DICTIONARY.has(rawWord.toUpperCase())) {
            resultEl.textContent = `"${rawWord}" is not in the dictionary.`;
            resultEl.style.color = "red";
            playSFX('wrong');
            return;
        }

        const matchIndices = getPlateMatchIndices(currentPlate, rawWord);
        if (!matchIndices) {
            const html = explainPlateMismatch(currentPlate, rawWord);
            resultEl.innerHTML = html;
            resultEl.style.color = "red";
            playSFX('wrong');
            return;
        }

        plateLocked = true;
        checkButtonEl.disabled = true;
        skipButtonEl.disabled = true;
        wordInputEl.readOnly = true;

        solvedCount++;
        updateProgressDisplay();

        resultEl.textContent = `"${rawWord}" matches ${currentPlate}.`;
        resultEl.style.color = "green";
        playSFX('correct');

        const plate = currentPlate;
        const word = rawWord.toLowerCase();
        const diffScore = getPlateDifficultyScore(plate);

        let timeLabel = "\u2014";
        let thinkingSeconds = 0;
        if (plateStartTime != null) {
            thinkingSeconds = (performance.now() - plateStartTime) / 1000;
            timeLabel = `${thinkingSeconds.toFixed(2)}s`;
        }

        gameHistory.push({
            plate, word, skipped: false, thinkingSeconds, penaltySeconds: 0
        });

        addToHistoryWithAnimation(
            plate, word, matchIndices, null, diffScore, timeLabel,
            () => {
                if (solvedCount >= TOTAL_PLATES) endGame();
                else pickRandomPlate();
            },
            thinkingSeconds, false
        );
    }

    let skipCooldown = false;
    function handleSkip() {
        console.log('=== SKIP CLICKED ===');
        if (skipCooldown) return;
        skipCooldown = true;
        setTimeout(() => { skipCooldown = false; }, 500);
        if (!gameStarted) {
            resultEl.textContent = "Press Start to begin the game.";
            resultEl.style.color = "red";
            return;
        }
        if (gameOver) {
            resultEl.textContent = "Game over. Press Restart game to play again.";
            resultEl.style.color = "red";
            return;
        }
        if (!currentPlate) return;
        if (plateLocked) return;

        plateLocked = true;
        checkButtonEl.disabled = true;
        skipButtonEl.disabled = true;
        wordInputEl.readOnly = true;

        skipCount += 1;
        const added = skipCount * 5;
        penaltySeconds += added;

        resultEl.textContent = `Skipped ${currentPlate}. +${added}s penalty.`;
        resultEl.style.color = "orange";
        playSFX('skip');

        const plate = currentPlate;
        const penaltyLabel = '\u274C';
        const diffScore = getPlateDifficultyScore(plate);
        const skipRect = skipButtonEl.getBoundingClientRect();

        let timeLabel = "\u2014";
        let thinkingSeconds = 0;
        if (plateStartTime != null) {
            thinkingSeconds = (performance.now() - plateStartTime) / 1000;
            timeLabel = `${thinkingSeconds.toFixed(2)}s (+${added}s)`;
        }

        gameHistory.push({
            plate, word: "skipped", skipped: true, thinkingSeconds, penaltySeconds: added
        });

        addToHistoryWithAnimation(
            plate, penaltyLabel, null, skipRect, diffScore, timeLabel,
            () => {
                updateSkipButtonLabel();
                pickRandomPlate();
            },
            null, true
        );
    }

    // --------- INIT ---------
    startButtonEl.disabled = true;
    hideMainStartButton();
    hideChartButton();
    updateSkipButtonLabel();

    startButtonEl.addEventListener("click", startOrRestartFromMain);
    checkButtonEl.addEventListener("click", checkWord);
    skipButtonEl.addEventListener("click", handleSkip);
    chartButtonEl.addEventListener("click", openChartModal);

    wordInputEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter") checkWord();
    });

    wordsModalCloseBtnEl.addEventListener("click", closeWordsModal);
    wordsModalCloseBtnBottomEl.addEventListener("click", closeWordsModal);
    wordsModalBackdropEl.addEventListener("click", (e) => {
        if (e.target === wordsModalBackdropEl) closeWordsModal();
    });

    // Sort buttons replaced by Common/Viable/Used tabs
    if (wordsSortAlphaBtnEl) wordsSortAlphaBtnEl.addEventListener("click", () => setWordsSortMode("alpha"));
    if (wordsSortLengthBtnEl) wordsSortLengthBtnEl.addEventListener("click", () => setWordsSortMode("length"));

    gameModalPrimaryBtnEl.addEventListener("click", () => {
        if (gameModalMode === "start") startGameFromModal();
        else if (gameModalMode === "end") startGameFromModal();
    });

    gameModalSecondaryBtnEl.addEventListener("click", () => {
        closeGameModal();
        if (gameMode === 'practice') {
            showPracticePlateStatsModal();
        } else {
            openChartModal();
        }
    });

    gameModalCloseBtnEl.addEventListener("click", () => {
        closeGameModal();
        if (!gameStarted && !gameOver && gameModalMode === "start") showStartGameButton();
    });

    gameModalBackdropEl.addEventListener("click", (e) => {
        if (e.target === gameModalBackdropEl) {
            closeGameModal();
            if (!gameStarted && !gameOver && gameModalMode === "start") showStartGameButton();
        }
    });

    chartModalCloseBtnEl.addEventListener("click", closeChartModal);
    chartModalCloseBtnBottomEl.addEventListener("click", closeChartModal);
    chartModalBackdropEl.addEventListener("click", (e) => {
        if (e.target === chartModalBackdropEl) closeChartModal();
    });


    // Highlight plate letters in a word
    function highlightPlateInWord(plate, word) {
        const upperWord = word.toUpperCase();
        const upperPlate = plate.toUpperCase();
        let result = '';
        let plateIndex = 0;

        for (let i = 0; i < word.length; i++) {
            if (plateIndex < upperPlate.length && upperWord[i] === upperPlate[plateIndex]) {
                result += `<span style="color:#16a34a;font-weight:700;">${word[i]}</span>`;
                plateIndex++;
            } else {
                result += `<span style="color:#000000;">${word[i]}</span>`;
            }
        }

        return result;
    }

    // View player run details
    async function viewPlayerRun(userId, dateString, userName, totalTime, percentile, median, totalPlayers, rank) {
        const backdrop = document.getElementById('runDetailsModalBackdrop');
        const titleEl = document.getElementById('runDetailsModalTitle');
        const contentEl = document.getElementById('runDetailsContent');

        titleEl.textContent = `${userName} | ${formatDateForDisplay(dateString)}`;
        contentEl.innerHTML = '<p style="text-align:center;color:#6b7280;padding:20px;">Loading...</p>';
        backdrop.classList.add('show');

        try {
            const data = await loadPlayerHistory(userId, dateString);

            if (!data || !data.history || data.history.length === 0) {
                contentEl.innerHTML = '<p style="text-align:center;color:#6b7280;padding:20px;">Detailed breakdown not available</p>';
                return;
            }

            // Stats card
            let html = '<div style="background:#f9fafb;border-radius:12px;padding:16px;margin-bottom:20px;">';
            html += `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #e5e7eb;">`;
            html += `<span>Total time</span><span style="font-weight:600;color:#16a34a;">${data.totalTime.toFixed(2)}s${percentile ? '  (Top ' + percentile + '%)' : ''}</span>`;
            html += `</div>`;
            if (median) {
                html += `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #e5e7eb;">`;
                html += `<span>Median time</span><span style="color:#6b7280;">${parseFloat(median).toFixed(2)}s</span>`;
                html += `</div>`;
            }
            if (rank && totalPlayers) {
                html += `<div style="display:flex;justify-content:space-between;padding:8px 0;">`;
                html += `<span>Global rank</span><span style="color:#6b7280;">${rank} of ${totalPlayers}</span>`;
                html += `</div>`;
            }
            html += '</div>';

            // Plates header
            html += '<div style="font-size:0.8rem;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;padding-left:4px;">Plates</div>';

            // Plate rows with time gradient
            data.history.forEach((entry) => {
                const time = entry.skipped
                    ? (entry.thinkingSeconds || 0) + (entry.penaltySeconds || 0)
                    : entry.thinkingSeconds;
                const bgColor = entry.skipped ? '#1f2937' : getTimeColor(time);
                const textColor = entry.skipped ? '#ef4444' : '#000';
                const plateColor = entry.skipped ? '#ef4444' : '#000';
                html += `<div onclick="showViableWordsForPlate('${entry.plate}')" style="display:flex;align-items:center;padding:12px;margin-bottom:2px;border-radius:8px;background:${bgColor};cursor:pointer;">`;
                html += `<span style="font-weight:700;min-width:50px;color:${plateColor};">${entry.plate}</span>`;
                html += `<span style="color:#6b7280;margin:0 8px;">|</span>`;

                if (entry.skipped) {
                    html += `<span style="flex:1;color:#ef4444;font-weight:500;">skipped</span>`;
                    html += `<span style="color:#ef4444;font-weight:600;">${entry.thinkingSeconds.toFixed(2)}s</span>`;
                    html += `<span style="color:#ef4444;margin-left:4px;">(+${entry.penaltySeconds}s)</span>`;
                } else {
                    html += `<span style="flex:1;color:${textColor};font-weight:500;">${entry.word || ''}</span>`;
                    html += `<span style="color:${textColor};font-weight:600;">${time.toFixed(2)}s</span>`;
                }

                html += `<span style="margin-left:8px;color:${entry.skipped ? '#ef4444' : '#9ca3af'};">&#8250;</span>`;
                html += `</div>`;
            });

            contentEl.innerHTML = html;

        } catch (error) {
            console.error('Error loading run details:', error);
            contentEl.innerHTML = '<p style="text-align:center;color:#dc2626;">Failed to load run details</p>';
        }
    }

    window.viewPlayerRun = viewPlayerRun;

    function closeRunDetailsModal() {
        const backdrop = document.getElementById('runDetailsModalBackdrop');
        if (backdrop) backdrop.classList.remove('show');
    }
    window.closeRunDetailsModal = closeRunDetailsModal;

    // === COMMON WORDS ===
    async function loadCommonWords() {
        try {
            const res = await fetch('common-words.txt');
            const text = await res.text();
            for (const line of text.split(/\r?\n/)) {
                const w = line.trim().toLowerCase();
                if (w && /^[a-z]+$/.test(w)) COMMON_WORDS.add(w);
            }
            console.log('Loaded', COMMON_WORDS.size, 'common words');
        } catch(e) {
            console.warn('Could not load common-words.txt:', e);
        }
    }
    loadCommonWords();

    async function loadProfanity() {
        try {
            const res = await fetch('profanity.txt');
            const text = await res.text();
            for (const line of text.split(/\r?\n/)) {
                const w = line.trim().toLowerCase();
                if (w) PROFANITY.add(w);
            }
        } catch(e) {}
    }
    loadProfanity();

    function getViableWordsForPlate(plate) {
        const viable = [];
        if (WORDS && WORDS.length > 0) {
            for (const word of WORDS) {
                if (wordMatchesPlate(plate, word)) viable.push(word);
            }
        }
        console.log('getViableWordsForPlate:', plate, 'WORDS.length:', WORDS?.length, 'viable:', viable.length, 'COMMON_WORDS.size:', COMMON_WORDS.size);
        return viable;
    }

    let wordsModalMyWord = '';  // current user's word for this plate
    let wordsModalMyTime = 0;
    let wordsModalMySkipped = false;
    let wordsModalMyPenalty = 0;
    let wordsModalSkipPct = 0;
    let wordsModalAvgTime = 0;

    let wordsModalSource = 'daily'; // 'daily' or 'practice'

    function showViableWordsForPlate(plate, hideUsed, source) {
        if (!plate || plate === '\u2014') return;

        wordsModalSource = source || 'daily';
        wordsModalPlate = plate.toUpperCase();
        wordsModalDate = currentViewingDate || getTodayString();
        wordsModalMyWord = '';
        wordsModalMyTime = 0;
        wordsModalMySkipped = false;
        wordsModalMyPenalty = 0;
        wordsModalViable = getViableWordsForPlate(plate);
        wordsModalCommon = wordsModalViable.filter(w => COMMON_WORDS.has(w.toLowerCase()));
        wordsModalUsed = [];
        wordsModalSkipPct = 0;
        wordsModalAvgTime = 0;
        wordsModalActiveTab = 'common';

        document.getElementById('wordsModalTitle').textContent = `Plate: ${wordsModalPlate}`;
        document.getElementById('wordsModalBackdrop').classList.add('show');

        document.getElementById('wordsTabCommon').textContent = `Common (${wordsModalCommon.length})`;
        document.getElementById('wordsTabViable').textContent = `Viable (${wordsModalViable.length.toLocaleString()})`;
        const usedTab = document.getElementById('wordsTabUsed');
        usedTab.textContent = 'Used';
        usedTab.style.display = hideUsed ? 'none' : '';

        renderWordsTab('common');

        if (hideUsed) return; // Skip loading used data during gameplay

        if (wordsModalSource === 'daily') {
            // Daily: use RPC with user details, date-scoped, clickable
            sb.rpc('plate_user_details', { p_plate: wordsModalPlate, p_date: wordsModalDate })
                .then(({ data }) => {
                    if (!data) return;
                    const wordGroups = {};
                    let totalPlays = 0, skipCount = 0, totalTime = 0, foundMyEntry = false;
                    data.forEach(row => {
                        totalPlays++;
                        const thinkTime = row.thinking_seconds || 0;
                        const penTime = row.penalty_seconds || 0;
                        totalTime += thinkTime + penTime;
                        const key = row.skipped ? '__skipped__' : (row.word || '').toLowerCase();
                        if (row.skipped) skipCount++;
                        if (!wordGroups[key]) wordGroups[key] = { word: key, count: 0, users: [] };
                        wordGroups[key].count++;
                        wordGroups[key].users.push({
                            name: row.display_name || (row.handle ? '@' + row.handle : 'Anonymous'),
                            time: thinkTime, penalty: penTime, userId: row.user_id, skipped: row.skipped
                        });
                        if (currentUser && row.user_id === currentUser.id) {
                            foundMyEntry = true;
                            wordsModalMySkipped = row.skipped;
                            wordsModalMyWord = row.skipped ? '' : (row.word || '').toLowerCase();
                            wordsModalMyTime = thinkTime;
                            wordsModalMyPenalty = penTime;
                        }
                    });
                    if (!foundMyEntry && currentUser) wordsModalMyWord = '__not_played__';
                    wordsModalSkipPct = totalPlays > 0 ? Math.round(skipCount / totalPlays * 100) : 0;
                    wordsModalAvgTime = totalPlays > 0 ? totalTime / totalPlays : 0;
                    wordsModalUsed = Object.values(wordGroups)
                        .map(g => ({ ...g, pct: Math.round(g.count / totalPlays * 100), isSkip: g.word === '__skipped__' }))
                        .sort((a, b) => b.count - a.count);
                    document.getElementById('wordsTabUsed').textContent = `Used (${totalPlays})`;
                    updateWordsModalHeader();
                    if (wordsModalActiveTab === 'used') renderWordsTab('used');
                })
                .catch(e => console.error('Failed to load used words:', e));
        } else {
            // Practice: pull from all tables, no user details, not clickable
            Promise.all([
                sb.from('daily_run_entries').select('word, skipped, thinking_seconds, penalty_seconds').eq('plate', wordsModalPlate),
                sb.from('practice_plate_stats').select('word, skipped, thinking_seconds').eq('plate', wordsModalPlate),
                sb.from('h2h_run_entries').select('word, skipped, thinking_seconds').eq('plate', wordsModalPlate)
            ]).then(([dailyRes, practiceRes, h2hRes]) => {
                    const allData = [
                        ...(dailyRes.data || []).map(r => ({ ...r, penalty_seconds: r.penalty_seconds || 0 })),
                        ...(practiceRes.data || []).map(r => ({ ...r, penalty_seconds: 0 })),
                        ...(h2hRes.data || []).map(r => ({ ...r, penalty_seconds: 0 }))
                    ];
                    const wordGroups = {};
                    const myEntry = gameHistory.find(e => (e.plate || '').toUpperCase() === wordsModalPlate);
                    let totalPlays = 0, skipCount = 0, totalTime = 0;
                    allData.forEach(row => {
                        totalPlays++;
                        const thinkTime = row.thinking_seconds || 0;
                        const penTime = row.penalty_seconds || 0;
                        totalTime += thinkTime + penTime;
                        const key = row.skipped ? '__skipped__' : (row.word || '').toLowerCase();
                        if (row.skipped) skipCount++;
                        if (!wordGroups[key]) wordGroups[key] = { word: key, count: 0, users: [] };
                        wordGroups[key].count++;
                    });
                    if (myEntry) {
                        wordsModalMySkipped = myEntry.skipped || false;
                        wordsModalMyWord = myEntry.skipped ? '' : (myEntry.word || '').toLowerCase();
                        wordsModalMyTime = myEntry.thinkingSeconds || 0;
                        wordsModalMyPenalty = myEntry.penaltySeconds || 0;
                    } else if (currentUser) {
                        wordsModalMyWord = '__not_played__';
                    }
                    wordsModalSkipPct = totalPlays > 0 ? Math.round(skipCount / totalPlays * 100) : 0;
                    wordsModalAvgTime = totalPlays > 0 ? totalTime / totalPlays : 0;
                    wordsModalUsed = Object.values(wordGroups)
                        .map(g => ({ ...g, pct: Math.round(g.count / totalPlays * 100), isSkip: g.word === '__skipped__' }))
                        .sort((a, b) => b.count - a.count);
                    document.getElementById('wordsTabUsed').textContent = `Used (${totalPlays})*`;
                    updateWordsModalHeader();
                    if (wordsModalActiveTab === 'used') renderWordsTab('used');
                })
                .catch(e => console.error('Failed to load used words:', e));
        }
    }

    function updateWordsModalHeader() {
        const statusEl = document.getElementById('wordsModalStatus');
        let headerHtml = '';
        // Show what the current user played
        if (wordsModalMySkipped) {
            headerHtml += `<span style="color:#6b7280;">You skipped: </span><strong style="color:#ef4444;">${wordsModalMyTime.toFixed(2)}s (+${wordsModalMyPenalty}s)</strong>`;
        } else if (wordsModalMyWord === '__not_played__') {
            headerHtml += `<span style="color:#6b7280;">You finished before this plate</span>`;
        } else if (wordsModalMyWord) {
            headerHtml += `<span style="color:#6b7280;">You played: </span><strong>${wordsModalMyWord}</strong> <span style="color:#6b7280;">(${wordsModalMyTime.toFixed(2)}s)</span>`;
        }
        if (wordsModalAvgTime > 0) {
            if (headerHtml) headerHtml += '<br>';
            headerHtml += `<span style="color:#6b7280;">Skip: ${wordsModalSkipPct}%</span>`;
            headerHtml += `<span style="color:#6b7280;margin-left:16px;">Avg: ${wordsModalAvgTime.toFixed(2)}s</span>`;
        }
        statusEl.innerHTML = headerHtml;
    }

    function switchWordsTab(tab) {
        wordsModalActiveTab = tab;
        document.getElementById('wordsTabCommon').classList.toggle('active', tab === 'common');
        document.getElementById('wordsTabViable').classList.toggle('active', tab === 'viable');
        document.getElementById('wordsTabUsed').classList.toggle('active', tab === 'used');
        renderWordsTab(tab);
    }
    window.switchWordsTab = switchWordsTab;

    function highlightWordWithPlate(word, plate) {
        const upperPlate = plate.toUpperCase();
        const upperWord = word.toUpperCase();
        let highlighted = '';
        let plateIdx = 0;
        for (let i = 0; i < word.length; i++) {
            if (plateIdx < upperPlate.length && upperWord[i] === upperPlate[plateIdx]) {
                highlighted += `<strong style="color:#16a34a;">${word[i]}</strong>`;
                plateIdx++;
            } else {
                highlighted += word[i];
            }
        }
        return highlighted;
    }

    function renderWordsTab(tab) {
        const listEl = document.getElementById('wordsModalList');
        // Don't clear the status — keep the header stats visible
        updateWordsModalHeader();
        let html = '';

        if (tab === 'common') {
            const sorted = [...wordsModalCommon].sort((a, b) => a.length - b.length || a.localeCompare(b));
            sorted.forEach(word => {
                html += `<div class="word-item">${highlightWordWithPlate(word, wordsModalPlate)}</div>`;
            });
        } else if (tab === 'viable') {
            const sorted = [...wordsModalViable].sort((a, b) => a.length - b.length || a.localeCompare(b));
            sorted.forEach(word => {
                html += `<div class="word-item">${highlightWordWithPlate(word, wordsModalPlate)}</div>`;
            });
        } else if (tab === 'used') {
            if (wordsModalUsed.length === 0) {
                html = '<p style="text-align:center;color:#6b7280;padding:20px;">Loading...</p>';
            } else {
                wordsModalUsed.forEach((entry, idx) => {
                    let isMyEntry = false;
                    if (entry.isSkip && wordsModalMySkipped) isMyEntry = true;
                    else if (!entry.isSkip && wordsModalMyWord && entry.word === wordsModalMyWord) isMyEntry = true;
                    const badge = isMyEntry ? ' <span class="lb-badge lb-badge-you" style="font-size:0.7rem;">YOU</span>' : '';
                    const wordDisplay = entry.isSkip
                        ? '<span style="color:#ef4444;font-weight:600;">skipped</span>'
                        : highlightWordWithPlate(entry.word, wordsModalPlate);

                    if (wordsModalSource === 'daily' && entry.users && entry.users.length > 0) {
                        // Daily: clickable with user dropdown
                        html += `<div>`;
                        html += `<div onclick="toggleUsedDetail(${idx})" style="display:flex;align-items:center;padding:10px 0;border-bottom:1px solid #f3f4f6;cursor:pointer;">`;
                        html += `<div style="flex:1;">${wordDisplay}${badge}</div>`;
                        html += `<div style="min-width:30px;text-align:right;font-weight:600;color:#374151;">${entry.count}</div>`;
                        html += `<div style="min-width:40px;text-align:right;color:#6b7280;">${entry.pct}%</div>`;
                        html += `<div id="usedChevron${idx}" style="color:#9ca3af;margin-left:8px;transition:transform 0.2s;">&#8250;</div>`;
                        html += `</div>`;
                        html += `<div id="usedDetail${idx}" style="display:none;padding:4px 0 8px 16px;background:#f9fafb;border-bottom:1px solid #e5e7eb;">`;
                        entry.users.sort((a, b) => a.time - b.time).forEach(u => {
                            const isMe = currentUser && u.userId === currentUser.id;
                            const nameStyle = isMe ? 'color:#9370db;font-weight:600;' : 'color:#374151;';
                            let timeDisplay = u.time.toFixed(2) + 's';
                            if (u.skipped && u.penalty) timeDisplay = `${u.time.toFixed(2)}s (+${u.penalty}s)`;
                            html += `<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:0.9rem;">`;
                            html += `<span style="${nameStyle}">${u.name}</span>`;
                            html += `<span style="color:#6b7280;">${timeDisplay}</span>`;
                            html += `</div>`;
                        });
                        html += `</div></div>`;
                    } else {
                        // Practice: not clickable
                        html += `<div style="display:flex;align-items:center;padding:10px 0;border-bottom:1px solid #f3f4f6;">`;
                        html += `<div style="flex:1;">${wordDisplay}${badge}</div>`;
                        html += `<div style="min-width:30px;text-align:right;font-weight:600;color:#374151;">${entry.count}</div>`;
                        html += `<div style="min-width:40px;text-align:right;color:#6b7280;">${entry.pct}%</div>`;
                        html += `</div>`;
                    }
                });
            }
        }

        listEl.innerHTML = html;
    }

    function toggleUsedDetail(idx) {
        const detail = document.getElementById('usedDetail' + idx);
        const chevron = document.getElementById('usedChevron' + idx);
        if (!detail) return;
        if (detail.style.display === 'none') {
            detail.style.display = 'block';
            if (chevron) chevron.style.transform = 'rotate(90deg)';
        } else {
            detail.style.display = 'none';
            if (chevron) chevron.style.transform = '';
        }
    }
    window.toggleUsedDetail = toggleUsedDetail;

    // Legacy compat
    function displayViableWords(sortType) {
        switchWordsTab(sortType === 'alpha' ? 'common' : 'viable');
    }
    window.displayViableWords = displayViableWords;
    window.showViableWordsForPlate = showViableWordsForPlate;


    function loadSelectedDate() {
        const v = document.getElementById('leaderboardDatePicker').value;
        if (v) displayLeaderboard(v);
    }
    window.loadSelectedDate = loadSelectedDate;

    function changeDateBy(days) {
        const picker = document.getElementById('leaderboardDatePicker');
        const currentDate = new Date(picker.value + 'T00:00:00');
        currentDate.setDate(currentDate.getDate() + days);

        const newDateStr = currentDate.toISOString().split('T')[0];
        picker.value = newDateStr;
        const dateDisplay = document.getElementById('leaderboardDateDisplay');
        if (dateDisplay) dateDisplay.textContent = formatDateForDisplay(newDateStr);
        displayLeaderboard(newDateStr);
        updateNavigationButtons();
    }
    window.changeDateBy = changeDateBy;

    const EARLIEST_DATE = '2026-04-15';

    function updateNavigationButtons() {
        const picker = document.getElementById('leaderboardDatePicker');
        const nextBtn = document.getElementById('nextDayBtn');
        const prevBtn = document.getElementById('prevDayBtn');
        const today = getTodayString();

        if (picker.value === today) {
            nextBtn.disabled = true;
            nextBtn.style.opacity = '0.5';
            nextBtn.style.cursor = 'not-allowed';
        } else {
            nextBtn.disabled = false;
            nextBtn.style.opacity = '1';
            nextBtn.style.cursor = 'pointer';
        }

        if (picker.value <= EARLIEST_DATE) {
            prevBtn.disabled = true;
            prevBtn.style.opacity = '0.5';
            prevBtn.style.cursor = 'not-allowed';
        } else {
            prevBtn.disabled = false;
            prevBtn.style.opacity = '1';
            prevBtn.style.cursor = 'pointer';
        }
    }

    function loadTodayScores() {
        const t = getTodayString();
        const picker = document.getElementById('leaderboardDatePicker');
        if (picker) picker.value = t;
        displayLeaderboard(t);
    }
    window.loadTodayScores = loadTodayScores;



    // === EVENT HANDLERS ===
    window.addEventListener('DOMContentLoaded', function() {
        // Initialize to practice mode on page load
        gameMode = 'practice';
        const mi = document.getElementById('modeIndicator');
        mi.textContent = 'Practice Mode - Unlimited attempts';
        mi.style.background = '#f3e8ff';
        mi.style.color = '#6b21a8';
        mi.style.border = '2px solid #e9d5ff';

        // Show start button
        const startBtn = document.getElementById('startButton');
        startBtn.textContent = 'Start Game';
        startBtn.disabled = false;
        startBtn.style.opacity = '1';
        startBtn.style.cursor = 'pointer';

        document.getElementById('dailyChallengeBtn').addEventListener('click', async () => {
            if (gameMode === 'practice' && gameHistory.length > 0) {
                submitPracticePlateStats();
            }
            unlockAudio();
            console.log('Daily Challenge clicked!');
            console.log('State:', { platesReady, dictionaryReady, allPlates: ALL_PLATES?.length, currentUser: !!currentUser });

            if (!platesReady || !dictionaryReady || !ALL_PLATES || ALL_PLATES.length === 0) {
                alert('Game data is still loading... Please wait a moment and try again.');
                console.log('Blocked: data not ready');
                return;
            }

            if (!currentUser && !await signInWithApple()) { console.log('Blocked: no user'); return; }

            console.log('Checking if played today...');
            const alreadyPlayed = await checkIfPlayedToday();
            console.log('Already played:', alreadyPlayed);
            if (alreadyPlayed) {
                alert('You already played today\'s challenge! Come back tomorrow, or try Practice Mode.');
                return;
            }

            gameMode = 'daily';
            dailyPlateSequence = null; // will be fetched from server in beginNewRun

            // Update mode indicator
            const mi = document.getElementById('modeIndicator');
            mi.textContent = 'Daily Challenge - 1 attempt per day';
            mi.style.background = '#fef3c7';
            mi.style.color = '#92400e';
            mi.style.border = '2px solid #fbbf24';

            const startBtn = document.getElementById('startButton');
            startBtn.textContent = 'Start Game';
            startBtn.style.display = 'inline-block';
        });

        // Rules button
        const rulesBtnElement = document.getElementById('rulesBtn');
        if (rulesBtnElement) {
            rulesBtnElement.addEventListener('click', () => {
                const modal = document.getElementById('rulesModalBackdrop');
                if (modal) modal.classList.add('show');
            });
        }

        document.getElementById('rulesModalCloseBtn').addEventListener('click', () => {
            document.getElementById('rulesModalBackdrop').classList.remove('show');
        });

        document.getElementById('rulesModalCloseBtnBottom').addEventListener('click', () => {
            document.getElementById('rulesModalBackdrop').classList.remove('show');
        });

        document.getElementById('rulesModalBackdrop').addEventListener('click', (e) => {
            if (e.target.id === 'rulesModalBackdrop') {
                document.getElementById('rulesModalBackdrop').classList.remove('show');
            }
        });

        document.getElementById('practiceBtn').addEventListener('click', async () => {
            if (!currentUser) {
                if (!await signInWithApple()) return;
            }
            // Submit practice stats from previous run (not H2H)
            if (gameMode === 'practice' && gameHistory.length > 0 && !practiceStatsSubmitted) {
                submitPracticePlateStats();
            }
            practiceStatsSubmitted = false;
            gameMode = 'practice';
            dailyPlateSequence = null;
            document.getElementById('practiceSettingsBtn').style.display = '';

            // Reset game state from any previous game
            if (timerIntervalId) { clearInterval(timerIntervalId); timerIntervalId = null; }
            resetGameState();
                window.onbeforeunload = null;

            // Clear UI
            plateEl.textContent = '---';
            resultEl.textContent = '';
            while (historyBodyEl.firstChild) historyBodyEl.removeChild(historyBodyEl.firstChild);
            historyEmptyEl.style.display = 'block';
            timerDisplayEl.textContent = 'Time: 0.00 s';
            progressDisplayEl.textContent = 'Solved: 0 / 10';
            wordInputEl.value = '';
            wordInputEl.disabled = false;
            wordInputEl.readOnly = false;
            checkButtonEl.disabled = false;
            skipButtonEl.disabled = false;

            const mi = document.getElementById('modeIndicator');
            const timedLabel = practiceTimed ? '' : ' | UNTIMED';
            mi.textContent = `Practice Mode | Diff ${practiceDifficulty}${timedLabel}`;
            mi.style.background = '#f3e8ff';
            mi.style.color = '#6b21a8';
            mi.style.border = '2px solid #e9d5ff';

            const startBtn = document.getElementById('startButton');
            startBtn.textContent = 'Start Game';
            startBtn.style.display = 'inline-block';
            startBtn.disabled = false;
            startBtn.style.opacity = '1';
            startBtn.style.cursor = 'pointer';

            document.getElementById('dailyChallengeBtn').disabled = false;
            document.getElementById('dailyChallengeBtn').style.opacity = '1';
        });

        // Practice settings
        const diffSlider = document.getElementById('difficultySlider');
        const diffValue = document.getElementById('difficultyValue');
        const diffLabel2 = document.getElementById('difficultyLabel2');
        const timedToggle = document.getElementById('timedToggle');

        // Initialize from saved values
        diffSlider.value = practiceDifficulty;
        diffValue.textContent = practiceDifficulty;
        timedToggle.checked = practiceTimed;
        updateDiffLabel(practiceDifficulty);

        diffSlider.addEventListener('input', () => {
            practiceDifficulty = parseInt(diffSlider.value);
            diffValue.textContent = practiceDifficulty;
            localStorage.setItem('practiceDifficulty', practiceDifficulty);
            updateDiffLabel(practiceDifficulty);
            if (gameMode === 'practice') {
                const timedLabel = practiceTimed ? '' : ' | UNTIMED';
                document.getElementById('modeIndicator').textContent = `Practice Mode | Diff ${practiceDifficulty}${timedLabel}`;
            }
        });

        timedToggle.addEventListener('change', () => {
            practiceTimed = timedToggle.checked;
            if (gameMode === 'practice') {
                const timedLabel = practiceTimed ? '' : ' | UNTIMED';
                document.getElementById('modeIndicator').textContent = `Practice Mode | Diff ${practiceDifficulty}${timedLabel}`;
            }
            localStorage.setItem('practiceTimed', practiceTimed);
        });

        document.getElementById('practiceSettingsBtn').addEventListener('click', () => {
            const panel = document.getElementById('practiceSettings');
            panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
        });

        function updateDiffLabel(d) {
            if (d <= 30) diffLabel2.textContent = 'Easy plates';
            else if (d <= 69) diffLabel2.textContent = 'Normal plates';
            else diffLabel2.textContent = 'Challenging plates';
        }
    });

    // ========== HEAD-TO-HEAD FEATURE ==========
    let currentChallengeId = null;
    let currentH2HRunId = null;
    let currentH2HDifficulty = 50;
    let challengeStartTime = null;
    let pendingOpponent = null;
    let h2hChallengesCache = [];
    let h2hProfilesCache = {};
    let h2hActiveSubTab = 'incoming';
    let selectedFriendId = null;
    let friendsListData = [];


    function generateChallengeSequence(difficulty) {
        if (!platesReady || !ALL_PLATES.length) return [];
        const diff = typeof difficulty === 'number' ? difficulty : 50;
        const weights = weightsForDifficulty(diff);
        const sequence = [];
        const used = new Set();

        while (sequence.length < 200 && used.size < ALL_PLATES.length) {
            const r = Math.random();
            let threshold = 0;
            let bandIdx = 0;
            for (let b = 0; b < weights.length; b++) {
                threshold += weights[b];
                if (r < threshold) { bandIdx = b; break; }
            }
            const bandName = H2H_BAND_NAMES_ORDERED[bandIdx];
            const pool = getBandPool(bandName);
            const remaining = pool.filter(p => !used.has(p));

            if (remaining.length > 0) {
                const plate = remaining[Math.floor(Math.random() * remaining.length)];
                sequence.push(plate);
                used.add(plate);
            }
        }
        return sequence;
    }

    // === Challenge Tab ===
    function switchChallengeTab(tab) {
        h2hActiveSubTab = tab;
        document.getElementById('chTabIncoming').classList.toggle('active', tab === 'incoming');
        document.getElementById('chTabPending').classList.toggle('active', tab === 'pending');
        document.getElementById('chTabResults').classList.toggle('active', tab === 'results');
        renderChallengesList();
    }
    window.switchChallengeTab = switchChallengeTab;

    async function loadH2HChallenges() {
        const contentEl = document.getElementById('challengesContent');
        if (!currentUser) {
            contentEl.innerHTML = '<p style="text-align:center;color:#6b7280;padding:40px 0;">Sign in to view challenges</p>';
            return;
        }
        contentEl.innerHTML = '<p style="text-align:center;color:#6b7280;padding:20px;">Loading...</p>';

        try {
            const { data, error } = await sb
                .from('h2h_challenges')
                .select('*')
                .or(`challenger_id.eq.${currentUser.id},opponent_id.eq.${currentUser.id}`)
                .order('created_at', { ascending: false });

            if (error) throw error;
            h2hChallengesCache = data || [];

            // Collect unique user IDs for profile lookup
            const userIds = new Set();
            h2hChallengesCache.forEach(c => {
                userIds.add(c.challenger_id);
                userIds.add(c.opponent_id);
            });
            userIds.delete(currentUser.id);

            if (userIds.size > 0) {
                const { data: profiles } = await sb
                    .from('profiles')
                    .select('id, display_name, handle')
                    .in('id', Array.from(userIds));
                if (profiles) {
                    profiles.forEach(p => {
                        h2hProfilesCache[p.id] = p.display_name || (p.handle ? '@' + p.handle : 'Player');
                    });
                }
            }

            // Load runs for score display
            const challengeIds = h2hChallengesCache.map(c => c.id);
            if (challengeIds.length > 0) {
                const { data: runs } = await sb
                    .from('h2h_runs')
                    .select('id, challenge_id, user_id, total_seconds, h2h_run_entries(id, skipped)')
                    .in('challenge_id', challengeIds);
                if (runs) {
                    runs.forEach(r => {
                        const ch = h2hChallengesCache.find(c => c.id === r.challenge_id);
                        if (ch) {
                            if (!ch._runs) ch._runs = {};
                            const solvedCount = (r.h2h_run_entries || []).filter(e => !e.skipped).length;
                            const forfeited = r.total_seconds !== null && solvedCount < 10;
                            ch._runs[r.user_id] = { runId: r.id, totalSeconds: r.total_seconds, forfeited };
                        }
                    });
                }
            }

            renderChallengesList();
        } catch (e) {
            console.error('Error loading challenges:', e);
            contentEl.innerHTML = `<p style="text-align:center;color:#dc2626;padding:20px;">Error loading challenges: ${e.message || e}</p>`;
        }
    }

    function getOpponentName(challenge) {
        const isChallenger = challenge.challenger_id === currentUser.id;
        const otherId = isChallenger ? challenge.opponent_id : challenge.challenger_id;
        return h2hProfilesCache[otherId] || 'Player';
    }

    function formatRelativeDate(dateStr) {
        const d = new Date(dateStr);
        const now = new Date();
        const diffMs = now - d;
        const diffMins = Math.floor(diffMs / 60000);
        if (diffMins < 1) return 'just now';
        if (diffMins < 60) return diffMins + 'm ago';
        const diffHrs = Math.floor(diffMins / 60);
        if (diffHrs < 24) return diffHrs + 'h ago';
        const diffDays = Math.floor(diffHrs / 24);
        if (diffDays < 7) return diffDays + 'd ago';
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    function getDifficultyLabel(d) {
        return 'Difficulty ' + d;
    }

    function renderChallengesList() {
        const contentEl = document.getElementById('challengesContent');
        if (!currentUser) {
            contentEl.innerHTML = '<p style="text-align:center;color:#6b7280;padding:40px 0;">Sign in to view challenges</p>';
            return;
        }

        let filtered = [];
        if (h2hActiveSubTab === 'incoming') {
            filtered = h2hChallengesCache.filter(c =>
                c.opponent_id === currentUser.id && c.status === 'pending'
            );
        } else if (h2hActiveSubTab === 'pending') {
            filtered = h2hChallengesCache.filter(c => {
                const isChallenger = c.challenger_id === currentUser.id;
                return (isChallenger && c.status === 'pending') || c.status === 'accepted';
            });
        } else if (h2hActiveSubTab === 'results') {
            filtered = h2hChallengesCache.filter(c => c.status === 'completed');
        }

        if (filtered.length === 0) {
            const emptyMsg = h2hActiveSubTab === 'incoming' ? 'No incoming challenges'
                : h2hActiveSubTab === 'pending' ? 'No pending challenges'
                : 'No completed challenges';
            contentEl.innerHTML = `<p style="text-align:center;color:#6b7280;padding:40px 0;">${emptyMsg}</p>`;
            return;
        }

        let html = '';
        filtered.forEach(ch => {
            const oppName = getOpponentName(ch);
            const isChallenger = ch.challenger_id === currentUser.id;
            const diffLabel = getDifficultyLabel(ch.difficulty ?? 50);
            const dateStr = formatRelativeDate(ch.created_at);

            if (h2hActiveSubTab === 'incoming') {
                html += `<div class="challenge-row">`;
                html += `<div class="ch-info">`;
                html += `<div class="ch-name">${oppName}</div>`;
                html += `<div class="ch-meta">${diffLabel} &middot; ${dateStr}</div>`;
                html += `</div>`;
                html += `<div class="ch-actions">`;
                html += `<button class="ch-accept-btn" onclick="event.stopPropagation();acceptChallenge('${ch.id}')">Accept</button>`;
                html += `<button class="ch-decline-btn" onclick="event.stopPropagation();declineChallenge('${ch.id}')">Decline</button>`;
                html += `</div>`;
                html += `</div>`;
            } else if (h2hActiveSubTab === 'pending') {
                const myRun = ch._runs && ch._runs[currentUser.id];
                const oppId = isChallenger ? ch.opponent_id : ch.challenger_id;
                const oppRun = ch._runs && ch._runs[oppId];
                const myScore = myRun && myRun.forfeited ? 'Forfeit' : (myRun && myRun.totalSeconds != null ? myRun.totalSeconds.toFixed(2) + 's' : (myRun ? 'In progress' : 'Not played'));
                const oppScore = oppRun && oppRun.forfeited ? 'Forfeit' : (oppRun && oppRun.totalSeconds != null ? oppRun.totalSeconds.toFixed(2) + 's' : 'TBD');

                const canPlay = (!myRun || (myRun && myRun.totalSeconds == null)) && ch.status === 'accepted';
                html += `<div class="challenge-row" onclick="${canPlay ? `playH2HChallenge('${ch.id}')` : `viewH2HScorecard('${ch.id}')`}">`;
                html += `<div class="ch-info">`;
                html += `<div class="ch-name">${oppName}</div>`;
                html += `<div class="ch-meta">${diffLabel} &middot; ${ch.status === 'pending' ? 'Waiting for response' : dateStr}</div>`;
                html += `</div>`;
                html += `<div class="ch-scores" style="font-size:0.85rem;">`;
                html += `<div>You: <strong>${myScore}</strong></div>`;
                html += `<div class="ch-tbd">Them: ${oppScore}</div>`;
                html += `</div>`;
                html += `<div class="ch-chevron">&#8250;</div>`;
                html += `</div>`;
            } else if (h2hActiveSubTab === 'results') {
                const myRun = ch._runs && ch._runs[currentUser.id];
                const oppId = isChallenger ? ch.opponent_id : ch.challenger_id;
                const oppRun = ch._runs && ch._runs[oppId];
                const myTime = myRun ? myRun.totalSeconds : null;
                const oppTime = oppRun ? oppRun.totalSeconds : null;
                const myForfeit = myRun && myRun.forfeited;
                const oppForfeit = oppRun && oppRun.forfeited;

                let resultIcon = '';
                let resultClass = '';
                if (myForfeit && oppForfeit) { resultIcon = ''; resultClass = ''; }
                else if (myForfeit) { resultIcon = '&#10007;'; resultClass = 'ch-loss'; }
                else if (oppForfeit) { resultIcon = '&#10003;'; resultClass = 'ch-win'; }
                else if (myTime !== null && oppTime !== null) {
                    if (myTime < oppTime) { resultIcon = '&#10003;'; resultClass = 'ch-win'; }
                    else if (myTime > oppTime) { resultIcon = '&#10007;'; resultClass = 'ch-loss'; }
                    else { resultIcon = '&#8212;'; resultClass = 'ch-tie'; }
                }

                const myDisplay = myForfeit ? 'Forfeit' : (myTime !== null ? myTime.toFixed(2) + 's' : '--');
                const oppDisplay = oppForfeit ? 'Forfeit' : (oppTime !== null ? oppTime.toFixed(2) + 's' : '--');

                html += `<div class="challenge-row" onclick="viewH2HScorecard('${ch.id}')">`;
                html += `<div class="ch-info">`;
                html += `<div class="ch-name">${oppName} <span class="${resultClass}" style="margin-left:6px;">${resultIcon}</span></div>`;
                html += `<div class="ch-meta">${diffLabel} &middot; ${dateStr}</div>`;
                html += `</div>`;
                html += `<div class="ch-scores" style="font-size:0.85rem;">`;
                html += `<div>You: <strong>${myDisplay}</strong></div>`;
                html += `<div>Them: <strong>${oppDisplay}</strong></div>`;
                html += `</div>`;
                html += `<button onclick="event.stopPropagation();rematchChallenge('${oppId}','${oppName.replace(/'/g,"\\'")}',${ch.difficulty ?? 50})" style="padding:6px 12px;background:#9370db;color:white;border:none;border-radius:8px;font-weight:600;font-size:0.8rem;cursor:pointer;margin-right:6px;">Rematch</button>`;
                html += `<div class="ch-chevron">&#8250;</div>`;
                html += `</div>`;
            }
        });

        contentEl.innerHTML = html;
    }

    // === New Challenge Modal ===
    let preselectedChallengeUserId = null;
    let preselectedChallengeUserName = null;

    function openNewChallengeModal() {
        if (!currentUser) {
            alert('Please sign in to create challenges');
            return;
        }
        const preId = preselectedChallengeUserId;
        const preName = preselectedChallengeUserName;
        preselectedChallengeUserId = null;
        preselectedChallengeUserName = null;

        if (!preId) {
            selectedFriendId = null;
            document.getElementById('sendChallengeBtn').disabled = true;
            document.getElementById('sendChallengeBtn').style.opacity = '0.5';
        }
        document.getElementById('friendSearchInput').value = '';
        document.getElementById('challengeDiffSlider').value = 50;
        document.getElementById('challengeDiffValue').textContent = '50';
        document.getElementById('challengeDiffLabel').textContent = 'Normal plates';
        document.getElementById('newChallengeModalBackdrop').classList.add('show');
        loadFriendsList(preId, preName);
    }
    window.openNewChallengeModal = openNewChallengeModal;

    function closeNewChallengeModal() {
        document.getElementById('newChallengeModalBackdrop').classList.remove('show');
    }
    window.closeNewChallengeModal = closeNewChallengeModal;

    function updateChallengeDiffLabel(d) {
        const label = document.getElementById('challengeDiffLabel');
        if (d <= 30) label.textContent = 'Easy plates';
        else if (d <= 69) label.textContent = 'Normal plates';
        else label.textContent = 'Challenging plates';
    }
    window.updateChallengeDiffLabel = updateChallengeDiffLabel;

    async function loadFriendsList(preId, preName) {
        const listEl = document.getElementById('friendsList');
        listEl.innerHTML = '<p style="text-align:center;color:#6b7280;padding:12px;">Loading friends...</p>';

        try {
            const { data, error } = await sb
                .from('friendships')
                .select('user_a, user_b')
                .or(`user_a.eq.${currentUser.id},user_b.eq.${currentUser.id}`)
                .eq('status', 'accepted');

            if (error) throw error;

            const friendIds = (data || []).map(f => f.user_a === currentUser.id ? f.user_b : f.user_a);
            const { data: profiles } = friendIds.length > 0
                ? await sb.from('profiles').select('id, display_name, handle').in('id', friendIds)
                : { data: [] };

            friendsListData = (profiles || []).map(p => ({
                id: p.id,
                name: p.display_name || (p.handle ? '@' + p.handle : 'Player'),
                handle: p.handle || ''
            }));

            // Add preselected non-friend if not already in list
            if (preId && !friendsListData.find(f => f.id === preId)) {
                friendsListData.unshift({ id: preId, name: preName || 'Player', handle: '' });
            }

            // Auto-select preselected user
            if (preId) {
                selectedFriendId = preId;
                document.getElementById('sendChallengeBtn').disabled = false;
                document.getElementById('sendChallengeBtn').style.opacity = '1';
            }

            renderFriendsList();
        } catch (e) {
            console.error('Error loading friends:', e);
            listEl.innerHTML = '<p style="text-align:center;color:#dc2626;padding:12px;">Error loading friends</p>';
        }
    }

    function renderFriendsList() {
        const listEl = document.getElementById('friendsList');
        const query = (document.getElementById('friendSearchInput').value || '').toLowerCase();
        const filtered = friendsListData.filter(f =>
            f.name.toLowerCase().includes(query) || f.handle.toLowerCase().includes(query)
        );

        if (filtered.length === 0) {
            listEl.innerHTML = '<p style="text-align:center;color:#6b7280;padding:12px;">No friends found</p>';
            return;
        }

        let html = '';
        filtered.forEach(f => {
            const sel = f.id === selectedFriendId ? ' selected' : '';
            html += `<div class="friend-item${sel}" onclick="selectFriend('${f.id}')">`;
            html += `<div class="friend-name">${f.name}</div>`;
            if (f.handle) html += `<div class="friend-handle">@${f.handle}</div>`;
            html += `</div>`;
        });
        listEl.innerHTML = html;
    }

    function filterFriendsList() {
        renderFriendsList();
    }
    window.filterFriendsList = filterFriendsList;

    function selectFriend(friendId) {
        selectedFriendId = friendId;
        renderFriendsList();
        const btn = document.getElementById('sendChallengeBtn');
        btn.disabled = false;
        btn.style.opacity = '1';
    }
    window.selectFriend = selectFriend;

    async function sendChallenge() {
        if (!currentUser || !selectedFriendId) return;

        const btn = document.getElementById('sendChallengeBtn');
        btn.disabled = true;
        btn.textContent = 'Creating...';

        try {
            const difficulty = parseInt(document.getElementById('challengeDiffSlider').value);
            const plates = generateChallengeSequence(difficulty);

            if (plates.length < 100) {
                alert('Error generating plates. Please try again.');
                btn.disabled = false;
                btn.textContent = 'Send Challenge';
                return;
            }

            const { data, error } = await sb.rpc('create_h2h_challenge', {
                p_opponent_id: selectedFriendId,
                p_plates: plates,
                p_difficulty: difficulty
            });

            if (error) throw error;
            const challengeId = data;

            closeNewChallengeModal();

            // Start playing immediately
            await playH2HChallenge(challengeId);
        } catch (e) {
            console.error('Error creating challenge:', e);
            alert('Error creating challenge: ' + e.message);
            btn.disabled = false;
            btn.textContent = 'Send Challenge';
        }
    }
    window.sendChallenge = sendChallenge;

    // === Accept / Decline / Play ===
    async function acceptChallenge(challengeId) {
        if (!currentUser) return;
        try {
            const { error } = await sb
                .from('h2h_challenges')
                .update({ status: 'accepted' })
                .eq('id', challengeId);
            if (error) throw error;

            // Start playing immediately
            await playH2HChallenge(challengeId);
        } catch (e) {
            console.error('Error accepting challenge:', e);
            alert('Error accepting challenge: ' + e.message);
        }
    }
    window.acceptChallenge = acceptChallenge;

    async function declineChallenge(challengeId) {
        if (!currentUser) return;
        if (!confirm('Decline this challenge?')) return;
        try {
            const { error } = await sb
                .from('h2h_challenges')
                .update({ status: 'declined' })
                .eq('id', challengeId);
            if (error) throw error;
            loadH2HChallenges();
        } catch (e) {
            console.error('Error declining challenge:', e);
            alert('Error declining challenge: ' + e.message);
        }
    }
    window.declineChallenge = declineChallenge;

    async function playH2HChallenge(challengeId) {
        if (!currentUser) {
            alert('Please sign in to play challenges');
            return;
        }

        // Reset any previous game state
        if (timerIntervalId) { clearInterval(timerIntervalId); timerIntervalId = null; }
        resetGameState();
        gameOver = false;
        gameStarted = false;

        try {
            // Fetch challenge data
            const { data: challenge, error } = await sb
                .from('h2h_challenges')
                .select('*')
                .eq('id', challengeId)
                .single();

            if (error || !challenge) {
                alert('Challenge not found');
                return;
            }

            // Check if already played
            const { data: existingRuns } = await sb
                .from('h2h_runs')
                .select('id, total_seconds')
                .eq('challenge_id', challengeId)
                .eq('user_id', currentUser.id)
                .limit(1);

            if (existingRuns && existingRuns.length > 0 && existingRuns[0].total_seconds !== null) {
                alert('You have already played this challenge');
                return;
            }

            // Start run via RPC
            const { data: runData, error: runError } = await sb.rpc('start_h2h_run', {
                p_challenge_id: challengeId
            });

            if (runError) throw runError;

            const run = Array.isArray(runData) ? runData[0] : runData;
            if (run.state === 'completed') {
                alert('You have already completed this challenge');
                return;
            }

            currentChallengeId = challengeId;
            currentH2HRunId = run.run_id;
            gameMode = 'h2h_challenge';
            dailyPlateSequence = challenge.plates;

            const isChallenger = challenge.challenger_id === currentUser.id;
            const oppId = isChallenger ? challenge.opponent_id : challenge.challenger_id;
            let oppName = h2hProfilesCache[oppId];
            if (!oppName) {
                const { data: prof } = await sb.from('profiles').select('display_name, handle').eq('id', oppId).single();
                oppName = prof?.display_name || (prof?.handle ? '@' + prof.handle : 'Opponent');
                h2hProfilesCache[oppId] = oppName;
            }

            // Switch to game tab
            switchTab('game');

            document.getElementById('practiceBtn').disabled = true;
            document.getElementById('practiceBtn').style.opacity = '0.5';
            document.getElementById('dailyChallengeBtn').disabled = true;
            document.getElementById('dailyChallengeBtn').style.opacity = '0.5';

            currentH2HDifficulty = challenge.difficulty ?? 50;

            const mi = document.getElementById('modeIndicator');
            mi.innerHTML = `
                <div style="display:flex;align-items:center;justify-content:space-between;">
                    <span>H2H vs ${oppName} | Difficulty = ${currentH2HDifficulty}</span>
                    <button onclick="forfeitH2H()" style="padding:6px 12px;background:#dc2626;color:white;border:none;border-radius:4px;cursor:pointer;font-size:0.9rem;">Forfeit</button>
                </div>
            `;
            mi.style.background = '#fef3c7';
            mi.style.color = '#92400e';
            mi.style.border = '2px solid #fbbf24';

            // Auto-start the game immediately
            const startBtn = document.getElementById('startButton');
            startBtn.style.display = 'none';
            window.scrollTo({ top: 0, behavior: 'smooth' });
            await beginNewRun();
        } catch (e) {
            console.error('Error starting challenge:', e);
            alert('Error starting challenge: ' + e.message);
        }
    }
    window.playH2HChallenge = playH2HChallenge;

    window.forfeitH2H = async function() {
        if (!currentH2HRunId) return;
        if (!confirm('Are you sure you want to forfeit this challenge?')) return;

        try {
            const entries = gameHistory.map((entry, idx) => ({
                plate_index: idx,
                plate: entry.plate,
                word: entry.word || null,
                skipped: entry.skipped || false,
                thinking_seconds: Math.floor((entry.thinkingSeconds || 0) * 100) / 100,
                penalty_seconds: entry.penaltySeconds || 0
            }));

            const totalSeconds = startTime
                ? Math.floor(((performance.now() - startTime) / 1000 + penaltySeconds) * 100) / 100
                : 0.01;

            await sb.rpc('submit_h2h_run', {
                p_run_id: currentH2HRunId,
                p_total_seconds: totalSeconds,
                p_entries: entries
            });
        } catch (e) {
            console.error('Forfeit error:', e);
        }

        currentChallengeId = null;
        currentH2HRunId = null;
        gameMode = 'practice';
        gameHistory = [];
        localStorage.removeItem('pendingPracticeStats');
        if (timerIntervalId) { clearInterval(timerIntervalId); timerIntervalId = null; }
        gameStarted = false;
        gameOver = true;
        window.onbeforeunload = null;
        resetGameState();
        switchTab('challenges');
        loadH2HChallenges();
    };

    window.cancelPendingChallenge = function() {
        pendingOpponent = null;
        currentChallengeId = null;
        currentH2HRunId = null;
        gameMode = 'practice';

        const practiceBtn = document.getElementById('practiceBtn');
        const dailyBtn = document.getElementById('dailyChallengeBtn');

        practiceBtn.disabled = false;
        practiceBtn.style.opacity = '1';
        practiceBtn.style.cursor = 'pointer';

        dailyBtn.disabled = false;
        dailyBtn.style.opacity = '1';
        dailyBtn.style.cursor = 'pointer';

        const mi = document.getElementById('modeIndicator');
        mi.textContent = 'Select a game mode above to begin';
        mi.style.background = '#f3f4f6';
        mi.style.color = '#000000';
        mi.style.border = '2px dashed #d1d5db';

        const startBtn = document.getElementById('startButton');
        startBtn.textContent = 'Start Game';
        startBtn.classList.remove('pulse-button');
        updateDailyBtnState();
    };

    async function saveChallengeResult(time, solved, skipped) {
        if (!currentUser || !currentH2HRunId || gameMode !== 'h2h_challenge') return;

        const totalSeconds = Math.floor(time * 100) / 100;
        const entries = gameHistory.map((entry, idx) => ({
            plate_index: idx,
            plate: entry.plate,
            word: entry.skipped ? null : (entry.word || '').toLowerCase(),
            thinking_seconds: Math.floor(entry.thinkingSeconds * 100) / 100,
            skipped: entry.skipped || false,
            penalty_seconds: entry.penaltySeconds || 0
        }));

        try {
            const { error } = await sb.rpc('submit_h2h_run', {
                p_run_id: currentH2HRunId,
                p_total_seconds: totalSeconds,
                p_entries: entries
            });

            if (error) {
                console.error('Failed to submit H2H run:', error);
                alert('Warning: your results may not have saved. Error: ' + error.message);
            } else {
                console.log('H2H run submitted successfully');
            }
        } catch (e) {
            console.error('Error submitting H2H run:', e);
        }

        currentChallengeId = null;
        currentH2HRunId = null;
        challengeStartTime = null;
        gameMode = 'practice';
        gameHistory = [];
        localStorage.removeItem('pendingPracticeStats');

        // Update banner
        const mi = document.getElementById('modeIndicator');
        mi.innerHTML = '<span>H2H Complete!</span>';
        mi.style.background = '#f0fdf4';
        mi.style.color = '#16a34a';
        mi.style.border = '2px solid #86efac';

        // Reset buttons
        document.getElementById('practiceBtn').disabled = false;
        document.getElementById('practiceBtn').style.opacity = '1';
        document.getElementById('dailyChallengeBtn').disabled = false;
        document.getElementById('dailyChallengeBtn').style.opacity = '1';
        updateDailyBtnState();
    }

    async function markChallengeDNF() {
        // Not applicable in Supabase flow — run timeout handled server-side
        currentChallengeId = null;
        currentH2HRunId = null;
        challengeStartTime = null;
        gameMode = 'practice';
        resetGameState();
    }

    // === H2H Scorecard Modal ===
    async function viewH2HScorecard(challengeId) {
        const backdrop = document.getElementById('h2hScorecardModalBackdrop');
        const titleEl = document.getElementById('h2hScorecardTitle');
        const contentEl = document.getElementById('h2hScorecardContent');

        titleEl.textContent = 'Challenge Scorecard';
        contentEl.innerHTML = '<p style="text-align:center;color:#6b7280;padding:20px;">Loading...</p>';
        backdrop.classList.add('show');

        try {
            // Get challenge
            const { data: challenge } = await sb
                .from('h2h_challenges')
                .select('*')
                .eq('id', challengeId)
                .single();

            if (!challenge) {
                contentEl.innerHTML = '<p style="text-align:center;color:#dc2626;">Challenge not found</p>';
                return;
            }

            // Get runs
            const { data: runs } = await sb
                .from('h2h_runs')
                .select('id, user_id, total_seconds')
                .eq('challenge_id', challengeId);

            // Get entries for each run
            const runEntries = {};
            for (const run of (runs || [])) {
                const { data: entries } = await sb
                    .from('h2h_run_entries')
                    .select('*')
                    .eq('run_id', run.id)
                    .order('plate_index');
                runEntries[run.user_id] = {
                    totalSeconds: run.total_seconds,
                    entries: entries || []
                };
            }

            // Determine players
            const p1Id = challenge.challenger_id;
            const p2Id = challenge.opponent_id;
            const p1Name = p1Id === currentUser.id ? 'You' : (h2hProfilesCache[p1Id] || 'Player 1');
            const p2Name = p2Id === currentUser.id ? 'You' : (h2hProfilesCache[p2Id] || 'Player 2');
            const p1Data = runEntries[p1Id];
            const p2Data = runEntries[p2Id];
            const p1Time = p1Data ? p1Data.totalSeconds : null;
            const p2Time = p2Data ? p2Data.totalSeconds : null;

            // Header
            let p1Icon = '', p2Icon = '';
            let p1TimeClass = '', p2TimeClass = '';
            if (p1Time !== null && p2Time !== null) {
                if (p1Time < p2Time) {
                    p1Icon = ' &#10003;'; p1TimeClass = 'ch-win';
                    p2Icon = ' &#10007;'; p2TimeClass = 'ch-loss';
                } else if (p2Time < p1Time) {
                    p2Icon = ' &#10003;'; p2TimeClass = 'ch-win';
                    p1Icon = ' &#10007;'; p1TimeClass = 'ch-loss';
                } else {
                    p1Icon = ''; p2Icon = ''; p1TimeClass = 'ch-tie'; p2TimeClass = 'ch-tie';
                }
            }

            let html = '<div class="scorecard-header">';
            html += `<div class="scorecard-player"><div class="scorecard-player-name">${p1Name}${p1Icon}</div>`;
            html += `<div class="scorecard-player-time ${p1TimeClass}">${p1Time !== null ? p1Time.toFixed(2) : '--'}</div></div>`;
            html += '<div class="scorecard-vs">VS</div>';
            html += `<div class="scorecard-player"><div class="scorecard-player-name">${p2Name}${p2Icon}</div>`;
            html += `<div class="scorecard-player-time ${p2TimeClass}">${p2Time !== null ? p2Time.toFixed(2) : '--'}</div></div>`;
            html += '</div>';

            // Table
            const plates = challenge.plates || [];
            const maxEntries = Math.max(
                p1Data ? p1Data.entries.length : 0,
                p2Data ? p2Data.entries.length : 0,
                10
            );

            html += '<div style="overflow-x:auto;"><table class="scorecard-table">';
            html += `<thead><tr><th style="width:30%;">${p1Name}</th><th style="width:15%;">Plate</th><th style="width:30%;">${p2Name}</th></tr></thead>`;
            html += '<tbody>';

            let p1Total = 0, p2Total = 0;

            for (let i = 0; i < Math.min(maxEntries, plates.length); i++) {
                const plate = plates[i] || '--';
                const e1 = p1Data && p1Data.entries[i];
                const e2 = p2Data && p2Data.entries[i];

                // P1 cell
                let p1Cell = '';
                let p1CellClass = '';
                if (e1) {
                    const t = e1.skipped ? (e1.thinking_seconds + e1.penalty_seconds) : e1.thinking_seconds;
                    p1Total += t;
                    if (e1.skipped) {
                        p1Cell = `<span>&#10060;</span><br><span style="font-size:0.8rem;">${e1.thinking_seconds.toFixed(2)} (+${e1.penalty_seconds})</span>`;
                        p1CellClass = ' class="sc-skip"';
                    } else {
                        const bg = getTimeColor(t);
                        const textC = t > 15 ? '#fff' : '#000';
                        p1Cell = `<span>${e1.word || ''}</span><br><span style="font-size:0.8rem;">${t.toFixed(2)}</span>`;
                        p1CellClass = ` style="background:${bg};color:${textC};"`;
                    }
                } else {
                    p1Cell = '<span style="color:#d1d5db;">--</span>';
                    p1CellClass = '';
                }

                // P2 cell
                let p2Cell = '';
                let p2CellClass = '';
                if (e2) {
                    const t = e2.skipped ? (e2.thinking_seconds + e2.penalty_seconds) : e2.thinking_seconds;
                    p2Total += t;
                    if (e2.skipped) {
                        p2Cell = `<span>&#10060;</span><br><span style="font-size:0.8rem;">${e2.thinking_seconds.toFixed(2)} (+${e2.penalty_seconds})</span>`;
                        p2CellClass = ' class="sc-skip"';
                    } else {
                        const bg = getTimeColor(t);
                        const textC = t > 15 ? '#fff' : '#000';
                        p2Cell = `<span>${e2.word || ''}</span><br><span style="font-size:0.8rem;">${t.toFixed(2)}</span>`;
                        p2CellClass = ` style="background:${bg};color:${textC};"`;
                    }
                } else {
                    p2Cell = '<span style="color:#d1d5db;">--</span>';
                    p2CellClass = '';
                }

                html += `<tr>`;
                html += `<td${p1CellClass}>${p1Cell}</td>`;
                html += `<td class="sc-plate" onclick="showViableWordsForPlate('${plate}')">${plate}</td>`;
                html += `<td${p2CellClass}>${p2Cell}</td>`;
                html += `</tr>`;
            }

            // Total row
            html += `<tr class="sc-total">`;
            html += `<td>${p1Time !== null ? p1Time.toFixed(2) : '--'}</td>`;
            html += `<td>Total</td>`;
            html += `<td>${p2Time !== null ? p2Time.toFixed(2) : '--'}</td>`;
            html += `</tr>`;

            html += '</tbody></table></div>';

            // Chat section
            html += '<div style="margin-top:20px;border-top:1px solid #e5e7eb;padding-top:16px;">';
            html += '<div style="font-weight:700;font-size:0.95rem;margin-bottom:10px;">Chat</div>';
            html += `<div id="h2hChatMessages" style="max-height:200px;overflow-y:auto;margin-bottom:10px;"></div>`;
            html += '<div style="display:flex;gap:8px;">';
            html += `<input type="text" id="h2hChatInput" placeholder="Message..." style="flex:1;padding:8px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:0.9rem;" onkeydown="if(event.key==='Enter')sendH2HChat('${challengeId}')">`;
            html += `<button onclick="sendH2HChat('${challengeId}')" style="padding:8px 16px;background:#9370db;color:white;border:none;border-radius:8px;font-weight:600;cursor:pointer;">Send</button>`;
            html += '</div></div>';

            contentEl.innerHTML = html;
            loadH2HChat(challengeId);
            subscribeH2HChat(challengeId);

        } catch (e) {
            console.error('Error loading scorecard:', e);
            contentEl.innerHTML = '<p style="text-align:center;color:#dc2626;">Error loading scorecard</p>';
        }
    }
    window.viewH2HScorecard = viewH2HScorecard;

    let h2hChatSubscription = null;

    async function loadH2HChat(challengeId) {
        const el = document.getElementById('h2hChatMessages');
        if (!el) return;
        try {
            const { data } = await sb.from('h2h_messages').select('id, user_id, text, created_at').eq('challenge_id', challengeId).order('created_at');
            if (!data || data.length === 0) {
                el.innerHTML = '<p style="text-align:center;color:#9ca3af;font-size:0.85rem;padding:8px;">No messages yet</p>';
                return;
            }
            renderH2HChatMessages(data, el);
        } catch (e) {
            console.warn('[Chat] Load error:', e);
        }
    }

    function renderH2HChatMessages(messages, el) {
        const myId = currentUser ? currentUser.id : '';
        let html = '';
        messages.forEach(m => {
            const isMe = m.user_id === myId;
            const align = isMe ? 'flex-end' : 'flex-start';
            const bg = isMe ? '#f3e8ff' : '#f3f4f6';
            const ago = formatRelativeDate(m.created_at);
            html += `<div style="display:flex;flex-direction:column;align-items:${align};margin-bottom:6px;">`;
            html += `<div style="background:${bg};padding:6px 12px;border-radius:12px;max-width:75%;font-size:0.9rem;">${m.text}</div>`;
            html += `<span style="font-size:0.7rem;color:#9ca3af;margin-top:2px;">${ago}</span>`;
            html += '</div>';
        });
        el.innerHTML = html;
        el.scrollTop = el.scrollHeight;
    }

    function subscribeH2HChat(challengeId) {
        if (h2hChatSubscription) {
            sb.removeChannel(h2hChatSubscription);
            h2hChatSubscription = null;
        }
        h2hChatSubscription = sb.channel('h2h-chat-' + challengeId)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'h2h_messages', filter: 'challenge_id=eq.' + challengeId }, (payload) => {
                const el = document.getElementById('h2hChatMessages');
                if (!el) return;
                const emptyMsg = el.querySelector('p');
                if (emptyMsg) emptyMsg.remove();
                const m = payload.new;
                const isMe = currentUser && m.user_id === currentUser.id;
                const align = isMe ? 'flex-end' : 'flex-start';
                const bg = isMe ? '#f3e8ff' : '#f3f4f6';
                const div = document.createElement('div');
                div.style.cssText = `display:flex;flex-direction:column;align-items:${align};margin-bottom:6px;`;
                div.innerHTML = `<div style="background:${bg};padding:6px 12px;border-radius:12px;max-width:75%;font-size:0.9rem;">${m.text}</div><span style="font-size:0.7rem;color:#9ca3af;margin-top:2px;">just now</span>`;
                el.appendChild(div);
                el.scrollTop = el.scrollHeight;
            })
            .subscribe();
    }

    window.sendH2HChat = async function(challengeId) {
        const input = document.getElementById('h2hChatInput');
        const text = input.value.trim();
        if (!text || !currentUser) return;
        input.value = '';
        try {
            await sb.from('h2h_messages').insert({ challenge_id: challengeId, user_id: currentUser.id, text });
        } catch (e) {
            console.warn('[Chat] Send error:', e);
            input.value = text;
        }
    };

    function closeH2HScorecardModal() {
        if (h2hChatSubscription) {
            sb.removeChannel(h2hChatSubscription);
            h2hChatSubscription = null;
        }
        document.getElementById('h2hScorecardModalBackdrop').classList.remove('show');
    }
    window.closeH2HScorecardModal = closeH2HScorecardModal;
    // ========== END HEAD-TO-HEAD FEATURE ==========

    // ========== PROFILE MODAL ==========
    window.openProfileModal = async function(userId, displayName) {
        const backdrop = document.getElementById('profileModalBackdrop');
        const content = document.getElementById('profileModalContent');
        const title = document.getElementById('profileModalTitle');
        title.textContent = displayName || 'Profile';
        content.innerHTML = '<p style="color:#6b7280;">Loading...</p>';
        backdrop.classList.add('show');

        try {
            // Fetch profile
            const { data: profile } = await sb.from('profiles').select('id, display_name, handle').eq('id', userId).single();
            const name = profile?.display_name || displayName || 'Player';
            const handle = profile?.handle;
            const initials = name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();

            // Fetch stats
            const { data: history } = await sb.from('daily_runs').select('date, total_seconds').eq('user_id', userId).not('total_seconds', 'is', null);
            const dailies = history ? history.length : 0;
            const avgTime = dailies > 0 ? (history.reduce((s, r) => s + r.total_seconds, 0) / dailies) : 0;

            // Fetch overall stats
            let beatPct = '--';
            let overallPct = '--';
            try {
                const { data: stats } = await sb.rpc('user_overall_stats', { p_user_id: userId });
                if (stats && stats.length > 0) {
                    const s = stats[0];
                    if (s.ratio != null) beatPct = (s.ratio * 100).toFixed(1) + '%';
                    if (s.percentile_rank != null) overallPct = 'Top ' + Math.max(1, Math.round(100 - s.percentile_rank)) + '%';
                }
            } catch (e) { console.warn('Stats error:', e); }

            // Fetch friend count
            let friendCount = 0;
            try {
                const { data: friends } = await sb.from('friendships').select('id').or(`user_a.eq.${userId},user_b.eq.${userId}`).eq('status', 'accepted');
                friendCount = friends ? friends.length : 0;
            } catch (e) {}

            // Fetch streak
            let streak = 0;
            if (history && history.length > 0) {
                const dates = new Set(history.map(r => r.date));
                const today = new Date();
                const fmt = d => d.toISOString().split('T')[0];
                let check = new Date(today);
                check.setHours(0,0,0,0);
                if (!dates.has(fmt(check))) {
                    check.setDate(check.getDate() - 1);
                }
                while (dates.has(fmt(check))) {
                    streak++;
                    check.setDate(check.getDate() - 1);
                }
            }

            const isSelf = currentUser && currentUser.id === userId;
            const streakHtml = streak >= 3 ? `<span style="margin-left:8px;">🔥 ${streak}</span>` : '';

            let html = '';
            html += `<div class="profile-modal-avatar">${initials}</div>`;
            html += `<div class="profile-modal-name">${name}${streakHtml}</div>`;
            if (handle) html += `<div class="profile-modal-handle">@${handle}</div>`;

            html += '<div class="profile-modal-stats">';
            html += `<div class="profile-modal-stat"><div class="profile-modal-stat-value" style="color:#d97706;">${dailies}</div><div class="profile-modal-stat-label">dailies</div></div>`;
            html += `<div class="profile-modal-stat"><div class="profile-modal-stat-value" style="color:#2563eb;">${avgTime > 0 ? avgTime.toFixed(1) : '--'}</div><div class="profile-modal-stat-label">avg time</div></div>`;
            html += `<div class="profile-modal-stat"><div class="profile-modal-stat-value" style="color:#16a34a;">${beatPct}</div><div class="profile-modal-stat-label">beat</div></div>`;
            html += `<div class="profile-modal-stat"><div class="profile-modal-stat-value" style="color:#9370db;">${overallPct}</div><div class="profile-modal-stat-label">overall</div></div>`;
            html += `<div class="profile-modal-stat"><div class="profile-modal-stat-value">${friendCount}</div><div class="profile-modal-stat-label">friends</div></div>`;
            html += '</div>';

            if (!isSelf) {
                html += `<button class="profile-modal-challenge-btn" onclick="closeProfileModal();preselectedChallengeUserId='${userId}';preselectedChallengeUserName='${name.replace(/'/g,"\\'")}';openNewChallengeModal();">⚔ Challenge</button>`;
            }

            html += `<button class="profile-modal-stats-btn" onclick="openPlayerStats('${userId}','${name.replace(/'/g,"\\'")}')">Stats</button>`;

            content.innerHTML = html;
        } catch (e) {
            console.error('Profile modal error:', e);
            content.innerHTML = '<p style="color:#dc2626;">Error loading profile</p>';
        }
    };

    window.rematchChallenge = async function(oppId, oppName, difficulty) {
        if (!currentUser) return;
        try {
            const plates = generateChallengeSequence(difficulty);
            if (plates.length < 100) { alert('Error generating plates'); return; }

            const { data, error } = await sb.rpc('create_h2h_challenge', {
                p_opponent_id: oppId,
                p_plates: plates,
                p_difficulty: difficulty
            });
            if (error) throw error;

            await playH2HChallenge(data);
        } catch (e) {
            console.error('Rematch error:', e);
            alert('Error creating rematch: ' + e.message);
        }
    };

    window.closeProfileModal = function() {
        document.getElementById('profileModalBackdrop').classList.remove('show');
    };

    // ========== PLAYER STATS ==========
    window.openPlayerStats = async function(userId, displayName) {
        const content = document.getElementById('profileModalContent');
        const title = document.getElementById('profileModalTitle');
        title.textContent = displayName + ' — Stats';
        content.innerHTML = '<p style="color:#6b7280;">Loading stats...</p>';

        const isSelf = currentUser && currentUser.id === userId;

        try {
            const { data: stats, error } = await sb.rpc('player_stats', { p_user_id: userId });
            if (error) throw error;

            let html = '';

            // Tab buttons
            const tabs = isSelf ? ['Daily', 'H2H', 'Practice'] : ['Daily'];
            html += '<div class="stats-tabs">';
            tabs.forEach((t, i) => {
                html += `<button class="stats-tab ${i === 0 ? 'active' : ''}" onclick="switchStatsTab('${t.toLowerCase()}', this)">${t}</button>`;
            });
            html += '</div>';

            // Tab contents
            html += buildDailyStats(stats, true);
            if (isSelf) {
                html += buildH2HStats(stats);
                html += buildPracticeStats(stats);
            }

            html += `<button class="stats-back-btn" onclick="openProfileModal('${userId}','${displayName.replace(/'/g, "\\'")}')">Back to Profile</button>`;

            content.innerHTML = html;
        } catch (e) {
            console.error('Stats error:', e);
            content.innerHTML = '<p style="color:#dc2626;">Error loading stats</p>';
        }
    };

    function switchStatsTab(tab, btn) {
        document.querySelectorAll('.stats-tab-content').forEach(el => el.style.display = 'none');
        document.querySelectorAll('.stats-tab').forEach(el => el.classList.remove('active'));
        btn.classList.add('active');
        const el = document.getElementById('stats-' + tab);
        if (el) el.style.display = 'block';
    }
    window.switchStatsTab = switchStatsTab;

    function formatStatsDate(iso) {
        if (!iso) return '';
        const d = new Date(iso + 'T00:00:00');
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    function statsRow(label, value, subtitle) {
        let html = '<div class="stats-row">';
        html += `<div class="stats-row-label">${label}</div>`;
        html += '<div class="stats-row-right">';
        html += `<div class="stats-row-value">${value}</div>`;
        if (subtitle) html += `<div class="stats-row-subtitle">${subtitle}</div>`;
        html += '</div></div>';
        return html;
    }

    function skipRateStr(perGame, rate) {
        if (rate == null) return '--';
        if (perGame != null) return `${perGame.toFixed(1)} per game (${rate}%)`;
        return `${rate}%`;
    }

    function finishStr(rank, total) {
        if (rank == null || total == null) return '--';
        const pct = (rank / total) * 100;
        const pctStr = pct <= 10 ? pct.toFixed(1) + '%' : Math.round(pct) + '%';
        return `#${rank} of ${total} (Top ${pctStr})`;
    }

    function buildDailyStats(s, visible) {
        let html = `<div id="stats-daily" class="stats-tab-content" style="display:${visible ? 'block' : 'none'}">`;

        html += '<div class="stats-section-label">Stats</div>';
        html += '<div class="stats-section-box">';
        html += statsRow('Daily Challenges', s.daily_games ?? 0);
        html += statsRow('Avg Time', s.daily_avg_time != null ? s.daily_avg_time.toFixed(1) + ' seconds' : '--');
        html += statsRow('Beat', s.daily_beat_pct != null ? (s.daily_beat_pct * 100).toFixed(1) + '%' : '--');
        html += statsRow('Overall', s.daily_overall_pct != null ? 'Top ' + (100 - s.daily_overall_pct).toFixed(1) + '%' : '--');
        html += statsRow('Current Streak', s.daily_current_streak ?? 0);
        html += statsRow('Longest Streak', s.daily_longest_streak ?? 0);
        html += statsRow('Skip Rate', skipRateStr(s.daily_skips_per_game, s.daily_skip_rate));
        html += '</div>';

        html += '<div class="stats-section-label">Personal Bests</div>';
        html += '<div class="stats-section-box">';
        html += statsRow('Best Finish (Rank)', finishStr(s.daily_best_finish_rank, s.daily_best_finish_total), formatStatsDate(s.daily_best_finish_date));
        html += statsRow('Best Finish (Percentile)', finishStr(s.daily_best_pct_rank, s.daily_best_pct_total), formatStatsDate(s.daily_best_pct_date));
        html += statsRow('Best Time', s.daily_best_time != null ? s.daily_best_time.toFixed(1) + ' seconds' : '--', formatStatsDate(s.daily_best_date));
        const fpD = s.daily_fastest_plate && s.daily_fastest_time != null ? `[${s.daily_fastest_plate}] ${s.daily_fastest_time.toFixed(2)} seconds` : '--';
        html += statsRow('Fastest Plate', fpD, [s.daily_fastest_word ? s.daily_fastest_word.charAt(0).toUpperCase() + s.daily_fastest_word.slice(1) : '', formatStatsDate(s.daily_fastest_date)].filter(Boolean).join(' — '));
        const hpD = s.daily_hardest_plate && s.daily_hardest_pct != null ? `[${s.daily_hardest_plate}] ${s.daily_hardest_pct}% skipped` : '--';
        html += statsRow('Hardest Plate', hpD, [s.daily_hardest_word ? s.daily_hardest_word.charAt(0).toUpperCase() + s.daily_hardest_word.slice(1) : '', formatStatsDate(s.daily_hardest_date)].filter(Boolean).join(' — '));
        html += '</div>';

        html += '</div>';
        return html;
    }

    function buildH2HStats(s) {
        let html = '<div id="stats-h2h" class="stats-tab-content" style="display:none">';

        html += '<div class="stats-section-label">Stats</div>';
        html += '<div class="stats-section-box">';
        html += statsRow('Challenges', s.h2h_games ?? 0);
        const w = s.h2h_wins ?? 0, l = s.h2h_losses ?? 0, tot = w + l;
        const record = tot === 0 ? '0-0' : `${w}-${l} (${Math.round(w / tot * 100)}%)`;
        html += statsRow('Record', record);
        const opp = s.h2h_common_opp_name ? `${s.h2h_common_opp_name} (${s.h2h_common_opp_count}x)` : '--';
        html += statsRow('Common Opponent', opp);
        html += statsRow('Skip Rate', skipRateStr(s.h2h_skips_per_game, s.h2h_skip_rate));
        html += '</div>';

        html += '<div class="stats-section-label">Personal Bests</div>';
        html += '<div class="stats-section-box">';
        html += statsRow('Best Time', s.h2h_best_time != null ? s.h2h_best_time.toFixed(1) + ' seconds' : '--',
            [formatStatsDate(s.h2h_best_date), s.h2h_best_opponent ? 'vs ' + s.h2h_best_opponent : ''].filter(Boolean).join(' — '));
        const fpH = s.h2h_fastest_plate && s.h2h_fastest_time != null ? `[${s.h2h_fastest_plate}] ${s.h2h_fastest_time.toFixed(2)} seconds` : '--';
        html += statsRow('Fastest Plate', fpH,
            [s.h2h_fastest_word ? s.h2h_fastest_word.charAt(0).toUpperCase() + s.h2h_fastest_word.slice(1) : '', formatStatsDate(s.h2h_fastest_date), s.h2h_fastest_opponent ? 'vs ' + s.h2h_fastest_opponent : ''].filter(Boolean).join(' — '));
        const closest = s.h2h_closest_margin != null ? `${s.h2h_closest_won ? 'Won' : 'Lost'} by ${s.h2h_closest_margin.toFixed(2)}` : '--';
        html += statsRow('Closest Game', closest,
            [formatStatsDate(s.h2h_closest_date), s.h2h_closest_opponent ? 'vs ' + s.h2h_closest_opponent : ''].filter(Boolean).join(' — '));
        html += '</div>';

        html += '</div>';
        return html;
    }

    function buildPracticeStats(s) {
        let html = '<div id="stats-practice" class="stats-tab-content" style="display:none">';

        html += '<div class="stats-section-label">Stats</div>';
        html += '<div class="stats-section-box">';
        html += statsRow('Practices', s.practice_games ?? 0);
        html += statsRow('Skip Rate', skipRateStr(s.practice_skips_per_game, s.practice_skip_rate));
        html += '</div>';

        html += '<div class="stats-section-label">Personal Bests</div>';
        html += '<div class="stats-section-box">';
        html += statsRow('Fastest Run', s.practice_fastest_run != null ? s.practice_fastest_run.toFixed(1) + ' seconds' : '--');
        const fpP = s.practice_fastest_plate && s.practice_fastest_time != null ? `[${s.practice_fastest_plate}] ${s.practice_fastest_time.toFixed(2)} seconds` : '--';
        html += statsRow('Fastest Plate', fpP, s.practice_fastest_word ? s.practice_fastest_word.charAt(0).toUpperCase() + s.practice_fastest_word.slice(1) : '');
        html += '</div>';

        html += '</div>';
        return html;
    }
    // ========== END PLAYER STATS ==========

    // ========== PRACTICE PLATE STATS ==========
    window.showPracticePlateStatsModal = async function() {
        const backdrop = document.getElementById('practiceStatsModalBackdrop');
        const content = document.getElementById('practiceStatsModalContent');
        backdrop.classList.add('show');
        content.innerHTML = '<p style="text-align:center;color:#6b7280;padding:20px;">Loading plate stats...</p>';

        const plates = gameHistory.map(e => e.plate);
        if (plates.length === 0) {
            content.innerHTML = '<p style="text-align:center;color:#6b7280;">No plates played</p>';
            return;
        }

        try {
            let html = '<table style="width:100%;border-collapse:collapse;font-size:0.85rem;">';
            html += '<thead><tr style="background:#f3f4f6;">';
            html += '<th style="padding:6px 8px;text-align:left;">#</th>';
            html += '<th style="padding:6px 8px;text-align:left;">Plate</th>';
            html += '<th style="padding:6px 8px;text-align:right;">Plays</th>';
            html += '<th style="padding:6px 8px;text-align:right;">Skip</th>';
            html += '<th style="padding:6px 8px;text-align:right;">Think</th>';
            html += '<th style="padding:6px 8px;text-align:right;">Top Word</th>';
            html += '</tr></thead><tbody>';

            for (let i = 0; i < plates.length; i++) {
                const plate = plates[i];

                // Fetch from all tables
                const [practiceRes, dailyRes, h2hRes] = await Promise.all([
                    sb.from('practice_plate_stats').select('word, skipped, thinking_seconds').eq('plate', plate),
                    sb.from('daily_run_entries').select('word, skipped, thinking_seconds').eq('plate', plate),
                    sb.from('h2h_run_entries').select('word, skipped, thinking_seconds').eq('plate', plate)
                ]);

                const allRows = [
                    ...(practiceRes.data || []),
                    ...(dailyRes.data || []),
                    ...(h2hRes.data || [])
                ];


                const total = allRows.length;
                const skipCount = allRows.filter(r => r.skipped).length;
                const skipPct = total > 0 ? Math.round(100 * skipCount / total) : 0;
                const validTimes = allRows.filter(r => r.thinking_seconds <= 400);
                const avgThink = validTimes.length > 0 ? (validTimes.reduce((s, r) => s + r.thinking_seconds, 0) / validTimes.length).toFixed(1) : '--';

                const wordCounts = {};
                allRows.filter(r => !r.skipped && r.word).forEach(r => {
                    const w = r.word.toLowerCase();
                    wordCounts[w] = (wordCounts[w] || 0) + 1;
                });
                const topWord = Object.entries(wordCounts).sort((a, b) => b[1] - a[1])[0];
                const topWordStr = topWord ? `${topWord[0]} (${Math.round(topWord[1] / total * 100)}%)` : '--';

                // Row color
                const t = Math.min(Math.max(skipPct, 0), 100) / 100;
                let red, green, opacity;
                if (t < 0.20) { const f = t / 0.20; red = f * 0.95; green = 0.75 + f * 0.15; opacity = 0.18 + f * 0.02; }
                else if (t < 0.50) { const f = (t - 0.20) / 0.30; red = 0.95 + f * 0.05; green = 0.90 - f * 0.65; opacity = 0.15 + f * 0.05; }
                else { const f = (t - 0.50) / 0.50; red = 1.0; green = 0.25 - f * 0.20; opacity = 0.20 + f * 0.12; }
                const rr = Math.round(255 + (red * 255 - 255) * opacity);
                const gg = Math.round(255 + (green * 255 - 255) * opacity);
                const bb = Math.round(255 * (1 - opacity));
                const bgColor = `rgb(${rr}, ${gg}, ${bb})`;

                html += `<tr style="background:${bgColor};cursor:pointer;" onclick="closePracticeStatsModal();showViableWordsForPlate('${plate}', false, 'practice')">`;
                html += `<td style="padding:8px;color:#9ca3af;">${i + 1}</td>`;
                html += `<td style="padding:8px;"><strong style="font-family:monospace;">${plate}</strong></td>`;
                html += `<td style="padding:8px;text-align:right;color:#9ca3af;">${total}</td>`;
                html += `<td style="padding:8px;text-align:right;">${total > 0 ? skipPct + '%' : '--'}</td>`;
                html += `<td style="padding:8px;text-align:right;">${avgThink}</td>`;
                html += `<td style="padding:8px;text-align:right;">${topWordStr}</td>`;
                html += '</tr>';
            }

            html += '</tbody></table>';
            content.innerHTML = html;
        } catch (e) {
            console.error('Practice stats error:', e);
            content.innerHTML = '<p style="text-align:center;color:#dc2626;">Error loading stats</p>';
        }
    };

    window.closePracticeStatsModal = function() {
        document.getElementById('practiceStatsModalBackdrop').classList.remove('show');
    };

    window.showExpectedRunModal = function() {
        const d = window._lastExpectedData;
        if (!d) {
            // Data not ready yet — compute it
            const baseElapsed = (performance.now() - startTime) / 1000;
            const totalSec = baseElapsed + penaltySeconds;
            computeExpectedTime(totalSec).then(() => {
                if (window._lastExpectedData) showExpectedRunModal();
            });
            return;
        }

        const backdrop = document.getElementById('practiceStatsModalBackdrop');
        const content = document.getElementById('practiceStatsModalContent');
        document.querySelector('#practiceStatsModalBackdrop .modal-title').textContent = 'Expected Run';
        backdrop.classList.add('show');

        const diff = d.actualTime - d.expectedTime;
        const absDiff = Math.abs(diff).toFixed(1);
        const faster = diff < 0;
        const color = faster ? '#16a34a' : '#dc2626';
        const word = faster ? 'faster' : 'slower';

        let html = '';
        html += `<div style="text-align:center;margin-bottom:12px;">`;
        html += `<div style="font-size:1.1rem;">Your time: <strong>${d.actualTime.toFixed(1)}s</strong></div>`;
        html += `<div style="font-size:1.1rem;">Expected: <strong>${d.expectedTime.toFixed(1)}s</strong></div>`;
        html += `<div style="font-size:1rem;color:${color};font-weight:600;margin-top:4px;">${absDiff}s ${word} than expected</div>`;
        html += `</div>`;

        html += '<table style="width:100%;border-collapse:collapse;font-size:0.8rem;">';
        html += '<thead><tr style="background:#f3f4f6;"><th style="padding:4px 6px;text-align:left;">#</th><th style="padding:4px 6px;text-align:left;">Plate</th><th style="padding:4px 6px;text-align:right;">Median</th><th style="padding:4px 6px;text-align:right;">Skip %</th><th style="padding:4px 6px;text-align:right;">Solves</th><th style="padding:4px 6px;text-align:right;">Skips</th></tr></thead><tbody>';
        d.breakdown.forEach((b, i) => {
            const isProrated = b.fraction < 1;
            const rowStyle = isProrated ? 'border-bottom:1px solid #f0f0f0;background:#f9fafb;font-style:italic;' : 'border-bottom:1px solid #f0f0f0;';
            html += `<tr style="${rowStyle}">`;
            html += `<td style="padding:4px 6px;color:#9ca3af;">${i + 1}</td>`;
            html += `<td style="padding:4px 6px;font-weight:600;font-family:monospace;">${b.plate}${isProrated ? ' <span style="font-size:0.7rem;color:#9ca3af;font-weight:400;">(' + Math.round(b.fraction * 100) + '%)</span>' : ''}</td>`;
            html += `<td style="padding:4px 6px;text-align:right;">${b.medianThink.toFixed(1)}s</td>`;
            html += `<td style="padding:4px 6px;text-align:right;">${Math.round(b.skipRate * 100)}%</td>`;
            html += `<td style="padding:4px 6px;text-align:right;">${b.cumulSolves.toFixed(2)}</td>`;
            html += `<td style="padding:4px 6px;text-align:right;">${b.cumulSkips.toFixed(2)}</td>`;
            html += `</tr>`;
        });
        html += '</tbody></table>';
        html += `<div style="font-size:0.8rem;color:#6b7280;margin-top:8px;padding:6px;background:#f9fafb;border-radius:6px;">`;
        html += `Thinking: ${d.totalThinking.toFixed(1)}s + Penalty: ${d.penalty.toFixed(1)}s (${d.skips.toFixed(1)} skips) = <strong>${d.expectedTime.toFixed(1)}s</strong>`;
        html += `</div>`;

        content.innerHTML = html;
    };
    // ========== END PRACTICE PLATE STATS ==========

    // On page unload, save practice stats locally (will be submitted on next load)
    window.addEventListener('pagehide', () => {
        console.log('[Practice] pagehide fired', { gameMode, histLen: gameHistory.length, submitted: practiceStatsSubmitted });
        if (gameMode === 'practice' && gameHistory.length > 0 && !practiceStatsSubmitted) {
            savePracticeStatsLocally();
        }
    });

    loadDictionary();
    loadDifficulty();

    // Precache yesterday's leaderboard silently
    setTimeout(() => {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yStr = yesterday.toISOString().split('T')[0];
        if (yStr >= EARLIEST_DATE) loadLeaderboard(yStr);
    }, 2000);

// Auto-load today's leaderboard when page is fully loaded
window.addEventListener('load', function() {
    // Auto-load leaderboard
    setTimeout(function() {
        try {
            const today = getTodayString();
            const datePicker = document.getElementById('leaderboardDatePicker');
            if (datePicker) {
                datePicker.value = today;
                datePicker.max = today;
            }
        } catch (error) {
            console.error('Error initializing date picker:', error);
        }
    }, 500);

    // Check for challenge ID in URL
    const urlParams = new URLSearchParams(window.location.search);
    const challengeId = urlParams.get('challenge');
    if (challengeId && currentUser) {
        setTimeout(() => { playH2HChallenge(challengeId); }, 500);
    }
});
