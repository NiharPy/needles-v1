import { Server } from 'socket.io';
import ChatModel from "../models/Chat.js";


const socketHandler = (server) => {
    const io = new Server(server, {
      cors: { origin: '*', methods: ['GET', 'POST'] },
    });
  
    io.on('connection', (socket) => {
      console.log('New client connected:', socket.id);
  
      // Listen for new chat messages
      socket.on('sendMessage', async (data) => {
        try {
          const { userId, boutiqueId, altOrderId, sender, message, image, voiceNote } = data;
  
          // Save the message to the database
          const chatMessage = await ChatModel.create({
            userId,
            boutiqueId,
            altOrderId,
            sender,
            message,
            image,
            voiceNote,
          });
  
          // Emit the message to both parties
          io.to(userId).emit('receiveMessage', chatMessage);
          io.to(boutiqueId).emit('receiveMessage', chatMessage);
  
          // End session if Boutique sends "Bye"
          if (sender === 'Boutique' && message.toLowerCase() === 'bye') {
            await ChatModel.updateMany({ altOrderId }, { sessionActive: false });
            io.to(userId).emit('sessionEnded', { message: 'Boutique ended the session.' });
            io.to(boutiqueId).emit('sessionEnded', { message: 'You ended the session.' });
          }
        } catch (error) {
          console.error('Error handling message:', error);
        }
      });
  
      // Handle client disconnect
      socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
      });
    });
  };

  export default socketHandler;