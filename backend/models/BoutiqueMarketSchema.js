import mongoose from "mongoose";

const boutiqueSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true }, // Use bcrypt for encryption
  location: {
    address: String,
    latitude: Number,
    longitude: Number,
  },
  catalogue: [
    {
      itemName: [String],
      price: [Number],
      image: String, // URL for item image
    },
  ],
  orders: [
    {
      userId: mongoose.Schema.Types.ObjectId,
      items: [String], // Items ordered
      status: { type: String, default: 'Pending' },
      createdAt: { type: Date, default: Date.now },
    },
  ],
  businessTracker: {
    totalOrders: { type: Number, default: 0 },
    totalRevenue: { type: Number, default: 0 },
  },
  createdAt: { type: Date, default: Date.now },
});

const BoutiqueModel = mongoose.model("Boutique", boutiqueSchema)
export default BoutiqueModel;
