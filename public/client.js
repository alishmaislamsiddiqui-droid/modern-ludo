const socket = io();

const joinScreen = document.getElementById('join-screen');
const roomIdInput = document.getElementById('room-id');
const playerNameInput = document.getElementById('player-name');
const colorOpts = document.querySelectorAll('.color-opt');
const joinBtn = document.getElementById('join-btn');

const lobbyScreen = document.getElementById('lobby-screen');
const lobbyIdDisplay = document.getElementById('lobby-id-display');
const playerList = document.getElementById('player-list');
const hostControls = document.getElementById('host-controls');
const playerCountSelect = document.getElementById('player-count-select');
const themeSelect = document.getElementById('theme-select');
const startBtn = document.getElementById('start-game-btn');

const gameScreen = document.getElementById('game-screen');
const boardEl = document.getElementById('board');
const gameLog = document.getElementById('game-log');
const turnIndicator = document.getElementById('turn-indicator');
const diceBox = document.getElementById('dice-box');
const rollBtn = document.getElementById('roll-dice-btn');

let myRoomId = null;
let myName = null;
let myColor = 'red';
let gameConfig = null;
let latestPlayers = [];
let currentDiceValue = 0;

let MAIN_PATH = [];
let HOME_PATHS = {};

const COLOR_HEX = {
    green: '#15803d',
    yellow: '#facc15',
    blue: '#0284c7',
    red: '#d62828'
};

colorOpts.forEach(opt => {
    opt.addEventListener('click', () => {
        document.querySelector('.color-opt.active').classList.remove('active');
        opt.classList.add('active');
        myColor = opt.dataset.color;
    });
});

joinBtn.addEventListener('click', () => {
    myRoomId = roomIdInput.value.trim();
    myName = playerNameInput.value.trim();
    if (!myRoomId || !myName) return alert('Enter Room ID and Name');
    
    socket.emit('joinGame', { roomId: myRoomId, playerName: myName, playerColor: myColor });
    joinScreen.classList.remove('active');
    lobbyScreen.classList.add('active');
    lobbyIdDisplay.innerText = myRoomId;
});

socket.on('updatePlayerList', (players) => {
    playerList.innerHTML = '';
    players.forEach((p, index) => {
        const li = document.createElement('li');
        li.innerText = `${p.name} (${p.color.toUpperCase()})`;
        li.style.color = COLOR_HEX[p.color] || p.color;
        playerList.appendChild(li);
        
        if (p.id === socket.id && index === 0) {
            hostControls.style.display = 'block';
        }
    });
});

startBtn.addEventListener('click', () => {
    socket.emit('startGame', { 
        roomId: myRoomId, 
        playerCount: playerCountSelect.value,
        theme: themeSelect.value
    });
});

socket.on('gameStarted', ({ config, players }) => {
    gameConfig = config;
    latestPlayers = players;
    currentDiceValue = 0;
    lobbyScreen.classList.remove('active');
    gameScreen.classList.add('active');
    
    const me = players.find(p => p.id === socket.id);
    if (me) myColor = me.color;

    generatePaths();
    renderBoard();
    updateBoardTokens(players);
});

socket.on('updateGameState', ({ players, currentDice }) => {
    latestPlayers = players;
    currentDiceValue = currentDice || 0;
    updateBoardTokens(players);
});

socket.on('diceRolled', ({ roll, playerColor, players }) => {
    diceBox.innerText = roll;
    diceBox.style.color = COLOR_HEX[playerColor] || playerColor;
    rollBtn.disabled = true;
    currentDiceValue = roll;
    if (players) latestPlayers = players;
    updateBoardTokens(latestPlayers);
});

socket.on('updateTurn', ({ turnIndex }) => {
    gameConfig.turnIndex = turnIndex;
    currentDiceValue = 0;
    const activePlayers = gameConfig.activePlayers;
    const currentColor = activePlayers[turnIndex];
    turnIndicator.innerText = `${currentColor.toUpperCase()}'s turn`;
    turnIndicator.style.color = COLOR_HEX[currentColor] || currentColor;
    diceBox.innerText = '-';
    diceBox.style.color = '#fff';

    rollBtn.disabled = (currentColor !== myColor);
    updateBoardTokens(latestPlayers);
});

socket.on('log', (msg) => {
    const entry = document.createElement('div');
    entry.innerText = msg;
    gameLog.prepend(entry);
});

rollBtn.addEventListener('click', () => {
    socket.emit('rollDice', { roomId: myRoomId });
});

