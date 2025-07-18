import BoutiqueModel from '../models/BoutiqueMarketSchema.js';
import mongoose from 'mongoose';
import OrderModel from "../models/OrderSchema.js";
import UserModel from "../models/userschema.js";
import jwt from "jsonwebtoken";
import { sendOTP } from "../utils/otpService.js";
import { v2 as cloudinary } from 'cloudinary';
import { getEmbedding } from '../utils/embedding.js';
import BlacklistedToken from "../models/BlacklistedToken.js";
import openai from "../utils/openai.js"; // axios client with API key
import { cosineSimilarity } from "../utils/embeddingUtils.js"; // helper to compute similarity
import { predefinedHyderabadAreas } from '../constants/areas.js';
import { logUserActivity, getRecentUserEmbeddings} from "../controllers/recommendationController.js"
import axios from "axios";
import fs from 'fs';
import { pipeline,RawImage } from '@xenova/transformers';
import dotenv from 'dotenv';
import { redis } from '../config/redis.js';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { storeImageEmbedding } from '../utils/qdrantClient.js';
import { addDressQueue } from '../queues/addDressQueue.js';
import { getQdrantClient } from '../config/qdrant.js';
import logger from "../utils/logger.js";


const ANALYTICS_BASE_URL = process.env.ANALYTICS_BASE_URL;

dotenv.config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const CreateBoutique = async function (req, res) {
  try {
    const {
      name,
      email,
      password,
      phone,
      location,
      dressTypes,
      catalogue,
      area,
    } = req.body;

    const adminId = req.adminId;

    if (!adminId) {
      logger.warn("CreateBoutique: Missing adminId in request");
      return res.status(401).json({ message: "Admin ID missing from token" });
    }

    if (!name || !password || !email || !location || !phone || !dressTypes) {
      logger.warn("CreateBoutique: Missing required fields", { body: req.body });
      return res.status(400).send("All fields (name, password, email, location, phone, dressTypes) are required");
    }

    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const parsedLocation = typeof location === 'string' ? JSON.parse(location) : location;
    const parsedDressTypes = typeof dressTypes === 'string' ? JSON.parse(dressTypes) : dressTypes;
    const parsedCatalogue = catalogue && typeof catalogue === 'string' ? JSON.parse(catalogue) : [];
    const parsedArea = typeof area === 'string' ? area.trim() : area;

    let headerImageUrl = '';
    if (req.file) {
      const result = await cloudinary.uploader.upload(req.file.path, {
        folder: 'boutique_headers',
      });
      headerImageUrl = result.secure_url;
      logger.info("CreateBoutique: Uploaded header image to Cloudinary");
    }

    const CreatedBoutique = await BoutiqueModel.create({
      adminId,
      name,
      email,
      password: hashedPassword,
      phone,
      location: parsedLocation,
      dressTypes: parsedDressTypes,
      headerImage: headerImageUrl,
      catalogue: parsedCatalogue,
      area: parsedArea,
    });

    logger.info("CreateBoutique: Boutique created in DB", { boutiqueId: CreatedBoutique._id });

    const combinedText = `
      Boutique name: ${name}
      Location: ${parsedLocation?.address || ''}
      Dress types: ${parsedDressTypes?.join(', ')}
      Catalogue: ${parsedCatalogue?.join(', ')}
      Rating: ${CreatedBoutique.rating || 'No rating yet'}
    `;

    const embedding = await getEmbedding(combinedText);
    CreatedBoutique.embedding = embedding;
    await CreatedBoutique.save();

    logger.info("CreateBoutique: Embedding saved for boutique", { boutiqueId: CreatedBoutique._id });

    const responseData = CreatedBoutique.toObject();
    delete responseData.password;

    return res.status(201).json(responseData);

  } catch (error) {
    logger.error("CreateBoutique: Error occurred", { error: error.stack || error });

    if (error.name === 'ValidationError') {
      return res.status(422).json({ error: error.message, details: error.errors });
    }

    return res.status(500).send("An unexpected error occurred");
  }
};

export const updateBoutiqueEmbedding = async (boutiqueId) => {
  try {
    logger.info("updateBoutiqueEmbedding: Started", { boutiqueId });

    const boutique = await BoutiqueModel.findById(boutiqueId).lean();
    if (!boutique) {
      logger.warn("updateBoutiqueEmbedding: Boutique not found", { boutiqueId });
      throw new Error("Boutique not found");
    }

    const combinedText = `
      Boutique name: ${boutique.name}
      Location: ${boutique.location?.address || ''}
      Dress types: ${boutique.dressTypes?.join(', ') || ''}
      Catalogue: ${boutique.catalogue?.join(', ') || ''}
      Rating: ${boutique.rating || 'No rating yet'}
    `;

    const embedding = await getEmbedding(combinedText);
    await BoutiqueModel.findByIdAndUpdate(boutiqueId, { embedding });

    logger.info("updateBoutiqueEmbedding: Embedding updated successfully", { boutiqueId });
  } catch (error) {
    logger.error("updateBoutiqueEmbedding: Error occurred", { boutiqueId, error: error.stack || error });
    throw error;
  }
};

