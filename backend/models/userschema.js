import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: { type: Number, required: true, unique: true },
  otp: { type: Number, required: true },
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