function generatePaths() {
    // Center row (7) and center col (7) home stretches
    HOME_PATHS['green'] = [[7,1],[7,2],[7,3],[7,4],[7,5]];
    HOME_PATHS['yellow'] = [[1,7],[2,7],[3,7],[4,7],[5,7]];
    HOME_PATHS['blue'] = [[7,13],[7,12],[7,11],[7,10],[7,9]];
    HOME_PATHS['red'] = [[13,7],[12,7],[11,7],[10,7],[9,7]];

    // 52-tile clockwise outer track starting at Green's start tile (6,1)
    MAIN_PATH = [
        [6,1], [6,2], [6,3], [6,4], [6,5],             // 0..4
        [5,6], [4,6], [3,6], [2,6], [1,6], [0,6],       // 5..10 (8 is top-left star)
        [0,7],                                          // 11 (Yellow arrow)
        [0,8], [1,8], [2,8], [3,8], [4,8], [5,8],       // 12..17 (13 is Yellow start)
        [6,9], [6,10], [6,11], [6,12], [6,13], [6,14],  // 18..23 (21 is top-right star)
        [7,14],                                         // 24 (Blue arrow)
        [8,14], [8,13], [8,12], [8,11], [8,10], [8,9],  // 25..30 (26 is Blue start)
        [9,8], [10,8], [11,8], [12,8], [13,8], [14,8],  // 31..36 (34 is bottom-right star)
        [14,7],                                         // 37 (Red arrow)
        [14,6], [13,6], [12,6], [11,6], [10,6], [9,6],  // 38..43 (39 is Red start)
        [8,5], [8,4], [8,3], [8,2], [8,1], [8,0],       // 44..49 (47 is bottom-left star)
        [7,0],                                          // 50 (Green arrow)
        [6,0]                                           // 51
    ];
}

function renderBoard() {
    document.querySelectorAll('.cell').forEach(el => el.remove());
    const size = 15;

    for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
            if ((r < 6 && c < 6) || (r < 6 && c > 8) || (r > 8 && c > 8) || (r > 8 && c < 6) || (r >= 6 && r <= 8 && c >= 6 && c <= 8)) {
                continue;
            }

            const cell = document.createElement('div');
            cell.className = 'cell';
            cell.id = `cell-${r}-${c}`;
            cell.style.gridRow = `${r + 1}`;
            cell.style.gridColumn = `${c + 1}`;
            
            // Starting squares + Center Home-Stretch Pathways
            if ((r === 6 && c === 1) || (r === 7 && c >= 1 && c <= 5)) cell.classList.add('home-path-green');
            if ((r === 1 && c === 8) || (c === 7 && r >= 1 && r <= 5)) cell.classList.add('home-path-yellow');
            if ((r === 8 && c === 13) || (r === 7 && c >= 9 && c <= 13)) cell.classList.add('home-path-blue');
            if ((r === 13 && c === 6) || (c === 7 && r >= 9 && r <= 13)) cell.classList.add('home-path-red');

            // Entry Arrows
            if (r === 7 && c === 0) cell.classList.add('arrow-green');
            if (r === 0 && c === 7) cell.classList.add('arrow-yellow');
            if (r === 7 && c === 14) cell.classList.add('arrow-blue');
            if (r === 14 && c === 7) cell.classList.add('arrow-red');

            boardEl.appendChild(cell);
        }
    }
    
    // Star Safe Stops on the 4 non-colored star tiles
    const starIndices = [8, 21, 34, 47];
    starIndices.forEach(idx => {
        const [r, c] = MAIN_PATH[idx];
        const cell = document.getElementById(`cell-${r}-${c}`);
        if (cell) cell.classList.add('safe');
    });
}

function updateBoardTokens(players) {
    document.querySelectorAll('.token').forEach(el => el.remove());
    const offsets = {'green': 0, 'yellow': 13, 'blue': 26, 'red': 39};
    
    players.forEach(p => {
        const playerColor = p.color;
        const playerOffset = offsets[playerColor];
        
        p.tokens.forEach((pos, index) => {
            let targetCell = null;
            
            if (pos === -1) {
                targetCell = document.getElementById(`base-${playerColor}-${index}`);
            } else if (pos >= 51 && pos < 56) {
                const coords = HOME_PATHS[playerColor][pos - 51];
                targetCell = document.getElementById(`cell-${coords[0]}-${coords[1]}`);
            } else if (pos === 56) {
                targetCell = document.querySelector(`.${playerColor}-tri`);
            } else if (pos >= 0 && pos <= 50) {
                const globalIdx = (pos + playerOffset) % 52;
                const coords = MAIN_PATH[globalIdx];
                targetCell = document.getElementById(`cell-${coords[0]}-${coords[1]}`);
            }

            if (targetCell) {
                const tokenEl = document.createElement('div');
                tokenEl.className = 'token';
                tokenEl.style.backgroundColor = COLOR_HEX[playerColor] || playerColor;

                const activeColorMap = gameConfig.activePlayers;
                const currentPlayerColor = activeColorMap[gameConfig.turnIndex];
                if (currentPlayerColor === myColor && p.color === myColor && currentDiceValue > 0) {
                    if ((pos === -1 && currentDiceValue === 6) || (pos >= 0 && pos + currentDiceValue <= 56)) {
                        tokenEl.classList.add('movable');
                        tokenEl.onclick = () => {
                            socket.emit('moveToken', { roomId: myRoomId, tokenIndex: index });
                        };
                    }
                }

                targetCell.appendChild(tokenEl);
            }
        });
    });
}
