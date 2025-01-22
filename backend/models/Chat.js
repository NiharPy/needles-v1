import mongoose from "mongoose";

const chatMessageSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  boutiqueId: { type: mongoose.Schema.Types.ObjectId, ref: 'Boutique', required: true },
  altOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true }, // Link to alteration order
  sender: { type: String, enum: ['User', 'Boutique'], required: true },
  message: { type: String }, // Text message
  image: { type: String }, // Path to the image
  voiceNote: { type: String }, // Path to the voice note
  timestamp: { type: Date, default: Date.now },
  sessionActive: { type: Boolean, default: true }, // Tracks if the session is active
});

const ChatModel = mongoose.model('ChatMessage', chatMessageSchema);

export default ChatModel;