export const addHeaderImage = async (req, res) => {
  try {
    const boutiqueId = req.boutiqueId; // ⬅️ Set by auth middleware
    logger.info("addHeaderImage: Request received", { boutiqueId });

    const boutique = await BoutiqueModel.findById(boutiqueId);
    if (!boutique) {
      logger.warn("addHeaderImage: Boutique not found", { boutiqueId });
      return res.status(404).json({ message: "Boutique not found." });
    }

    const uploadedImages = req.files?.images || [];

    if (uploadedImages.length === 0) {
      logger.warn("addHeaderImage: No images uploaded", { boutiqueId });
      return res.status(400).json({ message: "At least one image must be uploaded." });
    }

    const currentCount = boutique.headerImage.length;
    const remainingSlots = 5 - currentCount;

    if (uploadedImages.length > remainingSlots) {
      logger.warn("addHeaderImage: Upload exceeds slot limit", {
        boutiqueId,
        uploadedCount: uploadedImages.length,
        remainingSlots,
      });
      return res.status(400).json({
        message: `You can only upload ${remainingSlots} more image(s).`,
      });
    }

    uploadedImages.forEach((file) => {
      boutique.headerImage.push(file.path);
    });

    await boutique.save();

    logger.info("addHeaderImage: Header images uploaded successfully", {
      boutiqueId,
      totalImages: boutique.headerImage.length,
    });

    res.status(200).json({
      message: "Header images uploaded successfully.",
      headerImage: boutique.headerImage,
    });
  } catch (error) {
    logger.error("addHeaderImage: Error uploading header images", {
      boutiqueId: req.boutiqueId,
      error: error.stack || error,
    });
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const deleteAllHeaderImages = async (req, res) => {
  try {
    const boutiqueId = req.boutiqueId;
    logger.info("deleteAllHeaderImages: Request received", { boutiqueId });

    const boutique = await BoutiqueModel.findById(boutiqueId);
    if (!boutique) {
      logger.warn("deleteAllHeaderImages: Boutique not found", { boutiqueId });
      return res.status(404).json({ message: "Boutique not found" });
    }

    boutique.headerImage = [];
    await boutique.save();

    logger.info("deleteAllHeaderImages: Header images cleared", { boutiqueId });

    res.status(200).json({
      message: "All header images deleted successfully",
      headerImage: boutique.headerImage,
    });
  } catch (error) {
    logger.error("deleteAllHeaderImages: Failed to delete header images", {
      boutiqueId: req.boutiqueId,
      error: error.stack || error.message || error,
    });
    res.status(500).json({ message: "Internal server error" });
  }
};

export const deleteHeaderImage = async (req, res) => {
  try {
    const boutiqueId = req.boutiqueId;
    const imageUrl = req.body.imageUrl;

    logger.info("deleteHeaderImage: Request received", { boutiqueId, imageUrl });

    if (!imageUrl) {
      logger.warn("deleteHeaderImage: Missing image URL", { boutiqueId });
      return res.status(400).json({ message: "Image URL is required for deletion." });
    }

    const boutique = await BoutiqueModel.findById(boutiqueId);
    if (!boutique) {
      logger.warn("deleteHeaderImage: Boutique not found", { boutiqueId });
      return res.status(404).json({ message: "Boutique not found." });
    }

    const index = boutique.headerImage.indexOf(imageUrl);
    if (index === -1) {
      logger.warn("deleteHeaderImage: Image URL not found in boutique record", { boutiqueId, imageUrl });
      return res.status(404).json({ message: "Image URL not found in header images." });
    }

    boutique.headerImage.splice(index, 1);
    await boutique.save();

    logger.info("deleteHeaderImage: Header image deleted successfully", { boutiqueId, deletedImage: imageUrl });

    res.status(200).json({
      message: "Header image deleted successfully.",
      headerImage: boutique.headerImage,
    });
  } catch (error) {
    logger.error("deleteHeaderImage: Error deleting header image", {
      boutiqueId: req.boutiqueId,
      imageUrl: req.body.imageUrl,
      error: error.stack || error,
    });
    res.status(500).json({ message: "Server error", error: error.message });
  }
};


export const updateBoutiqueDetails = async (req, res) => {
  try {
    const boutiqueId = req.boutiqueId;
    const { name, location, area } = req.body;

    logger.info("updateBoutiqueDetails: Update request received", { boutiqueId, body: req.body });

    if (!mongoose.Types.ObjectId.isValid(boutiqueId)) {
      logger.warn("updateBoutiqueDetails: Invalid boutique ID", { boutiqueId });
      return res.status(400).json({ message: "Invalid boutique ID" });
    }

    const updateFields = {};

    if (name) updateFields.name = name;

    if (area) {
      const trimmedArea = area.trim();
      if (!predefinedHyderabadAreas.includes(trimmedArea)) {
        logger.warn("updateBoutiqueDetails: Invalid area", {
          boutiqueId,
          area: trimmedArea,
          allowedAreas: predefinedHyderabadAreas,
        });
        return res.status(400).json({
          message: `Invalid area. Choose from predefined Hyderabad areas only.`,
          allowedAreas: predefinedHyderabadAreas,
        });
      }
      updateFields.area = trimmedArea;
    }

    if (location) {
      if (location.address) updateFields['location.address'] = location.address;
      if (location.city) updateFields['location.city'] = location.city;
      if (location.state) updateFields['location.state'] = location.state;
      if (location.latitude) updateFields['location.latitude'] = location.latitude;
      if (location.longitude) updateFields['location.longitude'] = location.longitude;
    }

    if (Object.keys(updateFields).length === 0) {
      logger.warn("updateBoutiqueDetails: No valid fields provided", { boutiqueId });
      return res.status(400).json({ message: "No valid fields provided to update" });
    }

    const updatedBoutique = await BoutiqueModel.findByIdAndUpdate(
      boutiqueId,
      { $set: updateFields },
      { new: true }
    );

    if (!updatedBoutique) {
      logger.warn("updateBoutiqueDetails: Boutique not found", { boutiqueId });
      return res.status(404).json({ message: "Boutique not found" });
    }

    await updateBoutiqueEmbedding(boutiqueId);
    logger.info("updateBoutiqueDetails: Boutique updated and embedding refreshed", {
      boutiqueId,
      updatedFields: updateFields,
    });

    res.status(200).json({
      message: "Boutique details updated successfully",
      boutique: updatedBoutique,
    });

  } catch (error) {
    logger.error("updateBoutiqueDetails: Error updating boutique", {
      boutiqueId,
      error: error.stack || error.message || error,
    });
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const requestPhoneNumberChange = async (req, res) => {
  try {
    const boutiqueId = req.boutiqueId;
    const { newPhone } = req.body;

    logger.info("requestPhoneNumberChange: Request received", { boutiqueId, newPhone });

    if (!newPhone || !/^\+91\d{10}$/.test(newPhone)) {
      logger.warn("requestPhoneNumberChange: Invalid phone number format", { boutiqueId, newPhone });
      return res.status(400).json({ message: "Invalid new phone number format" });
    }

    const boutique = await BoutiqueModel.findById(boutiqueId);
    if (!boutique) {
      logger.warn("requestPhoneNumberChange: Boutique not found", { boutiqueId });
      return res.status(404).json({ message: "Boutique not found" });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    boutique.otp = otp;
    await boutique.save();

    logger.info("requestPhoneNumberChange: OTP generated and saved", {
      boutiqueId,
      oldPhone: boutique.phone,
      otp,
    });

    // ⛔ Simulated SMS log
    console.log(`OTP for boutique (${boutique.phone}) to change phone: ${otp}`);

    res.status(200).json({
      message: "OTP generated and logged for testing. Use it to confirm phone update.",
    });
  } catch (error) {
    logger.error("requestPhoneNumberChange: Failed to generate OTP", {
      boutiqueId: req.boutiqueId,
      error: error.stack || error.message || error,
    });
    res.status(500).json({ message: "Failed to initiate phone update" });
  }
};

export const confirmPhoneNumberChange = async (req, res) => {
  try {
    const boutiqueId = req.boutiqueId;
    const { otp, newPhone } = req.body;

    logger.info("confirmPhoneNumberChange: Request received", { boutiqueId, newPhone });

    if (!otp || !newPhone || !/^\+91\d{10}$/.test(newPhone)) {
      logger.warn("confirmPhoneNumberChange: Missing or invalid input", { boutiqueId, otp, newPhone });
      return res.status(400).json({ message: "OTP and valid new phone number are required" });
    }

    const boutique = await BoutiqueModel.findById(boutiqueId);
    if (!boutique) {
      logger.warn("confirmPhoneNumberChange: Boutique not found", { boutiqueId });
      return res.status(404).json({ message: "Boutique not found" });
    }

    if (boutique.otp !== otp) {
      logger.warn("confirmPhoneNumberChange: Invalid OTP", { boutiqueId, providedOtp: otp });
      return res.status(400).json({ message: "Invalid OTP" });
    }

    const alreadyExists = await BoutiqueModel.findOne({ phone: newPhone });
    if (alreadyExists) {
      logger.warn("confirmPhoneNumberChange: Phone already registered", { boutiqueId, newPhone });
      return res.status(400).json({ message: "This phone number is already registered" });
    }

    boutique.phone = newPhone;
    boutique.otp = ''; // Clear OTP
    await boutique.save();

    logger.info("confirmPhoneNumberChange: Phone number updated", { boutiqueId, newPhone });

    res.status(200).json({ message: "Phone number updated successfully" });
  } catch (error) {
    logger.error("confirmPhoneNumberChange: Error occurred", {
      boutiqueId: req.boutiqueId,
      error: error.stack || error.message || error,
    });
    res.status(500).json({ message: "Could not update phone number" });
  }
};

export const changePassword = async (req, res) => {
  try {
    const boutiqueId = req.boutiqueId;
    const { oldPassword, newPassword } = req.body;

    logger.info("changePassword: Request received", { boutiqueId });

    if (!oldPassword || !newPassword) {
      logger.warn("changePassword: Missing passwords", { boutiqueId });
      return res.status(400).json({ message: "Old and new passwords are required" });
    }

    const boutique = await BoutiqueModel.findById(boutiqueId);
    if (!boutique) {
      logger.warn("changePassword: Boutique not found", { boutiqueId });
      return res.status(404).json({ message: "Boutique not found" });
    }

    const isMatch = await bcrypt.compare(oldPassword, boutique.password);
    if (!isMatch) {
      logger.warn("changePassword: Incorrect old password", { boutiqueId });
      return res.status(401).json({ message: "Incorrect old password" });
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, 12);
    boutique.password = hashedNewPassword;
    await boutique.save();

    logger.info("changePassword: Password changed successfully", { boutiqueId });

    res.status(200).json({ message: "Password changed successfully" });
  } catch (error) {
    logger.error("changePassword: Error during password change", {
      boutiqueId: req.boutiqueId,
      error: error.stack || error.message || error,
    });
    res.status(500).json({ message: "Server error while changing password" });
  }
};

const Boutiquelogin = async function (req, res) {
  try {
    const { name, password, phone } = req.body;

    logger.info("Boutiquelogin: Login attempt", { phone });

    if (!name || !password || !phone) {
      logger.warn("Boutiquelogin: Missing credentials", { phone });
      return res.status(400).json({ message: "name, password, phone are required." });
    }

    const Boutique = await BoutiqueModel.findOne({ phone });
    if (!Boutique) {
      logger.warn("Boutiquelogin: Boutique not found", { phone });
      return res.status(404).json({ message: "Boutique Account not found." });
    }

    if (Boutique.name !== name) {
      logger.warn("Boutiquelogin: Invalid name", { boutiqueId: Boutique._id, phone });
      return res.status(401).json({ message: "Invalid credentials." });
    }

    const isValidPassword = await bcrypt.compare(password, Boutique.password);
    if (!isValidPassword) {
      logger.warn("Boutiquelogin: Invalid password", { boutiqueId: Boutique._id, phone });
      return res.status(401).json({ message: "Invalid credentials." });
    }

    const otp = Math.floor(100000 + Math.random() * 900000);
    const OTP_EXPIRATION_TIME = 1; // in minutes

    Boutique.otp = otp;
    Boutique.otpExpiry = Date.now() + OTP_EXPIRATION_TIME * 60 * 1000;
    await Boutique.save();

    logger.info("Boutiquelogin: OTP generated and saved", { boutiqueId: Boutique._id, phone });

    // Respond with OTP only in development
    res.status(200).json({
      message: "OTP generated. Please verify to complete login.",
      switchToOTPPage: true,
      boutiqueUserId: Boutique._id,
      ...(process.env.NODE_ENV === 'development' && { otp })
    });
  } catch (error) {
    logger.error("Boutiquelogin: Login error", {
      error: error.stack || error.message,
      requestBody: req.body
    });
    res.status(500).json({ message: "An unexpected error occurred during login." });
  }
};

const boutiquesData = async function (req, res) {
  try {
    const boutiqueId = req.user.userId; // From JWT via authMiddleware

    logger.info("boutiquesData: Fetch request received", { boutiqueId });

    const boutique = await BoutiqueModel.findById(
      boutiqueId,
      'name location phone headerImage area' // include 'area'
    );

    if (!boutique) {
      logger.warn("boutiquesData: Boutique not found", { boutiqueId });
      return res.status(404).json({
        success: false,
        message: "Boutique not found",
      });
    }

    logger.info("boutiquesData: Boutique fetched successfully", { boutiqueId });

    res.status(200).json({
      success: true,
      message: "Boutique fetched successfully",
      data: boutique,
    });
  } catch (error) {
    logger.error("boutiquesData: Error fetching boutique", {
      boutiqueId: req.user?.userId,
      error: error.stack || error.message || error,
    });

    res.status(500).json({
      success: false,
      message: "Server error. Unable to fetch boutique.",
    });
  }
};


const verifyOtpFB = async (req, res) => {
  try {
    const { phone, otp } = req.body;

    logger.info("verifyOtpFB: OTP verification requested", { phone });

    if (!phone || !otp) {
      logger.warn("verifyOtpFB: Missing phone or OTP", { phone });
      return res.status(400).json({ message: "Phone number and OTP are required." });
    }

    const user = await BoutiqueModel.findOne({ phone });

    if (!user) {
      logger.warn("verifyOtpFB: Boutique not found", { phone });
      return res.status(404).json({ message: "Boutique account not found." });
    }

    if (!user.otp) {
      logger.warn("verifyOtpFB: OTP is missing or expired", { phone });
      return res.status(400).json({ message: "OTP has expired or is invalid." });
    }

    if (otp !== user.otp) {
      logger.warn("verifyOtpFB: Incorrect OTP", { phone, enteredOtp: otp });
      return res.status(400).json({ message: "Invalid OTP. Please try again." });
    }

    const accessToken = jwt.sign(
      { userId: user._id, name: user.name, role: user.role },
      process.env.ACCESS_TOKEN_SECRET,
      { expiresIn: "15m" }
    );

    const refreshToken = jwt.sign(
      { userId: user._id },
      process.env.REFRESH_TOKEN_SECRET,
      { expiresIn: "30d" }
    );

    user.refreshToken = refreshToken;
    user.otp = null;
    user.otpExpiry = null;
    await user.save();

    logger.info("verifyOtpFB: OTP verified and tokens issued", {
      boutiqueId: user._id,
    });

    // Send HTTP-only cookies
    res.cookie("accessToken", accessToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'None',
      domain: 'needles-v1.onrender.com',
      maxAge: 15 * 60 * 1000,
    });

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'None',
      domain: 'needles-v1.onrender.com',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    res.status(200).json({
      message: "OTP verified. User logged in.",
      user: {
        _id: user._id,
        name: user.name,
        role: user.role,
      },
      accessToken, // ⚠️ OK in response (optional)
    });
  } catch (error) {
    logger.error("verifyOtpFB: Internal server error", {
      phone: req.body?.phone,
      error: error.stack || error.message || error,
    });
    res.status(500).json({ message: "Internal server error." });
  }
};


const boutiqueSearch = async function (req, res) {
  try {
    const userId = req.userId;
    if (!userId) {
      logger.warn("boutiqueSearch: Unauthorized access");
      return res.status(401).json({ message: "Unauthorized access." });
    }

    const { query } = req.query;
    if (!query || typeof query !== "string") {
      logger.warn("boutiqueSearch: Missing or invalid query", { userId });
      return res.status(400).json({ message: "Query is required for boutique search." });
    }

    const originalWordCount = query.split(/\s+/).filter(Boolean).length;

    const parseQuery = (query) => {
      const ratingRegex = /(at least|above|under|less than|more than)?\s*(\d(\.\d+)?)(\s*stars?| star rating)?/i;
      const areaRegex = /\bin\s([a-zA-Z\s]+)/i;

      const ratingMatch = query.match(ratingRegex);
      const areaMatch = query.match(areaRegex);

      let ratingValue = null;
      let ratingOp = "gte";

      if (ratingMatch) {
        const phrase = ratingMatch[1]?.toLowerCase();
        const value = parseFloat(ratingMatch[2]);
        if (!isNaN(value)) {
          ratingValue = value;
          if (phrase?.includes("above") || phrase?.includes("more")) ratingOp = "gt";
          if (phrase?.includes("under") || phrase?.includes("less")) ratingOp = "lt";
          if (phrase?.includes("at least")) ratingOp = "gte";
        }
      }

      const areaValue = areaMatch ? areaMatch[1].trim() : null;

      let filteredQuery = query;
      if (ratingMatch) filteredQuery = filteredQuery.replace(ratingMatch[0], '');
      if (areaMatch && areaMatch.index > 10) {
        filteredQuery = filteredQuery.replace(areaMatch[0], '');
      }

      return {
        cleanedQuery: filteredQuery.trim(),
        ratingValue,
        ratingOp,
        areaValue,
      };
    };

    const filterMatchingDressTypes = (dressTypes, cleanedQuery) => {
      if (!Array.isArray(dressTypes)) return [];
      const lowerQuery = cleanedQuery.toLowerCase();
      return dressTypes.filter(d =>
        typeof d?.type === "string" && d.type.toLowerCase().includes(lowerQuery)
      );
    };

    const { cleanedQuery, ratingValue, ratingOp, areaValue } = parseQuery(query);

    if (!cleanedQuery && !ratingValue && !areaValue) {
      logger.warn("boutiqueSearch: Query too vague", { userId, originalQuery: query });
      return res.status(400).json({
        message: "Query too vague. Please provide a dress type, rating, or location.",
        results: [],
      });
    }

    if (
      (!cleanedQuery || cleanedQuery.toLowerCase() === "show boutiques") &&
      areaValue &&
      !ratingValue
    ) {
      const areaOnlyResults = await BoutiqueModel.find({
        area: { $regex: areaValue, $options: "i" },
      })
        .limit(10)
        .select("name area averageRating dressTypes.type dressTypes.images");

      logger.info("boutiqueSearch: Area-only fallback", {
        userId, areaValue, count: areaOnlyResults.length,
      });

      return res.status(200).json({
        message: "Area-only search (fallback)",
        results: areaOnlyResults.map(b => ({
          ...b.toObject(),
          dressTypes: b.dressTypes,
        })),
      });
    }

    if (originalWordCount <= 2) {
      const keywordFallback = await BoutiqueModel.find({
        $or: [
          { name: { $regex: cleanedQuery, $options: "i" } },
          { area: { $regex: cleanedQuery, $options: "i" } },
          { "catalogue.itemName": { $regex: cleanedQuery, $options: "i" } },
          { "dressTypes.type": { $regex: cleanedQuery, $options: "i" } },
        ],
        ...(areaValue && { area: { $regex: areaValue, $options: "i" } }),
        ...(ratingValue && { averageRating: { [`$${ratingOp}`]: ratingValue } }),
      })
        .limit(5)
        .select("name area averageRating dressTypes.type dressTypes.images");

      logger.info("boutiqueSearch: Keyword-based fallback", {
        userId, cleanedQuery, count: keywordFallback.length,
      });

      return res.status(200).json({
        message: "Short query keyword-based search",
        results: keywordFallback.map(b => ({
          ...b.toObject(),
          dressTypes: filterMatchingDressTypes(b.dressTypes, cleanedQuery),
        })),
      });
    }

    // 🧠 Semantic embedding
    let queryVector;
    try {
      logger.info("boutiqueSearch: Generating embedding vector", { userId, cleanedQuery });
      queryVector = await getEmbedding(cleanedQuery);
    } catch (err) {
      logger.error("boutiqueSearch: Embedding generation failed", {
        userId,
        error: err.message,
      });
      return res.status(500).json({ message: "Failed to generate semantic embedding." });
    }

    try {
      await logUserActivity(userId, "search", cleanedQuery, queryVector);
    } catch (logErr) {
      logger.warn("boutiqueSearch: Activity logging failed", {
        userId,
        error: logErr.message,
      });
    }

    const mustFilters = [];
    if (ratingValue) {
      mustFilters.push({
        range: {
          path: "averageRating",
          [ratingOp]: ratingValue,
        },
      });
    }
    if (areaValue) {
      mustFilters.push({
        text: {
          path: "area",
          query: areaValue,
        },
      });
    }

    const knnStage = {
      $search: {
        knnBeta: {
          path: "embedding",
          vector: queryVector,
          k: 20,
          ...(mustFilters.length > 0
            ? {
                filter: {
                  compound: {
                    must: mustFilters,
                  },
                },
              }
            : {}),
        },
      },
    };

    const pipeline = [
      knnStage,
      {
        $project: {
          name: 1,
          area: 1,
          averageRating: 1,
          "dressTypes.type": 1,
          "dressTypes.images": 1,
          score: { $meta: "searchScore" },
        },
      },
      { $sort: { averageRating: -1, score: -1 } },
      { $limit: 10 },
    ];

    const semanticResults = await BoutiqueModel.aggregate(pipeline);

    if (!semanticResults.length) {
      logger.info("boutiqueSearch: No semantic results found", { userId });
      return res.status(200).json({
        message: "No semantic results found.",
        results: [],
      });
    }

    logger.info("boutiqueSearch: Semantic search successful", {
      userId,
      resultCount: semanticResults.length,
      cleanedQuery,
    });

    return res.status(200).json({
      message: "Semantic search successful",
      results: semanticResults.map(b => ({
        ...b,
        dressTypes: filterMatchingDressTypes(b.dressTypes, cleanedQuery),
      })),
    });
  } catch (error) {
    logger.error("boutiqueSearch: Unhandled server error", {
      userId: req.userId,
      error: error.stack || error.message,
    });
    return res.status(500).json({
      message: "Server error. Could not complete boutique search.",
      error: error.message,
    });
  }
};



const viewBoutiqueDetails = async (req, res) => {
  try {
    const { boutiqueId } = req.params;

    // ✅ Step 1: Validate the boutique ID
    if (!mongoose.Types.ObjectId.isValid(boutiqueId)) {
      logger.warn("viewBoutiqueDetails: Invalid boutique ID", { boutiqueId });
      return res.status(400).json({ message: "Invalid boutique ID." });
    }

    const cacheKey = `boutique:${boutiqueId}`;

    // ✅ Step 2: Check Redis cache
    const cached = await redis.get(cacheKey);
    if (cached) {
      try {
        const boutiqueFromCache = JSON.parse(cached);
        logger.info("viewBoutiqueDetails: Cache hit", {
          boutiqueId,
          viewer: req.userId || 'guest',
        });

        return res.status(200).json({ boutique: boutiqueFromCache });
      } catch (err) {
        logger.warn("viewBoutiqueDetails: Corrupted cache, deleting", {
          boutiqueId,
          error: err.message,
        });
        await redis.del(cacheKey);
      }
    } else {
      logger.info("viewBoutiqueDetails: Cache miss", {
        boutiqueId,
        viewer: req.userId || 'guest',
      });
    }

    // ✅ Step 3: Fetch from MongoDB
    const boutique = await BoutiqueModel.findById(boutiqueId).lean();
    if (!boutique) {
      logger.warn("viewBoutiqueDetails: Boutique not found", { boutiqueId });
      return res.status(404).json({ message: "Boutique not found." });
    }

    // ✅ Step 4: Cache in Redis (3-minute TTL)
    await redis.set(cacheKey, JSON.stringify(boutique), { ex: 180 });

    logger.info("viewBoutiqueDetails: Boutique data served from DB", {
      boutiqueId,
      viewer: req.userId || 'guest',
    });

    // ✅ Step 5: Return response
    return res.status(200).json({ boutique });
  } catch (error) {
    logger.error("viewBoutiqueDetails: Internal error", {
      boutiqueId: req.params?.boutiqueId,
      error: error.stack || error.message,
    });

    return res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
};



const addItemToCatalogue = async (req, res) => {
  try {
    const { newItems } = req.body;
    const boutiqueId = req.boutiqueId;

    if (!boutiqueId || !newItems || !Array.isArray(newItems)) {
      logger.warn("addItemToCatalogue: Invalid input", {
        boutiqueId,
        received: req.body,
      });
      return res.status(400).json({
        message: "Boutique ID and valid newItems array are required.",
      });
    }

    const boutique = await BoutiqueModel.findById(boutiqueId);
    if (!boutique) {
      logger.warn("addItemToCatalogue: Boutique not found", { boutiqueId });
      return res.status(404).json({ message: "Boutique not found." });
    }

    newItems.forEach((item) => {
      const itemName = Array.isArray(item.itemName) ? item.itemName : [String(item.itemName)];
      const price = Array.isArray(item.price) ? item.price.map(Number) : [Number(item.price)];

      if (itemName[0] && price[0]) {
        boutique.catalogue.push({ itemName, price });
      } else {
        logger.warn("addItemToCatalogue: Invalid item skipped", { item });
      }
    });

    await boutique.save();

    logger.info("addItemToCatalogue: Items added successfully", {
      boutiqueId,
      addedItems: newItems.length,
    });

    res.status(200).json({
      message: "Items added to the catalogue successfully.",
      updatedCatalogue: boutique.catalogue,
    });
  } catch (error) {
    logger.error("addItemToCatalogue: Internal error", {
      boutiqueId: req.boutiqueId,
      error: error.stack || error.message,
    });
    res.status(500).json({ message: "Server error. Please try again." });
  }
};

const getBoutiqueCatalogue = async (req, res) => {
  try {
    const boutiqueId = req.boutiqueId;

    const boutique = await BoutiqueModel.findById(boutiqueId).select("name catalogue -_id");

    if (!boutique) {
      logger.warn("getBoutiqueCatalogue: Boutique not found", { boutiqueId });
      return res.status(404).json({ message: "Boutique not found" });
    }

    logger.info("getBoutiqueCatalogue: Catalogue retrieved", {
      boutiqueId,
      catalogueSize: boutique.catalogue.length,
    });

    res.status(200).json({
      message: "Catalogue retrieved successfully",
      boutiqueName: boutique.name,
      catalogue: boutique.catalogue.map(item => ({
        itemName: item.itemName,
        price: item.price,
      })),
    });
  } catch (error) {
    logger.error("getBoutiqueCatalogue: Server error", {
      boutiqueId: req.boutiqueId,
      error: error.stack || error.message,
    });
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const getBoutiqueCatalogueFU = async (req, res) => {
  try {
    const { boutiqueId } = req.params;
    const userId = req.userId;

    if (!mongoose.Types.ObjectId.isValid(boutiqueId)) {
      logger.warn("getBoutiqueCatalogueFU: Invalid boutique ID", { boutiqueId, userId });
      return res.status(400).json({ message: "Invalid boutique ID." });
    }

    const cacheKey = `catalogue:${boutiqueId}`;

    const cached = await redis.get(cacheKey);
    if (cached) {
      logger.info("getBoutiqueCatalogueFU: Cache hit", { boutiqueId, userId });
      return res.status(200).json({
        message: "Catalogue retrieved successfully (cached)",
        userId,
        ...JSON.parse(cached),
      });
    }

    const boutique = await BoutiqueModel.findById(boutiqueId).select("name catalogue");
    if (!boutique) {
      logger.warn("getBoutiqueCatalogueFU: Boutique not found", { boutiqueId, userId });
      return res.status(404).json({ message: "Boutique not found." });
    }

    const responseData = {
      boutiqueName: boutique.name,
      catalogue: boutique.catalogue.map(item => ({
        itemName: item.itemName,
        price: item.price,
      })),
    };

    await redis.set(cacheKey, JSON.stringify(responseData), { ex: 1800 });

    logger.info("getBoutiqueCatalogueFU: Catalogue fetched and cached", {
      boutiqueId,
      userId,
      itemCount: boutique.catalogue.length,
    });

    res.status(200).json({
      message: "Catalogue retrieved successfully",
      userId,
      ...responseData,
    });
  } catch (error) {
    logger.error("getBoutiqueCatalogueFU: Server error", {
      boutiqueId: req.params?.boutiqueId,
      userId: req.userId,
      error: error.stack || error.message,
    });
    res.status(500).json({ message: "Server error", error: error.message });
  }
};


const deleteItemFromCatalogue = async (req, res) => {
  try {
    const { itemNames } = req.body;
    const boutiqueId = req.boutiqueId;

    if (!boutiqueId || !itemNames || !Array.isArray(itemNames)) {
      logger.warn("deleteItemFromCatalogue: Invalid request body", {
        boutiqueId,
        itemNames,
      });
      return res.status(400).json({
        message: "Boutique ID and a valid array of itemNames are required.",
      });
    }

    const boutique = await BoutiqueModel.findById(boutiqueId);
    if (!boutique) {
      logger.warn("deleteItemFromCatalogue: Boutique not found", { boutiqueId });
      return res.status(404).json({ message: "Boutique not found." });
    }

    const originalLength = boutique.catalogue.length;

    // Filter out matching names from each item
    boutique.catalogue.forEach((item) => {
      item.itemName = item.itemName.filter(
        (name) => !itemNames.includes(name)
      );
    });

    // Remove empty catalogue items
    boutique.catalogue = boutique.catalogue.filter(
      (item) => item.itemName.length > 0
    );

    await boutique.save();

    logger.info("deleteItemFromCatalogue: Items deleted", {
      boutiqueId,
      deletedItems: itemNames,
      updatedCatalogueSize: boutique.catalogue.length,
      originalCatalogueSize: originalLength,
    });

    res.status(200).json({
      message: "Items removed from the catalogue successfully.",
      updatedCatalogue: boutique.catalogue,
    });
  } catch (error) {
    logger.error("deleteItemFromCatalogue: Server error", {
      boutiqueId: req.boutiqueId,
      error: error.stack || error.message,
    });
    res.status(500).json({ message: "Server error. Please try again." });
  }
};

const getRecommendedBoutiques = async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) {
      logger.warn("Unauthorized access attempt to getRecommendedBoutiques");
      return res.status(401).json({ message: "Unauthorized access." });
    }

    const redisKey = `recommended-boutiques:${userId}`;
    const cached = await redis.get(redisKey);

    if (cached) {
      const parsed = typeof cached === "string" ? JSON.parse(cached) : cached;
      const lastViewed = (await getRecentUserEmbeddings(userId, "view", 1))?.[0]?.timestamp || 0;
      const cacheTime = parsed._cachedAt || 0;

      if (cacheTime >= lastViewed) {
        logger.info(`Cache hit for recommended boutiques [userId=${userId}]`);
        return res.status(200).json({
          message: "Recommended boutiques fetched from cache.",
          recommendedBoutiques: parsed.boutiques,
        });
      }
    }

    const user = await UserModel.findById(userId).lean();
    if (!user?.address?.location?.lat || !user?.address?.location?.lng) {
      logger.warn(`Missing location for user [userId=${userId}]`);
      return res.status(400).json({ message: "User location is missing." });
    }

    const userLoc = `${user.address.location.lat},${user.address.location.lng}`;

    const allBoutiques = await BoutiqueModel.find()
      .select("name area dressTypes averageRating ratings headerImage location embedding")
      .lean();

    const boutiquesWithCoords = allBoutiques.filter(
      b => b.location?.latitude && b.location?.longitude
    );

    if (boutiquesWithCoords.length === 0) {
      logger.warn("No boutiques with valid coordinates found");
      return res.status(404).json({ message: "No boutiques with valid coordinates." });
    }

    const destinations = boutiquesWithCoords
      .map(b => `${b.location.latitude},${b.location.longitude}`)
      .join("|");

    const distanceRes = await axios.get("https://maps.googleapis.com/maps/api/distancematrix/json", {
      params: {
        origins: userLoc,
        destinations,
        key: GOOGLE_DISTANCE_MATRIX_KEY,
        units: "metric",
      },
    });

    const distances = distanceRes.data.rows[0]?.elements;
    if (!distances || distances.length !== boutiquesWithCoords.length) {
      logger.error("Mismatch or failure in Google Maps distance matrix API response");
      return res.status(500).json({ message: "Failed to fetch distance data from Google Maps." });
    }

    const scored = boutiquesWithCoords.map((b, i) => {
      const distanceKm = distances[i]?.distance?.value / 1000 || 100;
      const ratingScore = b.averageRating || 0;
      const distanceScore = distanceKm > 30 ? 0 : 1 - distanceKm / 30;
      const combinedScore = ratingScore * 0.6 + distanceScore * 0.4;

      return {
        _id: b._id.toString(),
        name: b.name,
        area: b.area,
        dressTypes: b.dressTypes,
        averageRating: ratingScore,
        totalRating: b.ratings?.length || 0,
        headerImage: b.headerImage,
        distanceKm: +distanceKm.toFixed(2),
        combinedScore,
        embedding: b.embedding,
      };
    });

    const sorted = scored.sort((a, b) => b.combinedScore - a.combinedScore).slice(0, 10);

    for (const boutique of sorted.slice(0, 5)) {
      await logUserActivity(userId, "view", `Boutique:${boutique.name}`, boutique.embedding);
    }

    const cacheData = sorted.map(({ embedding, ...rest }) => rest);

    await redis.set(
      redisKey,
      JSON.stringify({
        _cachedAt: Date.now(),
        boutiques: cacheData,
      }),
      { ex: 3600 }
    );

    logger.info(`Recommended boutiques generated [userId=${userId}]`);

    return res.status(200).json({
      message: "Recommended boutiques fetched successfully.",
      recommendedBoutiques: sorted,
    });

  } catch (error) {
    logger.error(`Error fetching recommended boutiques for user [userId=${req.userId}]: ${error.stack}`);
    return res.status(500).json({ message: "An error occurred while fetching boutiques" });
  }
};



const canonicalLabels = ["Lehenga", "Saree Blouse", "Kurta", "Gown", "Sherwani", "Choli"];
const canonicalImageMap = [
  { label: "Lehenga", imageUrl: "https://res.cloudinary.com/dwymmpkh8/image/upload/v1750053856/Hardcoded/l9z0s4ew2m9zsucdgq8e.png" },
  { label: "Saree Blouse", imageUrl: "https://res.cloudinary.com/dwymmpkh8/image/upload/v1750053856/Hardcoded/ptlfdfyo8b75ktk6lbtl.png" },
  { label: "Kurta", imageUrl: "https://res.cloudinary.com/dwymmpkh8/image/upload/v1750053856/Hardcoded/khaa81e5f66jvsselfo7.png" },
  { label: "Gown", imageUrl: "https://res.cloudinary.com/dwymmpkh8/image/upload/v1750053855/Hardcoded/bzdf9expco5fmddww0mi.png" },
  { label: "Sherwani", imageUrl: "https://res.cloudinary.com/dwymmpkh8/image/upload/v1750053856/Hardcoded/uab8xghclydm1cbk2bo0.png" },
  { label: "Choli", imageUrl: "https://res.cloudinary.com/dwymmpkh8/image/upload/v1750053856/Hardcoded/ie573v0kfw6yshttdeep.png" },
];
const normalize = str => str.trim().toLowerCase();
const imageMap = Object.fromEntries(canonicalImageMap.map(({ label, imageUrl }) => [normalize(label), imageUrl]));

const GOOGLE_DISTANCE_MATRIX_KEY = process.env.GOOGLE_MAPS_API_KEY;

// Safe JSON parser for Redis responses
function safeJSONParse(str) {
  try {
    return typeof str === 'string' ? JSON.parse(str) : str;
  } catch (err) {
    console.error("❌ Failed to parse Redis JSON:", err);
    return null;
  }
}

export const getRecommendedDressTypes = async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) {
      logger.warn("Unauthorized access to recommended dress types");
      return res.status(401).json({ message: "Unauthorized access." });
    }

    const redisKey = `recommended:${userId}`;
    const cached = await redis.get(redisKey);
    const parsed = safeJSONParse(cached);

    if (parsed?.data && parsed.timestamp) {
      const lastActivity = await getRecentUserEmbeddings(userId, "view", 1);
      const lastViewed = lastActivity?.[0]?.timestamp || 0;

      if (parsed.timestamp >= lastViewed) {
        logger.info(`Cache hit for recommended dress types [userId=${userId}]`);
        return res.status(200).json({
          message: "Returned from Redis cache",
          dressTypes: parsed.data,
        });
      }
    } else if (cached) {
      logger.warn(`Corrupt Redis cache for user [userId=${userId}]. Deleting.`);
      await redis.del(redisKey);
    }

    const user = await UserModel.findById(userId).lean();
    if (!user?.address?.location?.lat || !user?.address?.location?.lng) {
      logger.warn(`User location missing for [userId=${userId}]`);
      return res.status(400).json({ message: "User location missing." });
    }

    const userCoords = `${user.address.location.lat},${user.address.location.lng}`;
    const boutiques = await BoutiqueModel.find().lean();
    const boutiqueWithCoords = boutiques.filter(b => b.location?.latitude && b.location?.longitude);

    if (!boutiqueWithCoords.length) {
      logger.warn("No boutiques with valid coordinates");
      return res.status(404).json({ message: "No valid boutique coordinates available." });
    }

    const destinations = boutiqueWithCoords.map(b => `${b.location.latitude},${b.location.longitude}`).join("|");
    const distanceRes = await axios.get("https://maps.googleapis.com/maps/api/distancematrix/json", {
      params: { origins: userCoords, destinations, key: GOOGLE_DISTANCE_MATRIX_KEY },
    });

    const distances = distanceRes.data?.rows?.[0]?.elements;
    if (!distances) {
      logger.error("Google Maps API failed for distance matrix");
      return res.status(500).json({ message: "Failed to fetch distance data from Google Maps." });
    }

    const boutiqueScores = boutiqueWithCoords.map((b, i) => {
      const rating = b.averageRating || 0;
      const distanceKm = (distances[i]?.distance?.value || 1e6) / 1000;
      const score = 0.75 * rating + 0.25 * (1 / (distanceKm + 1));
      return { ...b, score };
    });

    const topBoutiques = boutiqueScores.sort((a, b) => b.score - a.score).slice(0, 10);

    const rawTypes = [];
    topBoutiques.forEach(b => {
      (b.dressTypes || []).forEach(dt => {
        const raw = dt.type?.trim();
        if (raw) rawTypes.push(raw);
      });
    });

    if (!rawTypes.length) {
      logger.info(`No dress types found from top boutiques for user [userId=${userId}]`);
      return res.status(200).json({ message: "No dress types available near you." });
    }

    logger.info(`Generating embeddings for rawTypes and canonicalLabels [userId=${userId}]`);

    const [canonicalRes, rawRes] = await Promise.all([
      axios.post("https://api.openai.com/v1/embeddings", {
        input: canonicalLabels,
        model: "text-embedding-3-small",
      }, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
      }),
      axios.post("https://api.openai.com/v1/embeddings", {
        input: rawTypes,
        model: "text-embedding-3-small",
      }, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
      }),
    ]);

    const canonicalEmbeddings = canonicalRes.data.data.map(d => d.embedding);
    const rawEmbeddings = rawRes.data.data.map(d => d.embedding);

    const canonicalCountMap = {};
    const canonicalRawTypes = new Set();

    rawTypes.forEach((raw, i) => {
      let bestMatch = null;
      let bestScore = -Infinity;
      canonicalLabels.forEach((canonical, j) => {
        const sim = cosineSimilarity(rawEmbeddings[i], canonicalEmbeddings[j]);
        if (sim > bestScore) {
          bestScore = sim;
          bestMatch = canonical;
        }
      });
      if (bestMatch) {
        canonicalRawTypes.add(bestMatch);
        canonicalCountMap[bestMatch] = (canonicalCountMap[bestMatch] || 0) + 1;
      }
    });

    const uniqueLabels = [...canonicalRawTypes];
    const userEmbeddings = await getRecentUserEmbeddings(userId, "view", 50);

    if (!userEmbeddings.length) {
      logger.info(`No user activity. Returning trending dress types for [userId=${userId}]`);
      const fallbackData = uniqueLabels.map(label => ({
        label,
        imageUrl: imageMap[normalize(label)] || null,
        count: canonicalCountMap[label] || 1,
      }));

      await redis.set(redisKey, JSON.stringify({
        data: fallbackData,
        timestamp: Date.now(),
      }), { ex: 3600 });

      return res.status(200).json({
        message: "No user activity yet. Showing trending dress types.",
        dressTypes: fallbackData,
      });
    }

    logger.info(`Scoring dress types for relevance [userId=${userId}]`);

    const labelRes = await axios.post("https://api.openai.com/v1/embeddings", {
      input: uniqueLabels,
      model: "text-embedding-3-small",
    }, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
    });

    const labelEmbeddings = labelRes.data.data.map(d => d.embedding);

    const relevanceScores = uniqueLabels.map((label, idx) => {
      const avgSim = userEmbeddings.reduce((sum, emb) => sum + cosineSimilarity(labelEmbeddings[idx], emb), 0) / userEmbeddings.length;
      return {
        label,
        imageUrl: imageMap[normalize(label)] || null,
        count: canonicalCountMap[label] || 1,
        relevance: avgSim,
      };
    });

    const sorted = relevanceScores.sort((a, b) => b.relevance - a.relevance);

    for (const { label } of sorted.slice(0, 5)) {
      await logUserActivity(userId, "view", label, {
        source: "getRecommendedDressTypes",
        reason: "Sorted by relevance + location + rating",
      });
    }

    await redis.set(redisKey, JSON.stringify({
      data: sorted,
      timestamp: Date.now(),
    }), { ex: 3600 });

    logger.info(`Recommended dress types served [userId=${userId}]`);

    return res.status(200).json({
      message: "Recommended dress types using distance, rating and user activity",
      dressTypes: sorted,
    });

  } catch (err) {
    logger.error(`❌ getRecommendedDressTypes failed [userId=${req.userId}] - ${err.message}`);
    return res.status(500).json({
      message: "Server error",
      error: err?.response?.data || err.message,
    });
  }
};


