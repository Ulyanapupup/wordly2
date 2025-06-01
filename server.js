const express = require('express');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Create HTTP server
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// WebSocket server
const wss = new WebSocket.Server({ server });

const rooms = {};
const players = {};

wss.on('connection', (ws) => {
  let playerId = generateId();
  players[playerId] = { ws, room: null, isReady: false, word: null, isTurn: false };
  
  console.log(`New connection: ${playerId}`);

  ws.on('message', (message) => {
    const data = JSON.parse(message);
    handleMessage(playerId, data);
  });

  ws.on('close', () => {
    handleDisconnect(playerId);
  });

  // Send initial connection info
  ws.send(JSON.stringify({
    type: 'connection',
    playerId
  }));
});

function generateId() {
  return Math.random().toString(36).substr(2, 9);
}

function handleMessage(playerId, data) {
  const player = players[playerId];
  if (!player) return;

  switch (data.type) {
    case 'createRoom':
      createRoom(playerId);
      break;
    case 'joinRoom':
      joinRoom(playerId, data.roomId);
      break;
    case 'setWord':
      setWord(playerId, data.word);
      break;
    case 'submitGuess':
      submitGuess(playerId, data.guess);
      break;
    case 'submitFeedback':
      submitFeedback(playerId, data.feedback);
      break;
  }
}

function createRoom(playerId) {
  const roomId = generateId();
  rooms[roomId] = {
    players: [playerId],
    gameState: 'waiting',
    currentTurn: null
  };
  
  players[playerId].room = roomId;
  
  sendToPlayer(playerId, {
    type: 'roomCreated',
    roomId
  });
  
  console.log(`Room created: ${roomId}`);
}

function joinRoom(playerId, roomId) {
  const room = rooms[roomId];
  if (!room || room.players.length >= 2) {
    sendToPlayer(playerId, {
      type: 'joinError',
      message: 'Room is full or does not exist'
    });
    return;
  }

  room.players.push(playerId);
  players[playerId].room = roomId;
  
  // Notify both players
  room.players.forEach(pId => {
    sendToPlayer(pId, {
      type: 'playerJoined',
      roomId,
      players: room.players.map(p => ({
        id: p,
        isReady: players[p].isReady
      }))
    });
  });
  
  console.log(`Player ${playerId} joined room ${roomId}`);
}

function setWord(playerId, word) {
  const player = players[playerId];
  if (!player || !player.room) return;

  player.word = word.toUpperCase();
  player.isReady = true;
  
  const room = rooms[player.room];
  const allReady = room.players.every(pId => players[pId].isReady);
  
  // Notify all players in room about readiness
  room.players.forEach(pId => {
    sendToPlayer(pId, {
      type: 'playerReady',
      playerId,
      allReady
    });
  });
  
  // If both ready, start game
  if (allReady && room.gameState === 'waiting') {
    startGame(room);
  }
}

function startGame(room) {
  room.gameState = 'playing';
  room.currentTurn = room.players[0]; // First player starts
  players[room.players[0]].isTurn = true;
  players[room.players[1]].isTurn = false;
  
  room.players.forEach(pId => {
    sendToPlayer(pId, {
      type: 'gameStarted',
      yourTurn: players[pId].isTurn
    });
  });
}

function submitGuess(playerId, guess) {
  const player = players[playerId];
  if (!player || !player.room || !player.isTurn) return;

  const room = rooms[player.room];
  const opponentId = room.players.find(pId => pId !== playerId);
  
  if (!opponentId) return;
  
  // Send guess to opponent for feedback
  players[opponentId].isTurn = true;
  player.isTurn = false;
  
  sendToPlayer(opponentId, {
    type: 'receiveGuess',
    guess: guess.toUpperCase(),
    guesserId: playerId
  });
  
  // Also show the guess to the guesser
  sendToPlayer(playerId, {
    type: 'showGuess',
    guess: guess.toUpperCase(),
    isOpponent: false
  });
}

function submitFeedback(playerId, feedback) {
  const player = players[playerId];
  if (!player || !player.room || !player.isTurn) return;

  const room = rooms[player.room];
  const guesserId = room.players.find(pId => pId !== playerId);
  
  if (!guesserId) return;
  
  // Check if the guess was correct
  const guess = feedback.guess;
  const isCorrect = guess === player.word;
  
  // Send feedback to guesser
  sendToPlayer(guesserId, {
    type: 'receiveFeedback',
    feedback: feedback.colors,
    isCorrect
  });
  
  // Also show the feedback to the feedback giver
  sendToPlayer(playerId, {
    type: 'showGuess',
    guess: guess,
    isOpponent: true,
    feedback: feedback.colors
  });
  
  if (isCorrect) {
    // Game over
    endGame(room, guesserId);
  } else {
    // Switch turns
    players[guesserId].isTurn = true;
    player.isTurn = false;
    
    sendToPlayer(guesserId, {
      type: 'yourTurn'
    });
  }
}

function endGame(room, winnerId) {
  room.gameState = 'finished';
  
  const loserId = room.players.find(pId => pId !== winnerId);
  const winnerWord = players[winnerId].word;
  const loserWord = players[loserId].word;
  
  room.players.forEach(pId => {
    sendToPlayer(pId, {
      type: 'gameOver',
      winnerId,
      winnerWord,
      loserWord
    });
  });
}

function handleDisconnect(playerId) {
  const player = players[playerId];
  if (!player) return;

  if (player.room) {
    const room = rooms[player.room];
    if (room) {
      // Notify other player
      const otherPlayerId = room.players.find(pId => pId !== playerId);
      if (otherPlayerId) {
        sendToPlayer(otherPlayerId, {
          type: 'opponentDisconnected'
        });
      }
      
      // Clean up room
      delete rooms[player.room];
    }
  }
  
  // Clean up player
  delete players[playerId];
  console.log(`Player disconnected: ${playerId}`);
}

function sendToPlayer(playerId, message) {
  const player = players[playerId];
  if (player && player.ws.readyState === WebSocket.OPEN) {
    player.ws.send(JSON.stringify(message));
  }
}