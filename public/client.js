const socket = io();

// UI Elements
const lobby = document.getElementById('lobby');
const game = document.getElementById('game');
const createRoomBtn = document.getElementById('createRoom');
const joinRoomBtn = document.getElementById('joinRoom');
const roomIdInput = document.getElementById('roomIdInput');
const submitWordBtn = document.getElementById('submitWord');
const secretWordInput = document.getElementById('secretWord');
const guessSection = document.getElementById('guessSection');
const guessInput = document.getElementById('guessInput');
const submitGuessBtn = document.getElementById('submitGuess');
const gameStatus = document.getElementById('gameStatus');
const evaluationSection = document.getElementById('evaluationSection');
const opponentGuess = document.getElementById('opponentGuess');
const submitEvaluationBtn = document.getElementById('submitEvaluation');
const guessHistory = document.getElementById('guessHistory');

let roomId = null;
let playerId = null;
let currentEvaluation = [];
let opponentLetters = [];

createRoomBtn.addEventListener('click', () => {
  socket.emit('createRoom');
});

joinRoomBtn.addEventListener('click', () => {
  const id = roomIdInput.value.trim();
  if (id) {
    socket.emit('joinRoom', id);
  }
});

submitWordBtn.addEventListener('click', () => {
  const word = secretWordInput.value.trim();
  if (word.length === 5) {
    socket.emit('submitWord', { roomId, word });
    document.getElementById('wordSubmission').style.display = 'none';
    gameStatus.textContent = 'Waiting for opponent...';
  }
});

submitGuessBtn.addEventListener('click', () => {
  const guess = guessInput.value.trim();
  if (guess.length === 5) {
    socket.emit('makeGuess', { roomId, guess });
    addGuessToHistory(guess, 'pending');
    guessInput.value = '';
  }
});

submitEvaluationBtn.addEventListener('click', () => {
  socket.emit('submitEvaluation', { 
    roomId, 
    evaluation: currentEvaluation 
  });
  evaluationSection.classList.add('hidden');
  guessSection.classList.remove('hidden');
  gameStatus.textContent = 'Waiting for opponent...';
});

function createLetterElement(letter, index) {
  const letterElement = document.createElement('div');
  letterElement.className = 'letter';
  letterElement.textContent = letter;
  letterElement.dataset.index = index;
  letterElement.dataset.state = 'none';
  
  letterElement.addEventListener('click', () => {
    const states = ['none', 'green', 'yellow', 'gray'];
    const currentState = letterElement.dataset.state;
    const currentIndex = states.indexOf(currentState);
    const nextState = states[(currentIndex + 1) % states.length];
    
    letterElement.dataset.state = nextState;
    letterElement.className = 'letter ' + nextState;
    
    currentEvaluation[index] = nextState === 'none' ? null : nextState;
  });
  
  return letterElement;
}

function setupEvaluation(guess) {
  opponentGuess.innerHTML = '';
  currentEvaluation = new Array(5).fill(null);
  opponentLetters = guess.split('');
  
  opponentLetters.forEach((letter, index) => {
    opponentGuess.appendChild(createLetterElement(letter, index));
  });
}

function addGuessToHistory(guess, result) {
  const guessElement = document.createElement('div');
  guessElement.className = 'guess';
  
  if (result === 'pending') {
    guessElement.textContent = `Your guess: ${guess} (waiting for evaluation)`;
    guessElement.style.color = '#999';
  } else {
    const resultStr = result.map((color, index) => 
      `${guess[index]}: ${color || 'none'}`).join(', ');
    guessElement.textContent = `Your guess: ${guess} - ${resultStr}`;
  }
  
  guessHistory.appendChild(guessElement);
}

// Socket events
socket.on('roomCreated', (id) => {
  roomId = id;
  playerId = socket.id;
  lobby.classList.add('hidden');
  game.classList.remove('hidden');
  gameStatus.textContent = `Room created. Share this ID with your opponent: ${roomId}`;
});

socket.on('roomJoined', (id) => {
  roomId = id;
  playerId = socket.id;
  lobby.classList.add('hidden');
  game.classList.remove('hidden');
  gameStatus.textContent = 'Room joined. Submit your secret word.';
});

socket.on('startGame', () => {
  gameStatus.textContent = 'Game started! Make your guess.';
  guessSection.classList.remove('hidden');
});

socket.on('opponentGuess', (guess) => {
  gameStatus.textContent = 'Evaluate opponent\'s guess.';
  guessSection.classList.add('hidden');
  evaluationSection.classList.remove('hidden');
  setupEvaluation(guess);
});

socket.on('guessEvaluated', ({ guess, evaluation }) => {
  addGuessToHistory(guess, evaluation);
  gameStatus.textContent = 'Your turn to guess.';
});

socket.on('gameOver', ({ winner, words }) => {
  const winnerText = winner === playerId ? 'You won!' : 'You lost.';
  gameStatus.textContent = `${winnerText} Your word: ${words[playerId]}, Opponent's word: ${words[Object.keys(words).find(id => id !== playerId)]}`;
  guessSection.classList.add('hidden');
  evaluationSection.classList.add('hidden');
});

socket.on('playerDisconnected', () => {
  gameStatus.textContent = 'Opponent disconnected. Game over.';
  guessSection.classList.add('hidden');
  evaluationSection.classList.add('hidden');
});