export const getTopRatedNearbyBoutiquesForDressType = async (req, res) => {
  try {
    const userId = req.userId;
    const selectedType = req.params.dressType?.trim();

    if (!userId || !selectedType) {
      logger.warn(`Missing userId or dressType [userId=${userId}, dressType=${selectedType}]`);
      return res.status(400).json({ message: "Missing user ID or dress type." });
    }

    const cacheKey = `top-rated:${userId}:${selectedType.toLowerCase()}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      logger.info(`Cache hit for top-rated boutiques [userId=${userId}, type=${selectedType}]`);
      return res.status(200).json({
        message: `Top rated boutiques offering ${selectedType} (from cache)`,
        ...cached,
      });
    }

    const user = await UserModel.findById(userId).lean();
    if (!user?.address?.location?.lat || !user?.address?.location?.lng) {
      logger.warn(`User location missing [userId=${userId}]`);
      return res.status(400).json({ message: "User location is missing." });
    }

    const userLoc = `${user.address.location.lat},${user.address.location.lng}`;
    const allBoutiques = await BoutiqueModel.find().lean();
    const boutiquesWithCoords = allBoutiques.filter(b => b.location?.latitude && b.location?.longitude);

    if (!boutiquesWithCoords.length) {
      logger.warn("No boutiques with valid coordinates");
      return res.status(404).json({ message: "No valid boutique coordinates available." });
    }

    logger.info(`Generating embeddings for selected type: ${selectedType}`);

    const [selectedEmbeddingRes, canonicalEmbeddingRes] = await Promise.all([
      openai.post("/v1/embeddings", {
        input: selectedType,
        model: "text-embedding-3-small",
      }),
      openai.post("/v1/embeddings", {
        input: canonicalLabels,
        model: "text-embedding-3-small",
      }),
    ]);

    const selectedVector = selectedEmbeddingRes.data.data[0].embedding;

    let bestMatch = null, bestSim = -1;
    canonicalLabels.forEach((canonical, i) => {
      const sim = cosineSimilarity(selectedVector, canonicalEmbeddingRes.data.data[i].embedding);
      if (sim > bestSim) {
        bestSim = sim;
        bestMatch = canonical;
      }
    });

    logger.info(`Best matching canonical label: ${bestMatch} (sim=${bestSim.toFixed(4)})`);

    const relevantBoutiques = boutiquesWithCoords.filter(b =>
      b.dressTypes.some(dt => dt.type?.trim().toLowerCase() === bestMatch.toLowerCase())
    );

    if (!relevantBoutiques.length) {
      logger.info(`No boutiques found for canonical dress type: ${bestMatch}`);
      return res.status(404).json({ message: `No boutiques found offering ${bestMatch}.` });
    }

    const destinations = relevantBoutiques.map(b => `${b.location.latitude},${b.location.longitude}`).join("|");

    const distanceRes = await axios.get("https://maps.googleapis.com/maps/api/distancematrix/json", {
      params: {
        origins: userLoc,
        destinations,
        key: GOOGLE_DISTANCE_MATRIX_KEY,
        units: "metric",
      },
    });

    const distances = distanceRes.data.rows[0]?.elements;
    if (!distances || distances.length !== relevantBoutiques.length) {
      logger.error("Mismatch or failure in distance data from Google Maps API");
      return res.status(500).json({ message: "Failed to fetch distance data from Google Maps." });
    }

    const scored = relevantBoutiques.map((b, i) => {
      const distanceKm = distances[i]?.distance?.value / 1000 || 100;
      const ratingScore = b.averageRating || 0;
      const distanceScore = distanceKm > 30 ? 0 : 1 - distanceKm / 30;
      const combinedScore = ratingScore * 0.6 + distanceScore * 0.4;

      return {
        ...b,
        distanceKm: +distanceKm.toFixed(2),
        combinedScore,
      };
    });

    const top = scored.sort((a, b) => b.combinedScore - a.combinedScore).slice(0, 5);

    logger.info(`Top 5 boutiques selected for user [userId=${userId}] on dress type: ${bestMatch}`);

    for (const boutique of top) {
      await logUserActivity(userId, "view", `Boutique:${boutique.name}`, {
        source: "getTopRatedNearbyBoutiquesForDressType",
        reason: `User searched for ${bestMatch}`,
      });
    }

    const response = {
      dressType: bestMatch,
      boutiques: top,
    };

    await redis.set(cacheKey, response, { ex: 3600 }); // Cache for 1 hour
    logger.info(`Response cached [key=${cacheKey}]`);

    return res.status(200).json({
      message: `Top rated boutiques offering ${bestMatch}`,
      ...response,
    });

  } catch (err) {
    logger.error(`❌ Failed in getTopRatedNearbyBoutiquesForDressType [userId=${req.userId}]: ${err.message}`);
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};


export const getTopRatedBoutiques = async (req, res) => {
  try {
    const userId = req.userId; // 🧑‍💼 Injected by authMiddleware
    logger.info(`📥 getTopRatedBoutiques called by user: ${userId}`);

    const topBoutiques = await BoutiqueModel.find({ averageRating: { $gt: 0 } })
      .sort({ averageRating: -1, totalRatings: -1 })
      .limit(5)
      .select("name averageRating totalRatings headerImage area dressTypes");

    logger.info(`✅ Fetched top ${topBoutiques.length} rated boutiques`);

    return res.status(200).json({
      success: true,
      userId, // Optional: Can help trace issues in frontend
      data: topBoutiques,
    });

  } catch (error) {
    logger.error(`❌ Error in getTopRatedBoutiques [userId=${req.userId}]: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch top rated boutiques.",
    });
  }
};



