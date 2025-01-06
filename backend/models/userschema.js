import mongoose from "mongoose";


const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true }, // Use bcrypt for encryption
  address: {
    street: String,
    city: String,
    state: String,
    postalCode: String,
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

module.exports = mongoose.model("user", userSchema)