// Game State
let gameState = {
    playerCount: 4,
    impostorCount: 1,
    category: 'bollywood',
    currentPlayer: 1,
    playerNames: [],
    impostors: [],
    roles: [],          // 'impostor' or 'safe' per player index (0-based)
    realWord: '',
    impostorWord: '',
    cardRevealed: false,
    cardTransitioning: false,
    timerInterval: null,
    timerSeconds: 180,
    timerRunning: false,
    votedPlayer: null,
    speakingOrder: [],
    starterIndex: 0
};

// --- Setup Functions ---
function changePlayerCount(delta) {
    gameState.playerCount = Math.max(3, Math.min(12, gameState.playerCount + delta));
    document.getElementById('player-count').textContent = gameState.playerCount;
    // Ensure impostor count is valid
    if (gameState.impostorCount >= gameState.playerCount - 1) {
        gameState.impostorCount = Math.max(1, gameState.playerCount - 2);
        document.getElementById('impostor-count').textContent = gameState.impostorCount;
    }
}

function changeImpostorCount(delta) {
    const max = Math.floor(gameState.playerCount / 2);
    gameState.impostorCount = Math.max(1, Math.min(max, gameState.impostorCount + delta));
    document.getElementById('impostor-count').textContent = gameState.impostorCount;
}

function selectCategory(btn) {
    document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    gameState.category = btn.dataset.category;
}

// --- Game Flow ---
function startGame() {
    showScreen('names-screen');
    renderNamesForm();
}

function renderNamesForm() {
    const form = document.getElementById('names-form');
    form.innerHTML = '';
    for (let i = 1; i <= gameState.playerCount; i++) {
        const existing = gameState.playerNames[i - 1] || '';
        const div = document.createElement('div');
        div.className = 'name-input-group';
        div.innerHTML = `
            <span class="name-number">${i}</span>
            <input type="text" class="name-input" id="name-${i}" 
                   placeholder="Player ${i}" value="${existing}" 
                   autocomplete="off" />
        `;
        form.appendChild(div);
    }
    // Auto-focus first input
    setTimeout(() => document.getElementById('name-1')?.focus(), 100);
}

function submitNames() {
    gameState.playerNames = [];
    for (let i = 1; i <= gameState.playerCount; i++) {
        const input = document.getElementById(`name-${i}`);
        const name = input.value.trim() || `Player ${i}`;
        gameState.playerNames.push(name);
    }
    beginRound();
}

function beginRound() {
    // Pick word pair
    const [real, impostor] = getWordPair(gameState.category);
    gameState.realWord = real;
    gameState.impostorWord = impostor;
    gameState.currentPlayer = 1;
    gameState.cardRevealed = false;
    gameState.cardTransitioning = false;

    // Randomly pick impostors
    gameState.impostors = [];
    const indices = Array.from({ length: gameState.playerCount }, (_, i) => i + 1);
    for (let i = 0; i < gameState.impostorCount; i++) {
        const randIdx = Math.floor(Math.random() * indices.length);
        gameState.impostors.push(indices.splice(randIdx, 1)[0]);
    }

    // Build explicit roles array (0-based) for bulletproof role assignment
    gameState.roles = [];
    for (let i = 1; i <= gameState.playerCount; i++) {
        gameState.roles.push(gameState.impostors.includes(i) ? 'impostor' : 'safe');
    }

    console.log('[Impostor Game] Impostors:', gameState.impostors, 'Roles:', gameState.roles);

    showScreen('reveal-screen');
    setupRevealCard();
}