// Use this in protected routes with accessToken in headers
export const getViews = async (req, res) => {
  try {
    const userId = req.userId || "Unknown";
    logger.info(`📊 getViews called by user: ${userId}`);

    const response = await axios.get(`${ANALYTICS_BASE_URL}/boutique/views`, {
      headers: {
        Authorization: req.headers.authorization, // JWT forwarded
      },
    });

    logger.info(`✅ Views fetched successfully for user: ${userId}`);
    return res.status(200).json(response.data);

  } catch (error) {
    const errMessage = error?.response?.data || error.message;
    logger.error(`❌ Error fetching views [user=${req.userId}]: ${errMessage}`);
    return res.status(500).json({ error: "Failed to fetch views." });
  }
};

export const getTopDressType = async (req, res) => {
  try {
    const userId = req.userId || "Unknown";
    logger.info(`🎯 getTopDressType called by user: ${userId}`);

    const response = await axios.get(`${ANALYTICS_BASE_URL}/boutique/top-dressType`, {
      headers: {
        Authorization: req.headers.authorization,
      },
    });

    logger.info(`✅ Top dress type fetched successfully for user: ${userId}`);
    return res.status(200).json(response.data);

  } catch (error) {
    const errorDetails = error?.response?.data || error.message;
    logger.error(`❌ Failed to fetch top dress type [user=${userId}]: ${errorDetails}`);
    return res.status(500).json({ error: "Failed to fetch top dress type." });
  }
};

