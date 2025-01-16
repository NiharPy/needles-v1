import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: {
    type: String,
    required: true,
    unique: true,
    match: [/^\+91\d{10}$/, 'Please enter a valid phone number with +91 followed by 10 digits.'],
  },
  otp : {type : String, required : true},
  address: {
    street: String,
    city: String,
    state: String,
    postalCode: String,
  },
  role: {
    type: String,
    enum: ['admin', 'Boutique', 'User'],
    default: 'User',
  },
  measurements: {
    chest: Number,
    waist: Number,
    hip: Number,
    // Add more measurement fields as needed
  },
  orders: [
    {
      orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' }, // Reference to Order
      itemName: { type: String }, // Linked to order itemName
      status: {
        type: String,
        enum: ['Pending', 'Accepted', 'Declined', 'In Progress', 'Ready for Delivery', 'Completed'],
        default: 'Pending', // Synced with Order status
      },
      paymentStatus: { type: String, default: 'Unpaid' },
      createdAt: { type: Date, default: Date.now },
    },
  ],
  createdAt: { type: Date, default: Date.now },
});


const UserModel = mongoose.model("User", userSchema);
export default UserModel;