function setupRevealCard() {
    const card = document.getElementById('reveal-card');
    const wordDisplay = document.getElementById('word-display');

    // Lock interactions during transition
    gameState.cardTransitioning = true;
    gameState.cardRevealed = false;

    // Hide back content immediately to prevent flash of old content
    wordDisplay.style.visibility = 'hidden';

    // Reset card to front (unflipped)
    card.classList.remove('flipped');

    const playerName = gameState.playerNames[gameState.currentPlayer - 1] || `Player ${gameState.currentPlayer}`;
    document.getElementById('current-player-name').textContent = playerName;

    // Use the explicit roles array (0-based index) — bulletproof check
    const role = gameState.roles[gameState.currentPlayer - 1];
    const isImpostor = (role === 'impostor');

    console.log(`[Impostor Game] Player ${gameState.currentPlayer} (${playerName}) -> role: ${role}`);

    if (isImpostor) {
        wordDisplay.innerHTML = `
            <div class="impostor-badge"><i data-lucide="drama"></i> YOU ARE THE IMPOSTOR!</div>
            <p class="impostor-word">Your word: <strong>${gameState.impostorWord}</strong></p>
        `;
    } else {
        wordDisplay.innerHTML = `
            <div class="civilian-badge"><i data-lucide="circle-check-big"></i> You're safe!</div>
            <p class="real-word">Your word: <strong>${gameState.realWord}</strong></p>
        `;
    }

    // Show correct button
    if (gameState.currentPlayer < gameState.playerCount) {
        document.getElementById('next-player-btn').style.display = 'block';
        document.getElementById('start-discussion-btn').style.display = 'none';
    } else {
        document.getElementById('next-player-btn').style.display = 'none';
        document.getElementById('start-discussion-btn').style.display = 'block';
    }

    // Allow interaction after the unflip transition completes (0.6s CSS)
    setTimeout(() => {
        wordDisplay.style.visibility = 'visible';
        gameState.cardTransitioning = false;
    }, 650);

    // Re-initialize Lucide icons after injecting content
    if (typeof lucide !== 'undefined') lucide.createIcons();

    // Card click handler — guarded by transition lock
    card.onclick = () => {
        if (!gameState.cardRevealed && !gameState.cardTransitioning) {
            card.classList.add('flipped');
            gameState.cardRevealed = true;
        }
    };
}

function nextPlayer() {
    if (gameState.cardTransitioning) return; // Prevent rapid clicks
    gameState.currentPlayer++;
    setupRevealCard();
}

function startDiscussion() {
    showScreen('discussion-screen');
    
    // Game logic: Fully randomize the speaking order with ONE constraint —
    // the first speaker must be a non-impostor.
    //
    // Why randomize fully (not just clockwise from a random start)?
    // 1. Prevents the impostor from predicting when they'll speak
    // 2. Impostor can't "ride" the person before them by adapting their clue
    // 3. Keeps everyone alert — you don't know when you'll be called
    // 4. Removes positional advantage (later speakers always hear more in clockwise)
    //
    // Why must the first speaker be a non-impostor?
    // Going first is a disadvantage (no clues to reference). If the impostor
    // goes first with zero info, it becomes too obvious. Protecting them from
    // slot #1 keeps the game balanced.

    const nonImpostors = [];
    const impostorIndices = [];
    for (let i = 1; i <= gameState.playerCount; i++) {
        if (gameState.impostors.includes(i)) {
            impostorIndices.push(i);
        } else {
            nonImpostors.push(i);
        }
    }

    // Pick a random non-impostor for slot #1
    const starterIdx = Math.floor(Math.random() * nonImpostors.length);
    const starter = nonImpostors.splice(starterIdx, 1)[0];
    gameState.starterIndex = starter;

    // Shuffle remaining players (other non-impostors + impostors)
    const remaining = [...nonImpostors, ...impostorIndices];
    for (let i = remaining.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
    }

    // Final order: starter first, then shuffled rest
    gameState.speakingOrder = [starter, ...remaining];

    renderSpeakingOrder();
    gameState.timerSeconds = 180;
    updateTimerDisplay();
    startTimer();
}

function renderSpeakingOrder() {
    const container = document.getElementById('speaking-order');
    container.innerHTML = '';

    const starterName = gameState.playerNames[gameState.starterIndex - 1];
    const starterBanner = document.createElement('div');
    starterBanner.className = 'starter-banner';
    starterBanner.innerHTML = `<i data-lucide="shuffle"></i> Randomized! <strong>${starterName}</strong> starts first!`;
    container.appendChild(starterBanner);

    const list = document.createElement('div');
    list.className = 'order-list';
    gameState.speakingOrder.forEach((playerIdx, i) => {
        const name = gameState.playerNames[playerIdx - 1];
        const item = document.createElement('div');
        item.className = 'order-item' + (i === 0 ? ' order-active' : '');
        item.innerHTML = `<span class="order-num">${i + 1}</span><span class="order-name">${name}</span>`;
        item.onclick = () => {
            document.querySelectorAll('.order-item').forEach(el => el.classList.remove('order-active'));
            item.classList.add('order-active');
        };
        list.appendChild(item);
    });
    container.appendChild(list);

    if (typeof lucide !== 'undefined') lucide.createIcons();
}