export const getAnalyticsData = async (req, res) => {
  try {
    const userId = req.userId || "Unknown";
    logger.info(`📊 getAnalyticsData called by user: ${userId}`);

    const response = await axios.get(`${ANALYTICS_BASE_URL}/boutique`, {
      headers: {
        Authorization: req.headers.authorization,
      },
    });

    logger.info(`✅ Analytics data fetched successfully [user=${userId}]`);
    return res.status(200).json(response.data);

  } catch (error) {
    const errDetails = error?.response?.data || error.message;
    logger.error(`❌ Error fetching analytics data [user=${userId}]: ${errDetails}`);
    return res.status(500).json({ error: "Failed to fetch analytics data." });
  }
};




const addDressType = async (req, res) => {
  try {
    const boutiqueId = req.userId; // ✅ Comes from JWT via authMiddleware

    if (!boutiqueId) {
      return res.status(401).json({ message: "Unauthorized: No boutiqueId from token" });
    }

    const { dressType, measurementRequirements, sizeChart } = req.body;
    const files = req.files?.images || [];

    const imagePaths = files.map((file) => file.path);

    await addDressQueue.add('process-dress-type', {
      boutiqueId, // ✅ Now defined
      dressType,
      measurementRequirements,
      sizeChart,
      imagePaths,
    });

    res.status(200).json({ message: 'Dress type job enqueued successfully' });
  } catch (error) {
    console.error('❌ Error in addDressType controller:', error);
    res.status(500).json({ message: 'Failed to enqueue dress type' });
  }
};



