import mongoose from "mongoose";

const boutiqueSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  otp: { type: Number },
  phone: { 
    type: String, // Change from Number to String
    required: true, 
    unique: true, 
    match: [/^\+91\d{10}$/, 'Please enter a valid phone number with +91 followed by 10 digits.'] // Regex for Indian phone numbers
  }, // Use bcrypt for encryption
  otpExpiry: { type: Date }, // OTP expiration timestamp
  refreshToken: { type: String },
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
  role:{
    type : String,
    enum : ['admin', 'Boutique', 'User'],
    default : 'Boutique'
  },
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
