const express = require('express');
const app = express();
const userRoute = require('./Routes/userRoutes');
const User = require('./Models/User');
const Message = require('./Models/Message');

const rooms = ['general', 'tech', 'finance', 'crypto'];
const cors = require('cors');

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cors());

app.use('/users', userRoute);

require('./connection')

const server = require('http').createServer(app);
const PORT = process.env.PORT || 8080;
const io = require('socket.io')(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
})


app.get('/rooms', (req, res) => {
    res.json(rooms);
})

const getLastMessagesFromRoom = async (room) => {
    let roomMessages = await Message.aggregate([
        {$match: {to: room}},
        {$group: {_id: '$date', messagesByDate: {$push: '$$ROOT'}}}
    ])
    return roomMessages;
}

const sortRoomMessagesByDate = (messages) => {
    return messages.sort((a,b) => {
        let date1 = a._id.split('/');
        let date2 = b._id.split('/');

        date1 = date1[2] + date1[0] + date1[1];
        date2 = date2[2] + date2[0] + date2[1];

        return date1 < date2 ? -1 : 1;
    })
}


io.on('connection', (socket) => {
    socket.on('new-user', async () => {
        const members = await User.find();
        io.emit('new-user', members);
    })

    socket.on('join-room', async(room) => {
        socket.join(room);
        let roomMessages = await getLastMessagesFromRoom(room);
        roomMessages = sortRoomMessagesByDate(roomMessages);
        socket.emit('room-messages', roomMessages);
    })

    socket.on('message-room', async(room, content, sender,time, date) => {
        console.log('new-message', content)
        const newMessage = await Message.create({content, from: sender, time, date, to: room});
        let roomMessages = await getLastMessagesFromRoom(room);
        roomMessages = sortRoomMessagesByDate(roomMessages);

        io.to(room).emit('room-messages', roomMessages);

        socket.broadcast.emit('notifications', room)
    })

    app.delete('/logout', async (req,res) => {
        try {
            const {_id, newMsg} = req.body;
            const user = await User.findById(_id);
            user.status = 'offline';
            user.newMsg = newMsg;
            await user.save();
            const members = await User.find();
            socket.broadcast.emit('new-user', members);
            res.status(200).send();
        } catch(e) {
            console.log(e);
            res.status(400).send();
        }
    })
})



server.listen(PORT, () => {
    console.log('listening to port', PORT);
})