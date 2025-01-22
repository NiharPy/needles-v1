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
    flatNumber: { type: String, required: true },
    block: { type: String, required: true },
    street: { type: String, required: true },
    location: {
      lat: { type: Number, required: true },
      lng: { type: Number, required: true },
    },
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
      dressType : {type : String}, // Linked to order itemName
      alterations: { type: Boolean, default: false },
      status: {
        type: String,
        enum: ['Pending', 'Accepted', 'Declined', 'In Progress', 'Ready for Delivery', 'Completed'],
        default: 'Pending', // Synced with Order status
      },
      paymentStatus: { type: String, default: 'Unpaid' },
      createdAt: { type: Date, default: Date.now },
    },
  ],
  ODDorders: [
    {
      orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'ODorder' }, // Reference to ODD Order
      dressType: { type: String }, // Type of dress (Lehenga, SareeBlouse, etc.)
      ODitems: [
        {
          serialCode: { type: String }, // Serial code for selected item
          quantity: { type: Number, default: 1 }, // Quantity of the item
        },
      ],
      status: {
        type: String,
        enum: ['Pending', 'Accepted', 'Declined', 'In Progress', 'Ready for Delivery', 'Completed'],
        default: 'Pending', // Status for ODD order
      },
      specialInstructions: { type: String }, // Any special instructions provided by user
      pickupRequested: { type: Boolean, default: false },
      paymentStatus: { type: String, default: 'Unpaid' },
      createdAt: { type: Date, default: Date.now }, // Timestamp for order creation
    },
  ],
  createdAt: { type: Date, default: Date.now },
});


const UserModel = mongoose.model("User", userSchema);
export default UserModel;