import mongoose from "mongoose";

const alterationRequestSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  boutiqueId: { type: mongoose.Schema.Types.ObjectId, ref: "Boutique", required: true },
  description: { type: String, default: "" },
  referenceImage: { type: String }, // File path to image
  orderImage: [{ type: String }],
  voiceNote: [{type: String }], // File path to voice note
  status: { type: String, enum: ["Pending", "Reviewed", "In Progress", "Ready for Delivery", "Completed"], default: "Pending" },
  createdAt: { type: Date, default: Date.now },
});

const AlterationRequest = mongoose.model("AlterationRequest", alterationRequestSchema);

export default AlterationRequest;

