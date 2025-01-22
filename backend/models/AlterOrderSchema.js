import mongoose from "mongoose";
import OrderModel from "./OrderSchema.js";

const altorderSchema = new mongoose.Schema({
    originalOrderId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'order', 
      required: true 
    }, // Reference to the original order
    userId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'User', 
      required: true 
    }, // ID of the user requesting the alteration
    boutiqueId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'Boutique', 
      required: true 
    }, // ID of the boutique handling the alteration
    deliveryStatus: {
      type: String,
      enum: ['Pending', 'Accepted', 'In Progress', 'Ready for Delivery', 'Completed'],
      default: 'Pending',
    },
    alterations: { 
      type: Boolean, 
      default: true 
    }, // Always true for Altorder
    createdAt: { 
      type: Date, 
      default: Date.now 
    },
  });

const AltorderModel = mongoose.model('AltorderModel', altorderSchema);

export default AltorderModel;
