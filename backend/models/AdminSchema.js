import mongoose from "mongoose";


const adminSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    role:{
      type : String,
      enum : ['admin', 'Boutique', 'User'],
      default : 'admin'
    }, // Determines if the user is an admin
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
  });
const AdminModel = mongoose.model("Admin", adminSchema)
export default AdminModel;