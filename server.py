from flask import Flask, render_template, request
from flask_socketio import SocketIO, emit, join_room, leave_room
import random
import string

app = Flask(__name__)
app.config['SECRET_KEY'] = 'secret!'
socketio = SocketIO(app)

rooms = {}

@app.route('/')
def index():
    return render_template('index.html')

def generate_room_id():
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))

@socketio.on('createRoom')
def handle_create_room():
    room_id = generate_room_id()
    rooms[room_id] = {
        'players': [request.sid],
        'words': {},
        'guesses': [],
        'current_turn': 0,
        'game_over': False
    }
    join_room(room_id)
    emit('roomCreated', room_id)

@socketio.on('joinRoom')
def handle_join_room(room_id):
    room = rooms.get(room_id)
    if room and len(room['players']) == 1:
        room['players'].append(request.sid)
        join_room(room_id)
        emit('roomJoined', room_id, broadcast=True, include_self=True)
    else:
        emit('error', 'Room is full or does not exist.')

@socketio.on('submitWord')
def handle_submit_word(data):
    room_id = data['roomId']
    word = data['word'].lower()
    room = rooms.get(room_id)
    
    if room:
        room['words'][request.sid] = word
        emit('updateWords', room['words'], room=room_id)
        
        if len(room['words']) == 2:
            emit('startGame', room=room_id)

@socketio.on('makeGuess')
def handle_make_guess(data):
    room_id = data['roomId']
    guess = data['guess'].lower()
    room = rooms.get(room_id)
    
    if room and not room['game_over']:
        opponent_id = next(id for id in room['players'] if id != request.sid)
        opponent_word = room['words'].get(opponent_id, '')
        
        if guess == opponent_word:
            room['game_over'] = True
            emit('gameOver', {
                'winner': request.sid,
                'words': room['words']
            }, room=room_id)
            return
        
        room['guesses'].append({
            'player': request.sid,
            'guess': guess,
            'result': None
        })
        
        emit('opponentGuess', guess, room=opponent_id)
        emit('guessSent')

@socketio.on('submitEvaluation')
def handle_submit_evaluation(data):
    room_id = data['roomId']
    evaluation = data['evaluation']
    room = rooms.get(room_id)
    
    if room and not room['game_over']:
        if room['guesses']:
            room['guesses'][-1]['result'] = evaluation
            last_guess = room['guesses'][-1]['guess']
            
            emit('guessEvaluated', {
                'guess': last_guess,
                'evaluation': evaluation
            }, room=room_id)
            
            room['current_turn'] = (room['current_turn'] + 1) % 2
            emit('nextTurn', room['players'][room['current_turn']], room=room_id)

@socketio.on('disconnect')
def handle_disconnect():
    for room_id, room in list(rooms.items()):
        if request.sid in room['players']:
            emit('playerDisconnected', room=room_id)
            del rooms[room_id]
            break

if __name__ == '__main__':
    socketio.run(app, debug=True)