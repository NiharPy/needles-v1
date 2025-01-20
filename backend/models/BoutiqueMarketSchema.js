import mongoose from 'mongoose';

const boutiqueSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  otp: { type: String, default: '' },
  phone: {
    type: String,
    required: true,
    unique: true,
    match: [/^\+91\d{10}$/, 'Please enter a valid phone number with +91 followed by 10 digits.'],
  },
  location: {
    address: String,
    latitude: Number,
    longitude: Number,
  },
  catalogue: [
    {
      itemName: [String],
      price: [Number],
    },
  ],
  dressTypes: [
    {
      type: {
        type: String,
        required: true,
        enum: ['Saree Blouse', 'Lehenga', 'Kurta', 'Shirt', 'Gown'],
      },
      images: [String], // Array of image URLs for each dress type
    },
  ],
  role: {
    type: String,
    enum: ['admin', 'Boutique', 'User'],
    default: 'Boutique',
  },
  orders: [
    {
      orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
      status: {
        type: String,
        enum: ['Pending', 'Accepted', 'Declined', 'In Progress', 'Ready for Delivery', 'Completed'],
        default: 'Pending',
      },
      createdAt: { type: Date, default: Date.now },
    },
  ],
  ratings: [
    {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      rating: { type: Number, min: 1, max: 5 },
      comment: { type: String },
    },
  ],
  averageRating: { type: Number, default: 0 },
  totalRatings: { type: Number, default: 0 },
  businessTracker: {
    totalOrders: { type: Number, default: 0 },
    totalRevenue: { type: Number, default: 0 },
  },
  createdAt: { type: Date, default: Date.now },
});


const BoutiqueModel = mongoose.model("Boutique", boutiqueSchema)
export default BoutiqueModel;
