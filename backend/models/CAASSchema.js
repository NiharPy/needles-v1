import mongoose from 'mongoose';

const measurementRequirements = {
  Lehenga: ['Waist', 'Hip', 'Length'],
  SareeBlouse: ['Chest', 'Waist', 'Neck'],
  Kurta: ['Chest', 'Waist', 'Length'],
  Shirt: ['Chest', 'Sleeve', 'Length'],
  Gown: ['Chest', 'Waist', 'Hips', 'Length'],
};

// Define the cutting item schema
const CAASitemSchema = new mongoose.Schema({
  serialCode: {
    type: String,
    required: true,
  },
  type: {
    type: String,
    required: true,
  },
  fabric: {
    type: String,
    required: true,
  },
  cuttingInstructions: {
    type: String,
    required: true,
  },
});

// Define the main order schema for Cutting-As-A-Service
const CAASorderSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User', // Reference to the User model
    required: true,
  },
  CAASitems: [CAASitemSchema], // List of items to be cut
  pickUp: { type: Boolean },
  measurements: {
    type: Map, // Map for dynamic key-value pairs (measurements)
    of: Number,
    required: function () {
      return this.pickUp === false; // Only require measurements when pickUp is false
    },
    validate: {
      validator: async function (measurements) {
        if (!this.pickUp) { // Validate measurements only if pickUp is false
          // Find measurement requirements based on item types and validate the provided measurements
          const requiredMeasurements = Object.values(measurementRequirements).flat();
          const providedKeys = Array.from(measurements.keys());
          return requiredMeasurements.every((key) => providedKeys.includes(key));
        }
        return true; // If pickUp is true, skip validation
      },
      message: (props) => `Invalid measurements. Please provide all required fields.`,
    },
  },
  deliveryStatus: {
    type: String,
    enum: ['Pending', 'On the Way', 'Delivered'],
    default: 'Pending', // Default delivery status
  },
  orderDate: {
    type: Date,
    default: Date.now,
  },
  deliveryDate: {
    type: Date,
    required: true,
    default: function () {
      const now = new Date();
      const cutoffTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 19, 0, 0); // 7:00 PM
      return now <= cutoffTime ? now : new Date(now.setDate(now.getDate() + 1)); // Same day if before 7 PM, next day otherwise
    },
  },
  location: { type: String, required: true },
  specialInstructions: {
    type: String,
    default: '',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Create the model
const CAASorderModel = mongoose.model('CAASOrder', CAASorderSchema);

export default CAASorderModel;
