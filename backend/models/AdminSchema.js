import mongoose from 'mongoose';

const adminSchema = new mongoose.Schema({
  username: { 
    type: String, 
    required: true, 
    unique: true 
  },
  phone: { 
    type: String, 
    required: true, 
    unique: true 
  }, // Phone number for authentication
  role: {
    type: String,
    enum: ['admin', 'Boutique', 'User'],
    default: 'admin'
  }, // Determines if the user is an admin, boutique, or user
  otp: { 
    type: String, 
    required: false 
  }, // OTP for login/registration
  otpExpiry: { 
    type: Date, 
    required: false 
  }, // Expiry time for OTP
  created_at: { 
    type: Date, 
    default: Date.now 
  },
  updated_at: { 
    type: Date, 
    default: Date.now 
  }
});

// Create the Admin model based on the schema
const AdminModel = mongoose.model('Admin', adminSchema);

export default AdminModel;
