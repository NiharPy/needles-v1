import mongoose from 'mongoose';

const measurementRequirements = {
    Blouse: ['Length', 'Upper chest', 'Center chest', 'Shoulder Width', 'Sleeve Length', 'Sleeve Round', 'Middle hand round', 'Front neck height', 'Back neck height', 'Waist loose', 'Front Dart point', 'Full shoulder', 'Armhole Round'],
    KidsFrock: ['Full Length', 'Body Length', 'Bottom Length', 'Chest Round', 'Waist Round', 'Armhole Round', 'Shoulder Width', 'Sleeve Length', 'Sleeve Round', 'Full Shoulder', 'Front Neck height', 'Back Neck Height'],
  };
  
  const ODitemSchema = new mongoose.Schema({
    serialCode: {
      type: String,
      required: true,
    },
    imageUrl: {
      type: String,
      required: true,
    },
  });
  
  const ODorderSchema = new mongoose.Schema({
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User', // Reference to the User model
      required: true,
    },
    ODitems: [ODitemSchema],
    pickUp: { type: Boolean },
    measurements: {
      type: Map, // Map for dynamic key-value pairs
      of: Number,
      required: true,
      validate: {
        validator: function (measurements) {
          const dressType = this.dressType; // Ensure this is properly set
          const requiredMeasurements = measurementRequirements[dressType] || [];
          const providedKeys = Array.from(measurements.keys());
          return requiredMeasurements.every((key) => providedKeys.includes(key));
        },
        message: (props) =>
          `Invalid measurements for dress type "${props.value.dressType}". Required fields: ${measurementRequirements[props.value.dressType].join(
            ', '
          )}`,
      },
    },
    orderStatus: {
      type: String,
      enum: ['Accepted', 'In Progress', 'Completed', 'Delivered'],
      default: 'Accepted', // Default status is Pending
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
  const ODorderModel = mongoose.model('ODOrder', ODorderSchema);
  
 export default ODorderModel;