const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const rooms = {};

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on('createRoom', () => {
    const roomId = generateRoomId();
    rooms[roomId] = {
      players: [socket.id],
      words: {},
      guesses: [],
      currentTurn: 0,
      gameOver: false,
    };
    socket.join(roomId);
    socket.emit('roomCreated', roomId);
  });

  socket.on('joinRoom', (roomId) => {
    const room = rooms[roomId];
    if (room && room.players.length === 1) {
      room.players.push(socket.id);
      socket.join(roomId);
      io.to(roomId).emit('roomJoined', roomId);
    } else {
      socket.emit('error', 'Room is full or does not exist.');
    }
  });

  socket.on('submitWord', ({ roomId, word }) => {
    const room = rooms[roomId];
    if (room) {
      room.words[socket.id] = word.toLowerCase();
      if (Object.keys(room.words).length === 2) {
        io.to(roomId).emit('startGame');
      }
    }
  });

  socket.on('makeGuess', ({ roomId, guess }) => {
    const room = rooms[roomId];
    if (room && !room.gameOver) {
      const opponentId = room.players.find((id) => id !== socket.id);
      const opponentWord = room.words[opponentId];
      const result = evaluateGuess(guess.toLowerCase(), opponentWord);
      room.guesses.push({ player: socket.id, guess, result });
      io.to(roomId).emit('guessMade', { player: socket.id, guess, result });

      if (guess.toLowerCase() === opponentWord) {
        room.gameOver = true;
        io.to(roomId).emit('gameOver', {
          winner: socket.id,
          words: room.words,
        });
      } else {
        room.currentTurn = (room.currentTurn + 1) % 2;
        io.to(roomId).emit('nextTurn', room.players[room.currentTurn]);
      }
    }
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    for (const roomId in rooms) {
      const room = rooms[roomId];
      if (room.players.includes(socket.id)) {
        io.to(roomId).emit('playerDisconnected');
        delete rooms[roomId];
        break;
      }
    }
  });
});

function generateRoomId() {
  return Math.random().toString(36).substr(2, 6).toUpperCase();
}

function evaluateGuess(guess, target) {
  const result = [];
  const targetLetters = target.split('');
  const guessLetters = guess.split('');

  // First pass: correct letters in correct positions
  for (let i = 0; i < 5; i++) {
    if (guessLetters[i] === targetLetters[i]) {
      result.push('green');
      targetLetters[i] = null;
      guessLetters[i] = null;
    } else {
      result.push(null);
    }
  }

  // Second pass: correct letters in wrong positions
  for (let i = 0; i < 5; i++) {
    if (guessLetters[i]) {
      const index = targetLetters.indexOf(guessLetters[i]);
      if (index !== -1) {
        result[i] = 'yellow';
        targetLetters[index] = null;
      } else {
        result[i] = 'gray';
      }
    }
  }

  return result;
}

// Добавим новое событие в io.on('connection')
socket.on('submitEvaluation', ({ roomId, evaluation }) => {
  const room = rooms[roomId];
  if (room && !room.gameOver) {
    const lastGuess = room.guesses[room.guesses.length - 1];
    lastGuess.result = evaluation;
    
    io.to(roomId).emit('guessEvaluated', {
      guess: lastGuess.guess,
      evaluation: evaluation
    });
    
    room.currentTurn = (room.currentTurn + 1) % 2;
    io.to(roomId).emit('nextTurn', room.players[room.currentTurn]);
  }
});

// Изменим обработчик makeGuess
socket.on('makeGuess', ({ roomId, guess }) => {
  const room = rooms[roomId];
  if (room && !room.gameOver) {
    const opponentId = room.players.find((id) => id !== socket.id);
    room.guesses.push({ player: socket.id, guess: guess.toLowerCase(), result: null });
    
    // Отправляем догадку оппоненту для оценки
    socket.to(opponentId).emit('opponentGuess', guess.toLowerCase());
    
    // Уведомляем игрока, что его догадка отправлена на оценку
    socket.emit('guessSent');
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