// --- Timer ---
function startTimer() {
    gameState.timerRunning = true;
    document.getElementById('timer-btn').innerHTML = '<i data-lucide="circle-pause"></i> Pause';
    if (typeof lucide !== 'undefined') lucide.createIcons();
    gameState.timerInterval = setInterval(() => {
        gameState.timerSeconds--;
        updateTimerDisplay();
        if (gameState.timerSeconds <= 0) {
            clearInterval(gameState.timerInterval);
            gameState.timerRunning = false;
            document.getElementById('timer').classList.add('timer-done');
        }

        // Re-initialize icons after timer text updates
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }, 1000);
}

function toggleTimer() {
    if (gameState.timerRunning) {
        clearInterval(gameState.timerInterval);
        gameState.timerRunning = false;
        document.getElementById('timer-btn').innerHTML = '<i data-lucide="circle-play"></i> Resume';
        if (typeof lucide !== 'undefined') lucide.createIcons();
    } else {
        startTimer();
    }
}

function resetTimer() {
    clearInterval(gameState.timerInterval);
    gameState.timerSeconds = 180;
    gameState.timerRunning = false;
    updateTimerDisplay();
    document.getElementById('timer').classList.remove('timer-done');
    document.getElementById('timer-btn').innerHTML = '<i data-lucide="circle-play"></i> Start';
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function updateTimerDisplay() {
    const min = Math.floor(gameState.timerSeconds / 60);
    const sec = gameState.timerSeconds % 60;
    document.getElementById('timer').textContent =
        `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
}

// --- Voting ---
function startVoting() {
    clearInterval(gameState.timerInterval);
    showScreen('voting-screen');

    const grid = document.getElementById('vote-grid');
    grid.innerHTML = '';
    gameState.votedPlayer = null;

    for (let i = 1; i <= gameState.playerCount; i++) {
        const btn = document.createElement('button');
        btn.className = 'vote-btn';
        btn.textContent = gameState.playerNames[i - 1];
        btn.onclick = () => {
            document.querySelectorAll('.vote-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            gameState.votedPlayer = i;
        };
        grid.appendChild(btn);
    }
}

function revealImpostor() {
    showScreen('result-screen');

    const impostorList = gameState.impostors.map(i => gameState.playerNames[i - 1]).join(', ');
    const caught = gameState.votedPlayer && gameState.impostors.includes(gameState.votedPlayer);

    let resultHTML = '';
    if (caught) {
        resultHTML = `
            <div class="result-success">
                <h2><i data-lucide="party-popper"></i> Impostor Caught!</h2>
                <p>The impostor${gameState.impostorCount > 1 ? 's were' : ' was'}: <strong>${impostorList}</strong></p>
                <div class="result-emoji"><i data-lucide="search-check"></i></div>
            </div>
        `;
    } else {
        resultHTML = `
            <div class="result-fail">
                <h2><i data-lucide="skull"></i> Impostor Wins!</h2>
                <p>The impostor${gameState.impostorCount > 1 ? 's were' : ' was'}: <strong>${impostorList}</strong></p>
                ${gameState.votedPlayer ? `<p>You voted for ${gameState.playerNames[gameState.votedPlayer - 1]} — wrong!</p>` : '<p>No vote was cast!</p>'}
                <div class="result-emoji"><i data-lucide="drama"></i></div>
            </div>
        `;
    }

    document.getElementById('result-content').innerHTML = resultHTML;
    document.getElementById('the-word').textContent = gameState.realWord;

    if (typeof lucide !== 'undefined') lucide.createIcons();
}

// --- Navigation ---
function playAgain() {
    beginRound();
}

function goHome() {
    showScreen('start-screen');
}

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
}
