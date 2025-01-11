import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: { 
    type: String, // Change from Number to String
    required: true, 
    unique: true, 
    match: [/^\+91\d{10}$/, 'Please enter a valid phone number with +91 followed by 10 digits.'] // Regex for Indian phone numbers
  },
  otp: { type: Number },
  otpExpiry: { type: Date }, // OTP expiration timestamp
  refreshToken: { type: String }, // Store the refresh token
  address: {
    street: String,
    city: String,
    state: String,
    postalCode: String,
  },
  role:{
    type : String,
    enum : ['admin', 'Boutique', 'User'],
    default : 'User'
  },
  measurements: {
    chest: Number,
    waist: Number,
    hip: Number,
    // Add more measurement fields as needed
  },
  orders: [
    {
      boutiqueId: mongoose.Schema.Types.ObjectId,
      items: [String], // Items ordered
      status: { type: String, default: 'Pending' }, // e.g., Pending, In Progress, Completed
      paymentStatus: { type: String, default: 'Unpaid' },
      createdAt: { type: Date, default: Date.now },
    },
  ],
  createdAt: { type: Date, default: Date.now },
});

const UserModel = mongoose.model("user", userSchema)
export default UserModel;