const deleteDressType = async (req, res) => {
  const boutiqueId = req.boutiqueId; // ✅ Decoded from token
  const { dressType } = req.body;

  try {
    const boutique = await BoutiqueModel.findById(boutiqueId);
    if (!boutique) {
      return res.status(404).json({ message: 'Boutique not found' });
    }

    // Find the dress type to be deleted
    const targetDress = boutique.dressTypes.find(type => type.type === dressType);
    if (!targetDress) {
      return res.status(404).json({ message: 'Dress type not found in boutique' });
    }

    // ✅ Collect all qdrantIds from the images of that dress type
    const qdrantIds = targetDress.images.map(img => img.qdrantId).filter(Boolean);
    
    // ✅ Delete vectors from Qdrant
    if (qdrantIds.length > 0) {
      const qdrant = await getQdrantClient();
      await qdrant.delete('dress_types', {
        points: qdrantIds,
      });
      console.log(`🧹 Deleted ${qdrantIds.length} vectors from Qdrant`);
    }

    // ✅ Remove dressType from boutique
    boutique.dressTypes = boutique.dressTypes.filter((type) => type.type !== dressType);
    await boutique.save();

    res.status(200).json({ message: 'Dress type and embeddings deleted successfully', boutique });
  } catch (error) {
    console.error('❌ Error deleting dress type:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

const getDressTypeImages = async (req, res) => {
  const { boutiqueId, dressType } = req.params;

  try {
    // Find the boutique by ID
    const boutique = await BoutiqueModel.findById(boutiqueId);
    if (!boutique) {
      return res.status(404).json({ message: 'Boutique not found' });
    }

    // Find the dress type in the boutique's dressTypes array
    const dressTypeData = boutique.dressTypes.find(
      (item) => item.type.toLowerCase() === dressType.toLowerCase()
    );

    if (!dressTypeData) {
      return res.status(404).json({ message: `Dress type "${dressType}" not found` });
    }

    // Return the dress type and images
    res.status(200).json({
      dressType: dressTypeData.type,
      images: dressTypeData.images,
    });
  } catch (error) {
    console.error('Error fetching dress type images:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

const trackBusiness = async (req, res) => {
  try {
    const { boutiqueId } = req.params;

    // Find the boutique
    const boutique = await BoutiqueModel.findById(boutiqueId);
    if (!boutique) {
      return res.status(404).json({ error: "Boutique not found" });
    }

    // Find all orders associated with the boutique that have a bill
    const orders = await OrderModel.find({ boutiqueId, "bill.totalAmount": { $exists: true } });

    if (!orders.length) {
      return res.status(404).json({ message: "No billed orders found for this boutique." });
    }

    let totalRevenue = 0;
    let totalOrders = orders.length;

    // Calculate total revenue excluding platform and delivery fees
    orders.forEach((order) => {
      const bill = order.bill || {};
      const amountFromBill = bill.totalAmount - (bill.platformFee || 0) - (bill.deliveryFee || 0);
      totalRevenue += amountFromBill;
    });

    // Update the business tracker
    boutique.businessTracker.totalOrders = totalOrders;
    boutique.businessTracker.totalRevenue = totalRevenue;
    await boutique.save();

    res.json({
      success: true,
      message: "Business tracking updated successfully.",
      businessTracker: boutique.businessTracker,
    });
  } catch (error) {
    console.error("Error tracking business:", error);
    res.status(500).json({ error: error.message });
  }
};

const getDressTypesWithDetails = async (req, res) => {
  const boutiqueId = req.boutiqueId; // ⬅️ Use decoded ID from auth middleware

  try {
    // ✅ Find the boutique
    const boutique = await BoutiqueModel.findById(boutiqueId);

    if (!boutique) {
      return res.status(404).json({ message: 'Boutique not found' });
    }

    // ✅ Return full dress type details
    const dressTypes = boutique.dressTypes.map((type) => ({
      type: type.type,
      images: type.images,
      measurementRequirements: type.measurementRequirements,
    }));

    res.status(200).json({ dressTypes });
  } catch (error) {
    console.error("Error fetching dress types with details:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export { getDressTypesWithDetails};

const getOrdersByStatus = async (req, res) => {
  try {
    const boutiqueId = req.boutiqueId;
    const { userId, status } = req.query;

    if (boutiqueId && !mongoose.Types.ObjectId.isValid(boutiqueId)) {
      logger.warn("Invalid boutique ID provided in getOrdersByStatus.");
      return res.status(400).json({ error: "Invalid boutique ID" });
    }

    if (userId && !mongoose.Types.ObjectId.isValid(userId)) {
      logger.warn("Invalid user ID provided in getOrdersByStatus.");
      return res.status(400).json({ error: "Invalid user ID" });
    }

    const validStatuses = ["In Progress", "Ready for Delivery"];

    const query = {};
    if (boutiqueId) query.boutiqueId = boutiqueId;
    if (userId) query.userId = userId;

    if (status) {
      if (!validStatuses.includes(status)) {
        logger.warn(`Invalid status '${status}' provided. Allowed: ${validStatuses.join(", ")}`);
        return res.status(400).json({
          error: `Invalid status. Allowed values: ${validStatuses.join(", ")}`,
        });
      }
      query.status = status;
    } else {
      query["bill.status"] = "Paid";
    }

    const orders = await OrderModel.find(query)
      .populate("userId", "name phone")
      .populate("boutiqueId", "name location")
      .sort({ createdAt: -1 });

    logger.info(`Fetched ${orders.length} orders for boutique: ${boutiqueId}`);
    
    res.status(200).json({
      message: `Found ${orders.length} order(s).`,
      orders,
    });
  } catch (error) {
    logger.error(`Error fetching orders: ${error.message}`);
    res.status(500).json({ error: "Server error", details: error.message });
  }
};

export const logoutBoutique = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      logger.warn("Unauthorized logout attempt: Missing or invalid token header.");
      return res.status(401).json({ message: "Access token missing or invalid." });
    }

    const accessToken = authHeader.split(" ")[1];

    const decoded = jwt.verify(accessToken, process.env.ACCESS_TOKEN_SECRET);
    const boutiqueId = decoded.userId;

    const expiresAt = new Date(decoded.exp * 1000);
    await BlacklistedToken.create({ token: accessToken, expiresAt });

    await BoutiqueModel.findByIdAndUpdate(boutiqueId, { refreshToken: null });

    res.clearCookie("refreshToken", { httpOnly: true, secure: true, sameSite: "strict" });

    logger.info(`Boutique ${boutiqueId} logged out successfully.`);

    res.status(200).json({ message: "Logged out successfully." });
  } catch (error) {
    logger.error(`Logout error: ${error.message}`);
    res.status(500).json({ message: "Logout failed", error: error.message });
  }
};


export const getBoutiqueAreas = async (req, res) => {
  try {
    const boutiqueId = req.boutiqueId;

    if (!boutiqueId) {
      logger.warn("Unauthorized request: Missing boutique ID from token.");
      return res.status(401).json({ message: "Unauthorized. Boutique ID missing from token." });
    }

    const boutiques = await BoutiqueModel.find({}, 'area').lean();
    const usedAreaSet = new Set(
      boutiques.map(b => b.area?.trim()).filter(Boolean)
    );

    const areas = predefinedHyderabadAreas.map(area => ({
      area,
      inUse: usedAreaSet.has(area),
    }));

    logger.info(`Fetched predefined areas with usage status for boutique ${boutiqueId}`);

    res.status(200).json({
      success: true,
      message: "All predefined areas with usage info",
      areas,
    });
  } catch (err) {
    logger.error("❌ Error fetching boutique areas:", err.message);
    res.status(500).json({ success: false, message: "Server error", error: err.message });
  }
};


export const getSizeChartForDressType = async (req, res) => {
  try {
    const userId = req.userId;
    const { boutiqueId, dressType, selectedSize } = req.query;

    if (!userId) {
      logger.warn('Unauthorized access attempt: missing or invalid token');
      return res.status(401).json({ message: 'Unauthorized. Token missing or invalid.' });
    }

    if (!boutiqueId || !dressType || !selectedSize) {
      logger.warn('Missing parameters in query: boutiqueId, dressType, or selectedSize');
      return res.status(400).json({
        message: 'boutiqueId, dressType, and selectedSize are required',
      });
    }

    const boutique = await BoutiqueModel.findById(boutiqueId).lean();
    if (!boutique) {
      logger.warn(`Boutique not found for ID: ${boutiqueId}`);
      return res.status(404).json({ message: 'Boutique not found' });
    }

    const dress = boutique.dressTypes.find(dt => dt.type === dressType);
    if (!dress) {
      logger.warn(`Dress type '${dressType}' not found in boutique ${boutiqueId}`);
      return res.status(404).json({ message: 'Dress type not found in this boutique' });
    }

    const sizeChart = dress.sizeChart;
    const sizeValues = sizeChart[selectedSize];

    if (!sizeValues || typeof sizeValues !== 'object') {
      logger.warn(`Size '${selectedSize}' not found in size chart for dress type '${dressType}'`);
      return res.status(404).json({ message: `No values found for size '${selectedSize}'` });
    }

    const formattedValues = Object.fromEntries(Object.entries(sizeValues));

    logger.info(`Size chart retrieved for user ${userId} - Boutique: ${boutiqueId}, Dress: ${dressType}, Size: ${selectedSize}`);

    return res.status(200).json({
      message: `Size chart for ${selectedSize} in ${dressType}`,
      measurements: formattedValues,
    });

  } catch (error) {
    logger.error('❌ Error fetching size chart:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};


export {getOrdersByStatus};
export {trackBusiness};



export {getDressTypeImages};

export {addDressType};

export {deleteDressType};

export { getRecommendedBoutiques };

export { deleteItemFromCatalogue };

export {boutiqueSearch, Boutiquelogin, verifyOtpFB, viewBoutiqueDetails};

export {boutiquesData};

export {CreateBoutique};

export {addItemToCatalogue, getBoutiqueCatalogue};