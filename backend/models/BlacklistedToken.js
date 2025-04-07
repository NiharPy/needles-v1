import mongoose from "mongoose";

const blacklistedTokenSchema = new mongoose.Schema({
  token: { type: String, required: true },
  expiresAt: { type: Date, required: true },
});

const BlacklistedTokenModel = mongoose.model("BlacklistedToken", blacklistedTokenSchema);


export default BlacklistedTokenModel;
