import mongoose from 'mongoose';

const userInteractionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: ['click', 'search', 'view'], required: true },
  content: { type: String, required: true }, // e.g., 'Lehenga', 'Blouse with embroidery'
  timestamp: { type: Date, default: Date.now },
  embedding: {
    type: [Number], // 🔗 Precomputed embedding for this interaction
    required: true,
  },
});

const UserInteraction = mongoose.model('UserInteraction', userInteractionSchema);
export default UserInteraction;