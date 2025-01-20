import mongoose from 'mongoose';

const orderSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  boutiqueId: { type: mongoose.Schema.Types.ObjectId, ref: 'Boutique', required: true },
  pickUp: { type: Boolean },
  dressType: {
    type: String,
    required: true,
    enum: ['Saree Blouse', 'Lehenga', 'Kurta', 'Shirt', 'Gown'], // Predefined dress types
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
    required: true,
    validate: {
      validator: function (measurements) {
        const dressType = this.dressType;
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
  referralImage: { type: String }, // Path to referral image
  location: { type: String, required: true },
  voiceNote: {
    path: { type: String, required: true }, // Path to the uploaded voice note
    transcription: {
      telugu: String,
      hindi: String,
    },
  },
  status: {
    type: String,
    enum: ['Pending', 'Accepted', 'Declined', 'In Progress', 'Ready for Delivery', 'Completed'],
    default: 'Pending',
  },
  createdAt: { type: Date, default: Date.now },
});

// Measurement requirements for dress types
const measurementRequirements = {
  'Saree Blouse': ['chest', 'shoulder', 'waist', 'armLength'],
  Lehenga: ['waist', 'hip', 'length'],
  Kurta: ['chest', 'waist', 'hip', 'shoulder', 'armLength'],
  Shirt: ['chest', 'waist', 'shoulder', 'armLength', 'length'],
  Gown: ['chest', 'waist', 'hip', 'shoulder', 'length', 'armLength'],
};


const OrderModel = mongoose.model("order", orderSchema);
export default OrderModel;
