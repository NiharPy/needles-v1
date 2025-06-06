import mongoose from 'mongoose';

const boutiqueSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },

  // 🔐 OTP and auth fields
  otp: { type: String, default: '' },

  phone: {
    type: String,
    required: true,
    unique: true,
    match: [/^\+91\d{10}$/, 'Please enter a valid phone number with +91 followed by 10 digits.'],
  },

  // 📍 Location with address and coordinates
  location: {
    address: { type: String },
    city: { type: String },
    state: { type: String },
    latitude: { type: Number },
    longitude: { type: Number },
  },

  // 🖼️ Header image for boutique profile
  headerImage: {
    type: String, // Cloudinary image URL
    default: '',
  },

  // 📚 Catalogue of items
  catalogue: [
    {
      itemName: { type: String },
      price: { type: Number },
      image: { type: String }, // Optional: Cloudinary image for the item
      description: { type: String }, // Optional: Item description
    },
  ],

  // 👗 Dress types offered
  dressTypes: [
    {
      type: {
        type: String,
        required: true,
      },
      images: [{ type: String }], // Image URLs for this dress type
      measurementRequirements: [String], // e.g. ["Chest", "Waist", "Length"]
    },
  ],

  // 🧑‍💼 Role (admin/boutique/user)
  role: {
    type: String,
    enum: ['admin', 'Boutique', 'User'],
    default: 'Boutique',
  },

  // 🧾 Orders received by the boutique
  orders: [
    {
      orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
      alterations: { type: Boolean, default: false },
      status: {
        type: String,
        enum: ['Pending', 'Accepted', 'Declined', 'In Progress', 'Ready for Delivery', 'Completed'],
        default: 'Pending',
      },
      createdAt: { type: Date, default: Date.now },
    },
  ],

  // ⭐ Ratings and reviews from users
  ratings: [
    {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      rating: { type: Number, min: 1, max: 5 },
      comment: { type: String },
    },
  ],
  averageRating: { type: Number, default: 0 },
  totalRatings: { type: Number, default: 0 },

  // 📊 Business metrics
  businessTracker: {
    totalOrders: { type: Number, default: 0 },
    totalRevenue: { type: Number, default: 0 },
  },

  // 🔍 Semantic vector for NL search
  embedding: {
    type: [Number],
    required: true,
  },

  // 📅 Timestamps
  createdAt: { type: Date, default: Date.now },
});

const BoutiqueModel = mongoose.model("Boutique", boutiqueSchema);
export default BoutiqueModel;
