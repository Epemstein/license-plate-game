
    // One-time migration from implicit to PKCE flow (v266)
    if (!localStorage.getItem('pkce_migrated_v266')) {
        Object.keys(localStorage).filter(k => k.startsWith('sb-')).forEach(k => localStorage.removeItem(k));
        localStorage.setItem('pkce_migrated_v266', '1');
    }

    // === TAB SWITCHING ===
    const validTabs = ['game', 'leaderboard', 'challenges', 'profile', 'feedback'];
    const savedTab = sessionStorage.getItem('activeTab');
    if (savedTab && validTabs.includes(savedTab)) {
        setTimeout(() => switchTab(savedTab), 0);
    }

    function switchTab(tabName) {
        sessionStorage.setItem('activeTab', tabName);
        // Hide all tabs
        document.getElementById('gameTab').classList.remove('active');
        document.getElementById('leaderboardTab').classList.remove('active');
        document.getElementById('challengesTab').classList.remove('active');
        document.getElementById('profileTab').classList.remove('active');
        document.getElementById('feedbackTab').classList.remove('active');

        // Deactivate all tab buttons
        document.querySelectorAll('.tab-bar-item').forEach(btn => btn.classList.remove('active'));

        // Show selected tab
        document.getElementById(tabName + 'Tab').classList.add('active');

        // Activate button
        const buttons = document.querySelectorAll('.tab-bar-item');
        const tabMap = { game: 0, leaderboard: 1, challenges: 2, profile: 3, feedback: 4 };
        buttons[tabMap[tabName]].classList.add('active');

        // On leaderboard tab, auto-load today (skip refetch if cached)
        if (tabName === 'leaderboard') {
            const t = getTodayString();
            const picker = document.getElementById('leaderboardDatePicker');
            if (picker) {
                picker.value = t;
                picker.max = t;
            }
            if (cachedScores.length && currentViewingDate === t) {
                // Already have data — just re-render without hiding buttons
                renderLeaderboardRows(cachedScores);
            } else {
                displayLeaderboard(t);
            }
        }

        // On challenges tab, load challenges
        if (tabName === 'challenges') {
            loadH2HChallenges();
        }

        // On profile tab, update profile display
        if (tabName === 'profile') {
            updateProfileTab();
        }

        // On feedback tab, load messages
        if (tabName === 'feedback') {
            loadFeedback();
        }
    }
    window.switchTab = switchTab;

    // Leaderboard filter (global/friends stub)
    let leaderboardFilter = 'global';
    function setLeaderboardFilter(filter) {
        leaderboardFilter = filter;
        window._lbPage = 0;
        document.getElementById('lbGlobalBtn').classList.toggle('active', filter === 'global');
        document.getElementById('lbFriendsBtn').classList.toggle('active', filter === 'friends');
        // Refetch scores but only re-render the rows (not buttons above)
        const dateStr = currentViewingDate || getTodayString();
        (async () => {
            const oldIds = previousLeaderboardIds;
            const scores = await loadLeaderboard(dateStr);
            if (scores.length) {
                cachedScores = scores;
                const friendCount = scores.filter(s => s.isFriend || s.isMe).length;
                document.getElementById('lbGlobalBtn').textContent = `Global (${scores.length})`;
                document.getElementById('lbFriendsBtn').textContent = `Friends (${friendCount})`;
                // Update My Run rank
                const myScore = currentUser ? scores.find(s => s.isMe || s.userId === currentUser.id) : null;
                if (myScore) {
                    const myRank = scores.indexOf(myScore) + 1;
                    const el = document.getElementById('myRunTime');
                    if (el) el.innerHTML = `${myScore.totalTime.toFixed(2)} <span style="font-size:0.8rem;color:#756e5c;font-weight:500;">(#${myRank} of ${scores.length})</span>`;
                }
                renderLeaderboardRows(scores, oldIds);
            }
        })();
    }
    window.setLeaderboardFilter = setLeaderboardFilter;

    let cachedScores = [];
    let previousLeaderboardIds = new Set();
    let previousLeaderboardIds_unused = new Set();

    function renderLeaderboardRows(scores, oldIds) {
        let displayScores = scores;
        if (leaderboardFilter === 'friends') {
            displayScores = scores.filter(s => s.isFriend || s.isMe);
            if (displayScores.length === 0) {
                document.getElementById('leaderboardContent').innerHTML = '<p style="text-align:center;color:#756e5c;padding:20px;">No friends have played this date</p>';
                return;
            }
        }

        const userHasPlayed = currentUser && scores.some(s => s.userId === currentUser.id || s.isMe);
        const isPastDate = currentViewingDate !== getTodayString();

        // Pagination
        const pageSize = 50;
        const lbPage = window._lbPage || 0;
        const start = lbPage * pageSize;
        const paged = displayScores.slice(start, start + pageSize);
        const totalPages = Math.ceil(displayScores.length / pageSize);

        // Header row
        let h = '<div style="max-width:640px;margin:0 auto;">';
        h += '<div style="display:flex;align-items:center;padding:8px 12px;font-size:0.75rem;font-weight:600;color:#756e5c;text-transform:uppercase;letter-spacing:0.5px;border-bottom:2px solid #1a1714;">';
        h += '<div style="width:40px;text-align:center;">#</div>';
        h += '<div style="flex:1;padding-left:8px;">Player</div>';
        h += '<div style="width:80px;text-align:right;">Time</div>';
        h += '</div>';

        paged.forEach((s, i) => {
            const rank = start + i + 1;
            const isMe = s.isMe || (currentUser && s.userId === currentUser.id);
            const initials = s.userName === 'Anonymous' ? '?' : s.userName.split(' ').slice(0, 2).map(w => w[0] || '').join('').toUpperCase();
            const streakHtml = s.streak && s.streak > 1 ? `<span style="color:#f59e0b;font-size:0.8rem;margin-left:6px;">🔥${s.streak}</span>` : '';
            const rankColor = rank <= 3 ? '#ff3b30' : '#756e5c';
            const rankDisplay = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '#' + rank;

            let clickAttr = '';
            if (userHasPlayed || isPastDate) {
                clickAttr = `onclick="viewPlayerRun('${s.userId}','${currentViewingDate}','${s.userName.replace(/'/g,"\\'")}',${s.totalTime},${s.percentile||0},${s.median||0},${s.totalPlayers||0},${rank})"`;
            }

            const bgColor = isMe ? 'rgba(147,112,219,0.06)' : 'transparent';

            h += `<div style="display:flex;align-items:center;padding:10px 12px;border-bottom:1px solid #d9cfb6;cursor:pointer;background:${bgColor};" ${clickAttr}>`;
            h += `<div style="width:40px;text-align:center;font-weight:800;font-size:${rank <= 3 ? '1.1rem' : '0.9rem'};color:${rankColor};font-family:'Public Sans',system-ui,sans-serif;">${rankDisplay}</div>`;
            h += `<div style="width:32px;height:32px;border-radius:50%;background:${isMe ? '#9370db' : '#d9cfb6'};color:${isMe ? '#fff' : '#4a4338'};display:flex;align-items:center;justify-content:center;font-size:0.7rem;font-weight:700;margin-right:10px;flex-shrink:0;">${initials}</div>`;

            const nameColor = s.userName === 'Anonymous' ? '#9ca3af' : isMe ? '#9370db' : (s.isFriend ? '#14a06b' : '#1a1714');
            const nameClick = s.userName !== 'Anonymous' ? `onclick="event.stopPropagation();openProfileModal('${s.userId}','${s.userName.replace(/'/g,"\\'")}')"` : '';
            h += `<div style="flex:1;min-width:0;display:flex;align-items:center;gap:4px;">`;
            h += `<span style="font-family:'Public Sans',system-ui,sans-serif;font-weight:600;font-size:0.95rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:${nameColor};cursor:pointer;" ${nameClick}>${s.userName}</span>`;
            h += streakHtml;
            h += '</div>';

            const timeColor = isMe ? '#9370db' : (s.isFriend ? '#14a06b' : '#1a1714');
            if (userHasPlayed || isPastDate) {
                h += `<div style="width:80px;text-align:right;font-weight:700;font-size:0.95rem;font-variant-numeric:tabular-nums;font-family:'Public Sans',system-ui,sans-serif;color:${timeColor};">${s.totalTime.toFixed(2)}</div>`;
            } else {
                h += `<div style="width:80px;text-align:right;font-weight:700;font-size:0.95rem;filter:blur(5px);user-select:none;">${s.totalTime.toFixed(2)}</div>`;
            }
            h += '</div>';
        });

        // Pagination footer
        if (totalPages > 1) {
            h += `<div style="display:flex;align-items:center;justify-content:space-between;padding:12px;border-top:2px solid #1a1714;font-size:0.85rem;font-family:'Public Sans',system-ui,sans-serif;">`;
            h += `<span style="color:#756e5c;font-style:italic;">${formatDateForDisplay(currentViewingDate)}</span>`;
            h += `<div style="display:flex;align-items:center;gap:8px;">`;
            h += `<button onclick="lbPrevPage()" style="padding:4px 10px;border:2px solid ${lbPage > 0 ? '#1a1714' : '#d9cfb6'};border-radius:4px;background:#fefcf7;cursor:${lbPage > 0 ? 'pointer' : 'default'};font-weight:700;box-shadow:none;" ${lbPage === 0 ? 'disabled' : ''}>&lt;</button>`;
            h += `<span style="font-weight:600;">${start + 1}–${Math.min(start + pageSize, displayScores.length)} of ${displayScores.length}</span>`;
            h += `<button onclick="lbNextPage()" style="padding:4px 10px;border:2px solid ${start + pageSize < displayScores.length ? '#1a1714' : '#d9cfb6'};border-radius:4px;background:#fefcf7;cursor:${start + pageSize < displayScores.length ? 'pointer' : 'default'};font-weight:700;box-shadow:none;" ${start + pageSize >= displayScores.length ? 'disabled' : ''}>&gt;</button>`;
            h += '</div></div>';
        }
        h += '</div>';

        document.getElementById('leaderboardContent').innerHTML = h;

        // Track current IDs for next refresh
        previousLeaderboardIds = new Set(scores.map(s => s.userId));
    }

    window._lbPage = 0;
    function lbNextPage() { window._lbPage++; renderLeaderboardRows(cachedScores); }
    function lbPrevPage() { if (window._lbPage > 0) { window._lbPage--; renderLeaderboardRows(cachedScores); } }
    window.lbNextPage = lbNextPage;
    window.lbPrevPage = lbPrevPage;

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
            <div id="friendRequestsSection"></div>
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
                <div style="flex:1;text-align:center;border-right:1px solid #e5e7eb;">
                    <div style="font-weight:700;font-size:1.1rem;" id="statOverall">--</div>
                    <div style="font-size:0.75rem;color:#6b7280;">overall</div>
                </div>
                <div style="flex:1;text-align:center;cursor:pointer;" onclick="showFriendsPage()">
                    <div style="font-weight:700;font-size:1.1rem;color:#9370db;" id="statFriends">--</div>
                    <div style="font-size:0.75rem;color:#6b7280;">friends</div>
                </div>
            </div>
            <div style="display:flex;flex-direction:column;gap:8px;">
                <button onclick="showHistoricalScores()" style="width:100%;padding:14px;background:#fbbf24;color:#92400e;border:2px solid #1a1714;border-radius:5px;font-size:0.95rem;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:space-between;box-shadow:3px 3px 0 #1a1714;" onmouseenter="this.style.transform='translate(-1px,-1px)';this.style.boxShadow='5px 5px 0 #1a1714'" onmouseleave="this.style.transform='';this.style.boxShadow='3px 3px 0 #1a1714'">
                    <span>Historical Scores</span><span>&#8250;</span>
                </button>
                <button onclick="showPracticeHistory()" style="width:100%;padding:14px;background:#f3e8ff;color:#7c5cbf;border:2px solid #1a1714;border-radius:5px;font-size:0.95rem;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:space-between;box-shadow:3px 3px 0 #1a1714;" onmouseenter="this.style.transform='translate(-1px,-1px)';this.style.boxShadow='5px 5px 0 #1a1714'" onmouseleave="this.style.transform='';this.style.boxShadow='3px 3px 0 #1a1714'">
                    <span>Practice History</span><span>&#8250;</span>
                </button>
                <button onclick="showMyStats()" style="width:100%;padding:14px;background:rgba(37,99,235,0.08);color:#2563eb;border:2px solid #1a1714;border-radius:5px;font-size:0.95rem;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:space-between;box-shadow:3px 3px 0 #1a1714;" onmouseenter="this.style.transform='translate(-1px,-1px)';this.style.boxShadow='5px 5px 0 #1a1714'" onmouseleave="this.style.transform='';this.style.boxShadow='3px 3px 0 #1a1714'">
                    <span>Your Stats</span><span>&#8250;</span>
                </button>
                <button onclick="showGlobalStats()" style="width:100%;padding:14px;background:rgba(251,146,60,0.1);color:#c2410c;border:2px solid #1a1714;border-radius:5px;font-size:0.95rem;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:space-between;box-shadow:3px 3px 0 #1a1714;" onmouseenter="this.style.transform='translate(-1px,-1px)';this.style.boxShadow='5px 5px 0 #1a1714'" onmouseleave="this.style.transform='';this.style.boxShadow='3px 3px 0 #1a1714'">
                    <span>Global Stats</span><span>&#8250;</span>
                </button>
            </div>
            <div style="display:flex;gap:10px;margin-top:24px;justify-content:center;">
                <button onclick="showEditProfile()" style="padding:10px 20px;background:#eee9db;color:#4a4338;border:2px solid #d9cfb6;border-radius:5px;font-weight:600;font-size:0.85rem;cursor:pointer;box-shadow:none;">Edit Profile</button>
                <button class="profile-signout-btn" onclick="signOut()">Sign Out</button>
            </div>
        `;
        // Load stats asynchronously
        if (currentUser) {
            loadProfileStats();
            // Load friends inline to avoid timing issues
            (async () => {
                try {
                    // Friend count
                    const [{ data: fa }, { data: fb }] = await Promise.all([
                        sb.from('friendships').select('id').eq('status', 'accepted').eq('user_a', currentUser.id),
                        sb.from('friendships').select('id').eq('status', 'accepted').eq('user_b', currentUser.id)
                    ]);
                    const fc = document.getElementById('statFriends');
                    if (fc) fc.textContent = (fa ? fa.length : 0) + (fb ? fb.length : 0);

                    // Friend requests
                    const [{ data: ra }, { data: rb }] = await Promise.all([
                        sb.from('friendships').select('id, user_a, user_b, requested_by').eq('status', 'pending').eq('user_a', currentUser.id),
                        sb.from('friendships').select('id, user_a, user_b, requested_by').eq('status', 'pending').eq('user_b', currentUser.id)
                    ]);
                    const incoming = [...(ra || []), ...(rb || [])].filter(f => f.requested_by !== currentUser.id);
                    const frSection = document.getElementById('friendRequestsSection');
                    if (frSection && incoming.length > 0) {
                        const otherIds = incoming.map(f => f.user_a === currentUser.id ? f.user_b : f.user_a);
                        const { data: profiles } = await sb.from('profiles').select('id, display_name, handle').in('id', otherIds);
                        const nameMap = {};
                        (profiles || []).forEach(p => nameMap[p.id] = p.display_name || '@' + p.handle);
                        let html = '<div style="display:flex;flex-direction:column;gap:8px;margin:12px 0;">';
                        incoming.forEach(f => {
                            const otherId = f.user_a === currentUser.id ? f.user_b : f.user_a;
                            const name = nameMap[otherId] || 'Unknown';
                            html += `<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:#fefcf7;border:2px solid #1a1714;border-radius:5px;box-shadow:3px 3px 0 #1a1714;">`;
                            html += `<span style="font-weight:700;font-size:0.95rem;">${name}</span>`;
                            html += `<div style="display:flex;gap:6px;">`;
                            html += `<button onclick="respondFriend('${f.id}','accepted')" style="padding:6px 14px;background:#14a06b;color:white;border:2px solid #1a1714;border-radius:5px;font-weight:700;font-size:0.8rem;cursor:pointer;box-shadow:2px 2px 0 #1a1714;">Accept</button>`;
                            html += `<button onclick="respondFriend('${f.id}','declined')" style="padding:6px 14px;background:#ff3b30;color:white;border:2px solid #1a1714;border-radius:5px;font-weight:700;font-size:0.8rem;cursor:pointer;box-shadow:2px 2px 0 #1a1714;">Decline</button>`;
                            html += '</div></div>';
                        });
                        html += '</div>';
                        frSection.innerHTML = html;
                    }
                } catch (e) { console.error('[Friends]', e); }
            })();
        }
    }

    function renderProfileSetup(container, currentName) {
        const suggested = (currentName || '').toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').slice(0, 20);
        container.innerHTML = `
            <div style="max-width:360px;margin:40px auto;text-align:left;">
                <h2 style="text-align:center;margin-bottom:4px;">Set up your profile</h2>
                <p style="text-align:center;color:#756e5c;font-size:0.9rem;margin-bottom:24px;">Choose a display name and username to appear on leaderboards.</p>
                <div style="margin-bottom:16px;">
                    <label style="font-size:0.8rem;font-weight:600;color:#756e5c;">Display Name</label>
                    <input id="setupDisplayName" type="text" value="${currentName || ''}" maxlength="40" style="width:100%;padding:10px 12px;border:2px solid #d9cfb6;border-radius:5px;font-size:1rem;margin-top:4px;background:#fefcf7;">
                </div>
                <div style="margin-bottom:16px;">
                    <label style="font-size:0.8rem;font-weight:600;color:#756e5c;">Username</label>
                    <div style="display:flex;align-items:center;gap:4px;padding:10px 12px;border:2px solid #d9cfb6;border-radius:5px;margin-top:4px;background:#fefcf7;">
                        <span style="color:#756e5c;font-weight:600;">@</span>
                        <input id="setupHandle" type="text" value="${suggested}" maxlength="20" style="border:none;outline:none;font-size:1rem;flex:1;background:transparent;" oninput="this.value=this.value.toLowerCase().replace(/[^a-z0-9_]/g,'')">
                    </div>
                    <div style="font-size:0.75rem;color:#756e5c;margin-top:4px;">3–20 chars, letters/numbers/underscores. Can't be changed.</div>
                </div>
                <div id="setupError" style="color:#ff3b30;font-size:0.85rem;margin-bottom:8px;display:none;"></div>
                <button onclick="submitProfileSetup()" style="width:100%;padding:14px;background:#9370db;color:white;border:2px solid #1a1714;border-radius:5px;font-size:1rem;font-weight:700;cursor:pointer;box-shadow:3px 3px 0 #1a1714;" onmouseenter="this.style.transform='translate(-1px,-1px)';this.style.boxShadow='5px 5px 0 #1a1714'" onmouseleave="this.style.transform='';this.style.boxShadow='3px 3px 0 #1a1714'">Save Profile</button>
            </div>
        `;
    }
    window.renderProfileSetup = renderProfileSetup;

    async function submitProfileSetup() {
        const handle = document.getElementById('setupHandle').value.trim();
        const displayName = document.getElementById('setupDisplayName').value.trim();
        const errorEl = document.getElementById('setupError');
        errorEl.style.display = 'none';

        if (!/^[a-zA-Z0-9_]{3,20}$/.test(handle)) {
            errorEl.textContent = 'Username must be 3–20 characters (letters, numbers, underscores).';
            errorEl.style.display = 'block';
            return;
        }

        try {
            // Check handle uniqueness
            const { data: existing } = await sb.from('profiles').select('id').eq('handle', handle.toLowerCase());
            if (existing && existing.length > 0 && existing[0].id !== currentUser.id) {
                errorEl.textContent = 'That username is taken.';
                errorEl.style.display = 'block';
                return;
            }

            const { error } = await sb.from('profiles')
                .update({ handle: handle.toLowerCase(), display_name: displayName || handle })
                .eq('id', currentUser.id);
            if (error) throw error;

            document.getElementById('userName').textContent = displayName || handle;
            updateProfileTab();
        } catch (e) {
            errorEl.textContent = e.message || 'Error saving profile.';
            errorEl.style.display = 'block';
        }
    }
    window.submitProfileSetup = submitProfileSetup;

    function showEditProfile() {
        const container = document.getElementById('profileContent');
        sb.from('profiles').select('display_name, handle').eq('id', currentUser.id).single()
            .then(({ data }) => {
                const name = data?.display_name || '';
                const handle = data?.handle || '';
                container.innerHTML = `
                    <div style="max-width:360px;margin:20px auto;text-align:left;">
                        <button onclick="updateProfileTab()" style="padding:6px 14px;border:none;background:#eee9db;border-radius:5px;cursor:pointer;font-size:0.85rem;margin-bottom:12px;">&larr; Back</button>
                        <h3 style="margin:0 0 16px;">Edit Profile</h3>
                        <div style="margin-bottom:16px;">
                            <label style="font-size:0.8rem;font-weight:600;color:#756e5c;">Display Name</label>
                            <input id="editDisplayName" type="text" value="${name}" maxlength="40" style="width:100%;padding:10px 12px;border:2px solid #d9cfb6;border-radius:5px;font-size:1rem;margin-top:4px;background:#fefcf7;">
                        </div>
                        <div style="margin-bottom:16px;">
                            <label style="font-size:0.8rem;font-weight:600;color:#756e5c;">Username</label>
                            <div style="padding:10px 12px;border:2px solid #d9cfb6;border-radius:5px;margin-top:4px;background:#eee9db;color:#756e5c;">@${handle}</div>
                            <div style="font-size:0.75rem;color:#756e5c;margin-top:4px;">Username cannot be changed.</div>
                        </div>
                        <div id="editError" style="color:#ff3b30;font-size:0.85rem;margin-bottom:8px;display:none;"></div>
                        <button onclick="submitEditProfile()" style="width:100%;padding:14px;background:#9370db;color:white;border:2px solid #1a1714;border-radius:5px;font-size:1rem;font-weight:700;cursor:pointer;box-shadow:3px 3px 0 #1a1714;" onmouseenter="this.style.transform='translate(-1px,-1px)';this.style.boxShadow='5px 5px 0 #1a1714'" onmouseleave="this.style.transform='';this.style.boxShadow='3px 3px 0 #1a1714'">Save</button>
                    </div>
                `;
            });
    }
    window.showEditProfile = showEditProfile;

    async function submitEditProfile() {
        const displayName = document.getElementById('editDisplayName').value.trim();
        const errorEl = document.getElementById('editError');
        errorEl.style.display = 'none';
        if (!displayName) {
            errorEl.textContent = 'Display name cannot be empty.';
            errorEl.style.display = 'block';
            return;
        }
        try {
            const { error } = await sb.from('profiles')
                .update({ display_name: displayName })
                .eq('id', currentUser.id);
            if (error) throw error;
            document.getElementById('userName').textContent = displayName;
            updateProfileTab();
        } catch (e) {
            errorEl.textContent = e.message || 'Error saving.';
            errorEl.style.display = 'block';
        }
    }
    window.submitEditProfile = submitEditProfile;

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
                    stats.avgTime = (data.reduce((s, r) => s + r.total_seconds, 0) / data.length).toFixed(2);
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

    let histCalMonth = new Date();
    let histCalContainer = null; // tracks which element the calendar renders into
    let histCalUserId = null; // whose calendar is showing
    let histCalUserName = null;

    async function showHistoricalScores() {
        if (!currentUser) return;
        const container = document.getElementById('profileContent');
        container.innerHTML = '<p style="text-align:center;color:#6b7280;padding:20px;">Loading...</p>';

        try {
            // Fetch all runs (including incomplete)
            const { data: runs } = await sb
                .from('daily_runs')
                .select('date, total_seconds')
                .eq('user_id', currentUser.id)
                .order('date', { ascending: false });

            if (!runs || !runs.length) {
                container.innerHTML = `
                    <button onclick="updateProfileTab()" style="padding:6px 14px;border:none;background:#f3f4f6;border-radius:8px;cursor:pointer;font-size:0.85rem;">&larr; Back</button>
                    <p style="text-align:center;color:#6b7280;margin-top:20px;">No daily scores yet.</p>`;
                return;
            }

            // Batch fetch percentiles for all completed runs
            const completedDates = runs.filter(r => r.total_seconds != null).map(r => r.date);
            const pctByDate = {};
            if (completedDates.length > 0) {
                const { data: pctData } = await sb.rpc('batch_percentiles', {
                    p_user_id: currentUser.id,
                    p_dates: completedDates
                });
                if (pctData) pctData.forEach(p => { pctByDate[p.date] = p.percentile; });
            }

            // Build lookup
            const runByDate = {};
            runs.forEach(r => { runByDate[r.date] = r; });

            // Store for rendering
            window._histRunByDate = runByDate;
            window._histPctByDate = pctByDate;
            histCalMonth = new Date();
            histCalContainer = container;
            histCalUserId = currentUser.id;
            histCalUserName = null;
            renderHistoricalCalendar();
        } catch(e) {
            console.error('Error loading historical scores:', e);
            container.innerHTML = `
                <button onclick="updateProfileTab()" style="padding:6px 14px;border:none;background:#f3f4f6;border-radius:8px;cursor:pointer;font-size:0.85rem;">&larr; Back</button>
                <p style="text-align:center;color:#dc2626;">Error loading scores</p>`;
        }
    }
    window.showHistoricalScores = showHistoricalScores;

    // === PRACTICE HISTORY ===
    async function showPracticeHistory() {
        const container = document.getElementById('profileContent');
        container.innerHTML = '<p style="text-align:center;color:#756e5c;padding:20px;">Loading practice history...</p>';

        try {
            const { data, error } = await sb.from('practice_runs')
                .select('id, total_seconds, difficulty, plates_solved, plates_seen, expected_seconds, created_at')
                .eq('user_id', currentUser.id)
                .order('created_at', { ascending: false })
                .limit(100);

            let html = '<button onclick="updateProfileTab()" style="padding:6px 14px;border:none;background:#eee9db;border-radius:5px;cursor:pointer;font-size:0.85rem;margin-bottom:12px;">&larr; Back</button>';
            html += '<h3 style="margin:0 0 12px;">Practice History</h3>';

            if (!data || data.length === 0) {
                html += '<p style="color:#756e5c;">No practice runs yet.</p>';
            } else {
                data.forEach(r => {
                    const date = new Date(r.created_at);
                    const dateStr = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
                    const xtDelta = r.expected_seconds != null ? (r.expected_seconds - r.total_seconds) : null;
                    const xtHtml = xtDelta != null
                        ? `<span style="font-size:0.8rem;font-weight:600;color:${xtDelta >= 0 ? '#14a06b' : '#ff3b30'};">(${xtDelta >= 0 ? '+' : ''}${xtDelta.toFixed(1)})</span>`
                        : '';
                    html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border-bottom:1px solid #d9cfb6;">
                        <div><span style="font-weight:600;">${r.total_seconds.toFixed(1)}</span> ${xtHtml} <span style="font-size:0.8rem;color:#756e5c;margin-left:6px;">${r.plates_solved}/${r.plates_seen} · D${r.difficulty || 0}</span></div>
                        <span style="font-size:0.8rem;color:#756e5c;">${dateStr}</span>
                    </div>`;
                });
            }
            container.innerHTML = html;
        } catch (e) {
            container.innerHTML = '<button onclick="updateProfileTab()" style="padding:6px 14px;border:none;background:#eee9db;border-radius:5px;cursor:pointer;font-size:0.85rem;">&larr; Back</button><p style="color:#ff3b30;">Error loading practice history</p>';
        }
    }
    window.showPracticeHistory = showPracticeHistory;

    // === MY STATS ===
    async function showMyStats() {
        const container = document.getElementById('profileContent');
        container.innerHTML = '<p style="text-align:center;color:#756e5c;padding:20px;">Loading stats...</p>';

        try {
            const { data: stats } = await sb.rpc('player_stats', { p_user_id: currentUser.id });
            const s = stats;

            let html = '<button onclick="updateProfileTab()" style="padding:6px 14px;border:none;background:#eee9db;border-radius:5px;cursor:pointer;font-size:0.85rem;margin-bottom:12px;">&larr; Back</button>';
            html += '<h3 style="margin:0 0 12px;">Your Stats</h3>';

            // Daily section
            html += '<div style="font-size:0.8rem;font-weight:600;color:#756e5c;margin:14px 0 6px 4px;">Daily Challenge</div>';
            html += '<div class="stats-section-box">';
            html += statsRow('Games Played', s.daily_games || '--');
            html += statsRow('Best Time', s.daily_best_time ? s.daily_best_time.toFixed(1) : '--');
            html += statsRow('Avg Time', s.daily_avg_time ? s.daily_avg_time.toFixed(1) : '--');
            html += statsRow('Skip Rate', s.daily_skip_rate != null ? s.daily_skip_rate + '%' : '--');
            html += statsRow('Current Streak', s.daily_current_streak || '--');
            html += statsRow('Longest Streak', s.daily_longest_streak || '--');
            html += '</div>';

            // H2H section
            html += '<div style="font-size:0.8rem;font-weight:600;color:#756e5c;margin:14px 0 6px 4px;">Head to Head</div>';
            html += '<div class="stats-section-box">';
            html += statsRow('Record', (s.h2h_wins || 0) + 'W - ' + (s.h2h_losses || 0) + 'L');
            html += statsRow('Best Time', s.h2h_best_time ? s.h2h_best_time.toFixed(1) : '--');
            html += statsRow('Skip Rate', s.h2h_skip_rate != null ? s.h2h_skip_rate + '%' : '--');
            html += '</div>';

            // Practice section
            html += '<div style="font-size:0.8rem;font-weight:600;color:#756e5c;margin:14px 0 6px 4px;">Practice</div>';
            html += '<div class="stats-section-box">';
            html += statsRow('Games', s.practice_games || '--');
            html += statsRow('Fastest Run', s.practice_fastest_run ? s.practice_fastest_run.toFixed(1) : '--');
            html += statsRow('Skip Rate', s.practice_skip_rate != null ? s.practice_skip_rate + '%' : '--');
            html += '</div>';

            container.innerHTML = html;
        } catch (e) {
            container.innerHTML = '<button onclick="updateProfileTab()" style="padding:6px 14px;border:none;background:#eee9db;border-radius:5px;cursor:pointer;font-size:0.85rem;">&larr; Back</button><p style="color:#ff3b30;">Error loading stats</p>';
        }
    }
    window.showMyStats = showMyStats;

    function statsRow(label, value, subtitle) {
        const sub = subtitle ? `<div class="stats-row-subtitle">${subtitle}</div>` : '';
        return `<div class="stats-row"><span class="stats-row-label">${label}</span><div class="stats-row-right"><span class="stats-row-value">${value}</span>${sub}</div></div>`;
    }

    // === GLOBAL STATS ===
    async function showGlobalStats() {
        const container = document.getElementById('profileContent');
        container.innerHTML = '<p style="text-align:center;color:#756e5c;padding:20px;">Loading global stats...</p>';

        try {
            const { data: records } = await sb.rpc('global_records');
            const r = records;

            let html = '<button onclick="updateProfileTab()" style="padding:6px 14px;border:none;background:#eee9db;border-radius:5px;cursor:pointer;font-size:0.85rem;margin-bottom:12px;">&larr; Back</button>';
            html += '<h3 style="margin:0 0 12px;">Global Stats</h3>';

            // Records
            html += '<div style="font-size:0.8rem;font-weight:600;color:#756e5c;margin:14px 0 6px 4px;">Records</div>';
            html += '<div class="stats-section-box">';
            html += statsRow('Fastest Run', r.fastest_run?.total_seconds ? r.fastest_run.total_seconds.toFixed(1) + ' — ' + (r.fastest_run.display_name || 'Anonymous') : '--');
            html += statsRow('Fastest Word', r.fastest_word?.thinking_seconds ? r.fastest_word.thinking_seconds.toFixed(2) + ' "' + r.fastest_word.word + '" — ' + (r.fastest_word.display_name || 'Anonymous') : '--');
            html += statsRow('Longest Streak', r.longest_streak?.streak ? r.longest_streak.streak + ' days — ' + (r.longest_streak.display_name || 'Anonymous') : '--');
            html += statsRow('Hardest Solve', r.hardest_solve?.skip_pct ? r.hardest_solve.skip_pct + '% skip "' + r.hardest_solve.word + '" — ' + (r.hardest_solve.display_name || 'Anonymous') : '--');
            html += statsRow('Reigning Champ', r.reigning_champ?.total_seconds ? r.reigning_champ.total_seconds.toFixed(1) + ' — ' + (r.reigning_champ.display_name || 'Anonymous') : '--');
            html += '</div>';

            // Averages
            html += '<div style="font-size:0.8rem;font-weight:600;color:#756e5c;margin:14px 0 6px 4px;">Averages</div>';
            html += '<div class="stats-section-box">';
            html += statsRow('Run Time', r.mean_run_time.toFixed(1) + ' / ' + r.median_run_time.toFixed(1), 'mean / median');
            html += statsRow('Solve Time', r.mean_solve_time.toFixed(1) + ' / ' + r.median_solve_time.toFixed(1), 'mean / median');
            html += statsRow('Skip Time', r.mean_skip_time.toFixed(1) + ' / ' + r.median_skip_time.toFixed(1), 'mean / median');
            html += statsRow('Skip Rate', r.avg_skip_pct.toFixed(1) + '%');
            html += '</div>';

            // Totals
            html += '<div style="font-size:0.8rem;font-weight:600;color:#756e5c;margin:14px 0 6px 4px;">Totals</div>';
            html += '<div class="stats-section-box">';
            html += statsRow('Daily Runs', r.total_runs.toLocaleString());
            html += statsRow('Daily Plates', r.total_daily_plates.toLocaleString());
            html += statsRow('All Plates', r.total_all_plates.toLocaleString());
            html += '</div>';

            container.innerHTML = html;
        } catch (e) {
            console.error('Global stats error:', e);
            container.innerHTML = '<button onclick="updateProfileTab()" style="padding:6px 14px;border:none;background:#eee9db;border-radius:5px;cursor:pointer;font-size:0.85rem;">&larr; Back</button><p style="color:#ff3b30;">Error loading global stats</p>';
        }
    }
    window.showGlobalStats = showGlobalStats;

    function renderHistoricalCalendar() {
        const container = histCalContainer || document.getElementById('profileContent');
        const isModal = container.id === 'practiceStatsModalContent';
        const runByDate = window._histRunByDate || {};
        const pctByDate = window._histPctByDate || {};

        const year = histCalMonth.getFullYear();
        const month = histCalMonth.getMonth();
        const firstDay = new Date(year, month, 1);
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const startWeekday = firstDay.getDay();
        const today = new Date();
        const todayStr = getTodayString();

        const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];

        // Can navigate?
        const canPrev = year > 2026 || (year === 2026 && month > 3);
        const canNext = year < today.getFullYear() || (year === today.getFullYear() && month < today.getMonth());

        let html = '';
        if (isModal && histCalUserId) {
            html += '<div style="display:flex;align-items:center;margin-bottom:16px;">';
            html += `<button onclick="closePracticeStatsModal();openProfileModal('${histCalUserId}')" style="padding:6px 14px;border:none;background:#f3f4f6;border-radius:8px;cursor:pointer;font-size:0.85rem;">&larr; Back</button>`;
            html += '</div>';
        } else if (!isModal) {
            html += '<div style="display:flex;align-items:center;margin-bottom:16px;">';
            html += '<button onclick="updateProfileTab()" style="padding:6px 14px;border:none;background:#f3f4f6;border-radius:8px;cursor:pointer;font-size:0.85rem;">&larr; Back</button>';
            html += '<h3 style="margin:0 0 0 12px;font-size:1.1rem;">Historical Scores</h3>';
            html += '</div>';
        }

        // Month nav
        html += '<div style="display:flex;align-items:center;justify-content:center;gap:20px;margin-bottom:14px;">';
        html += `<button onclick="histCalShift(-1)" style="border:none;background:none;font-size:1.2rem;cursor:pointer;color:${canPrev ? '#374151' : '#d1d5db'};" ${canPrev ? '' : 'disabled'}>&lsaquo;</button>`;
        html += `<span style="font-weight:700;font-size:1rem;">${monthNames[month]} ${year}</span>`;
        html += `<button onclick="histCalShift(1)" style="border:none;background:none;font-size:1.2rem;cursor:pointer;color:${canNext ? '#374151' : '#d1d5db'};" ${canNext ? '' : 'disabled'}>&rsaquo;</button>`;
        html += '</div>';

        // Weekday headers
        html += '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:3px;margin-bottom:3px;">';
        ['S','M','T','W','T','F','S'].forEach(d => {
            html += `<div style="text-align:center;font-size:0.7rem;font-weight:600;color:#9ca3af;padding:4px 0;">${d}</div>`;
        });
        html += '</div>';

        // Calendar grid
        html += '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:3px;">';

        // Leading blanks
        for (let i = 0; i < startWeekday; i++) {
            html += '<div style="height:64px;"></div>';
        }

        // Check if viewing another user and current user hasn't played today
        const isOtherUser = histCalUserId && currentUser && histCalUserId !== currentUser.id;
        const viewerPlayedToday = todaysDailyTime != null;
        const todayLocked = isOtherUser && !viewerPlayedToday;

        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const cellDate = new Date(year, month, day);
            const isFuture = cellDate > today;
            const isToday = dateStr === todayStr;
            const run = runByDate[dateStr];
            const hasTime = run && run.total_seconds != null;
            const connectionLost = run && run.total_seconds == null;
            const isMissed = !isFuture && !isToday && !run;
            const cellLocked = isToday && todayLocked && hasTime;

            // Cell color (matches iOS)
            let bgColor;
            if (cellLocked) { bgColor = '#e5e5e5'; }
            else if (isFuture) { bgColor = '#f5f5f5'; }
            else if (connectionLost) { bgColor = 'rgba(239,68,68,0.08)'; }
            else if (isMissed) { bgColor = '#e0e0e0'; }
            else if (hasTime && pctByDate[dateStr] != null) {
                const pct = pctByDate[dateStr];
                const clamped = Math.max(50, Math.min(95, pct));
                const t = (clamped - 50) / 45;
                const r = Math.round(255 - t * (255 - 22));
                const g = Math.round(255 - t * (255 - 163));
                const b = Math.round(255 - t * (255 - 74));
                bgColor = `rgb(${r},${g},${b})`;
            } else { bgColor = 'white'; }

            const border = isToday ? '2px solid #000' : '1px solid rgba(0,0,0,0.1)';
            const cursor = (hasTime && !cellLocked) ? 'cursor:pointer;' : '';
            let onclick = '';
            if (hasTime && histCalUserId && !cellLocked) {
                const playerName = histCalUserName ? histCalUserName.replace(/'/g, "\\'") : 'My Run';
                onclick = `onclick="viewPlayerRun('${histCalUserId}','${dateStr}','${playerName}',${run.total_seconds},0,0,0,0)"`;
            }

            html += `<div ${onclick} style="height:64px;border-radius:8px;background:${bgColor};border:${border};position:relative;${cursor}">`;
            // Day number
            html += `<div style="position:absolute;top:3px;left:5px;font-size:0.65rem;font-weight:600;color:${isFuture ? '#d1d5db' : '#374151'};">${day}</div>`;
            // Content
            html += '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;padding-top:4px;">';
            if (cellLocked) {
                html += '<div style="font-size:1rem;color:#9ca3af;">&#128274;</div>';
            } else if (hasTime) {
                const pct = pctByDate[dateStr];
                const topPct = pct != null ? Math.round(100 - pct) : null;
                html += `<div style="font-size:0.75rem;font-weight:700;font-family:monospace;">${run.total_seconds.toFixed(1)}</div>`;
                if (topPct != null) {
                    html += `<div style="font-size:0.6rem;font-weight:600;color:rgba(0,0,0,0.6);">Top ${topPct}%</div>`;
                }
            } else if (connectionLost) {
                html += '<div style="font-size:0.8rem;color:rgba(239,68,68,0.7);">&#9889;</div>';
            } else if (isToday && !isFuture && !run) {
                html += '<div style="font-size:1rem;color:#9ca3af;">&#8987;</div>';
            }
            html += '</div></div>';
        }

        html += '</div>';
        container.innerHTML = html;
    }

    window.histCalShift = function(dir) {
        histCalMonth.setMonth(histCalMonth.getMonth() + dir);
        renderHistoricalCalendar();
    };

    window.showUserHistoricalScores = async function(userId, displayName) {
        // Show calendar for another user in a modal
        const backdrop = document.getElementById('practiceStatsModalBackdrop');
        const content = document.getElementById('practiceStatsModalContent');
        document.querySelector('#practiceStatsModalBackdrop .modal-title').textContent = displayName + ' — Calendar';
        backdrop.classList.add('show');
        content.innerHTML = '<p style="text-align:center;color:#6b7280;padding:20px;">Loading...</p>';

        try {
            const { data: runs } = await sb
                .from('daily_runs')
                .select('date, total_seconds')
                .eq('user_id', userId)
                .order('date', { ascending: false });

            const completedDates = (runs || []).filter(r => r.total_seconds != null).map(r => r.date);
            const pctByDate = {};
            if (completedDates.length > 0) {
                const { data: pctData } = await sb.rpc('batch_percentiles', {
                    p_user_id: userId,
                    p_dates: completedDates
                });
                if (pctData) pctData.forEach(p => { pctByDate[p.date] = p.percentile; });
            }

            const runByDate = {};
            (runs || []).forEach(r => { runByDate[r.date] = r; });

            window._histRunByDate = runByDate;
            window._histPctByDate = pctByDate;
            histCalMonth = new Date();
            histCalContainer = content;
            histCalUserId = userId;
            histCalUserName = displayName;
            renderHistoricalCalendar();
        } catch (e) {
            console.error('Error loading user history:', e);
            content.innerHTML = '<p style="color:#dc2626;">Error loading scores</p>';
        }
    };

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
                    if (profile) {
                        const name = profile.display_name || currentUser.email || 'Player';
                        const handle = profile.handle || '';
                        document.getElementById('userName').textContent = name;
                        if (!handle) {
                            renderProfileSetup(container, name);
                        } else {
                            renderProfile(container, name, handle);
                        }
                    }
                })
                .catch(e => console.error('Profile load error:', e));
        } else {
            container.innerHTML = `
                <div style="max-width:400px;margin:30px auto;border:2px solid #1a1714;border-radius:10px;overflow:hidden;box-shadow:6px 6px 0 #9370db;">
                    <div style="padding:32px 32px 28px;text-align:center;">
                        <div style="font-family:'Newsreader',Georgia,serif;font-size:1.8rem;font-weight:800;margin-bottom:16px;">Sign in / Create account</div>
                        <div style="font-family:'Newsreader',Georgia,serif;font-style:italic;color:#756e5c;font-size:0.95rem;margin-bottom:28px;">Sign in to play the daily challenge, add friends, and challenge users head-to-head.</div>

                        <button onclick="signInWithGoogle()" style="width:100%;padding:14px 20px;background:#fefcf7;color:#1a1714;border:2px solid #1a1714;border-radius:5px;font-size:1rem;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px;box-shadow:3px 3px 0 #1a1714;font-family:'Public Sans',system-ui,sans-serif;" onmouseenter="this.style.transform='translate(-1px,-1px)';this.style.boxShadow='5px 5px 0 #1a1714'" onmouseleave="this.style.transform='';this.style.boxShadow='3px 3px 0 #1a1714'">
                            <svg width="20" height="20" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                            Continue with Google
                        </button>

                        <div style="display:flex;align-items:center;gap:12px;margin:20px 0;">
                            <div style="flex:1;height:1px;background:#d9cfb6;"></div>
                            <span style="font-size:0.8rem;color:#756e5c;letter-spacing:0.1em;">OR</span>
                            <div style="flex:1;height:1px;background:#d9cfb6;"></div>
                        </div>

                        <button onclick="signInWithApple()" style="width:100%;padding:14px 20px;background:#1a1714;color:#ffffff;border:2px solid #1a1714;border-radius:5px;font-size:1rem;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px;box-shadow:3px 3px 0 #9370db;font-family:'Public Sans',system-ui,sans-serif;" onmouseenter="this.style.transform='translate(-1px,-1px)';this.style.boxShadow='5px 5px 0 #9370db'" onmouseleave="this.style.transform='';this.style.boxShadow='3px 3px 0 #9370db'">
                            &#63743; Continue with Apple
                        </button>
                        <div style="font-size:0.8rem;color:#756e5c;margin-top:8px;font-style:italic;">Continuing with Apple will link your account to the iOS app.</div>
                    </div>
                </div>
            `;
        }
    }

    // === SUPABASE ===
    const SUPABASE_URL = 'https://ggbvtaegsnlimscmjirf.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdnYnZ0YWVnc25saW1zY21qaXJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5MTkwNTUsImV4cCI6MjA5MTQ5NTA1NX0.RRQA0fW02H6XKj7xKUTSnR9zrGbWuE2kSmspCeHCfyQ';
    const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { flowType: 'pkce', persistSession: true }
    });

    // Capture referral from URL
    const urlRef = new URLSearchParams(window.location.search).get('ref');
    if (urlRef) localStorage.setItem('referredBy', urlRef);

    // Stub for removed Firebase
    const database = { ref: () => ({ set: async () => {}, once: async () => ({ exists: () => false, val: () => null }), push: () => ({ key: null }), remove: async () => {}, update: async () => {} }) };
    let gameMode = localStorage.getItem('currentGameMode') || 'practice';
    let currentUser = null;
    let dailyPlateSequence = null;
    let currentViewingDate = null;
    let currentLiveRunId = crypto.randomUUID();

    // Endless mode state
    let endlessSessionId = null;
    let endlessTotalSeen = 0;
    let endlessTotalSolved = 0;
    let endlessPendingEntries = []; // accumulated locally, flushed on end

    function cleanupLocalStorage() {
        // Remove large cached data to free space
        try {
            const keys = Object.keys(localStorage);
            for (const k of keys) {
                if (k.startsWith('lb_') || k.startsWith('plateRaw_') || k.startsWith('plateAnalysisCache')) {
                    localStorage.removeItem(k);
                }
            }
        } catch (e) { /* ignore */ }
    }

    function saveEndlessStateLocally() {
        if (endlessPendingEntries.length === 0 && endlessTotalSeen === 0) return;
        // Save the current plate index so we resume on the same plate
        const currentIdx = dailyPlateSequence ? usedPlates.size : 0;
        const state = {
            sessionId: endlessSessionId,
            totalSeen: endlessTotalSeen,
            totalSolved: endlessTotalSolved,
            entries: endlessPendingEntries,
            userId: currentUser?.id,
            plateSequence: dailyPlateSequence || [],
            cursor: Math.max(0, currentIdx - 1) // back up to unsolved plate
        };
        try {
            // Don't save full plate sequence — too large, fills localStorage
            const saveState = { ...state, plateSequence: state.plateSequence.slice(state.cursor, state.cursor + 50) };
            localStorage.setItem('pendingEndlessState', JSON.stringify(saveState));
        } catch (e) {
            console.warn('[Endless] localStorage save failed (quota), entries still in memory');
        }
    }

    let endlessFlushInProgress = false;
    let endlessFlushDone = false;
    async function submitPendingEndlessState() {
        if (endlessFlushInProgress || endlessFlushDone) return;
        const saved = localStorage.getItem('pendingEndlessState');
        if (!saved) return;
        // Remove immediately to prevent double-submit
        localStorage.removeItem('pendingEndlessState');
        endlessFlushInProgress = true;
        try {
            const state = JSON.parse(saved);
            if (!state || !state.entries || state.entries.length === 0) {
                // Re-save sequence without entries if needed
                if (state && state.plateSequence && state.plateSequence.length > 0) {
                    state.entries = [];
                    localStorage.setItem('pendingEndlessState', JSON.stringify(state));
                }
                return;
            }
            const userId = state.userId || (currentUser && currentUser.id);
            if (!userId) {
                // Can't submit — put it back for next attempt
                localStorage.setItem('pendingEndlessState', saved);
                return;
            }

            // Flush entries
            const rows = state.entries.map(e => ({
                user_id: userId,
                plate: e.plate,
                word: e.word,
                skipped: e.skipped,
                thinking_seconds: e.thinking_seconds,
                source: 'unlimited',
                difficulty: 50
            }));
            await sb.from('practice_plate_stats').insert(rows);
            console.log('[Endless] Submitted', rows.length, 'pending entries from localStorage');

            // Update session counters
            if (state.sessionId) {
                await sb.from('unlimited_sessions')
                    .update({
                        total_solved: state.totalSolved,
                        total_skipped: state.totalSeen - state.totalSolved,
                        total_plates_seen: state.totalSeen,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', state.sessionId);
            }

            // Re-save without entries but keep sequence for resume.
            // Also clear in-memory entries so they don't get re-saved by saveEndlessStateLocally.
            endlessPendingEntries = [];
            const cleaned = {
                sessionId: state.sessionId,
                totalSeen: state.totalSeen,
                totalSolved: state.totalSolved,
                entries: [],
                userId: state.userId,
                plateSequence: state.plateSequence || [],
                cursor: state.cursor || 0
            };
            localStorage.setItem('pendingEndlessState', JSON.stringify(cleaned));
        } catch (e) {
            console.error('[Endless] Pending state submit error:', e);
        }
        endlessFlushInProgress = false;
        endlessFlushDone = true;
    }

    // Save endless state on page unload/refresh/close
    // Always try to save — the function itself checks if there's anything to save
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') saveEndlessStateLocally();
    });
    window.addEventListener('pagehide', saveEndlessStateLocally);
    window.addEventListener('beforeunload', saveEndlessStateLocally);
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
            if (event === 'SIGNED_IN') switchTab('game');
            retryPendingSubmission();
            submitPendingPracticeStats();
            submitPendingEndlessState();
            loadH2HChallenges();

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
    async function signInWithGoogle() {
        try {
            const { error } = await sb.auth.signInWithOAuth({
                provider: 'google',
                options: { redirectTo: window.location.origin + window.location.pathname }
            });
            if (error) throw error;
            return true;
        } catch(e) {
            alert('Sign in failed: ' + e.message);
            return false;
        }
    }
    window.signInWithApple = signInWithApple;
    window.signInWithGoogle = signInWithGoogle;
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
            btn.onclick = () => switchTab('profile');
            // Practice stays available for guests
            practiceBtn.textContent = 'Practice Mode';
            practiceBtn.style.background = '#e9d5ff';
            practiceBtn.style.color = '#6b21a8';
            practiceBtn.style.cursor = 'pointer';
            practiceBtn.disabled = false;
            practiceBtn.onclick = null;
            practiceSettingsBtn.style.display = '';
            return;
        }
        // Restore buttons
        btn.onclick = null;
        practiceBtn.onclick = null;
        if (gameMode === 'endless') {
            practiceBtn.textContent = 'Endless Mode';
            practiceBtn.style.background = '#ccfbf1';
            practiceBtn.style.color = '#0f766e';
            practiceSettingsBtn.style.background = '#14b8a6';
        } else {
            practiceBtn.textContent = 'Practice Mode';
            practiceBtn.style.background = '#9370db';
            practiceBtn.style.color = '#ffffff';
        }
        practiceBtn.style.cursor = 'pointer';
        practiceBtn.disabled = false;
        practiceSettingsBtn.style.display = '';
        const played = await checkIfPlayedToday();
        if (played && todaysDailyTime) {
            btn.textContent = `Daily Challenge: ${todaysDailyTime.toFixed(2)}`;
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
        const runId = currentDailyRunId;

        const entries = gameHistory.map((entry, idx) => ({
            run_id: runId,
            plate_index: idx,
            plate: entry.plate,
            word: entry.skipped ? null : (entry.word || '').toLowerCase(),
            thinking_seconds: Math.floor(entry.thinkingSeconds * 100) / 100,
            skipped: entry.skipped || false,
            penalty_seconds: entry.penaltySeconds || 0
        }));

        // Save pending submission to localStorage so we can retry if the page closes
        try {
            const pending = { runId, date: today, totalSeconds, entries };
            localStorage.setItem('pendingDailySubmission', JSON.stringify(pending));
        } catch (e) {
            console.warn('[Submit] localStorage save failed (quota exceeded), submitting directly');
        }

        const success = await submitDailyRun(runId, totalSeconds, entries);

        if (success) {
            localStorage.removeItem('pendingDailySubmission');
            const solved = entries.filter(e => !e.skipped).length;
            pushCompletedRun('daily', totalSeconds, null, solved, entries.length, runId);
        }

        // Update daily button and refresh profile stats
        updateDailyBtnState();
        loadProfileStats(true);

        setTimeout(() => {
            displayLeaderboard(today);
        }, 500);
    }

    async function submitDailyRun(runId, totalSeconds, entries) {
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                const { error: updateError } = await sb
                    .from('daily_runs')
                    .update({ total_seconds: totalSeconds, completed_at: new Date().toISOString() })
                    .eq('id', runId);
                if (updateError) throw updateError;

                const { error: insertError } = await sb.from('daily_run_entries').insert(entries);
                // Duplicate entries are fine (means entries saved on a prior attempt)
                if (insertError && !insertError.message.includes('duplicate')) throw insertError;

                console.log(`[Submit] Success on attempt ${attempt}`);
                return true;
            } catch (e) {
                console.warn(`[Submit] Attempt ${attempt} failed:`, e.message || e);
                if (attempt < 3) await new Promise(r => setTimeout(r, attempt * 1500));
            }
        }
        console.error('[Submit] All 3 attempts failed — saved to localStorage for retry');
        alert('Your score was saved locally and will be submitted when you reload the page.');
        return false;
    }

    // On page load, retry any pending submission from a previous session
    async function retryPendingSubmission() {
        const raw = localStorage.getItem('pendingDailySubmission');
        if (!raw) return;
        try {
            const pending = JSON.parse(raw);
            console.log(`[Submit] Found pending submission for ${pending.date}, retrying...`);
            const success = await submitDailyRun(pending.runId, pending.totalSeconds, pending.entries);
            if (success) {
                localStorage.removeItem('pendingDailySubmission');
                console.log('[Submit] Pending submission recovered successfully');
            }
        } catch (e) {
            console.warn('[Submit] Pending retry failed:', e);
        }
    }

    // Push completed run to the unified completed_runs table for live tracker
    function pushCompletedRun(mode, totalSeconds, difficulty, platesSolved, platesSeen, sourceRunId) {
        const sourceTable = sourceRunId ? (mode === 'daily' ? 'daily_runs' : mode === 'practice' ? 'practice_runs' : mode === 'h2h' ? 'h2h_runs' : null) : null;
        sb.from('completed_runs').insert({
            user_id: currentUser ? currentUser.id : null,
            mode,
            total_seconds: Math.round(totalSeconds * 100) / 100,
            difficulty: difficulty != null ? difficulty : null,
            plates_solved: platesSolved,
            plates_seen: platesSeen,
            live_run_id: currentLiveRunId,
            source_run_id: sourceRunId || null,
            source_table: sourceTable
        }).then(({ error }) => {
            if (error) console.warn('[CompletedRun]', error.message);
        });
    }

    // Fire-and-forget live play for the realtime tracker
    function emitLivePlay(plate, word, skipped, thinkingSeconds) {
        const mode = gameMode === 'endless' ? 'endless' : gameMode === 'h2h_challenge' ? 'h2h' : gameMode;
        const diff = mode === 'practice' ? practiceDifficulty : mode === 'endless' ? 50 : mode === 'h2h' ? (currentH2HDifficulty || 50) : null;
        sb.from('live_plays').insert({
            user_id: currentUser ? currentUser.id : null,
            plate,
            word: skipped ? null : (word || '').toLowerCase(),
            skipped,
            thinking_seconds: Math.floor(thinkingSeconds * 100) / 100,
            mode,
            run_id: currentLiveRunId,
            difficulty: diff
        }).then(({ error }) => {
            if (error) console.warn('[Live]', error.message);
        });
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
            runId: run.id,
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
        // Don't cache until 5am next day to account for west coast late players
        const now = new Date();
        if (now.getHours() < 5) {
            // Before 5am: yesterday and today are both unsettled
            const yesterday = new Date(now);
            yesterday.setDate(yesterday.getDate() - 1);
            const yStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth()+1).padStart(2,'0')}-${String(yesterday.getDate()).padStart(2,'0')}`;
            if (dateStr >= yStr) return false;
        }
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

                // Top word from all players
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
                html += `<td style="padding:12px;font-weight:bold;position:sticky;left:0;background:${bg};z-index:5;white-space:nowrap;">${player.name}<br><span style="font-size:0.85rem;color:#6b7280;">(${player.time.toFixed(2)})</span></td>`;

                for (let i = 0; i < maxPlates; i++) {
                    if (i < player.history.length) {
                        const entry = player.history[i];
                        const word = entry.skipped ? '\u274C' : entry.word;

                        const totalTime = entry.skipped
                            ? (entry.thinkingSeconds || 0) + entry.penaltySeconds
                            : entry.thinkingSeconds;

                        const displayTime = `${totalTime.toFixed(2)}`;

                        const bgColor = entry.skipped ? '#000000' : getTimeColor(totalTime);
                        const textColor = entry.skipped ? '#ffffff' : (totalTime > 15 ? '#fff' : '#000');

                        const tooltip = entry.skipped
                            ? `Skipped\nThinking: ${(entry.thinkingSeconds || 0).toFixed(2)}\nPenalty: +${entry.penaltySeconds}\nTotal: ${totalTime.toFixed(2)}`
                            : `Word: ${entry.word}\nTime: ${totalTime.toFixed(2)}`;

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
                    const myRank = scores.indexOf(myScore) + 1;
                    document.getElementById('myRunTime').innerHTML = `${myScore.totalTime.toFixed(2)} <span style="font-size:0.8rem;color:#756e5c;font-weight:500;">(#${myRank} of ${scores.length})</span>`;
                }
            }

            // Update tab counts
            const friendCount = scores.filter(s => s.isFriend || s.isMe).length;
            document.getElementById('lbGlobalBtn').textContent = `Global (${scores.length})`;
            document.getElementById('lbFriendsBtn').textContent = `Friends (${friendCount})`;

            renderLeaderboardRows(scores, previousLeaderboardIds);

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
                statsBtn.style.opacity = canView ? '1' : '0.55';
                statsBtn.style.background = canView ? '#faf5ff' : '#eee9db';
                statsBtn.style.color = canView ? '#9370db' : '#756e5c';
                statsBtn.style.border = canView ? '2px solid #9370db' : '2px solid #d9cfb6';
                statsBtn.style.boxShadow = canView ? '3px 3px 0 #9370db' : 'none';
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
    const STORAGE_BASE = 'https://ggbvtaegsnlimscmjirf.supabase.co/storage/v1/object/public/app-data';
    let DEFINITIONS = {};

    async function loadDictionary() {
        try {
            // Try remote dictionary first, fallback to local
            let text;
            try {
                const vRes = await fetch(`${STORAGE_BASE}/dictionary-version.json`);
                const vInfo = await vRes.json();
                const cachedVersion = parseInt(localStorage.getItem('dictVersion') || '0');
                if (vInfo.version > cachedVersion || !localStorage.getItem('cachedWords')) {
                    console.log(`[Dict] Updating v${cachedVersion} → v${vInfo.version}`);
                    const res = await fetch(`${STORAGE_BASE}/words.txt`);
                    text = await res.text();
                    localStorage.setItem('cachedWords', text);
                    localStorage.setItem('dictVersion', String(vInfo.version));
                } else {
                    console.log(`[Dict] Using cached v${cachedVersion}`);
                    text = localStorage.getItem('cachedWords');
                }
            } catch (e) {
                console.log('[Dict] Remote unavailable, using local');
                const cached = localStorage.getItem('cachedWords');
                if (cached) {
                    text = cached;
                } else {
                    const res = await fetch("words.txt");
                    text = await res.text();
                }
            }

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

            // Apply incremental dictionary changes (add/remove words, definitions)
            // Always apply regardless of cached version — we rebuild from base each time.
            try {
                const cRes = await fetch(`${STORAGE_BASE}/dictionary-changes.json?t=${Date.now()}`);
                if (cRes.ok) {
                    const changes = await cRes.json();
                    const removeSet = new Set((changes.remove || []).map(w => w.toUpperCase()));
                    for (const w of removeSet) { DICTIONARY.delete(w); }
                    WORDS = WORDS.filter(w => !removeSet.has(w.toUpperCase()));
                    for (const w of (changes.add || [])) {
                        const lower = w.toLowerCase();
                        const upper = w.toUpperCase();
                        if (!DICTIONARY.has(upper) && /^[a-z]+$/.test(lower) && lower.length >= 3) {
                            DICTIONARY.add(upper);
                            WORDS.push(lower);
                        }
                    }
                    if (changes.definitions) {
                        for (const [word, senses] of Object.entries(changes.definitions)) {
                            DEFINITIONS[word.toLowerCase()] = senses;
                        }
                    }
                    console.log(`[Dict] Applied changes v${changes.version}: +${(changes.add||[]).length} -${(changes.remove||[]).length} words, ${Object.keys(changes.definitions||{}).length} defs → ${DICTIONARY.size} total`);
                }
            } catch (e) {
                console.log('[Dict] Changes check failed (offline?)');
            }
        } catch (err) {
            console.error(err);
            resultEl.textContent = "Failed to load words.txt.";
            resultEl.style.color = "red";
        }
    }

    async function loadDefinitions() {
        try {
            // Definitions are ~25MB — too large for localStorage.
            // Fetch from server each session, but only when first needed.
            console.log('[Defs] Will load on first use');
        } catch (e) {
            console.warn('[Defs] Init error:', e);
        }
    }

    let definitionsLoading = false;
    let definitionsLoadPromise = null;
    let definitionsFullyLoaded = false;
    async function ensureDefinitionsLoaded() {
        if (definitionsFullyLoaded) return;
        if (definitionsLoadPromise) return definitionsLoadPromise;
        definitionsLoadPromise = (async () => {
            definitionsLoading = true;
            try {
                console.log('[Defs] Downloading definitions.json...');
                const res = await fetch(`${STORAGE_BASE}/definitions.json`);
                if (!res.ok) throw new Error('HTTP ' + res.status);
                const fullDefs = await res.json();
                Object.assign(DEFINITIONS, fullDefs);
                definitionsFullyLoaded = true;
                console.log(`[Defs] Loaded ${Object.keys(DEFINITIONS).length} definitions`);
            } catch (e) {
                console.warn('[Defs] Remote failed:', e.message);
                try {
                    const res = await fetch('definitions.json');
                    if (res.ok) {
                        const fallbackDefs = await res.json();
                        Object.assign(DEFINITIONS, fallbackDefs);
                        definitionsFullyLoaded = true;
                    }
                } catch (e2) { console.warn('[Defs] Local fallback also failed'); }
            }
            definitionsLoading = false;
            definitionsLoadPromise = null;
        })();
        return definitionsLoadPromise;
    }
    // Pre-load definitions in background after page load
    setTimeout(() => ensureDefinitionsLoaded(), 3000);

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
        if ((gameMode==='daily' || gameMode==='h2h_challenge' || gameMode==='practice' || gameMode==='endless') && dailyPlateSequence && dailyPlateSequence.length) {
            const idx = usedPlates.size;
            console.log('Using sequence mode! Index:', idx, 'Sequence length:', dailyPlateSequence.length);

            // Auto-extend sequence for endless mode
            if (gameMode === 'endless' && idx >= dailyPlateSequence.length - 10) {
                const existing = new Set(dailyPlateSequence);
                const extra = generateChallengeSequence(50);
                extra.forEach(p => { if (!existing.has(p)) { dailyPlateSequence.push(p); existing.add(p); } });
            }

            if (idx>=dailyPlateSequence.length) {
                resultEl.textContent = "Ran out of plates! This shouldn't happen. Please report this bug.";
                resultEl.style.color = "red";
                endGame();
                return;
            }

            console.log('Daily/H2H mode - solvedCount:', solvedCount, 'TOTAL_PLATES:', TOTAL_PLATES);
            if (gameMode !== 'endless' && solvedCount >= TOTAL_PLATES) {
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
        if (gameMode === 'endless') {
            const seen = endlessTotalSeen;
            const solved = endlessTotalSolved;
            const pct = seen > 0 ? (solved / seen * 100).toFixed(1) : '0.0';
            progressDisplayEl.textContent = `Solved: ${solved}/${seen} (${pct}%)`;
        } else {
            progressDisplayEl.textContent = `Solved: ${solvedCount} / ${TOTAL_PLATES}`;
        }
    }

    function updateSkipButtonLabel() {
        if (gameMode === 'endless') {
            skipButtonEl.textContent = 'Skip';
        } else {
            const nextPenalty = (skipCount + 1) * 5;
            skipButtonEl.textContent = `Skip +${nextPenalty}`;
        }
    }

    function showStartGameButton() {
        startButtonEl.textContent = "Start Game";
        const ready = dictionaryReady && difficultyReady && platesReady;
        startButtonEl.disabled = !ready;
        startButtonEl.style.opacity = ready ? '1' : '0.5';
        startButtonEl.style.cursor = ready ? 'pointer' : 'not-allowed';
    }

    function showRestartGameButton() {
        if (gameMode === 'endless') {
            startButtonEl.textContent = "End Session";
        } else {
            startButtonEl.textContent = "Restart game";
        }
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
        // For endless mode, usedPlates may be pre-filled from saved state — don't clear
        if (gameMode !== 'endless') {
            usedPlates = new Set();
        }
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
        currentLiveRunId = crypto.randomUUID();
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
        // Endless mode: "End Session" button triggers confirmation
        if (gameMode === 'endless' && gameStarted) {
            document.getElementById('endEndlessBackdrop').classList.add('show');
            return;
        }
        // Submit practice stats from previous run before restarting
        if (gameMode === 'practice' && gameHistory.length > 0 && !practiceStatsSubmitted) {
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
        if (gameMode === 'endless') {
            timerDisplayEl.textContent = "";
        } else if (gameMode === 'practice' && !practiceTimed) {
            timerDisplayEl.textContent = "UNTIMED";
        } else {
            timerDisplayEl.textContent = "Time: " + totalSec.toFixed(2);
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
        // Computed time from plate entries (matches iOS)
        const computedSec = gameHistory.reduce((s, e) => s + (e.thinkingSeconds || 0) + (e.penaltySeconds || 0), 0);

        if (timerIntervalId) {
            clearInterval(timerIntervalId);
            timerIntervalId = null;
        }

        if (gameMode === 'practice' && !practiceTimed) {
            resultEl.textContent = `Finished! ${solvedCount} plates solved.`;
        } else {
            resultEl.textContent = `Finished! Time: ${computedSec.toFixed(2)} s`;
        }
        resultEl.style.color = "green";
        wordInputEl.blur();

        checkButtonEl.disabled = true;
        skipButtonEl.disabled = true;
        wordInputEl.disabled = true;
        wordInputEl.readOnly = true;

        if (gameMode !== 'h2h_challenge') openEndModal(computedSec);
        if (gameMode === 'h2h_challenge') computeExpectedTime(computedSec);
        if (gameMode !== 'daily' && gameMode !== 'h2h_challenge') {
            showRestartGameButton();
        }
        showChartButton();
        document.getElementById('dailyChallengeBtn').disabled = false;
        document.getElementById('practiceBtn').disabled = false;
        document.getElementById('practiceSettingsBtn').style.display = '';
        window.onbeforeunload = null;

        if (gameMode === 'daily' && currentUser) {
            saveScore(computedSec, solvedCount, skipCount);
        } else if (gameMode === 'h2h_challenge' && currentUser && currentH2HRunId) {
            saveChallengeResult(computedSec, solvedCount, skipCount);
        } else if (gameMode === 'practice') {
            submitPracticePlateStats();
        }
    }

    function savePracticeStatsLocally() {
        console.log('[Practice] savePracticeStatsLocally called', { gameMode, histLen: gameHistory.length, submitted: practiceStatsSubmitted });
        if (gameMode !== 'practice' || gameHistory.length === 0 || practiceStatsSubmitted) {
            console.log('[Practice] savePracticeStatsLocally SKIPPED');
            return;
        }
        const diff = typeof practiceDifficulty === 'number' ? practiceDifficulty : 50;
        const data = gameHistory.map(entry => ({
            plate: entry.plate,
            skipped: entry.skipped || false,
            thinking_seconds: Math.floor((entry.thinkingSeconds || 0) * 100) / 100,
            word: entry.skipped ? null : (entry.word || null),
            difficulty: diff,
            source: 'practice'
        }));
        localStorage.setItem('pendingPracticeStats', JSON.stringify(data));
    }

    let practiceStatsSubmitted = false;

    async function submitPracticePlateStats() {
        console.log('[Practice] submitPracticePlateStats called', { user: !!currentUser, histLen: gameHistory.length, submitted: practiceStatsSubmitted });
        if (gameHistory.length === 0 || practiceStatsSubmitted) {
            console.log('[Practice] submitPracticePlateStats SKIPPED');
            return;
        }
        practiceStatsSubmitted = true;
        localStorage.removeItem('pendingPracticeStats');
        console.log('[Practice] SUBMITTING to server...');
        try {
            const diff = typeof practiceDifficulty === 'number' ? practiceDifficulty : 50;
            const userId = currentUser ? currentUser.id : null;
            const rows = gameHistory.map(entry => ({
                user_id: userId,
                plate: entry.plate,
                skipped: entry.skipped || false,
                thinking_seconds: Math.floor((entry.thinkingSeconds || 0) * 100) / 100,
                word: entry.skipped ? null : (entry.word || null),
                difficulty: diff,
                source: 'practice'
            }));
            const solved = gameHistory.filter(e => !e.skipped).length;
            const totalTime = gameHistory.reduce((s, e) => s + (e.thinkingSeconds || 0) + (e.penaltySeconds || 0), 0);

            // Wait for expected time calculation to finish (runs in parallel)
            let expectedSec = null;
            for (let i = 0; i < 20; i++) {
                if (window._lastExpectedData && window._lastExpectedData.expectedTime) {
                    expectedSec = window._lastExpectedData.expectedTime;
                    break;
                }
                await new Promise(r => setTimeout(r, 250));
            }

            // Create practice_runs entry with expected time included
            let practiceRunId = null;
            try {
                const insertData = {
                    user_id: userId,
                    total_seconds: Math.floor(totalTime * 100) / 100,
                    difficulty: diff,
                    source: 'practice',
                    plates_solved: solved,
                    plates_seen: gameHistory.length
                };
                if (expectedSec) insertData.expected_seconds = expectedSec;
                const { data: runData, error: runErr } = await sb.from('practice_runs').insert(insertData).select('id').single();
                if (runErr) console.error('[Practice] practice_runs FAILED:', runErr.message);
                else practiceRunId = runData?.id || null;
            } catch (e) {
                console.warn('[Practice] practice_runs error:', e.message);
            }

            // Always insert plate stats (even if practice_runs failed)
            try {
                const rowsWithRunId = rows.map(r => ({ ...r, run_id: practiceRunId }));
                const { error: statsErr } = await sb.from('practice_plate_stats').insert(rowsWithRunId);
                if (statsErr) console.error('[Practice] plate stats FAILED:', statsErr.message);
                else console.log('[Practice] Saved', rowsWithRunId.length, 'plate stats');
            } catch (e) {
                console.error('[Practice] plate stats error:', e.message);
            }

            // Always push completed run
            pushCompletedRun('practice', totalTime, diff, solved, gameHistory.length, practiceRunId);
            window._lastPracticeRunId = practiceRunId;
        } catch (e) {
            console.error('[Practice] Submit error:', e);
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
                word: entry.word || null,
                difficulty: entry.difficulty || null,
                source: entry.source || 'practice'
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
        const solved = gameHistory.filter(e => !e.skipped).length;
        if (solved >= 10 && gameMode !== 'endless') {
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
        // Capture mode and IDs before async — they may be reset during fetch
        const capturedMode = gameMode;
        const capturedH2HRunId = currentH2HRunId;
        const capturedDailyRunId = currentDailyRunId;
        const capturedPracticeRunId = window._lastPracticeRunId;
        // Use the full plate sequence (up to 200), not just the 10 played
        const plateSequence = dailyPlateSequence || gameHistory.map(e => e.plate);
        if (plateSequence.length === 0) return;

        try {
            // Fetch stats for all plates we might traverse (fetch more than 10 since skips mean we go further)
            const plateStats = {}; // plate -> { medianThink, skipRate }

            // Batch fetch: 3 queries total instead of 150
            const platesToFetch = plateSequence.slice(0, 50);

            const [practiceRes, dailyRes, h2hRes] = await Promise.all([
                sb.from('practice_plate_stats').select('plate, thinking_seconds, skipped').in('plate', platesToFetch),
                sb.from('daily_run_entries').select('plate, thinking_seconds, skipped').in('plate', platesToFetch),
                sb.from('h2h_run_entries').select('plate, thinking_seconds, skipped').in('plate', platesToFetch)
            ]);

            // Group all rows by plate
            const byPlate = {};
            [...(practiceRes.data || []), ...(dailyRes.data || []), ...(h2hRes.data || [])].forEach(r => {
                if (r.thinking_seconds > 400) return;
                if (!byPlate[r.plate]) byPlate[r.plate] = [];
                byPlate[r.plate].push(r);
            });

            // Include current run entries for plates not yet in DB
            gameHistory.forEach(e => {
                const plate = (e.plate || '').toUpperCase();
                if (!plate) return;
                const t = e.thinkingSeconds || 0;
                if (t > 400) return;
                const rows = byPlate[plate] || [];
                const alreadyPresent = rows.some(r => Math.abs(r.thinking_seconds - t) < 0.01 && r.skipped === (e.skipped || false));
                if (!alreadyPresent) {
                    if (!byPlate[plate]) byPlate[plate] = [];
                    byPlate[plate].push({ plate, thinking_seconds: t, skipped: e.skipped || false });
                }
            });

            for (const plate of platesToFetch) {
                const rows = byPlate[plate];
                if (!rows || rows.length === 0) continue;
                const times = rows.map(r => r.thinking_seconds).sort((a, b) => a - b);
                const mid = Math.floor(times.length / 2);
                const median = times.length % 2 === 0 ? (times[mid - 1] + times[mid]) / 2 : times[mid];
                const skipRate = rows.filter(r => r.skipped).length / rows.length;
                plateStats[plate] = { medianThink: median, skipRate, plays: rows.length };
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
                    const fraction = solvesNeeded / solveContrib;
                    totalThinking += stats.medianThink * fraction;
                    solves += solveContrib * fraction;
                    skips += stats.skipRate * fraction;
                    platesTraversed++;
                    breakdown.push({
                        plate, plays: stats.plays || 0,
                        medianThink: stats.medianThink * fraction,
                        skipRate: stats.skipRate, fraction,
                        cumulSolves: solves, cumulSkips: skips
                    });
                    break;
                }

                totalThinking += stats.medianThink;
                solves += solveContrib;
                skips += stats.skipRate;
                platesTraversed++;
                breakdown.push({
                    plate, plays: stats.plays || 0,
                    medianThink: stats.medianThink,
                    skipRate: stats.skipRate, fraction: 1,
                    cumulSolves: solves, cumulSkips: skips
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
                bkHtml += '<thead><tr style="background:#f3f4f6;"><th style="padding:4px 6px;text-align:left;">#</th><th style="padding:4px 6px;text-align:left;">Plate</th><th style="padding:4px 6px;text-align:right;">Plays</th><th style="padding:4px 6px;text-align:right;">Median</th><th style="padding:4px 6px;text-align:right;">Skip %</th><th style="padding:4px 6px;text-align:right;">Solves</th><th style="padding:4px 6px;text-align:right;">Skips</th></tr></thead><tbody>';
                breakdown.forEach((b, i) => {
                    const isProrated = b.fraction < 1;
                    const rowStyle = isProrated ? 'border-bottom:1px solid #f0f0f0;background:#f9fafb;font-style:italic;' : 'border-bottom:1px solid #f0f0f0;';
                    bkHtml += `<tr style="${rowStyle}">`;
                    bkHtml += `<td style="padding:4px 6px;color:#9ca3af;">${i + 1}</td>`;
                    bkHtml += `<td style="padding:4px 6px;font-weight:600;font-family:monospace;">${b.plate}${isProrated ? ' <span style="font-size:0.7rem;color:#9ca3af;font-weight:400;">(' + Math.round(b.fraction * 100) + '%)</span>' : ''}</td>`;
                    bkHtml += `<td style="padding:4px 6px;text-align:right;color:#9ca3af;">${b.plays}</td>`;
                    bkHtml += `<td style="padding:4px 6px;text-align:right;">${b.medianThink.toFixed(1)}</td>`;
                    bkHtml += `<td style="padding:4px 6px;text-align:right;">${Math.round(b.skipRate * 100)}%</td>`;
                    bkHtml += `<td style="padding:4px 6px;text-align:right;">${b.cumulSolves.toFixed(2)}</td>`;
                    bkHtml += `<td style="padding:4px 6px;text-align:right;">${b.cumulSkips.toFixed(2)}</td>`;
                    bkHtml += `</tr>`;
                });
                bkHtml += '</tbody></table>';
                bkHtml += `<div style="font-size:0.8rem;color:#6b7280;margin-top:6px;padding:6px;background:#f9fafb;border-radius:6px;">`;
                bkHtml += `Thinking: ${totalThinking.toFixed(1)} + Penalty: ${penalty.toFixed(1)} (${skips.toFixed(1)} skips) = <strong>${expectedTime.toFixed(1)}</strong>`;
                bkHtml += `</div></div>`;

                el.innerHTML = `The expected time for this practice round was <a href="#" onclick="event.preventDefault();document.getElementById('expectedBreakdown').style.display=document.getElementById('expectedBreakdown').style.display==='none'?'block':'none';" style="font-weight:700;color:#2563eb;text-decoration:underline;">${expectedTime.toFixed(1)} seconds</a>.
                    <br><span style="color:${color};font-weight:600;">You were ${absDiff} seconds ${word} than expected.</span>
                    <div id="expectedBreakdown" style="display:none;">${bkHtml}</div>`;
            }
            // Save expected_seconds to the source run table (using captured values)
            if (expectedTime > 0) {
                if (capturedMode === 'practice') {
                    // Practice xT is included in the initial insert — no update needed
                } else if (capturedMode === 'daily' && capturedDailyRunId) {
                    sb.from('daily_runs').update({ expected_seconds: expectedTime }).eq('id', capturedDailyRunId).then(() => {});
                } else if (capturedMode === 'h2h_challenge' && capturedH2HRunId) {
                    sb.from('h2h_runs').update({ expected_seconds: expectedTime }).eq('id', capturedH2HRunId).then(() => {});
                }
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
                                return `${label}: ${value.toFixed(2)}`;
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
            timeLabel = `${thinkingSeconds.toFixed(2)}`;
        }

        gameHistory.push({
            plate, word, skipped: false, thinkingSeconds, penaltySeconds: 0
        });
        emitLivePlay(plate, word, false, thinkingSeconds);

        if (gameMode === 'endless') {
            endlessTotalSeen++;
            endlessTotalSolved++;
            endlessPendingEntries.push({ plate, word: word.toLowerCase(), skipped: false, thinking_seconds: Math.floor(thinkingSeconds * 100) / 100 });
            updateProgressDisplay();
            updateSkipButtonLabel();
            saveEndlessStateLocally();
        }

        addToHistoryWithAnimation(
            plate, word, matchIndices, null, diffScore, timeLabel,
            () => {
                if (gameMode !== 'endless' && solvedCount >= TOTAL_PLATES) endGame();
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

        resultEl.textContent = `Skipped ${currentPlate}. +${added} penalty.`;
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
            timeLabel = `${thinkingSeconds.toFixed(2)} (+${added})`;
        }

        gameHistory.push({
            plate, word: "skipped", skipped: true, thinkingSeconds, penaltySeconds: added
        });
        emitLivePlay(plate, null, true, thinkingSeconds);

        if (gameMode === 'endless') {
            endlessTotalSeen++;
            endlessPendingEntries.push({ plate, word: null, skipped: true, thinking_seconds: Math.floor(thinkingSeconds * 100) / 100 });
            updateProgressDisplay();
            updateSkipButtonLabel();
            saveEndlessStateLocally();
        }

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

            // Stats rows with drop shadow
            let html = '<div style="display:flex;flex-direction:column;gap:6px;margin-bottom:16px;">';
            html += `<div class="stats-section-box" style="box-shadow:2px 2px 0 #1a1714;border:2px solid #1a1714;border-radius:5px;"><div class="stats-row"><span class="stats-row-label">Total time</span><div class="stats-row-right"><span class="stats-row-value" style="color:#14a06b;">${data.totalTime.toFixed(2)}${percentile ? '  (Top ' + Math.max(1, Math.round(100 - percentile)) + '%)' : ''}</span></div></div></div>`;
            if (median) {
                html += `<div class="stats-section-box" style="box-shadow:2px 2px 0 #1a1714;border:2px solid #1a1714;border-radius:5px;"><div class="stats-row"><span class="stats-row-label">Median time</span><div class="stats-row-right"><span class="stats-row-value">${parseFloat(median).toFixed(2)}</span></div></div></div>`;
            }
            if (rank && totalPlayers) {
                html += `<div class="stats-section-box" style="box-shadow:2px 2px 0 #1a1714;border:2px solid #1a1714;border-radius:5px;"><div class="stats-row"><span class="stats-row-label">Global rank</span><div class="stats-row-right"><span class="stats-row-value">${rank} of ${totalPlayers}</span></div></div></div>`;
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
                    html += `<span style="color:#ef4444;font-weight:600;">${entry.thinkingSeconds.toFixed(2)}</span>`;
                    html += `<span style="color:#ef4444;margin-left:4px;">(+${entry.penaltySeconds})</span>`;
                } else {
                    html += `<span style="flex:1;color:${textColor};font-weight:500;">${entry.word || ''}</span>`;
                    html += `<span style="color:${textColor};font-weight:600;">${time.toFixed(2)}</span>`;
                }

                html += `<span style="margin-left:8px;color:${entry.skipped ? '#ef4444' : '#9ca3af'};">&#8250;</span>`;
                html += `</div>`;
            });

            // Comments section (only for own or friend's runs)
            const isMyRun = currentUser && userId === currentUser.id;
            const isFriendRun = cachedScores.some(s => s.userId === userId && s.isFriend);
            if (data.runId && currentUser && (isMyRun || isFriendRun)) {
                html += '<div style="border-top:2px solid #d9cfb6;margin-top:16px;padding-top:12px;">';
                html += '<div style="font-size:0.8rem;color:#756e5c;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Comments</div>';
                html += `<div id="runComments" style="margin-bottom:8px;"></div>`;
                html += `<div style="display:flex;gap:6px;">`;
                html += `<input id="runCommentInput" type="text" placeholder="Add a comment..." style="flex:1;padding:8px 12px;border:2px solid #d9cfb6;border-radius:5px;font-size:0.85rem;background:#fefcf7;">`;
                html += `<button onclick="submitRunComment('${data.runId}')" style="padding:8px 14px;background:#9370db;color:white;border:2px solid #1a1714;border-radius:5px;font-weight:600;font-size:0.85rem;cursor:pointer;box-shadow:2px 2px 0 #1a1714;">Send</button>`;
                html += '</div></div>';
            }

            contentEl.innerHTML = html;

            // Load comments
            if (data.runId && currentUser && (isMyRun || isFriendRun)) {
                loadRunComments(data.runId);
                const commentInput = document.getElementById('runCommentInput');
                if (commentInput) commentInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') submitRunComment(data.runId);
                });
            }

        } catch (error) {
            console.error('Error loading run details:', error);
            contentEl.innerHTML = '<p style="text-align:center;color:#dc2626;">Failed to load run details</p>';
        }
    }

    async function loadRunComments(runId) {
        const container = document.getElementById('runComments');
        if (!container) return;
        try {
            const { data } = await sb.from('run_comments')
                .select('id, text, user_id, created_at')
                .eq('run_id', runId)
                .order('created_at', { ascending: true });
            if (!data || data.length === 0) {
                container.innerHTML = '<div style="color:#756e5c;font-size:0.8rem;font-style:italic;">No comments yet</div>';
                return;
            }
            // Resolve user names
            const userIds = [...new Set(data.map(c => c.user_id))];
            const { data: profiles } = await sb.from('profiles').select('id, display_name, handle').in('id', userIds);
            const nameMap = {};
            (profiles || []).forEach(p => nameMap[p.id] = p.display_name || ('@' + p.handle) || 'Anon');

            let html = '';
            data.forEach(c => {
                const name = nameMap[c.user_id] || 'Anon';
                const ago = timeSince(new Date(c.created_at));
                const isMe = currentUser && c.user_id === currentUser.id;
                html += `<div style="padding:6px 0;border-bottom:1px solid #eee9db;font-size:0.85rem;">`;
                html += `<span style="font-weight:600;${isMe ? 'color:#9370db;' : ''}">${name}</span>`;
                html += `<span style="color:#756e5c;font-size:0.75rem;margin-left:6px;">${ago}</span>`;
                html += `<div style="margin-top:2px;">${c.text}</div>`;
                html += '</div>';
            });
            container.innerHTML = html;
        } catch (e) {
            console.error('[Comments]', e);
        }
    }

    async function submitRunComment(runId) {
        const input = document.getElementById('runCommentInput');
        const text = (input.value || '').trim();
        if (!text || !currentUser) return;
        input.value = '';
        try {
            await sb.from('run_comments').insert({ run_id: runId, user_id: currentUser.id, text });
            loadRunComments(runId);
        } catch (e) {
            console.error('[Comment submit]', e);
        }
    }
    window.submitRunComment = submitRunComment;

    function timeSince(date) {
        const s = Math.floor((Date.now() - date.getTime()) / 1000);
        if (s < 60) return 'just now';
        if (s < 3600) return Math.floor(s / 60) + 'm ago';
        if (s < 86400) return Math.floor(s / 3600) + 'h ago';
        return Math.floor(s / 86400) + 'd ago';
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
            headerHtml += `<span style="color:#6b7280;">You skipped: </span><strong style="color:#ef4444;">${wordsModalMyTime.toFixed(2)} (+${wordsModalMyPenalty})</strong>`;
        } else if (wordsModalMyWord === '__not_played__') {
            headerHtml += `<span style="color:#6b7280;">You finished before this plate</span>`;
        } else if (wordsModalMyWord) {
            headerHtml += `<span style="color:#6b7280;">You played: </span><strong>${wordsModalMyWord}</strong> <span style="color:#6b7280;">(${wordsModalMyTime.toFixed(2)})</span>`;
        }
        if (wordsModalAvgTime > 0) {
            if (headerHtml) headerHtml += '<br>';
            headerHtml += `<span style="color:#6b7280;">Skip: ${wordsModalSkipPct}%</span>`;
            headerHtml += `<span style="color:#6b7280;margin-left:16px;">Avg: ${wordsModalAvgTime.toFixed(2)}</span>`;
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
                html += `<div class="word-item" onclick="showDefinition('${word.replace(/'/g, "\\'")}')" style="cursor:pointer;">${highlightWordWithPlate(word, wordsModalPlate)}</div>`;
            });
        } else if (tab === 'viable') {
            const sorted = [...wordsModalViable].sort((a, b) => a.length - b.length || a.localeCompare(b));
            sorted.forEach(word => {
                html += `<div class="word-item" onclick="showDefinition('${word.replace(/'/g, "\\'")}')" style="cursor:pointer;">${highlightWordWithPlate(word, wordsModalPlate)}</div>`;
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
                        : `<span onclick="event.stopPropagation();showDefinition('${entry.word.replace(/'/g, "\\'")}')" style="cursor:pointer;">${highlightWordWithPlate(entry.word, wordsModalPlate)}</span>`;

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
                            let timeDisplay = u.time.toFixed(2);
                            if (u.skipped && u.penalty) timeDisplay = `${u.time.toFixed(2)} (+${u.penalty})`;
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

    async function showDefinition(word) {
        await ensureDefinitionsLoaded();
        const senses = DEFINITIONS[word.toLowerCase()];
        let popup = document.getElementById('definitionPopup');
        if (!popup) {
            popup = document.createElement('div');
            popup.id = 'definitionPopup';
            popup.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:10001;background:#e5e7eb;border:2px solid #000;border-radius:14px;padding:18px;max-width:340px;width:90%;box-shadow:0 4px 20px rgba(0,0,0,0.2);';
            document.body.appendChild(popup);

            const backdrop = document.createElement('div');
            backdrop.id = 'definitionBackdrop';
            backdrop.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:10000;background:rgba(0,0,0,0.3);';
            backdrop.onclick = hideDefinition;
            document.body.appendChild(backdrop);
        }
        document.getElementById('definitionBackdrop').style.display = 'block';
        popup.style.display = 'block';

        let html = `<div style="font-size:1.2rem;font-weight:700;margin-bottom:8px;">${highlightWordWithPlate(word, wordsModalPlate)}</div>`;
        if (!senses || senses.length === 0) {
            html += `<div style="color:#6b7280;">No definition available</div>`;
        } else {
            senses.forEach(s => {
                html += `<div style="margin-bottom:6px;"><span style="font-style:italic;color:#6b7280;font-size:0.85rem;">${s.p}</span> <span style="color:#111;">${s.d}</span></div>`;
            });
        }
        popup.innerHTML = html;
    }
    window.showDefinition = showDefinition;

    function hideDefinition() {
        const popup = document.getElementById('definitionPopup');
        const backdrop = document.getElementById('definitionBackdrop');
        if (popup) popup.style.display = 'none';
        if (backdrop) backdrop.style.display = 'none';
    }
    window.hideDefinition = hideDefinition;

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
        // Restore mode from localStorage or default to practice
        const savedMode = localStorage.getItem('currentGameMode');
        gameMode = (savedMode === 'endless') ? 'endless' : 'practice';

        const mi = document.getElementById('modeIndicator');
        const practiceBtn = document.getElementById('practiceBtn');
        const startBtn = document.getElementById('startButton');

        if (gameMode === 'endless') {
            mi.textContent = 'Endless Mode';
            mi.style.background = '#f0fdfa';
            mi.style.color = '#0f766e';
            mi.style.border = '2px solid #99f6e4';
            practiceBtn.textContent = 'Endless Mode';
            practiceBtn.style.background = '#ccfbf1';
            practiceBtn.style.color = '#0f766e';
            document.querySelector('.mode-btn-settings').style.background = '#14b8a6';
            startBtn.textContent = 'Resume Session';
            // Restore session counters and plate sequence after auth is ready
            setTimeout(async () => {
                if (!currentUser) return;
                try {
                    const today = getTodayString();
                    const { data } = await sb.rpc('start_unlimited_session', { p_date: today });
                    if (data && data.length > 0) {
                        endlessSessionId = data[0].session_id;
                    }
                    // Count actual rows for accurate counters
                    const { count: totalCount } = await sb.from('practice_plate_stats')
                        .select('id', { count: 'exact', head: true })
                        .eq('user_id', currentUser.id)
                        .eq('source', 'unlimited')
                        .gte('created_at', today + 'T00:00:00')
                        .lte('created_at', today + 'T23:59:59');
                    const { count: solvedCount } = await sb.from('practice_plate_stats')
                        .select('id', { count: 'exact', head: true })
                        .eq('user_id', currentUser.id)
                        .eq('source', 'unlimited')
                        .eq('skipped', false)
                        .gte('created_at', today + 'T00:00:00')
                        .lte('created_at', today + 'T23:59:59');
                    endlessTotalSeen = totalCount || 0;
                    endlessTotalSolved = solvedCount || 0;
                    updateProgressDisplay();
                    // Try to restore plate sequence from saved state
                    const savedState = localStorage.getItem('pendingEndlessState');
                    if (savedState) {
                        try {
                            const parsed = JSON.parse(savedState);
                            if (parsed.plateSequence && parsed.plateSequence.length > 0) {
                                dailyPlateSequence = parsed.plateSequence;
                                // Pre-fill usedPlates up to the saved cursor
                                usedPlates = new Set();
                                for (let i = 0; i < (parsed.cursor || 0); i++) {
                                    if (i < dailyPlateSequence.length) usedPlates.add(dailyPlateSequence[i]);
                                }
                                console.log('[Endless] Restored sequence, cursor:', parsed.cursor, 'usedPlates:', usedPlates.size);
                            } else {
                                dailyPlateSequence = generateChallengeSequence(50);
                            }
                        } catch (e) {
                            dailyPlateSequence = generateChallengeSequence(50);
                        }
                    } else {
                        dailyPlateSequence = generateChallengeSequence(50);
                    }
                } catch (e) { console.error('[Endless] Session restore error:', e); }
            }, 1500);
        } else {
            mi.textContent = 'Practice Mode - Difficulty ' + (typeof practiceDifficulty === 'number' ? practiceDifficulty : 50);
            mi.style.background = '#f3e8ff';
            mi.style.color = '#6b21a8';
            mi.style.border = '2px solid #e9d5ff';
            startBtn.textContent = 'Start Game';
        }
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

            if (!currentUser) { switchTab('profile'); return; }

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
                initTryIt();
            });
        }

        // Enter key on try-it input
        const tryItInputEl = document.getElementById('tryItInput');
        if (tryItInputEl) {
            tryItInputEl.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') tryItSubmit();
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
            // Show mode choice modal
            document.getElementById('practiceModeBackdrop').classList.add('show');
            const endlessBtn = document.getElementById('chooseEndlessBtn');
            if (!currentUser) {
                endlessBtn.disabled = true;
                endlessBtn.style.background = '#d9cfb6';
                endlessBtn.style.color = '#756e5c';
                endlessBtn.style.cursor = 'not-allowed';
                endlessBtn.innerHTML = 'Endless Mode (Sign in required)<br><span style="font-size:0.8rem;font-weight:400;opacity:0.9;">Endless Plates</span>';
            } else {
                endlessBtn.disabled = false;
                endlessBtn.style.background = '#14b8a6';
                endlessBtn.style.color = 'white';
                endlessBtn.style.cursor = 'pointer';
                endlessBtn.innerHTML = 'Endless Mode<br><span style="font-size:0.8rem;font-weight:400;opacity:0.9;">Endless Plates</span>';
            }
        });

        document.getElementById('quickMatchBtn').addEventListener('click', () => {
            if (!currentUser || currentUser.is_anonymous) {
                alert('Please sign in to play Quick Match');
                return;
            }
            // Show confirmation modal
            const backdrop = document.getElementById('wordsModalBackdrop') || document.createElement('div');
            let modal = document.getElementById('quickMatchConfirm');
            if (!modal) {
                modal = document.createElement('div');
                modal.id = 'quickMatchConfirm';
                modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.4);';
                modal.innerHTML = `
                    <div style="background:white;border-radius:16px;padding:24px;max-width:340px;width:90%;box-shadow:0 4px 20px rgba(0,0,0,0.2);text-align:center;">
                        <div style="font-size:1.2rem;font-weight:700;margin-bottom:8px;">Quick Match</div>
                        <div style="color:#6b7280;font-size:0.9rem;margin-bottom:20px;">Play 10 plates at Difficulty 50. You'll be matched against a random opponent.</div>
                        <div style="display:flex;gap:10px;">
                            <button id="qmCancel" style="flex:1;padding:10px;border:1px solid #d1d5db;border-radius:10px;background:white;font-weight:600;cursor:pointer;font-size:0.9rem;">Cancel</button>
                            <button id="qmStart" style="flex:1;padding:10px;border:none;border-radius:10px;background:#f59e0b;color:white;font-weight:600;cursor:pointer;font-size:0.9rem;">Play</button>
                        </div>
                    </div>
                `;
                document.body.appendChild(modal);
                document.getElementById('qmCancel').addEventListener('click', () => { modal.style.display = 'none'; });
                document.getElementById('qmStart').addEventListener('click', async () => {
                    modal.style.display = 'none';
                    await startQuickMatch();
                });
            } else {
                modal.style.display = 'flex';
            }
        });

        async function startQuickMatch() {
            const plates = generateChallengeSequence(50);
            if (!plates.length) {
                alert('Game data not ready yet. Please wait.');
                return;
            }

            try {
                const rpcParams = {
                    p_user_id: currentUser.id,
                    p_plates: plates
                };
                if (lastQuickMatchOpponentId) rpcParams.p_last_opponent_id = lastQuickMatchOpponentId;

                const { data, error } = await sb.rpc('quick_match', rpcParams);

                if (error) throw error;
                const result = Array.isArray(data) ? data[0] : data;
                if (!result) throw new Error('No result from quick_match');

                console.log('[QuickMatch] challenge=' + result.challenge_id + ' run=' + result.run_id + ' matched=' + result.matched);

                if (timerIntervalId) { clearInterval(timerIntervalId); timerIntervalId = null; }
                resetGameState();
                gameOver = false;
                gameStarted = false;

                currentChallengeId = result.challenge_id;
                currentH2HRunId = result.run_id;
                currentChallengeType = null;
                gameMode = 'h2h_challenge';
                dailyPlateSequence = result.plates;
                currentH2HDifficulty = 50;

                switchTab('game');

                document.getElementById('practiceBtn').disabled = true;
                document.getElementById('practiceBtn').style.opacity = '0.5';
                document.getElementById('dailyChallengeBtn').disabled = true;
                document.getElementById('dailyChallengeBtn').style.opacity = '0.5';
                document.getElementById('quickMatchBtn').disabled = true;
                document.getElementById('quickMatchBtn').style.opacity = '0.5';

                const mi = document.getElementById('modeIndicator');
                mi.innerHTML = `
                    <div style="display:flex;align-items:center;justify-content:space-between;">
                        <span>Quick Match | Difficulty 50</span>
                        <button onclick="forfeitH2H()" style="padding:6px 12px;background:#dc2626;color:white;border:none;border-radius:4px;cursor:pointer;font-size:0.9rem;">Forfeit</button>
                    </div>
                `;
                mi.style.background = '#fef3c7';
                mi.style.color = '#92400e';
                mi.style.border = '2px solid #fbbf24';

                const startBtn = document.getElementById('startButton');
                startBtn.style.display = 'none';
                window.scrollTo({ top: 0, behavior: 'smooth' });
                await beginNewRun();
            } catch (e) {
                console.error('[QuickMatch] Error:', e);
                alert('Quick Match error: ' + e.message);
            }
        }

        document.getElementById('choosePracticeBtn').addEventListener('click', () => {
            document.getElementById('practiceModeBackdrop').classList.remove('show');
            const btn = document.getElementById('practiceBtn');
            btn.textContent = 'Practice Mode';
            btn.style.background = '#e9d5ff';
            btn.style.color = '#6b21a8';
            document.querySelector('.mode-btn-settings').style.background = '#7c5cbf';
            startPracticeMode();
        });

        document.getElementById('chooseEndlessBtn').addEventListener('click', () => {
            if (!currentUser) { switchTab('profile'); document.getElementById('practiceModeBackdrop').classList.remove('show'); return; }
            document.getElementById('practiceModeBackdrop').classList.remove('show');
            const btn = document.getElementById('practiceBtn');
            btn.textContent = 'Endless Mode';
            btn.style.background = '#ccfbf1';
            btn.style.color = '#0f766e';
            document.querySelector('.mode-btn-settings').style.background = '#14b8a6';
            startEndlessMode();
        });

        function startPracticeMode() {
            // Submit previous run stats
            if (gameMode === 'practice' && gameHistory.length > 0 && !practiceStatsSubmitted) {
                submitPracticePlateStats();
            }
            practiceStatsSubmitted = false;
            gameMode = 'practice';
            localStorage.setItem('currentGameMode', 'practice');
            dailyPlateSequence = null;
            document.getElementById('practiceSettingsBtn').style.display = '';

            if (timerIntervalId) { clearInterval(timerIntervalId); timerIntervalId = null; }
            resetGameState();
            window.onbeforeunload = null;

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
        }

        async function startEndlessMode() {
            // Submit previous run stats
            if (gameMode === 'practice' && gameHistory.length > 0 && !practiceStatsSubmitted) {
                submitPracticePlateStats();
            }
            practiceStatsSubmitted = false;
            gameMode = 'endless';
            localStorage.setItem('currentGameMode', 'endless');
            dailyPlateSequence = null;
            document.getElementById('practiceSettingsBtn').style.display = 'none';

            if (timerIntervalId) { clearInterval(timerIntervalId); timerIntervalId = null; }
            resetGameState();
            window.onbeforeunload = null;

            // Start or resume session on server
            try {
                const today = getTodayString();
                const { data } = await sb.rpc('start_unlimited_session', { p_date: today });
                if (data && data.length > 0) {
                    endlessSessionId = data[0].session_id;
                }
                // Count actual rows for accurate counters (session counter may be stale)
                if (currentUser) {
                    const { count: totalCount } = await sb.from('practice_plate_stats')
                        .select('id', { count: 'exact', head: true })
                        .eq('user_id', currentUser.id)
                        .eq('source', 'unlimited')
                        .gte('created_at', today + 'T00:00:00')
                        .lte('created_at', today + 'T23:59:59');
                    const { count: solvedCount } = await sb.from('practice_plate_stats')
                        .select('id', { count: 'exact', head: true })
                        .eq('user_id', currentUser.id)
                        .eq('source', 'unlimited')
                        .eq('skipped', false)
                        .gte('created_at', today + 'T00:00:00')
                        .lte('created_at', today + 'T23:59:59');
                    endlessTotalSeen = totalCount || 0;
                    endlessTotalSolved = solvedCount || 0;
                    // Sync session counter
                    if (endlessSessionId) {
                        await sb.from('unlimited_sessions')
                            .update({
                                total_plates_seen: endlessTotalSeen,
                                total_solved: endlessTotalSolved,
                                total_skipped: endlessTotalSeen - endlessTotalSolved
                            })
                            .eq('id', endlessSessionId);
                    }
                }
            } catch (e) {
                console.error('Failed to start endless session:', e);
                endlessTotalSeen = 0;
                endlessTotalSolved = 0;
            }

            endlessPendingEntries = [];
            gameHistory = [];

            const mi = document.getElementById('modeIndicator');
            mi.textContent = 'Endless Mode';
            mi.style.background = '#f0fdfa';
            mi.style.color = '#0f766e';
            mi.style.border = '2px solid #99f6e4';

            // Try to restore plate sequence from saved state
            let restored = false;
            const savedState = localStorage.getItem('pendingEndlessState');
            if (savedState) {
                try {
                    const parsed = JSON.parse(savedState);
                    if (parsed.plateSequence && parsed.plateSequence.length > 0 && parsed.cursor != null) {
                        dailyPlateSequence = parsed.plateSequence;
                        usedPlates = new Set();
                        for (let i = 0; i < parsed.cursor; i++) {
                            if (i < dailyPlateSequence.length) usedPlates.add(dailyPlateSequence[i]);
                        }
                        restored = true;
                        console.log('[Endless] Restored sequence from localStorage, cursor:', parsed.cursor);
                    }
                } catch (e) { /* ignore parse errors */ }
            }
            if (!restored) {
                dailyPlateSequence = generateChallengeSequence(50);
            }

            // Set up UI — game starts when user clicks Start Game
            plateEl.textContent = '---';
            resultEl.textContent = '';
            while (historyBodyEl.firstChild) historyBodyEl.removeChild(historyBodyEl.firstChild);
            historyEmptyEl.style.display = 'block';
            timerDisplayEl.textContent = '';
            updateProgressDisplay();
            wordInputEl.value = '';
            wordInputEl.disabled = false;
            wordInputEl.readOnly = false;
            checkButtonEl.disabled = false;
            skipButtonEl.disabled = false;
            updateSkipButtonLabel();

            const startBtn = document.getElementById('startButton');
            startBtn.textContent = 'Start Game';
            startBtn.style.display = 'inline-block';
            startBtn.disabled = false;
            startBtn.style.opacity = '1';
            startBtn.style.cursor = 'pointer';

            document.getElementById('dailyChallengeBtn').disabled = false;
            document.getElementById('dailyChallengeBtn').style.opacity = '1';
        }

        // End endless session — flush entries to server
        async function endEndlessSession() {
            if (timerIntervalId) { clearInterval(timerIntervalId); timerIntervalId = null; }
            gameStarted = false;
            gameOver = true;
            plateLocked = true;
            wordInputEl.disabled = true;
            wordInputEl.readOnly = true;
            checkButtonEl.disabled = true;
            skipButtonEl.disabled = true;

            // Grab entries and clear immediately so beforeunload doesn't re-save them
            const entriesToFlush = endlessPendingEntries.slice();
            endlessPendingEntries = [];
            localStorage.removeItem('pendingEndlessState');

            // Flush pending entries
            if (currentUser && entriesToFlush.length > 0) {
                try {
                    const rows = entriesToFlush.map(e => ({
                        user_id: currentUser.id,
                        plate: e.plate,
                        word: e.word,
                        skipped: e.skipped,
                        thinking_seconds: e.thinking_seconds,
                        source: 'unlimited',
                        difficulty: 50
                    }));
                    await sb.from('practice_plate_stats').insert(rows);
                    console.log('[Endless] Flushed', rows.length, 'entries');
                } catch (e) {
                    console.error('[Endless] Flush error:', e);
                }
            }

            // Update session counters
            if (endlessSessionId) {
                try {
                    await sb.from('unlimited_sessions')
                        .update({
                            total_solved: endlessTotalSolved,
                            total_skipped: endlessTotalSeen - endlessTotalSolved,
                            total_plates_seen: endlessTotalSeen,
                            updated_at: new Date().toISOString()
                        })
                        .eq('id', endlessSessionId);
                } catch (e) {
                    console.error('[Endless] Session update error:', e);
                }
            }

            // Enable plate stats button
            if (gameHistory.length > 0) {
                const psBtn = document.getElementById('practiceStatsBtn2');
                if (psBtn) { psBtn.disabled = false; psBtn.style.opacity = '1'; }
            }

            resultEl.textContent = `Session paused — ${endlessTotalSolved}/${endlessTotalSeen} solved.`;
            resultEl.style.color = 'green';

            // Generate fresh sequence for resume
            dailyPlateSequence = generateChallengeSequence(50);
            // Don't clear gameHistory — Plate Stats button needs it

            // Show Resume Session button
            const startBtn = document.getElementById('startButton');
            startBtn.textContent = 'Resume Session';
            startBtn.disabled = false;
            startBtn.style.opacity = '1';
            startBtn.style.cursor = 'pointer';

            document.getElementById('dailyChallengeBtn').disabled = false;
            document.getElementById('dailyChallengeBtn').style.opacity = '1';
        }

        document.getElementById('confirmEndEndlessBtn').addEventListener('click', () => {
            document.getElementById('endEndlessBackdrop').classList.remove('show');
            endEndlessSession();
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
    let currentChallengeType = null; // 'group' or null
    let lastQuickMatchOpponentId = null;
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
        document.getElementById('chTabLeaderboard').classList.toggle('active', tab === 'leaderboard');
        if (tab === 'leaderboard') {
            renderH2HLeaderboard();
            return;
        }
        renderChallengesList();
    }
    window.switchChallengeTab = switchChallengeTab;

    async function loadH2HChallenges() {
        const contentEl = document.getElementById('challengesContent');
        if (!currentUser) {
            contentEl.innerHTML = '<div style="text-align:center;padding:40px 0;"><p style="color:#756e5c;margin-bottom:16px;">Sign in to view challenges</p><button onclick="switchTab(\'profile\')" style="padding:10px 24px;background:#9370db;color:white;border:2px solid #1a1714;border-radius:5px;font-weight:700;cursor:pointer;box-shadow:3px 3px 0 #1a1714;">Sign In</button></div>';
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

            // Also fetch group challenges where user is a participant
            const { data: groupParts } = await sb
                .from('group_challenge_participants')
                .select('challenge_id, user_id, status')
                .eq('user_id', currentUser.id);

            const groupChallengeIds = (groupParts || []).map(p => p.challenge_id);
            let groupChallenges = [];
            if (groupChallengeIds.length > 0) {
                const existingIds = new Set((data || []).map(c => c.id));
                const missingIds = groupChallengeIds.filter(id => !existingIds.has(id));
                if (missingIds.length > 0) {
                    const { data: gcData } = await sb
                        .from('h2h_challenges')
                        .select('*')
                        .in('id', missingIds)
                        .order('created_at', { ascending: false });
                    groupChallenges = gcData || [];
                }
            }

            h2hChallengesCache = [...(data || []), ...groupChallenges];

            // Store group participants for lookup — include all group challenges in cache
            window._groupParticipants = {};
            const allGroupIds = h2hChallengesCache.filter(c => c.challenge_type === 'group').map(c => c.id);
            if (allGroupIds.length > 0) {
                const { data: allParts } = await sb
                    .from('group_challenge_participants')
                    .select('challenge_id, user_id, status')
                    .in('challenge_id', allGroupIds);
                (allParts || []).forEach(p => {
                    if (!window._groupParticipants[p.challenge_id]) window._groupParticipants[p.challenge_id] = [];
                    window._groupParticipants[p.challenge_id].push(p);
                });
            }

            // Collect unique user IDs for profile lookup
            const userIds = new Set();
            h2hChallengesCache.forEach(c => {
                userIds.add(c.challenger_id);
                if (c.opponent_id) userIds.add(c.opponent_id);
            });
            // Add group participant IDs
            Object.values(window._groupParticipants || {}).forEach(parts => {
                parts.forEach(p => userIds.add(p.user_id));
            });
            userIds.delete(currentUser.id);
            userIds.delete(null);

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

            // Fetch Elo history for completed challenges
            const completedIds = h2hChallengesCache.filter(c => c.status === 'completed').map(c => c.id);
            if (completedIds.length > 0 && currentUser) {
                const { data: eloRows } = await sb.from('elo_history')
                    .select('user_id, challenge_id, old_elo, new_elo')
                    .in('challenge_id', completedIds);
                if (eloRows) {
                    for (const e of eloRows) {
                        const ch = h2hChallengesCache.find(c => c.id === e.challenge_id);
                        if (!ch) continue;
                        if (e.user_id === currentUser.id) {
                            ch._eloChange = e.new_elo - e.old_elo;
                        } else {
                            ch._oppElo = e.old_elo;
                        }
                    }
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

    function updateChallengesBadge() {
        const badge = document.getElementById('challengesBadge');
        if (!badge || !currentUser) { if (badge) badge.style.display = 'none'; return; }
        const incomingCount = h2hChallengesCache.filter(c => {
            if (c.opponent_id === currentUser.id && c.status === 'pending') return true;
            if (c.challenge_type === 'group') {
                const parts = window._groupParticipants?.[c.id] || [];
                if (parts.some(p => p.user_id === currentUser.id && p.status === 'invited')) return true;
            }
            return false;
        }).length;
        if (incomingCount > 0) {
            badge.textContent = incomingCount;
            badge.style.display = '';
        } else {
            badge.style.display = 'none';
        }
    }

    function renderChallengesList() {
        const contentEl = document.getElementById('challengesContent');
        if (!currentUser) {
            contentEl.innerHTML = '<div style="text-align:center;padding:40px 0;"><p style="color:#756e5c;margin-bottom:16px;">Sign in to view challenges</p><button onclick="switchTab(\'profile\')" style="padding:10px 24px;background:#9370db;color:white;border:2px solid #1a1714;border-radius:5px;font-weight:700;cursor:pointer;box-shadow:3px 3px 0 #1a1714;">Sign In</button></div>';
            return;
        }
        updateChallengesBadge();

        let filtered = [];
        if (h2hActiveSubTab === 'incoming') {
            filtered = h2hChallengesCache.filter(c => {
                if (c.opponent_id === currentUser.id && c.status === 'pending') return true;
                // Group challenge invites
                if (c.challenge_type === 'group') {
                    const parts = window._groupParticipants?.[c.id] || [];
                    if (parts.some(p => p.user_id === currentUser.id && p.status === 'invited')) return true;
                }
                return false;
            });
        } else if (h2hActiveSubTab === 'pending') {
            filtered = h2hChallengesCache.filter(c => {
                const isChallenger = c.challenger_id === currentUser.id;
                if ((isChallenger && c.status === 'pending') || c.status === 'accepted' || c.status === 'quick_match_waiting') return true;
                // Group challenges I created or accepted
                if (c.challenge_type === 'group' && c.status === 'group_active') {
                    if (isChallenger) return true;
                    const parts = window._groupParticipants?.[c.id] || [];
                    if (parts.some(p => p.user_id === currentUser.id && (p.status === 'accepted' || p.status === 'completed'))) return true;
                }
                return false;
            });
        } else if (h2hActiveSubTab === 'results') {
            filtered = h2hChallengesCache.filter(c => {
                if (c.status === 'completed') return true;
                // Group challenges where I completed and at least one other completed
                if (c.challenge_type === 'group' && c.status === 'group_active') {
                    const parts = window._groupParticipants?.[c.id] || [];
                    const myPart = parts.find(p => p.user_id === currentUser.id);
                    const othersCompleted = parts.some(p => p.user_id !== currentUser.id && p.status === 'completed');
                    if (myPart?.status === 'completed' && othersCompleted) return true;
                }
                return false;
            });
            filtered.sort((a, b) => (b.completed_at || b.created_at || '').localeCompare(a.completed_at || a.created_at || ''));
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
            const dateStr = formatRelativeDate(h2hActiveSubTab === 'results' && ch.completed_at ? ch.completed_at : ch.created_at);

            if (h2hActiveSubTab === 'incoming') {
                const isGroup = ch.challenge_type === 'group';
                const displayName = isGroup ? (ch.group_name || 'Group Challenge') : oppName;
                const acceptFn = isGroup ? 'acceptGroupChallenge' : 'acceptChallenge';
                const declineFn = isGroup ? 'declineGroupChallenge' : 'declineChallenge';
                const bgColor = isGroup ? '#f3e8ff' : '#f0f0ff';
                const borderColor = isGroup ? '#d8b4fe' : '#c7d2fe';
                html += `<div style="display:flex;align-items:center;padding:12px 14px;margin-bottom:6px;border-radius:12px;background:${bgColor};border:1px solid ${borderColor};">`;
                html += `<div style="flex:1;min-width:0;">`;
                html += `<div style="font-weight:700;font-size:0.95rem;color:#1f2937;">${isGroup ? '👥 ' : ''}${displayName}</div>`;
                html += `<div style="font-size:0.75rem;color:#9ca3af;margin-top:2px;">${diffLabel} · ${dateStr}</div>`;
                html += `</div>`;
                html += `<div style="display:flex;gap:8px;">`;
                html += `<button onclick="event.stopPropagation();${acceptFn}('${ch.id}')" style="padding:6px 14px;background:#16a34a;color:white;border:none;border-radius:8px;font-weight:600;font-size:0.8rem;cursor:pointer;">Accept</button>`;
                html += `<button onclick="event.stopPropagation();${declineFn}('${ch.id}')" style="padding:6px 14px;background:#ef4444;color:white;border:none;border-radius:8px;font-weight:600;font-size:0.8rem;cursor:pointer;">Decline</button>`;
                html += `</div>`;
                html += `</div>`;
            } else if (h2hActiveSubTab === 'pending') {
                if (ch.challenge_type === 'group') {
                    const parts = window._groupParticipants?.[ch.id] || [];
                    const completedCount = parts.filter(p => p.status === 'completed').length;
                    const groupDisplayName = ch.group_name || 'Group Challenge';
                    html += `<div style="display:flex;align-items:center;padding:12px 14px;margin-bottom:6px;border-radius:12px;background:#f3e8ff;border:1px solid #d8b4fe;cursor:pointer;" onclick="viewGroupScorecard('${ch.id}')">`;
                    html += `<div style="flex:1;min-width:0;">`;
                    html += `<div style="font-weight:700;font-size:0.95rem;color:#1f2937;">👥 ${groupDisplayName}</div>`;
                    html += `<div style="font-size:0.75rem;color:#9ca3af;margin-top:2px;">${completedCount}/${parts.length} played · ${diffLabel} · ${dateStr}</div>`;
                    html += `</div>`;
                    html += `<span style="color:#9ca3af;font-size:1rem;">›</span>`;
                    html += `</div>`;
                } else {
                const isQuickMatch = ch.status === 'quick_match_waiting';
                const myRun = ch._runs && ch._runs[currentUser.id];
                const oppId = isQuickMatch ? null : (isChallenger ? ch.opponent_id : ch.challenger_id);
                const oppRun = oppId ? (ch._runs && ch._runs[oppId]) : null;
                const myScore = myRun && myRun.forfeited ? 'Forfeit' : (myRun && myRun.totalSeconds != null ? myRun.totalSeconds.toFixed(1) : (myRun ? 'In progress' : 'Not played'));
                const oppScore = isQuickMatch ? '—' : (oppRun && oppRun.forfeited ? 'Forfeit' : (oppRun && oppRun.totalSeconds != null ? oppRun.totalSeconds.toFixed(1) : '—'));

                const canPlay = !isQuickMatch && (!myRun || (myRun && myRun.totalSeconds == null)) && ch.status === 'accepted';
                const statusLabel = isQuickMatch ? 'Waiting for opponent' : (ch.status === 'pending' ? 'Waiting for response' : (canPlay ? 'Tap to play' : 'Waiting for opponent'));
                const statusColor = canPlay ? '#16a34a' : '#9ca3af';
                const displayName = isQuickMatch ? 'Quick Match' : `vs ${oppName}`;
                const bgColor = isQuickMatch ? '#fff7ed' : '#fffbeb';
                const borderColor = isQuickMatch ? '#fdba74' : '#fde68a';
                html += `<div style="display:flex;align-items:center;padding:12px 14px;margin-bottom:6px;border-radius:12px;background:${bgColor};border:1px solid ${borderColor};cursor:pointer;" onclick="${canPlay ? `playH2HChallenge('${ch.id}')` : `viewH2HScorecard('${ch.id}')`}">`;
                html += `<div style="flex:1;min-width:0;">`;
                html += `<div style="font-weight:700;font-size:0.95rem;color:#1f2937;">${displayName}</div>`;
                html += `<div style="font-size:0.75rem;color:#9ca3af;margin-top:2px;">${diffLabel} · ${dateStr}</div>`;
                html += `<div style="font-size:0.75rem;color:${statusColor};font-weight:600;margin-top:2px;">${statusLabel}</div>`;
                html += `</div>`;
                html += `<div style="display:flex;align-items:center;gap:12px;">`;
                html += `<div style="text-align:center;min-width:55px;">`;
                html += `<div style="font-size:0.7rem;color:#9ca3af;font-weight:600;">YOU</div>`;
                html += `<div style="font-size:0.95rem;font-weight:700;color:#374151;">${myScore}</div>`;
                html += `</div>`;
                html += `<div style="color:#d1d5db;font-size:0.8rem;">vs</div>`;
                html += `<div style="text-align:center;min-width:55px;">`;
                html += `<div style="font-size:0.7rem;color:#9ca3af;font-weight:600;">THEM</div>`;
                html += `<div style="font-size:0.95rem;font-weight:700;color:#9ca3af;">${oppScore}</div>`;
                html += `</div>`;
                html += `<span style="color:#9ca3af;font-size:1rem;">›</span>`;
                html += `</div>`;
                html += `</div>`;
                } // close else for non-group pending
            } else if (h2hActiveSubTab === 'results') {
                if (ch.challenge_type === 'group') {
                    const parts = window._groupParticipants?.[ch.id] || [];
                    const completedCount = parts.filter(p => p.status === 'completed').length;
                    const groupDisplayName = ch.group_name || 'Group Challenge';
                    html += `<div style="display:flex;align-items:center;padding:12px 14px;margin-bottom:6px;border-radius:12px;background:#f3e8ff;border:1px solid #d8b4fe;cursor:pointer;" onclick="viewGroupScorecard('${ch.id}')">`;
                    html += `<div style="flex:1;min-width:0;">`;
                    html += `<div style="font-weight:700;font-size:0.95rem;color:#1f2937;">👥 ${groupDisplayName}</div>`;
                    html += `<div style="font-size:0.75rem;color:#9ca3af;margin-top:2px;">${completedCount}/${parts.length} played · ${diffLabel} · ${dateStr}</div>`;
                    html += `</div>`;
                    html += `<span style="color:#9ca3af;font-size:1rem;">›</span>`;
                    html += `</div>`;
                } else {
                const myRun = ch._runs && ch._runs[currentUser.id];
                const oppId = isChallenger ? ch.opponent_id : ch.challenger_id;
                const oppRun = ch._runs && ch._runs[oppId];
                const myTime = myRun ? myRun.totalSeconds : null;
                const oppTime = oppRun ? oppRun.totalSeconds : null;
                const myForfeit = myRun && myRun.forfeited;
                const oppForfeit = oppRun && oppRun.forfeited;

                let resultLabel = '';
                let resultBg = '#f9fafb';
                let resultBorder = '#e5e7eb';
                if (myForfeit && oppForfeit) { resultLabel = 'Draw'; resultBg = '#fefce8'; resultBorder = '#fde68a'; }
                else if (myForfeit) { resultLabel = 'Loss'; resultBg = '#fef2f2'; resultBorder = '#fecaca'; }
                else if (oppForfeit) { resultLabel = 'Win'; resultBg = '#f0fdf4'; resultBorder = '#bbf7d0'; }
                else if (myTime !== null && oppTime !== null) {
                    if (myTime < oppTime) { resultLabel = 'Win'; resultBg = '#f0fdf4'; resultBorder = '#bbf7d0'; }
                    else if (myTime > oppTime) { resultLabel = 'Loss'; resultBg = '#fef2f2'; resultBorder = '#fecaca'; }
                    else { resultLabel = 'Tie'; resultBg = '#fefce8'; resultBorder = '#fde68a'; }
                }

                const myDisplay = myForfeit ? 'Forfeit' : (myTime !== null ? myTime.toFixed(1) : '--');
                const oppDisplay = oppForfeit ? 'Forfeit' : (oppTime !== null ? oppTime.toFixed(1) : '--');
                const myColor = resultLabel === 'Win' ? '#16a34a' : resultLabel === 'Loss' ? '#dc2626' : '#374151';
                const oppColor = resultLabel === 'Loss' ? '#16a34a' : resultLabel === 'Win' ? '#dc2626' : '#374151';

                const wonIcon = resultLabel === 'Win' ? '✓' : resultLabel === 'Loss' ? '✗' : '—';
                const wonIconColor = resultLabel === 'Win' ? '#16a34a' : resultLabel === 'Loss' ? '#dc2626' : '#6b7280';
                const eloChange = ch._eloChange || 0;
                const eloStr = eloChange > 0 ? `<span style="color:#16a34a;font-size:0.75rem;margin-left:4px;">+${eloChange}</span>` : eloChange < 0 ? `<span style="color:#dc2626;font-size:0.75rem;margin-left:4px;">${eloChange}</span>` : '';
                const oppElo = ch._oppElo ? ` (${ch._oppElo})` : '';

                html += `<div style="display:flex;align-items:center;padding:10px 14px;margin-bottom:4px;border-radius:10px;background:${resultBg};border:1px solid ${resultBorder};cursor:pointer;gap:10px;" onclick="viewH2HScorecard('${ch.id}')">`;
                html += `<span style="font-size:1.2rem;font-weight:700;color:${wonIconColor};width:20px;">${wonIcon}</span>`;
                html += `<div style="flex:1;min-width:0;">`;
                html += `<div style="font-weight:600;font-size:0.9rem;color:#1f2937;">${oppName}<span style="color:#374151;font-size:0.8rem;">${oppElo}</span></div>`;
                html += `<div style="font-size:0.7rem;color:#9ca3af;margin-top:1px;">${diffLabel} · ${dateStr}</div>`;
                html += `</div>`;
                html += `<div style="text-align:right;">`;
                html += `<div style="font-size:0.85rem;font-weight:700;color:#374151;">${myDisplay} vs ${oppDisplay}</div>`;
                html += eloStr ? `<div style="font-size:0.75rem;margin-top:1px;">${eloStr}</div>` : '';
                html += `</div>`;
                html += `<button onclick="event.stopPropagation();rematchChallenge('${oppId}','${oppName.replace(/'/g,"\\'")}',${ch.difficulty ?? 50})" style="padding:4px 8px;background:none;border:1px solid #d1d5db;border-radius:6px;font-size:0.7rem;color:#6b7280;cursor:pointer;white-space:nowrap;" title="Rematch">↻</button>`;
                html += `<span style="color:#d1d5db;font-size:0.9rem;">›</span>`;
                html += `</div>`;
                } // close else for non-group results
            }
        });

        contentEl.innerHTML = html;
    }

    // === H2H Leaderboard ===
    function renderH2HTable(data, myId, limit) {
        const shown = data.slice(0, limit);
        let html = '<table style="width:100%;border-collapse:collapse;font-size:0.9rem;">';
        html += '<thead><tr style="font-size:0.7rem;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #d9cfb6;">';
        html += '<th style="padding:6px 8px;text-align:center;width:28px;">#</th>';
        html += '<th style="padding:6px 8px;text-align:left;">Player</th>';
        html += '<th style="padding:6px 8px;text-align:left;">Elo</th>';
        html += '<th style="padding:6px 8px;text-align:right;">W</th>';
        html += '<th style="padding:6px 8px;text-align:right;">L</th>';
        html += '<th style="padding:6px 8px;text-align:right;">PCT</th>';
        html += '</tr></thead><tbody>';

        shown.forEach((r, i) => {
            const isMe = r.id === myId;
            const total = r.wins + r.losses;
            const pct = total > 0 ? Math.round(r.wins / total * 100) : 0;
            const todayStr = r.today > 0 ? `<span style="color:#16a34a;font-size:0.75rem;margin-left:3px;">(+${r.today})</span>`
                : r.today < 0 ? `<span style="color:#dc2626;font-size:0.75rem;margin-left:3px;">(${r.today})</span>` : '';
            const bg = isMe ? 'background:rgba(124,58,237,0.05);' : '';
            const bold = isMe ? 'font-weight:700;' : '';

            html += `<tr style="${bg}border-bottom:1px solid #eee9db;">`;
            html += `<td style="padding:8px;text-align:center;color:#756e5c;font-size:0.8rem;">${i + 1}</td>`;
            const nameContent = r.anonymous || isMe
                ? `<span style="color:${r.anonymous ? '#9ca3af' : 'inherit'};">${r.anonymous ? 'Anonymous' : r.name}</span>`
                : `<span style="color:#7c3aed;cursor:pointer;" onclick="event.stopPropagation();preselectedChallengeUserId='${r.id}';preselectedChallengeUserName='${r.name.replace(/'/g,"\\'")}';openNewChallengeModal()">${r.name}</span>`;
            html += `<td style="padding:8px;${bold}max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${nameContent}</td>`;
            html += `<td style="padding:8px;font-weight:700;font-variant-numeric:tabular-nums;">${r.elo.toLocaleString()}${todayStr}</td>`;
            html += `<td style="padding:8px;text-align:right;font-variant-numeric:tabular-nums;">${r.wins}</td>`;
            html += `<td style="padding:8px;text-align:right;font-variant-numeric:tabular-nums;">${r.losses}</td>`;
            html += `<td style="padding:8px;text-align:right;color:#756e5c;font-variant-numeric:tabular-nums;">${pct}%</td>`;
            html += '</tr>';
        });

        html += '</tbody></table>';
        if (limit < data.length) {
            html += `<div style="text-align:center;margin-top:12px;"><button onclick="showMoreH2HRankings()" style="padding:8px 20px;background:#eee9db;color:#4a4338;border:2px solid #d9cfb6;border-radius:5px;font-weight:600;font-size:0.85rem;cursor:pointer;box-shadow:none;">Show 10 More</button></div>`;
        }
        return html;
    }

    function showMoreH2HRankings() {
        window._h2hRankingsShown = (window._h2hRankingsShown || 10) + 10;
        const data = window._h2hRankingsData || [];
        const myId = currentUser?.id;
        // Rebuild just the table portion (keep stats card)
        const contentEl = document.getElementById('challengesContent');
        const tableStart = contentEl.innerHTML.indexOf('<table');
        if (tableStart >= 0) {
            contentEl.innerHTML = contentEl.innerHTML.substring(0, tableStart) + renderH2HTable(data, myId, window._h2hRankingsShown);
        }
    }
    window.showMoreH2HRankings = showMoreH2HRankings;

    async function renderH2HLeaderboard() {
        const contentEl = document.getElementById('challengesContent');
        contentEl.innerHTML = '<p style="text-align:center;color:#6b7280;padding:40px 0;">Loading rankings...</p>';

        try {
            const { data, error } = await sb.rpc('h2h_rankings');
            if (error) throw error;

            if (!data || data.length === 0) {
                contentEl.innerHTML = '<p style="text-align:center;color:#6b7280;padding:40px 0;">No ranked players yet</p>';
                return;
            }

            const myId = currentUser?.id;
            const myRow = myId ? data.find(r => r.id === myId) : null;
            const myRank = myRow ? data.indexOf(myRow) + 1 : null;

            let html = '';

            // Pinned stats card
            if (myRow) {
                const total = myRow.wins + myRow.losses;
                const pct = total > 0 ? Math.round(myRow.wins / total * 100) : 0;
                const todayBadge = myRow.today > 0 ? `<span style="color:#16a34a;font-weight:700;margin-left:4px;">+${myRow.today}</span>`
                    : myRow.today < 0 ? `<span style="color:#dc2626;font-weight:700;margin-left:4px;">${myRow.today}</span>` : '';
                html += `<div style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;margin-bottom:12px;border-radius:12px;background:rgba(124,58,237,0.06);border:1px solid rgba(124,58,237,0.15);">`;
                html += `<div><div style="font-size:0.7rem;color:#6b7280;">Your Rating</div><div style="font-size:1.4rem;font-weight:800;font-variant-numeric:tabular-nums;">${myRow.elo.toLocaleString()}${todayBadge}</div></div>`;
                html += `<div style="text-align:right;"><div style="font-size:0.7rem;color:#6b7280;">Rank</div><div style="font-size:1.4rem;font-weight:800;">#${myRank}</div></div>`;
                html += `</div>`;
                html += `<div style="display:flex;gap:12px;margin-bottom:14px;text-align:center;">`;
                html += `<div style="flex:1;padding:8px;border-radius:8px;background:#f9fafb;"><div style="font-size:1rem;font-weight:700;">${myRow.games}</div><div style="font-size:0.65rem;color:#6b7280;">Games</div></div>`;
                html += `<div style="flex:1;padding:8px;border-radius:8px;background:#f9fafb;"><div style="font-size:1rem;font-weight:700;">${myRow.wins}</div><div style="font-size:0.65rem;color:#6b7280;">Wins</div></div>`;
                html += `<div style="flex:1;padding:8px;border-radius:8px;background:#f9fafb;"><div style="font-size:1rem;font-weight:700;">${myRow.losses}</div><div style="font-size:0.65rem;color:#6b7280;">Losses</div></div>`;
                html += `<div style="flex:1;padding:8px;border-radius:8px;background:#f9fafb;"><div style="font-size:1rem;font-weight:700;">${pct}%</div><div style="font-size:0.65rem;color:#6b7280;">Win%</div></div>`;
                html += `</div>`;
            }

            window._h2hRankingsData = data;
            window._h2hRankingsShown = 10;
            html += renderH2HTable(data, myId, 10);
            contentEl.innerHTML = html;
        } catch (e) {
            console.error('[H2H Leaderboard]', e);
            contentEl.innerHTML = '<p style="text-align:center;color:#dc2626;padding:40px 0;">Failed to load rankings</p>';
        }
    }

    // === New Challenge Modal ===
    let preselectedChallengeUserId = null;
    let preselectedChallengeUserName = null;
    let selectedFriendIds = new Set();
    let savedGroupsList = [];
    let selectedGroupName = null;

    function openNewChallengeModal() {
        if (!currentUser) {
            alert('Please sign in to create challenges');
            return;
        }
        const preId = preselectedChallengeUserId;
        const preName = preselectedChallengeUserName;
        preselectedChallengeUserId = null;
        preselectedChallengeUserName = null;

        selectedFriendIds = new Set();
        selectedFriendId = null;
        selectedGroupName = null;
        document.getElementById('sendChallengeBtn').disabled = true;
        document.getElementById('sendChallengeBtn').style.opacity = '0.5';
        document.getElementById('friendSearchInput').value = '';
        document.getElementById('challengeDiffSlider').value = 50;
        document.getElementById('challengeDiffValue').textContent = '50';
        document.getElementById('challengeDiffLabel').textContent = 'Normal plates';
        document.getElementById('newChallengeModalBackdrop').classList.add('show');
        loadFriendsList(preId, preName);
        loadSavedGroups();
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

    async function loadSavedGroups() {
        try {
            const { data } = await sb.from('saved_groups')
                .select('id, name, member_ids')
                .order('updated_at', { ascending: false });
            savedGroupsList = data || [];
        } catch(e) { savedGroupsList = []; }
        renderFriendsList();
    }

    function renderFriendsList() {
        const listEl = document.getElementById('friendsList');
        const query = (document.getElementById('friendSearchInput').value || '').toLowerCase();

        let html = '';

        // Saved groups (show when no friends selected)
        if (selectedFriendIds.size === 0 && savedGroupsList.length > 0) {
            const filteredGroups = query ? savedGroupsList.filter(g => g.name.toLowerCase().includes(query)) : savedGroupsList;
            if (filteredGroups.length > 0) {
                html += '<div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;padding:8px 12px 4px;">Saved Groups</div>';
                filteredGroups.forEach(g => {
                    html += `<div class="friend-item" onclick="selectSavedGroup('${g.id}')" style="background:#f3e8ff;">`;
                    html += `<div class="friend-name" style="color:#7c3aed;">👥 ${g.name}</div>`;
                    html += `<div class="friend-handle">${g.member_ids.length} players</div>`;
                    html += `</div>`;
                });
                html += '<div style="border-bottom:1px solid #e5e7eb;margin:4px 0;"></div>';
            }
        }

        // Selected friends chips
        if (selectedFriendIds.size > 0) {
            html += '<div style="display:flex;flex-wrap:wrap;gap:6px;padding:8px 12px;">';
            selectedFriendIds.forEach(fid => {
                const f = friendsListData.find(x => x.id === fid);
                if (f) {
                    html += `<span style="background:#7c3aed;color:white;padding:3px 10px;border-radius:12px;font-size:12px;font-weight:600;display:inline-flex;align-items:center;gap:4px;">${f.name} <span onclick="event.stopPropagation();deselectFriend('${fid}')" style="cursor:pointer;opacity:0.7;">✕</span></span>`;
                }
            });
            html += `<span style="color:#6b7280;font-size:11px;padding:3px 0;">${selectedFriendIds.size}/9</span>`;
            html += '</div>';
        }

        // Friends list
        if (selectedFriendIds.size < 9) {
            const filtered = friendsListData.filter(f =>
                !selectedFriendIds.has(f.id) &&
                (f.name.toLowerCase().includes(query) || f.handle.toLowerCase().includes(query))
            );

            if (filtered.length === 0 && selectedFriendIds.size === 0) {
                html += '<p style="text-align:center;color:#6b7280;padding:12px;">No friends found</p>';
            } else {
                filtered.forEach(f => {
                    html += `<div class="friend-item" onclick="selectFriend('${f.id}')">`;
                    html += `<div class="friend-name">${f.name}</div>`;
                    if (f.handle) html += `<div class="friend-handle">@${f.handle}</div>`;
                    html += `</div>`;
                });
            }
        }

        listEl.innerHTML = html;
    }

    function filterFriendsList() {
        renderFriendsList();
    }
    window.filterFriendsList = filterFriendsList;

    function selectFriend(friendId) {
        selectedFriendIds.add(friendId);
        selectedGroupName = null;
        // Keep backward compat for 1v1
        if (selectedFriendIds.size === 1) selectedFriendId = friendId;
        renderFriendsList();
        const btn = document.getElementById('sendChallengeBtn');
        btn.disabled = false;
        btn.style.opacity = '1';
    }
    window.selectFriend = selectFriend;

    function deselectFriend(friendId) {
        selectedFriendIds.delete(friendId);
        selectedGroupName = null;
        if (selectedFriendIds.size === 0) {
            selectedFriendId = null;
            document.getElementById('sendChallengeBtn').disabled = true;
            document.getElementById('sendChallengeBtn').style.opacity = '0.5';
        } else {
            selectedFriendId = [...selectedFriendIds][0];
        }
        renderFriendsList();
    }
    window.deselectFriend = deselectFriend;

    function selectSavedGroup(groupId) {
        const group = savedGroupsList.find(g => g.id === groupId);
        if (!group) return;
        selectedFriendIds = new Set(group.member_ids.filter(id => id !== currentUser.id));
        selectedFriendId = [...selectedFriendIds][0] || null;
        selectedGroupName = group.name;
        renderFriendsList();
        const btn = document.getElementById('sendChallengeBtn');
        btn.disabled = false;
        btn.style.opacity = '1';
    }
    window.selectSavedGroup = selectSavedGroup;

    async function sendChallenge() {
        if (!currentUser || selectedFriendIds.size === 0) return;

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

            const opponentIds = [...selectedFriendIds];
            const isGroup = opponentIds.length > 1;

            if (isGroup) {
                // Group challenge
                const { data, error } = await sb.rpc('create_group_challenge', {
                    p_opponent_ids: opponentIds,
                    p_plates: plates,
                    p_difficulty: difficulty
                });
                if (error) throw error;
                const result = Array.isArray(data) ? data[0] : data;
                if (!result) throw new Error('Failed to create group challenge');

                // Set group name if from saved group
                if (selectedGroupName) {
                    try {
                        await sb.rpc('set_group_challenge_name', {
                            p_challenge_id: result.challenge_id,
                            p_name: selectedGroupName
                        });
                    } catch (_) {}
                }

                closeNewChallengeModal();

                const displayName = selectedGroupName || 'Group Challenge';
                // Set up H2H game mode
                if (timerIntervalId) { clearInterval(timerIntervalId); timerIntervalId = null; }
                resetGameState();
                gameOver = false;
                gameStarted = false;

                currentChallengeId = result.challenge_id;
                currentH2HRunId = result.run_id;
                currentChallengeType = 'group';
                gameMode = 'h2h_challenge';
                dailyPlateSequence = plates;
                currentH2HDifficulty = difficulty;

                switchTab('game');

                document.getElementById('practiceBtn').disabled = true;
                document.getElementById('practiceBtn').style.opacity = '0.5';
                document.getElementById('dailyChallengeBtn').disabled = true;
                document.getElementById('dailyChallengeBtn').style.opacity = '0.5';
                document.getElementById('quickMatchBtn').disabled = true;
                document.getElementById('quickMatchBtn').style.opacity = '0.5';

                const mi = document.getElementById('modeIndicator');
                mi.innerHTML = `
                    <div style="display:flex;align-items:center;justify-content:space-between;">
                        <span>${displayName.toUpperCase()} | Difficulty ${difficulty}</span>
                        <button onclick="forfeitH2H()" style="padding:6px 12px;background:#dc2626;color:white;border:none;border-radius:4px;cursor:pointer;font-size:0.9rem;">Forfeit</button>
                    </div>
                `;
                mi.style.background = '#fef3c7';
                mi.style.color = '#92400e';
                mi.style.border = '2px solid #fbbf24';

                const startBtn = document.getElementById('startButton');
                startBtn.style.display = 'none';
                window.scrollTo({ top: 0, behavior: 'smooth' });
                await beginNewRun();
            } else {
                // 1v1 challenge
                const { data, error } = await sb.rpc('create_h2h_challenge', {
                    p_opponent_id: opponentIds[0],
                    p_plates: plates,
                    p_difficulty: difficulty
                });
                if (error) throw error;
                const challengeId = data;
                closeNewChallengeModal();
                await playH2HChallenge(challengeId);
            }
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

    async function acceptGroupChallenge(challengeId) {
        if (!currentUser) return;
        try {
            const { data, error } = await sb.rpc('accept_group_challenge', {
                p_challenge_id: challengeId
            });
            if (error) throw error;
            const result = Array.isArray(data) ? data[0] : data;
            if (!result) throw new Error('Failed to accept');
            await playH2HChallenge(challengeId);
        } catch(e) {
            console.error('Error accepting group challenge:', e);
            alert('Error: ' + e.message);
        }
    }
    window.acceptGroupChallenge = acceptGroupChallenge;

    async function declineGroupChallenge(challengeId) {
        if (!currentUser) return;
        if (!confirm('Decline this group challenge?')) return;
        try {
            await sb.rpc('decline_group_challenge', { p_challenge_id: challengeId });
            loadH2HChallenges();
        } catch(e) {
            console.error('Error declining group challenge:', e);
            alert('Error: ' + e.message);
        }
    }
    window.declineGroupChallenge = declineGroupChallenge;

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
            currentChallengeType = challenge.challenge_type || null;
            gameMode = 'h2h_challenge';
            dailyPlateSequence = challenge.plates;

            const isGroup = challenge.challenge_type === 'group';
            let displayName;
            if (isGroup) {
                displayName = (challenge.group_name || 'Group Challenge').toUpperCase();
            } else {
                const isChallenger = challenge.challenger_id === currentUser.id;
                const oppId = isChallenger ? challenge.opponent_id : challenge.challenger_id;
                let oppName = h2hProfilesCache[oppId];
                if (!oppName) {
                    const { data: prof } = await sb.from('profiles').select('display_name, handle').eq('id', oppId).single();
                    oppName = prof?.display_name || (prof?.handle ? '@' + prof.handle : 'Opponent');
                    h2hProfilesCache[oppId] = oppName;
                }
                displayName = `H2H vs ${oppName}`;
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
                    <span>${displayName} | Difficulty ${currentH2HDifficulty}</span>
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

            // Complete group challenge run (pairwise Elo)
            if (currentChallengeType === 'group' && currentChallengeId) {
                try { await sb.rpc('complete_group_run', { p_challenge_id: currentChallengeId }); } catch (_) {}
            }
        } catch (e) {
            console.error('Forfeit error:', e);
        }

        currentChallengeId = null;
        currentH2HRunId = null;
        currentChallengeType = null;
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
        currentChallengeType = null;
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
                const solved = entries.filter(e => !e.skipped).length;
                pushCompletedRun('h2h', totalSeconds, currentH2HDifficulty, solved, entries.length, currentH2HRunId);

                // Complete group challenge run (pairwise Elo)
                if (currentChallengeType === 'group' && currentChallengeId) {
                    try {
                        await sb.rpc('complete_group_run', { p_challenge_id: currentChallengeId });
                    } catch (ge) {
                        console.error('Error completing group run:', ge);
                    }
                }
            }
        } catch (e) {
            console.error('Error submitting H2H run:', e);
        }

        const completedChallengeId = currentChallengeId;
        const completedChallengeType = currentChallengeType;
        currentChallengeId = null;
        currentH2HRunId = null;
        currentChallengeType = null;
        challengeStartTime = null;
        gameMode = 'practice';
        // Mark as already submitted so practice stats don't re-submit H2H history
        practiceStatsSubmitted = true;
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
        document.getElementById('quickMatchBtn').disabled = false;
        document.getElementById('quickMatchBtn').style.opacity = '1';
        updateDailyBtnState();

        // Track last quick match opponent for B2B prevention
        if (completedChallengeId) {
            sb.from('h2h_challenges').select('challenger_id, opponent_id').eq('id', completedChallengeId).single()
                .then(({ data }) => {
                    if (data) {
                        const oppId = data.challenger_id === currentUser.id ? data.opponent_id : data.challenger_id;
                        if (oppId) lastQuickMatchOpponentId = oppId;
                    }
                });
            // Auto-show scorecard after a brief delay for data to settle
            setTimeout(() => {
                if (completedChallengeType === 'group') {
                    viewGroupScorecard(completedChallengeId);
                } else {
                    viewH2HScorecard(completedChallengeId);
                }
            }, 500);
        }
    }

    async function markChallengeDNF() {
        // Not applicable in Supabase flow — run timeout handled server-side
        currentChallengeId = null;
        currentH2HRunId = null;
        currentChallengeType = null;
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

            // Determine players — fetch names if not cached
            const p1Id = challenge.challenger_id;
            const p2Id = challenge.opponent_id;
            for (const uid of [p1Id, p2Id]) {
                if (uid && uid !== currentUser.id && !h2hProfilesCache[uid]) {
                    const { data: prof } = await sb.from('profiles').select('display_name, handle').eq('id', uid).single();
                    if (prof) h2hProfilesCache[uid] = prof.display_name || (prof.handle ? '@' + prof.handle : null);
                }
            }
            const p1Name = p1Id === currentUser.id ? 'You' : (h2hProfilesCache[p1Id] || 'Player 1');
            const p2Name = p2Id === currentUser.id ? 'You' : (h2hProfilesCache[p2Id] || 'Player 2');
            const p1Data = runEntries[p1Id];
            const p2Data = runEntries[p2Id];
            const p1Time = p1Data ? p1Data.totalSeconds : null;
            const p2Time = p2Data ? p2Data.totalSeconds : null;

            // Forfeit detection: solved fewer than 10 plates
            const p1Solved = p1Data ? p1Data.entries.filter(e => !e.skipped).length : 0;
            const p2Solved = p2Data ? p2Data.entries.filter(e => !e.skipped).length : 0;
            const p1Forfeit = p1Data && p1Time !== null && p1Solved < 10;
            const p2Forfeit = p2Data && p2Time !== null && p2Solved < 10;

            // Header
            let p1Icon = '', p2Icon = '';
            let p1TimeClass = '', p2TimeClass = '';
            if (p1Time !== null && p2Time !== null) {
                const p1Wins = p2Forfeit && !p1Forfeit ? true : (!p1Forfeit && !p2Forfeit && p1Time < p2Time);
                const p2Wins = p1Forfeit && !p2Forfeit ? true : (!p1Forfeit && !p2Forfeit && p2Time < p1Time);
                if (p1Wins) {
                    p1Icon = ' &#10003;'; p1TimeClass = 'ch-win';
                    p2Icon = ' &#10007;'; p2TimeClass = 'ch-loss';
                } else if (p2Wins) {
                    p2Icon = ' &#10003;'; p2TimeClass = 'ch-win';
                    p1Icon = ' &#10007;'; p1TimeClass = 'ch-loss';
                } else {
                    p1Icon = ''; p2Icon = ''; p1TimeClass = 'ch-tie'; p2TimeClass = 'ch-tie';
                }
            }

            // Fetch Elo for this challenge
            let p1Elo = '', p2Elo = '', p1EloChange = '', p2EloChange = '';
            const { data: eloData } = await sb.from('elo_history')
                .select('user_id, old_elo, new_elo')
                .eq('challenge_id', challengeId);
            if (eloData) {
                for (const e of eloData) {
                    const change = e.new_elo - e.old_elo;
                    const changeStr = change >= 0 ? `<span style="color:#16a34a;font-size:0.8rem;margin-left:4px;">(+${change})</span>` : `<span style="color:#dc2626;font-size:0.8rem;margin-left:4px;">(${change})</span>`;
                    if (e.user_id === p1Id) { p1Elo = `<div style="font-size:0.85rem;font-weight:700;color:#374151;">${e.new_elo}${changeStr}</div>`; }
                    else { p2Elo = `<div style="font-size:0.85rem;font-weight:700;color:#374151;">${e.new_elo}${changeStr}</div>`; }
                }
            }

            const p1TimeDisplay = p1Forfeit ? '🏳️' : (p1Time !== null ? p1Time.toFixed(2) : '--');
            const p2TimeDisplay = p2Forfeit ? '🏳️' : (p2Time !== null ? p2Time.toFixed(2) : '--');

            let html = '<div class="scorecard-header">';
            html += `<div class="scorecard-player"><div class="scorecard-player-name">${p1Name}${p1Icon}</div>${p1Elo}`;
            html += `<div class="scorecard-player-time ${p1TimeClass}">${p1TimeDisplay}</div></div>`;
            html += '<div class="scorecard-vs">VS</div>';
            html += `<div class="scorecard-player"><div class="scorecard-player-name">${p2Name}${p2Icon}</div>${p2Elo}`;
            html += `<div class="scorecard-player-time ${p2TimeClass}">${p2TimeDisplay}</div></div>`;
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
                html += `<td class="sc-plate" onclick="showViableWordsForPlate('${plate}', false, 'practice')">${plate}</td>`;
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

    // ===== GROUP CHALLENGE SCORECARD =====
    async function viewGroupScorecard(challengeId) {
        const backdrop = document.getElementById('h2hScorecardModalBackdrop');
        const titleEl = document.getElementById('h2hScorecardTitle');
        const contentEl = document.getElementById('h2hScorecardContent');

        titleEl.textContent = 'Group Challenge';
        contentEl.innerHTML = '<p style="text-align:center;color:#6b7280;padding:20px;">Loading...</p>';
        backdrop.classList.add('show');

        try {
            // Fetch challenge, participants, runs, entries, elo in parallel
            const [challengeRes, participantsRes, runsRes, eloRes] = await Promise.all([
                sb.from('h2h_challenges').select('*').eq('id', challengeId).single(),
                sb.from('group_challenge_participants').select('*').eq('challenge_id', challengeId),
                sb.from('h2h_runs').select('id, user_id, total_seconds').eq('challenge_id', challengeId),
                sb.from('elo_history').select('user_id, old_elo, new_elo').eq('challenge_id', challengeId)
            ]);

            const challenge = challengeRes.data;
            if (!challenge) {
                contentEl.innerHTML = '<p style="text-align:center;color:#dc2626;">Challenge not found</p>';
                return;
            }

            const participants = participantsRes.data || [];
            const runs = runsRes.data || [];
            const eloData = eloRes.data || [];

            // Build elo map — sum changes for group challenges (multiple pairwise adjustments)
            const eloMap = {};
            for (const e of eloData) {
                if (eloMap[e.user_id]) {
                    eloMap[e.user_id].change += (e.new_elo - e.old_elo);
                    eloMap[e.user_id].newElo = e.new_elo;
                } else {
                    eloMap[e.user_id] = { oldElo: e.old_elo, newElo: e.new_elo, change: e.new_elo - e.old_elo };
                }
            }

            // Fetch profiles for all participants
            const allUserIds = participants.map(p => p.user_id);
            for (const uid of allUserIds) {
                if (!h2hProfilesCache[uid] && uid !== currentUser.id) {
                    const { data: prof } = await sb.from('profiles').select('display_name, handle').eq('id', uid).single();
                    if (prof) h2hProfilesCache[uid] = prof.display_name || (prof.handle ? '@' + prof.handle : null);
                }
            }

            // Build run data per user
            const runMap = {};
            for (const run of runs) {
                runMap[run.user_id] = { runId: run.id, totalSeconds: run.total_seconds };
            }

            // Fetch entries for completed runs
            const entriesMap = {};
            const completedRuns = runs.filter(r => r.total_seconds !== null);
            if (completedRuns.length > 0) {
                const { data: allEntries } = await sb.from('h2h_run_entries')
                    .select('*')
                    .in('run_id', completedRuns.map(r => r.id))
                    .order('plate_index');
                if (allEntries) {
                    for (const entry of allEntries) {
                        const run = completedRuns.find(r => r.id === entry.run_id);
                        if (run) {
                            if (!entriesMap[run.user_id]) entriesMap[run.user_id] = [];
                            entriesMap[run.user_id].push(entry);
                        }
                    }
                }
            }

            // Sort participants: completed first (by time), then pending
            const sorted = [...participants].sort((a, b) => {
                const aRun = runMap[a.user_id];
                const bRun = runMap[b.user_id];
                const aTime = aRun?.totalSeconds;
                const bTime = bRun?.totalSeconds;
                if (aTime != null && bTime != null) return aTime - bTime;
                if (aTime != null) return -1;
                if (bTime != null) return 1;
                return 0;
            });

            const groupName = challenge.group_name || 'Group Challenge';
            titleEl.textContent = groupName;

            // === STANDINGS TAB ===
            const medals = ['🥇', '🥈', '🥉'];
            let html = '';
            html += '<div id="groupScorecardTabs" style="display:flex;border-bottom:2px solid #e5e7eb;margin-bottom:16px;">';
            html += '<button class="group-sc-tab active" onclick="switchGroupScorecardTab(\'standings\',\'' + challengeId + '\')" data-tab="standings" style="flex:1;padding:10px;font-weight:700;font-size:0.9rem;border:none;background:none;cursor:pointer;border-bottom:3px solid #9370db;color:#9370db;">Standings</button>';

            // Add a tab for each completed player
            let completedIdx = 0;
            for (let i = 0; i < sorted.length; i++) {
                const p = sorted[i];
                const pRun = runMap[p.user_id];
                if (pRun?.totalSeconds == null) continue;
                const pName = p.user_id === currentUser.id ? 'You' : (h2hProfilesCache[p.user_id] || 'Player');
                const shortName = pName.length > 8 ? pName.slice(0, 7) + '…' : pName;
                const tabMedal = completedIdx < 3 ? medals[completedIdx] + ' ' : '';
                html += `<button class="group-sc-tab" onclick="switchGroupScorecardTab('player-${completedIdx}','${challengeId}')" data-tab="player-${completedIdx}" style="flex:1;padding:10px;font-weight:600;font-size:0.85rem;border:none;background:none;cursor:pointer;border-bottom:3px solid transparent;color:#9ca3af;">${tabMedal}${shortName}</button>`;
                completedIdx++;
            }
            html += '</div>';

            // Tab content wrapper — fixed height so modal doesn't resize
            html += '<div id="groupTabContentWrapper" style="min-height:400px;max-height:60vh;overflow-y:auto;">';

            // Standings content
            html += '<div id="groupTab-standings" class="group-tab-content">';
            for (let i = 0; i < sorted.length; i++) {
                const p = sorted[i];
                const pRun = runMap[p.user_id];
                const pName = p.user_id === currentUser.id ? 'You' : (h2hProfilesCache[p.user_id] || 'Player');
                const isMe = p.user_id === currentUser.id;
                const medal = (pRun?.totalSeconds != null && i < 3) ? medals[i] : '';
                const time = pRun?.totalSeconds;
                const elo = eloMap[p.user_id];

                const bgColor = isMe ? '#f3e8ff' : '#f9fafb';
                const borderColor = isMe ? '#d8b4fe' : '#e5e7eb';

                html += `<div style="display:flex;align-items:center;padding:12px 14px;margin-bottom:6px;border-radius:12px;background:${bgColor};border:1px solid ${borderColor};">`;
                html += `<div style="width:32px;font-size:1.3rem;text-align:center;">${medal || (i + 1)}</div>`;
                html += `<div style="flex:1;min-width:0;margin-left:8px;">`;
                html += `<div style="font-weight:700;font-size:0.95rem;color:#1f2937;">${pName}</div>`;
                if (elo) {
                    const changeColor = elo.change >= 0 ? '#16a34a' : '#dc2626';
                    const changeStr = elo.change >= 0 ? `+${elo.change}` : `${elo.change}`;
                    html += `<div style="font-size:0.8rem;color:#6b7280;">${elo.newElo} <span style="color:${changeColor};">(${changeStr})</span></div>`;
                }
                html += `</div>`;
                html += `<div style="text-align:right;">`;
                if (time != null) {
                    // Check forfeit
                    const entries = entriesMap[p.user_id] || [];
                    const solvedCount = entries.filter(e => !e.skipped).length;
                    if (solvedCount < 10) {
                        html += `<div style="font-size:1.1rem;">🏳️</div>`;
                        html += `<div style="font-size:0.75rem;color:#9ca3af;">Forfeit</div>`;
                    } else {
                        html += `<div style="font-weight:700;font-size:1.05rem;color:#374151;">${time.toFixed(2)}s</div>`;
                    }
                } else {
                    html += `<div style="font-size:0.85rem;color:#9ca3af;font-style:italic;">Pending</div>`;
                }
                html += `</div>`;
                html += `</div>`;
            }
            html += '</div>';

            // Per-player detail tabs
            let playerTabIdx = 0;
            for (let i = 0; i < sorted.length; i++) {
                const p = sorted[i];
                const pRun = runMap[p.user_id];
                if (pRun?.totalSeconds == null) continue;
                const pName = p.user_id === currentUser.id ? 'You' : (h2hProfilesCache[p.user_id] || 'Player');
                const entries = entriesMap[p.user_id] || [];
                const plates = challenge.plates || [];

                html += `<div id="groupTab-player-${playerTabIdx}" class="group-tab-content" style="display:none;">`;
                html += `<div style="text-align:center;margin-bottom:12px;">`;
                html += `<div style="font-weight:700;font-size:1.1rem;color:#1f2937;">${pName}</div>`;
                html += `<div style="font-size:0.95rem;color:#6b7280;">${pRun.totalSeconds.toFixed(2)}s</div>`;
                html += `</div>`;

                html += '<table class="scorecard-table" style="table-layout:fixed;"><thead><tr><th style="width:10%;">#</th><th style="width:25%;">Plate</th><th style="width:35%;">Word</th><th style="width:30%;">Time</th></tr></thead><tbody>';
                for (let j = 0; j < entries.length; j++) {
                    const e = entries[j];
                    const plate = plates[j] || '--';
                    const t = e.skipped ? (e.thinking_seconds + (e.penalty_seconds || 0)) : e.thinking_seconds;
                    const bg = e.skipped ? '#fef2f2' : getTimeColor(t);
                    const textC = e.skipped ? '#dc2626' : (t > 15 ? '#fff' : '#000');
                    const word = e.skipped ? '❌' : (e.word || '');
                    const timeStr = e.skipped ? `${e.thinking_seconds.toFixed(2)} (+${e.penalty_seconds || 0})` : t.toFixed(2);
                    html += `<tr style="background:${bg};color:${textC};">`;
                    html += `<td style="font-size:0.8rem;color:#9ca3af;width:24px;">${j + 1}</td>`;
                    html += `<td class="sc-plate" onclick="showViableWordsForPlate('${plate}', false, 'practice')">${plate}</td>`;
                    html += `<td>${word}</td>`;
                    html += `<td style="font-size:0.85rem;">${timeStr}</td>`;
                    html += `</tr>`;
                }
                html += '</tbody></table>';
                html += '</div>';
                playerTabIdx++;
            }

            html += '</div>'; // close groupTabContentWrapper

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
            console.error('Error loading group scorecard:', e);
            contentEl.innerHTML = '<p style="text-align:center;color:#dc2626;">Error loading scorecard</p>';
        }
    }
    window.viewGroupScorecard = viewGroupScorecard;

    window.switchGroupScorecardTab = function(tab) {
        // Hide all tab contents
        document.querySelectorAll('.group-tab-content').forEach(el => el.style.display = 'none');
        // Show selected
        const target = document.getElementById('groupTab-' + tab);
        if (target) target.style.display = '';
        // Update tab buttons
        document.querySelectorAll('.group-sc-tab').forEach(btn => {
            if (btn.dataset.tab === tab) {
                btn.style.borderBottomColor = '#9370db';
                btn.style.color = '#9370db';
                btn.classList.add('active');
            } else {
                btn.style.borderBottomColor = 'transparent';
                btn.style.color = '#9ca3af';
                btn.classList.remove('active');
            }
        });
    };

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

            // Fetch friend count and friend IDs
            let friendCount = 0;
            let friendUserIds = [];
            try {
                const { data: friends } = await sb.from('friendships').select('user_a, user_b').or(`user_a.eq.${userId},user_b.eq.${userId}`).eq('status', 'accepted');
                friendCount = friends ? friends.length : 0;
                friendUserIds = (friends || []).map(f => f.user_a === userId ? f.user_b : f.user_a);
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

            // Check friendship status early
            let friendStatus = null;
            if (!isSelf && currentUser) {
                try {
                    const fIds = [currentUser.id, userId].sort();
                    const { data: fs } = await sb.from('friendships')
                        .select('id, status, requested_by')
                        .eq('user_a', fIds[0]).eq('user_b', fIds[1]);
                    if (fs && fs.length > 0) friendStatus = fs[0];
                } catch(e) {}
            }

            let html = '';
            html += `<div class="profile-modal-avatar">${initials}</div>`;
            html += `<div class="profile-modal-name">${name}${streakHtml}</div>`;
            if (handle) html += `<div class="profile-modal-handle">@${handle}</div>`;

            // Friend button under handle
            if (!isSelf && currentUser) {
                if (!friendStatus) {
                    html += `<button class="profile-modal-challenge-btn" style="background:rgba(20,160,107,0.1);color:#14a06b;border-color:rgba(20,160,107,0.25);margin-bottom:12px;" onclick="sendFriendRequestTo('${userId}','${name.replace(/'/g,"\\'")}',this)">+ Add Friend</button>`;
                } else if (friendStatus.status === 'pending' && friendStatus.requested_by !== currentUser.id) {
                    html += `<button class="profile-modal-challenge-btn" style="background:rgba(20,160,107,0.1);color:#14a06b;border-color:rgba(20,160,107,0.25);margin-bottom:12px;" onclick="respondFriend('${friendStatus.id}','accepted');this.textContent='Friends ✓';this.disabled=true;">Accept Request</button>`;
                } else if (friendStatus.status === 'pending') {
                    html += `<button class="profile-modal-challenge-btn" style="background:#eee9db;color:#756e5c;border-color:#d9cfb6;margin-bottom:12px;" disabled>Request Pending</button>`;
                } else if (friendStatus.status === 'accepted') {
                    html += `<button class="profile-modal-challenge-btn" style="background:#eee9db;color:#14a06b;border-color:#d9cfb6;margin-bottom:12px;" disabled>Friends ✓</button>`;
                }
            }

            html += '<div class="profile-modal-stats">';
            html += `<div class="profile-modal-stat"><div class="profile-modal-stat-value" style="color:#d97706;">${dailies}</div><div class="profile-modal-stat-label">dailies</div></div>`;
            html += `<div class="profile-modal-stat"><div class="profile-modal-stat-value" style="color:#2563eb;">${avgTime > 0 ? avgTime.toFixed(1) : '--'}</div><div class="profile-modal-stat-label">avg time</div></div>`;
            html += `<div class="profile-modal-stat"><div class="profile-modal-stat-value" style="color:#16a34a;">${beatPct}</div><div class="profile-modal-stat-label">beat</div></div>`;
            html += `<div class="profile-modal-stat"><div class="profile-modal-stat-value" style="color:#9370db;">${overallPct}</div><div class="profile-modal-stat-label">overall</div></div>`;
            html += `<div class="profile-modal-stat" style="cursor:pointer;" onclick="showFriendsList('${userId}')"><div class="profile-modal-stat-value" style="color:#374151;">${friendCount}</div><div class="profile-modal-stat-label" style="text-decoration:underline;">friends</div></div>`;
            html += '</div>';

            if (!isSelf && currentUser) {
                html += `<button class="profile-modal-challenge-btn" onclick="closeProfileModal();preselectedChallengeUserId='${userId}';preselectedChallengeUserName='${name.replace(/'/g,"\\'")}';openNewChallengeModal();">⚔ Challenge</button>`;
            }

            html += `<button class="profile-modal-stats-btn" onclick="openPlayerStats('${userId}','${name.replace(/'/g,"\\'")}')">Stats</button>`;
            html += `<button class="profile-modal-history-btn" onclick="closeProfileModal();showUserHistoricalScores('${userId}','${name.replace(/'/g,"\\'")}')">Historical Scores</button>`;

            content.innerHTML = html;
        } catch (e) {
            console.error('Profile modal error:', e);
            content.innerHTML = '<p style="color:#dc2626;">Error loading profile</p>';
        }
    };

    window.rematchChallenge = function(oppId, oppName, difficulty) {
        if (!currentUser) return;
        const backdrop = document.getElementById('rematchConfirmBackdrop');
        document.getElementById('rematchConfirmName').textContent = oppName;
        document.getElementById('rematchConfirmDiff').textContent = getDifficultyLabel(difficulty);
        document.getElementById('rematchConfirmBtn').onclick = async () => {
            backdrop.classList.remove('show');
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
        backdrop.classList.add('show');
    };

    window.closeProfileModal = function() {
        document.getElementById('profileModalBackdrop').classList.remove('show');
    };

    window.showFriendsList = async function(userId) {
        // Fetch this user's friends
        const { data: friendships } = await sb.from('friendships')
            .select('user_a, user_b')
            .or(`user_a.eq.${userId},user_b.eq.${userId}`)
            .eq('status', 'accepted');

        const friendIds = (friendships || []).map(f => f.user_a === userId ? f.user_b : f.user_a);
        if (friendIds.length === 0) { return; }

        // Fetch profiles
        const { data: profiles } = await sb.from('profiles')
            .select('id, display_name, handle')
            .in('id', friendIds);
        const profileMap = {};
        (profiles || []).forEach(p => { profileMap[p.id] = p; });

        // Check which are already my friends
        let myFriendIds = new Set();
        if (currentUser) {
            const { data: myFriends } = await sb.from('friendships')
                .select('user_a, user_b')
                .or(`user_a.eq.${currentUser.id},user_b.eq.${currentUser.id}`)
                .eq('status', 'accepted');
            (myFriends || []).forEach(f => {
                myFriendIds.add(f.user_a === currentUser.id ? f.user_b : f.user_a);
            });
        }

        let html = '<div style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.4);z-index:1100;display:flex;align-items:center;justify-content:center;" onclick="if(event.target===this)this.remove()">';
        html += '<div style="background:white;border-radius:16px;padding:20px;max-width:400px;width:90%;max-height:70vh;display:flex;flex-direction:column;">';
        html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;"><h3 style="margin:0;">Friends (' + friendIds.length + ')</h3><button onclick="this.closest(\'div[style*=fixed]\').remove()" style="background:none;border:none;font-size:1.2rem;cursor:pointer;">✕</button></div>';
        html += '<div style="overflow-y:auto;flex:1;">';

        friendIds.forEach(fid => {
            const p = profileMap[fid];
            if (!p) return;
            const name = p.display_name || (p.handle ? '@' + p.handle : 'Unknown');
            const handle = p.handle ? '@' + p.handle : '';
            const isMe = currentUser && fid === currentUser.id;
            const isMyFriend = myFriendIds.has(fid);

            html += '<div style="display:flex;align-items:center;padding:10px 8px;border-bottom:1px solid #f3f4f6;">';
            html += '<div style="flex:1;min-width:0;cursor:pointer;" onclick="this.closest(\'div[style*=fixed]\').remove();openProfileModal(\'' + fid + '\',\'' + name.replace(/'/g, "\\'") + '\')">';
            html += '<div style="font-weight:600;font-size:0.95rem;">' + name + '</div>';
            if (handle) html += '<div style="font-size:0.8rem;color:#9ca3af;">' + handle + '</div>';
            html += '</div>';

            if (isMe) {
                html += '<span style="font-size:0.75rem;color:#9ca3af;font-weight:600;">You</span>';
            } else if (isMyFriend) {
                html += '<span style="font-size:0.75rem;color:#16a34a;font-weight:600;">Friends ✓</span>';
            } else if (currentUser) {
                html += '<button onclick="addFriendFromList(\'' + fid + '\',this)" style="padding:4px 12px;background:#9370db;color:white;border:none;border-radius:8px;font-size:0.75rem;font-weight:600;cursor:pointer;">Add</button>';
            }
            html += '</div>';
        });

        html += '</div></div></div>';
        document.body.insertAdjacentHTML('beforeend', html);
    };

    window.addFriendFromList = async function(friendId, btn) {
        if (!currentUser) return;
        btn.disabled = true;
        btn.textContent = 'Sending...';
        try {
            const ids = [currentUser.id, friendId].sort();
            await sb.from('friendships').insert({
                user_a: ids[0],
                user_b: ids[1],
                requested_by: currentUser.id,
                status: 'pending'
            });
            btn.textContent = 'Sent ✓';
            btn.style.background = '#16a34a';
        } catch (e) {
            btn.textContent = 'Error';
            btn.style.background = '#dc2626';
        }
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
        html += statsRow('Avg Time', s.daily_avg_time != null ? s.daily_avg_time.toFixed(1) : '--');
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
        html += statsRow('Best Time', s.daily_best_time != null ? s.daily_best_time.toFixed(1) : '--', formatStatsDate(s.daily_best_date));
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
        html += statsRow('Best Time', s.h2h_best_time != null ? s.h2h_best_time.toFixed(1) : '--',
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
        html += statsRow('Fastest Run', s.practice_fastest_run != null ? s.practice_fastest_run.toFixed(1) : '--');
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
        document.querySelector('#practiceStatsModalBackdrop .modal-title').textContent = 'Plate Stats';
        backdrop.classList.add('show');
        content.innerHTML = '<p style="text-align:center;color:#6b7280;padding:20px;">Loading plate stats...</p>';

        const plates = gameHistory.map(e => e.plate);
        if (plates.length === 0) {
            content.innerHTML = '<p style="text-align:center;color:#6b7280;">No plates played</p>';
            return;
        }

        try {
            // Batch fetch: 3 queries total
            const [practiceAll, dailyAll, h2hAll] = await Promise.all([
                sb.from('practice_plate_stats').select('plate, word, skipped, thinking_seconds').in('plate', plates),
                sb.from('daily_run_entries').select('plate, word, skipped, thinking_seconds').in('plate', plates),
                sb.from('h2h_run_entries').select('plate, word, skipped, thinking_seconds').in('plate', plates)
            ]);

            // Group by plate
            const byPlate = {};
            [...(practiceAll.data || []), ...(dailyAll.data || []), ...(h2hAll.data || [])].forEach(r => {
                if (!byPlate[r.plate]) byPlate[r.plate] = [];
                byPlate[r.plate].push(r);
            });

            let html = '<table style="width:100%;border-collapse:collapse;font-size:0.85rem;">';
            html += '<thead><tr style="background:#f3f4f6;">';
            html += '<th style="padding:6px 8px;text-align:left;">#</th>';
            html += '<th style="padding:6px 8px;text-align:left;">Plate</th>';
            html += '<th style="padding:6px 8px;text-align:right;">Plays</th>';
            html += '<th style="padding:6px 8px;text-align:right;">Skip</th>';
            html += '<th style="padding:6px 8px;text-align:right;">Median</th>';
            html += '<th style="padding:6px 8px;text-align:right;">Your Word (time)</th>';
            html += '</tr></thead><tbody>';

            for (let i = 0; i < plates.length; i++) {
                const plate = plates[i];
                const allRows = byPlate[plate] || [];

                const total = allRows.length;
                const skipCount = allRows.filter(r => r.skipped).length;
                const skipPct = total > 0 ? Math.round(100 * skipCount / total) : 0;
                const validTimes = allRows.filter(r => r.thinking_seconds <= 400).map(r => r.thinking_seconds).sort((a, b) => a - b);
                let avgThink = '--';
                if (validTimes.length > 0) {
                    const mid = Math.floor(validTimes.length / 2);
                    const median = validTimes.length % 2 === 0 ? (validTimes[mid - 1] + validTimes[mid]) / 2 : validTimes[mid];
                    avgThink = median.toFixed(1);
                }

                // Your word from current game
                const myEntry = gameHistory[i];
                const yourWordStr = myEntry ? (myEntry.skipped ? `❌ (${myEntry.thinkingSeconds.toFixed(1)})` : `${myEntry.word} (${myEntry.thinkingSeconds.toFixed(1)})`) : '--';

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

                html += `<tr style="background:${bgColor};cursor:pointer;" onclick="showViableWordsForPlate('${plate}', false, 'practice')">`;
                html += `<td style="padding:8px;color:#9ca3af;">${i + 1}</td>`;
                html += `<td style="padding:8px;"><strong style="font-family:monospace;">${plate}</strong></td>`;
                html += `<td style="padding:8px;text-align:right;color:#9ca3af;">${total}</td>`;
                html += `<td style="padding:8px;text-align:right;">${total > 0 ? skipPct + '%' : '--'}</td>`;
                html += `<td style="padding:8px;text-align:right;">${avgThink}</td>`;
                html += `<td style="padding:8px;text-align:right;">${yourWordStr}</td>`;
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
        html += `<div style="font-size:1.1rem;">Your time: <strong>${d.actualTime.toFixed(1)} seconds</strong></div>`;
        html += `<div style="font-size:1.1rem;">Expected: <strong>${d.expectedTime.toFixed(1)} seconds</strong></div>`;
        html += `<div style="font-size:1rem;color:${color};font-weight:600;margin-top:4px;">${absDiff} seconds ${word} than expected</div>`;
        html += `</div>`;

        html += '<table style="width:100%;border-collapse:collapse;font-size:0.8rem;">';
        html += '<thead><tr style="background:#f3f4f6;"><th style="padding:4px 6px;text-align:left;">#</th><th style="padding:4px 6px;text-align:left;">Plate</th><th style="padding:4px 6px;text-align:right;">Plays</th><th style="padding:4px 6px;text-align:right;">Median</th><th style="padding:4px 6px;text-align:right;">Skip %</th><th style="padding:4px 6px;text-align:right;">Solves</th><th style="padding:4px 6px;text-align:right;">Skips</th></tr></thead><tbody>';
        d.breakdown.forEach((b, i) => {
            const isProrated = b.fraction < 1;
            const rowStyle = isProrated ? 'border-bottom:1px solid #f0f0f0;background:#f9fafb;font-style:italic;' : 'border-bottom:1px solid #f0f0f0;';
            html += `<tr style="${rowStyle}">`;
            html += `<td style="padding:4px 6px;color:#9ca3af;">${i + 1}</td>`;
            html += `<td style="padding:4px 6px;font-weight:600;font-family:monospace;">${b.plate}${isProrated ? ' <span style="font-size:0.7rem;color:#9ca3af;font-weight:400;">(' + Math.round(b.fraction * 100) + '%)</span>' : ''}</td>`;
            html += `<td style="padding:4px 6px;text-align:right;color:#9ca3af;">${b.plays}</td>`;
            html += `<td style="padding:4px 6px;text-align:right;">${b.medianThink.toFixed(1)}</td>`;
            html += `<td style="padding:4px 6px;text-align:right;">${Math.round(b.skipRate * 100)}%</td>`;
            html += `<td style="padding:4px 6px;text-align:right;">${b.cumulSolves.toFixed(2)}</td>`;
            html += `<td style="padding:4px 6px;text-align:right;">${b.cumulSkips.toFixed(2)}</td>`;
            html += `</tr>`;
        });
        html += '</tbody></table>';
        html += `<div style="font-size:0.8rem;color:#6b7280;margin-top:8px;padding:6px;background:#f9fafb;border-radius:6px;">`;
        html += `Thinking: ${d.totalThinking.toFixed(1)} + Penalty: ${d.penalty.toFixed(1)} (${d.skips.toFixed(1)} skips) = <strong>${d.expectedTime.toFixed(1)}</strong>`;
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
    loadDefinitions();
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

    // === FEEDBACK TAB ===
    let feedbackLoaded = false;

    async function loadFeedback() {
        const prompt = document.getElementById('feedbackSignInPrompt');
        const chatArea = document.getElementById('feedbackChatArea');
        if (!currentUser) {
            prompt.style.display = 'block';
            chatArea.style.display = 'none';
            return;
        }
        prompt.style.display = 'none';
        chatArea.style.display = 'block';

        const container = document.getElementById('feedbackMessages');
        if (!feedbackLoaded) container.innerHTML = '<p style="color:#9ca3af;text-align:center;padding:20px;">Loading...</p>';

        try {
            const { data, error } = await sb.from('feedback_messages')
                .select('id, text, from_admin, created_at, image_url')
                .eq('user_id', currentUser.id)
                .order('created_at', { ascending: true });
            if (error) throw error;

            container.innerHTML = '';
            if (!data || data.length === 0) {
                container.innerHTML = '<p style="color:#9ca3af;text-align:center;padding:20px;">No messages yet. Send your first message!</p>';
            } else {
                for (const msg of data) {
                    container.appendChild(createFeedbackBubble(msg));
                }
            }
            feedbackLoaded = true;
            container.scrollTop = container.scrollHeight;
        } catch (e) {
            console.error('Failed to load feedback:', e);
            container.innerHTML = '<p style="color:#ef4444;text-align:center;padding:20px;">Error loading messages</p>';
        }
    }
    window.loadFeedback = loadFeedback;

    function createFeedbackBubble(msg) {
        const div = document.createElement('div');
        const isAdmin = msg.from_admin;
        div.style.cssText = `display:flex;flex-direction:column;align-items:${isAdmin ? 'flex-start' : 'flex-end'};`;

        let html = '';
        if (msg.image_url) {
            html += `<img src="${msg.image_url}" style="max-width:200px;border-radius:12px;margin-bottom:4px;cursor:pointer;" onclick="window.open('${msg.image_url}','_blank')">`;
        }
        if (msg.text) {
            html += `<div style="padding:8px 14px;border-radius:16px;font-size:0.9rem;line-height:1.4;max-width:80%;${isAdmin ? 'background:#e5e7eb;color:#111;' : 'background:#9370db;color:white;'}">${escapeHtml(msg.text)}</div>`;
        }

        const time = new Date(msg.created_at);
        const timeStr = time.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' + time.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
        html += `<div style="font-size:0.7rem;color:#aaa;margin-top:2px;padding:0 4px;">${isAdmin ? 'Dev · ' : ''}${timeStr}</div>`;

        div.innerHTML = html;
        return div;
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    async function sendFeedback() {
        if (!currentUser) return;
        const input = document.getElementById('feedbackInput');
        const text = input.value.trim();
        if (!text) return;
        input.value = '';

        const container = document.getElementById('feedbackMessages');
        // Remove "no messages" placeholder
        if (container.querySelector('p')) container.innerHTML = '';

        // Optimistic append
        const tempMsg = { text, from_admin: false, created_at: new Date().toISOString(), image_url: null };
        container.appendChild(createFeedbackBubble(tempMsg));
        container.scrollTop = container.scrollHeight;

        try {
            const { error } = await sb.from('feedback_messages')
                .insert({ user_id: currentUser.id, text, from_admin: false });
            if (error) throw error;
        } catch (e) {
            console.error('Failed to send feedback:', e);
            alert('Failed to send message. Please try again.');
        }
    }
    window.sendFeedback = sendFeedback;

    // === FRIENDS ===
    async function sendFriendRequest() {
        const input = document.getElementById('addFriendInput');
        const resultEl = document.getElementById('addFriendResult');
        const handle = (input.value || '').trim().toLowerCase().replace('@', '');
        if (!handle) return;
        resultEl.innerHTML = '';

        try {
            const { data: target } = await sb.from('profiles').select('id, display_name').eq('handle', handle).single();
            if (!target) { resultEl.innerHTML = '<span style="color:#ff3b30;">User not found</span>'; return; }
            if (target.id === currentUser.id) { resultEl.innerHTML = '<span style="color:#ff3b30;">That\'s you!</span>'; return; }

            // Check existing friendship
            const ids = [currentUser.id, target.id].sort();
            const { data: existing } = await sb.from('friendships')
                .select('id, status')
                .eq('user_a', ids[0]).eq('user_b', ids[1]);
            if (existing && existing.length > 0) {
                const f = existing[0];
                if (f.status === 'accepted') { resultEl.innerHTML = '<span style="color:#756e5c;">Already friends!</span>'; return; }
                resultEl.innerHTML = '<span style="color:#756e5c;">Request already pending</span>'; return;
            }

            await sb.from('friendships').insert({
                user_a: ids[0], user_b: ids[1],
                status: 'pending', requested_by: currentUser.id
            });
            input.value = '';
            resultEl.innerHTML = `<span style="color:#14a06b;">Request sent to ${target.display_name || '@' + handle}!</span>`;
        } catch (e) {
            resultEl.innerHTML = `<span style="color:#ff3b30;">${e.message || 'Error'}</span>`;
        }
    }
    window.sendFriendRequest = sendFriendRequest;

    async function sendFriendRequestTo(targetId, targetName, btn) {
        if (!currentUser) return;
        try {
            const ids = [currentUser.id, targetId].sort();
            await sb.from('friendships').insert({
                user_a: ids[0], user_b: ids[1],
                status: 'pending', requested_by: currentUser.id
            });
            btn.textContent = 'Request Sent';
            btn.disabled = true;
            btn.style.color = '#756e5c';
        } catch (e) {
            btn.textContent = 'Error';
            console.error('[Friend]', e);
        }
    }
    window.sendFriendRequestTo = sendFriendRequestTo;

    async function loadFriendRequests() {
        const container = document.getElementById('friendRequestsSection');
        if (!container || !currentUser) return;
        try {
            const [{ data: d1 }, { data: d2 }] = await Promise.all([
                sb.from('friendships').select('id, user_a, user_b, requested_by').eq('status', 'pending').eq('user_a', currentUser.id),
                sb.from('friendships').select('id, user_a, user_b, requested_by').eq('status', 'pending').eq('user_b', currentUser.id)
            ]);
            const data = [...(d1 || []), ...(d2 || [])];
            const incoming = (data || []).filter(f => f.requested_by !== currentUser.id);
            if (incoming.length === 0) { container.innerHTML = ''; return; }

            const otherIds = incoming.map(f => f.user_a === currentUser.id ? f.user_b : f.user_a);
            const { data: profiles } = await sb.from('profiles').select('id, display_name, handle').in('id', otherIds);
            const nameMap = {};
            (profiles || []).forEach(p => nameMap[p.id] = p.display_name || '@' + p.handle);

            let html = '<div style="display:flex;flex-direction:column;gap:8px;margin:12px 0;">';
            incoming.forEach(f => {
                const otherId = f.user_a === currentUser.id ? f.user_b : f.user_a;
                const name = nameMap[otherId] || 'Unknown';
                html += `<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:#fefcf7;border:2px solid #1a1714;border-radius:5px;box-shadow:3px 3px 0 #1a1714;">`;
                html += `<span style="font-weight:700;font-size:0.95rem;">${name}</span>`;
                html += `<div style="display:flex;gap:6px;">`;
                html += `<button onclick="respondFriend('${f.id}','accepted')" style="padding:6px 14px;background:#14a06b;color:white;border:2px solid #1a1714;border-radius:5px;font-weight:700;font-size:0.8rem;cursor:pointer;box-shadow:2px 2px 0 #1a1714;" onmouseenter="this.style.transform='translate(-1px,-1px)';this.style.boxShadow='3px 3px 0 #1a1714'" onmouseleave="this.style.transform='';this.style.boxShadow='2px 2px 0 #1a1714'">Accept</button>`;
                html += `<button onclick="respondFriend('${f.id}','declined')" style="padding:6px 14px;background:#ff3b30;color:white;border:2px solid #1a1714;border-radius:5px;font-weight:700;font-size:0.8rem;cursor:pointer;box-shadow:2px 2px 0 #1a1714;" onmouseenter="this.style.transform='translate(-1px,-1px)';this.style.boxShadow='3px 3px 0 #1a1714'" onmouseleave="this.style.transform='';this.style.boxShadow='2px 2px 0 #1a1714'">Decline</button>`;
                html += '</div></div>';
            });
            html += '</div>';
            container.innerHTML = html;
        } catch (e) { console.error('[Friends]', e); }
    }

    async function respondFriend(friendshipId, status) {
        try {
            if (status === 'declined') {
                await sb.from('friendships').delete().eq('id', friendshipId);
            } else {
                await sb.from('friendships').update({ status, responded_at: new Date().toISOString() }).eq('id', friendshipId);
            }
            loadFriendRequests();
            loadFriendsList();
        } catch (e) { console.error('[Friends]', e); }
    }
    window.respondFriend = respondFriend;

    async function loadFriendCount() {
        const el = document.getElementById('statFriends');
        if (!el || !currentUser) return;
        try {
            const [{ data: d1 }, { data: d2 }] = await Promise.all([
                sb.from('friendships').select('id').eq('status', 'accepted').eq('user_a', currentUser.id),
                sb.from('friendships').select('id').eq('status', 'accepted').eq('user_b', currentUser.id)
            ]);
            el.textContent = (d1 ? d1.length : 0) + (d2 ? d2.length : 0);
        } catch (e) { el.textContent = '0'; }
    }

    async function showFriendsPage() {
        const container = document.getElementById('profileContent');
        container.innerHTML = '<p style="text-align:center;color:#756e5c;padding:20px;">Loading friends...</p>';
        try {
            const [{ data: fa }, { data: fb }] = await Promise.all([
                sb.from('friendships').select('user_a, user_b').eq('status', 'accepted').eq('user_a', currentUser.id),
                sb.from('friendships').select('user_a, user_b').eq('status', 'accepted').eq('user_b', currentUser.id)
            ]);
            const data = [...(fa || []), ...(fb || [])];

            const friendIds = (data || []).map(f => f.user_a === currentUser.id ? f.user_b : f.user_a);
            const { data: profiles } = friendIds.length > 0
                ? await sb.from('profiles').select('id, display_name, handle').in('id', friendIds)
                : { data: [] };

            let html = '<button onclick="updateProfileTab()" style="padding:6px 14px;border:none;background:#eee9db;border-radius:5px;cursor:pointer;font-size:0.85rem;margin-bottom:12px;">&larr; Back</button>';
            html += '<h3 style="margin:0 0 12px;">Friends</h3>';

            html += '<div style="display:flex;gap:8px;max-width:400px;margin-bottom:16px;">';
            html += '<input id="addFriendInput" type="text" placeholder="Add friend by @handle" style="flex:1;padding:10px 12px;border:2px solid #d9cfb6;border-radius:5px;font-size:0.9rem;background:#fefcf7;">';
            html += '<button onclick="sendFriendRequest()" style="padding:10px 16px;background:#14a06b;color:white;border:2px solid #1a1714;border-radius:5px;font-weight:600;font-size:0.85rem;cursor:pointer;box-shadow:2px 2px 0 #1a1714;">Add</button>';
            html += '</div>';
            html += '<div id="addFriendResult" style="font-size:0.85rem;margin-bottom:12px;"></div>';

            if (!profiles || profiles.length === 0) {
                html += '<p style="color:#756e5c;">No friends yet. Add friends by their @handle!</p>';
            } else {
                (profiles || []).forEach(p => {
                    const name = p.display_name || '@' + p.handle;
                    html += `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid #eee9db;">`;
                    html += `<span style="font-weight:600;cursor:pointer;color:#9370db;" onclick="closeProfileModal();openProfileModal('${p.id}','${name.replace(/'/g,"\\'")}')">${name}</span>`;
                    html += `<span style="color:#756e5c;font-size:0.8rem;">@${p.handle || ''}</span>`;
                    html += '</div>';
                });
            }
            container.innerHTML = html;
            const afi = document.getElementById('addFriendInput');
            if (afi) afi.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendFriendRequest(); });
        } catch (e) {
            container.innerHTML = '<button onclick="updateProfileTab()" style="padding:6px 14px;border:none;background:#eee9db;border-radius:5px;cursor:pointer;font-size:0.85rem;">&larr; Back</button><p style="color:#ff3b30;">Error loading friends</p>';
        }
    }
    window.showFriendsPage = showFriendsPage;

    // === TRY IT OUT (How to Play) ===
    const tryItPlates = ['BRD', 'CLM', 'SCP', 'HDN', 'WEV', 'MAJ', 'LGT', 'GAE', 'FOG', 'RNT'];
    let tryItIndex = 0;
    let tryItSolved = 0;

    function initTryIt() {
        tryItIndex = 0;
        tryItSolved = 0;
        document.getElementById('tryItResult').innerHTML = '';
        document.getElementById('tryItScore').textContent = '';
        const inp = document.getElementById('tryItInput');
        inp.textContent = '';
        inp.style.display = '';
        inp.oninput = tryItHighlight;
        inp.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); tryItSubmit(); } };
        document.getElementById('tryItCheckBtn').style.display = '';
        nextTryItPlate();
        setTimeout(() => inp.focus(), 200);
    }
    window.initTryIt = initTryIt;

    function nextTryItPlate() {
        if (tryItIndex >= tryItPlates.length) {
            document.getElementById('tryItPlate').textContent = '🎉';
            document.getElementById('tryItResult').innerHTML = `<span style="color:#14a06b;font-weight:700;">You solved ${tryItSolved}/${tryItPlates.length} plates!</span>`;
            document.getElementById('tryItInput').style.display = 'none';
            document.getElementById('tryItCheckBtn').style.display = 'none';
            return;
        }
        document.getElementById('tryItPlate').textContent = tryItPlates[tryItIndex];
        const inp = document.getElementById('tryItInput');
        inp.textContent = '';
        inp.style.display = '';
        document.getElementById('tryItResult').innerHTML = `<span style="color:#756e5c;">${tryItSolved}/${tryItIndex} solved</span>`;
    }

    function tryItHighlight() {
        const inp = document.getElementById('tryItInput');
        const word = (inp.textContent || '').replace(/\s/g, '').toLowerCase();
        const plate = tryItPlates[tryItIndex] || '';
        const resultEl = document.getElementById('tryItResult');

        if (!word) {
            resultEl.innerHTML = `<span style="color:#756e5c;">${tryItSolved}/${tryItIndex} solved</span>`;
            return;
        }

        // Build colored HTML
        let plateIdx = 0;
        let html = '';
        let outOfOrder = false;
        let outOfOrderLetter = '';
        let neededLetter = '';

        for (let i = 0; i < word.length; i++) {
            const ch = word[i];
            const upper = ch.toUpperCase();

            if (plateIdx < plate.length && upper === plate[plateIdx]) {
                html += `<span style="color:#14a06b;">${upper}</span>`;
                plateIdx++;
            } else if (!outOfOrder && plateIdx < plate.length) {
                // Check if this letter is a plate letter that comes later
                const futureIdx = plate.indexOf(upper, plateIdx);
                if (futureIdx > plateIdx) {
                    html += `<span style="color:#ff3b30;">${upper}</span>`;
                    outOfOrder = true;
                    outOfOrderLetter = upper;
                    neededLetter = plate[plateIdx];
                } else {
                    html += `<span style="color:#1a1714;">${upper}</span>`;
                }
            } else {
                html += `<span style="color:#1a1714;">${upper}</span>`;
            }
        }

        inp.innerHTML = html;
        // Place cursor at end
        const sel = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(inp);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);

        if (outOfOrder) {
            resultEl.innerHTML = `<span style="color:#ff3b30;">${outOfOrderLetter} must come after ${neededLetter}</span>`;
        } else {
            resultEl.innerHTML = `<span style="color:#756e5c;">${tryItSolved}/${tryItIndex} solved</span>`;
        }
    }

    let tryItPending = false;
    function tryItSubmit() {
        if (tryItPending) return;
        const input = document.getElementById('tryItInput');
        const word = (input.textContent || '').replace(/\s/g, '').trim().toLowerCase();
        if (!word) return;
        if (word.length < 4) {
            document.getElementById('tryItResult').innerHTML = '<span style="color:#ff3b30;">Words must be at least 4 letters</span>';
            return;
        }
        if (tryItIndex >= tryItPlates.length) return;
        const plate = tryItPlates[tryItIndex];
        if (DICTIONARY.size > 0 && !DICTIONARY.has(word.toUpperCase())) {
            document.getElementById('tryItResult').innerHTML = `<span style="color:#ff3b30;">"${word.toUpperCase()}" isn't in the dictionary</span>`;
            return;
        }
        // Check plate letters in order
        let pi = 0;
        for (const ch of word) {
            if (pi < plate.length && ch.toUpperCase() === plate[pi]) pi++;
        }
        if (pi < plate.length) {
            document.getElementById('tryItResult').innerHTML = `<span style="color:#ff3b30;">"${word.toUpperCase()}" doesn't contain ${plate} in order</span>`;
            return;
        }
        // Success!
        tryItSolved++;
        tryItIndex++;
        tryItPending = true;
        document.getElementById('tryItInput').textContent = '';
        document.getElementById('tryItResult').innerHTML = `<span style="color:#14a06b;font-weight:700;">✓ ${word.toUpperCase()} matches ${plate}</span>`;
        setTimeout(() => { tryItPending = false; nextTryItPlate(); }, 800);
    }
    window.tryItSubmit = tryItSubmit;
});
