import mongoose from 'mongoose';

const orderSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  boutiqueId: { type: mongoose.Schema.Types.ObjectId, ref: 'Boutique', required: true },
  pickUp: { type: Boolean },
  dressType: {
    type: String,
    required: true, // Predefined dress types
  },
  dressType: {
    type: String,
    required: true,
    validate: {
      validator: async function (value) {
        const boutique = await mongoose.model('Boutique').findById(this.boutiqueId);
        if (!boutique) {
          return false; // Boutique doesn't exist
        }
        // Check if the dressType exists in the boutique's dressTypes
        return boutique.dressTypes.some((type) => type.type === value);
      },
      message: 'Invalid dress type. It does not exist in the boutique’s available dress types.',
    },
  },
  measurements: {
    type: Map, // Map for dynamic key-value pairs
    of: Number,
    required: function () {
      return this.pickUp === false; // Only require measurements when pickUp is false
    },
    validate: {
      validator: async function (measurements) {
        if (!this.pickUp) { // Validate measurements only if pickUp is false
          const boutique = await mongoose.model('Boutique').findById(this.boutiqueId);
          if (!boutique) {
            return false; // Boutique doesn't exist
          }

          const dressType = this.dressType;
          // Find the boutique's specific measurement requirements for the given dress type
          const dressTypeConfig = boutique.dressTypes.find((type) => type.type === dressType);
          if (!dressTypeConfig || !dressTypeConfig.measurementRequirements) {
            return false; // Measurement requirements not found for this dress type
          }

          const requiredMeasurements = dressTypeConfig.measurementRequirements;
          const providedKeys = Array.from(measurements.keys());
          return requiredMeasurements.every((key) => providedKeys.includes(key));
        }
        return true; // If pickUp is true, skip validation
      },
      message: (props) =>
        `Invalid measurements for dress type "${props.value.dressType}". Please provide all required fields.`,
    },
  },
  referralImage: { type: String }, // Path to referral image
  location: { type: String, required: true },
  voiceNote: [{type: String }],
  alterations: { type: Boolean, default: false },
  status: {
    type: String,
    enum: ['Pending', 'Accepted', 'Declined', 'In Progress', 'Ready for Delivery', 'Completed', "Cancelled"],
    default: 'Pending',
  },
  totalAmount: { type: Number, default: 0 },
  bill: {  // Add the bill field to store bill details
    items: {
      type: Map,
      of: Number,
    },
    platformFee: { type: Number, default: 0 },
    deliveryFee: { type: Number, default: 0 },
    gst: { type: Number, default: 0 }, // <-- Add this line
    additionalCost: {
      amount: { type: Number, default: 0 },
      reason: { type: String, default: "" },
    },
    totalAmount: { type: Number, default: 0 },
    status: { type: String, default: "Pending" }, // Could be Pending, Paid, etc.
  },
  createdAt: { type: Date, default: Date.now },
});

// Measurement requirements for dress types


const OrderModel = mongoose.model("order", orderSchema);
export default OrderModel;
