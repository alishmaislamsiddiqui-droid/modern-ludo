const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

let rooms = {};

io.on('connection', (socket) => {
    socket.on('joinGame', ({ roomId, playerName, playerColor }) => {
        if (!rooms[roomId]) {
            rooms[roomId] = {
                config: { maxPlayers: 0, activePlayers: [], customTheme: 'classic' },
                players: [],
                turnIndex: 0,
                currentDice: 0,
            };
        }

        const room = rooms[roomId];
        if (room.players.length >= 4) {
            socket.emit('error', 'Room full');
            return;
        }

        room.players.push({
            id: socket.id,
            name: playerName || `Player ${room.players.length + 1}`,
            color: playerColor || ['red', 'green', 'yellow', 'blue'][room.players.length],
            tokens: Array(4).fill(-1),
            finishedCount: 0
        });
        
        socket.join(roomId);
        socket.emit('roomState', roomId);
        io.to(roomId).emit('updatePlayerList', room.players);
    });

    socket.on('startGame', ({ roomId, playerCount, theme }) => {
        const room = rooms[roomId];
        if (!room || room.players[0].id !== socket.id) return;

        const active = room.players.slice(0, playerCount);
        room.config.activePlayers = active.map(p => p.color);
        room.config.maxPlayers = playerCount;
        room.config.customTheme = theme;

        room.players.forEach(p => {
            p.tokens = Array(4).fill(-1);
            p.finishedCount = 0;
        });
        room.turnIndex = 0;
        room.currentDice = 0;
        room.gameOver = false;

        io.to(roomId).emit('gameStarted', { config: room.config, players: room.players });
        io.to(roomId).emit('updateTurn', { turnIndex: 0 });
        io.to(roomId).emit('log', `${active[0].color.toUpperCase()}'s turn to roll.`);
    });

    socket.on('rollDice', ({ roomId }) => {
        const room = rooms[roomId];
        if (!room || room.gameOver) return;
        
        const currentPlayerColor = room.config.activePlayers[room.turnIndex];
        const player = room.players.find(p => p.color === currentPlayerColor);

        if (player.id !== socket.id || room.currentDice !== 0) return;

        const roll = Math.floor(Math.random() * 6) + 1;
        room.currentDice = roll;

        io.to(roomId).emit('diceRolled', { roll, playerColor: currentPlayerColor, players: room.players });
        io.to(roomId).emit('log', `${currentPlayerColor.toUpperCase()} rolled a ${roll}.`);

        let hasValidMoves = false;
        player.tokens.forEach((pos) => {
            if ((pos === -1 && roll === 6) || (pos >= 0 && pos + roll <= 56)) {
                hasValidMoves = true;
            }
        });

        if (!hasValidMoves) {
             room.currentDice = 0;
             io.to(roomId).emit('log', 'No valid moves. Turn forfeited.');
             setTimeout(() => nextTurn(room, roomId), 1200);
        }
    });

    socket.on('moveToken', ({ roomId, tokenIndex }) => {
        const room = rooms[roomId];
        if (!room || room.currentDice === 0 || room.gameOver) return;

        const currentPlayerColor = room.config.activePlayers[room.turnIndex];
        const player = room.players.find(p => p.color === currentPlayerColor);
        
        if (player.id !== socket.id) return;

        const roll = room.currentDice;
        const currentPos = player.tokens[tokenIndex];
        // Green: Top-Left (0), Yellow: Top-Right (13), Blue: Bottom-Right (26), Red: Bottom-Left (39)
        const offsets = {'green': 0, 'yellow': 13, 'blue': 26, 'red': 39};
        const playerOffset = offsets[currentPlayerColor];
        const safeTiles = [0, 8, 13, 21, 26, 34, 39, 47];

        let canMove = false;
        let newPos = currentPos;

        if (currentPos === -1) {
            if (roll === 6) {
                canMove = true;
                newPos = 0;
            }
        } else if (currentPos + roll <= 56) {
            canMove = true;
            newPos = currentPos + roll;
        }

        if (!canMove) return;

        player.tokens[tokenIndex] = newPos;
        room.currentDice = 0;

        if (newPos === 56) {
            player.finishedCount++;
            io.to(roomId).emit('log', `🎯 ${currentPlayerColor.toUpperCase()} got a token HOME!`);
            if (player.finishedCount === 4) {
                 room.gameOver = true;
                 io.to(roomId).emit('log', `🏆 GAME OVER! ${currentPlayerColor.toUpperCase()} WINS! 🏆`);
            }
        } else if (newPos <= 50) {
            const globalNewPos = (newPos + playerOffset) % 52;
            const isSafe = safeTiles.includes(globalNewPos);

            if (!isSafe) {
                 room.players.forEach(opp => {
                    if (opp.color === currentPlayerColor) return;
                    const oppOffset = offsets[opp.color];
                    
                    opp.tokens.forEach((oppPos, oppIdx) => {
                        if (oppPos >= 0 && oppPos <= 50) {
                             const oppGlobal = (oppPos + oppOffset) % 52;
                             if (oppGlobal === globalNewPos) {
                                  opp.tokens[oppIdx] = -1;
                                  io.to(roomId).emit('log', `⚔️ ${currentPlayerColor.toUpperCase()} CAPTURED ${opp.color.toUpperCase()}!`);
                             }
                        }
                    });
                 });
            }
        }

        io.to(roomId).emit('updateGameState', { players: room.players, currentDice: 0 });

        if (roll === 6 && !room.gameOver) {
             io.to(roomId).emit('updateTurn', { turnIndex: room.turnIndex });
             io.to(roomId).emit('log', 'Rolled a 6! Bonus roll.');
        } else if (!room.gameOver) {
            nextTurn(room, roomId);
        }
    });
});

function nextTurn(room, roomId) {
    room.turnIndex = (room.turnIndex + 1) % room.config.activePlayers.length;
    const nextColor = room.config.activePlayers[room.turnIndex];
    io.to(roomId).emit('updateTurn', { turnIndex: room.turnIndex });
    io.to(roomId).emit('log', `${nextColor.toUpperCase()}'s turn to roll.`);
}

const PORT = process.env.PORT || 8081;
server.listen(PORT, () => {
    console.log(`Modern Ludo server running on port ${PORT}`);
});
