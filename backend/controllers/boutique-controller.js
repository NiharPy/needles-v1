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
import { logUserActivity } from "../controllers/recommendationController.js"
import haversine from "haversine-distance";

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
    } = req.body;

    // ✅ Validate required fields
    if (!name || !password || !email || !location || !phone || !dressTypes) {
      return res.status(400).send("All fields (name, password, email, location, phone, dressTypes) are required");
    }

    // ✅ Parse stringified fields
    const parsedLocation = typeof location === 'string' ? JSON.parse(location) : location;
    const parsedDressTypes = typeof dressTypes === 'string' ? JSON.parse(dressTypes) : dressTypes;
    const parsedCatalogue = catalogue && typeof catalogue === 'string' ? JSON.parse(catalogue) : [];

    // ✅ Upload header image to Cloudinary (if present)
    let headerImageUrl = '';
    if (req.file) {
      const result = await cloudinary.uploader.upload(req.file.path, {
        folder: 'boutique_headers',
      });
      headerImageUrl = result.secure_url;
    }

    // ✅ Create boutique WITHOUT embedding
    const CreatedBoutique = await BoutiqueModel.create({
      name,
      email,
      password,
      phone,
      location: parsedLocation,
      dressTypes: parsedDressTypes,
      headerImage: headerImageUrl,
      catalogue: parsedCatalogue,
      // embedding is intentionally omitted
    });

    return res.status(201).json(CreatedBoutique);
  } catch (error) {
    console.error("Error creating Boutique:", error);

    if (error.name === 'ValidationError') {
      return res.status(422).json({ error: error.message, details: error.errors });
    }

    return res.status(500).send("An unexpected error occurred");
  }
};

export const addHeaderImage = async (req, res) => {
  try {
    const boutiqueId = req.boutiqueId; // ⬅️ Set by auth middleware

    const boutique = await BoutiqueModel.findById(boutiqueId);
    if (!boutique) {
      return res.status(404).json({ message: "Boutique not found." });
    }

    const uploadedImages = req.files?.images || [];

    if (uploadedImages.length === 0) {
      return res.status(400).json({ message: "At least one image must be uploaded." });
    }

    const currentCount = boutique.headerImage.length;
    const remainingSlots = 5 - currentCount;

    if (uploadedImages.length > remainingSlots) {
      return res.status(400).json({
        message: `You can only upload ${remainingSlots} more image(s).`,
      });
    }

    // Push image paths (or Cloudinary URLs) to headerImage array
    uploadedImages.forEach((file) => {
      boutique.headerImage.push(file.path); // or `file.location` if you're using S3
    });

    await boutique.save();

    res.status(200).json({
      message: "Header images uploaded successfully.",
      headerImage: boutique.headerImage,
    });
  } catch (error) {
    console.error("Error uploading header images:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const deleteAllHeaderImages = async (req, res) => {
  try {
    const boutiqueId = req.boutiqueId;

    const boutique = await BoutiqueModel.findById(boutiqueId);
    if (!boutique) {
      return res.status(404).json({ message: "Boutique not found" });
    }

    // Clear the headerImage array
    boutique.headerImage = [];
    await boutique.save();

    res.status(200).json({
      message: "All header images deleted successfully",
      headerImage: boutique.headerImage,
    });
  } catch (error) {
    console.error("Error deleting all header images:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const deleteHeaderImage = async (req, res) => {
  try {
    const boutiqueId = req.boutiqueId; // From auth middleware
    const imageUrl = req.body.imageUrl; // Cloudinary URL to delete

    if (!imageUrl) {
      return res.status(400).json({ message: "Image URL is required for deletion." });
    }

    const boutique = await BoutiqueModel.findById(boutiqueId);
    if (!boutique) {
      return res.status(404).json({ message: "Boutique not found." });
    }

    const index = boutique.headerImage.indexOf(imageUrl);
    if (index === -1) {
      return res.status(404).json({ message: "Image URL not found in header images." });
    }

    boutique.headerImage.splice(index, 1); // Remove image
    await boutique.save();

    res.status(200).json({
      message: "Header image deleted successfully.",
      headerImage: boutique.headerImage,
    });
  } catch (error) {
    console.error("Error deleting header image:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const updateBoutiqueDetails = async (req, res) => {
  try {
    const boutiqueId = req.boutiqueId; // Auth middleware injects this
    const { name, location, area } = req.body;

    // ✅ Validate boutique ID
    if (!mongoose.Types.ObjectId.isValid(boutiqueId)) {
      return res.status(400).json({ message: "Invalid boutique ID" });
    }

    const updateFields = {};

    // ✅ Update name
    if (name) updateFields.name = name;

    // ✅ Validate and update area
    if (area) {
      const trimmedArea = area.trim();
      if (!predefinedHyderabadAreas.includes(trimmedArea)) {
        return res.status(400).json({
          message: `Invalid area. Choose from predefined Hyderabad areas only.`,
          allowedAreas: predefinedHyderabadAreas,
        });
      }
      updateFields.area = trimmedArea;
    }

    // ✅ Update location subfields
    if (location) {
      if (location.address) updateFields['location.address'] = location.address;
      if (location.city) updateFields['location.city'] = location.city;
      if (location.state) updateFields['location.state'] = location.state;
      if (location.latitude) updateFields['location.latitude'] = location.latitude;
      if (location.longitude) updateFields['location.longitude'] = location.longitude;
    }

    // ⛔ No fields to update
    if (Object.keys(updateFields).length === 0) {
      return res.status(400).json({ message: "No valid fields provided to update" });
    }

    // ✅ Update in DB
    const updatedBoutique = await BoutiqueModel.findByIdAndUpdate(
      boutiqueId,
      { $set: updateFields },
      { new: true }
    );

    if (!updatedBoutique) {
      return res.status(404).json({ message: "Boutique not found" });
    }

    res.status(200).json({
      message: "Boutique details updated successfully",
      boutique: updatedBoutique,
    });

  } catch (error) {
    console.error("Error updating boutique:", error.message);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};


export const requestPhoneNumberChange = async (req, res) => {
  try {
    const boutiqueId = req.boutiqueId;
    const { newPhone } = req.body;

    if (!newPhone || !/^\+91\d{10}$/.test(newPhone)) {
      return res.status(400).json({ message: "Invalid new phone number format" });
    }

    const boutique = await BoutiqueModel.findById(boutiqueId);
    if (!boutique) return res.status(404).json({ message: "Boutique not found" });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    boutique.otp = otp;
    await boutique.save();

    // ⛔ No SMS logic here — just log for testing
    console.log(`OTP for boutique (${boutique.phone}) to change phone: ${otp}`);

    res.status(200).json({
      message: "OTP generated and logged for testing. Use it to confirm phone update.",
    });
  } catch (error) {
    console.error("Error generating OTP:", error.message);
    res.status(500).json({ message: "Failed to initiate phone update" });
  }
};

export const confirmPhoneNumberChange = async (req, res) => {
  try {
    const boutiqueId = req.boutiqueId;
    const { otp, newPhone } = req.body;

    if (!otp || !newPhone || !/^\+91\d{10}$/.test(newPhone)) {
      return res.status(400).json({ message: "OTP and valid new phone number are required" });
    }

    const boutique = await BoutiqueModel.findById(boutiqueId);
    if (!boutique) return res.status(404).json({ message: "Boutique not found" });

    if (boutique.otp !== otp) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    const alreadyExists = await BoutiqueModel.findOne({ phone: newPhone });
    if (alreadyExists) {
      return res.status(400).json({ message: "This phone number is already registered" });
    }

    boutique.phone = newPhone;
    boutique.otp = ''; // Clear OTP
    await boutique.save();

    res.status(200).json({ message: "Phone number updated successfully" });
  } catch (error) {
    console.error("Error confirming phone number update:", error.message);
    res.status(500).json({ message: "Could not update phone number" });
  }
};

export const changePassword = async (req, res) => {
  try {
    const boutiqueId = req.boutiqueId;
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
      return res.status(400).json({ message: "Old and new passwords are required" });
    }

    const boutique = await BoutiqueModel.findById(boutiqueId);
    if (!boutique) {
      return res.status(404).json({ message: "Boutique not found" });
    }

    console.log("Entered old password:", oldPassword);
    console.log("Stored password in DB:", boutique.password);

    if (boutique.password !== oldPassword) {
      return res.status(401).json({ message: "Incorrect old password" });
    }

    boutique.password = newPassword;
    await boutique.save();

    res.status(200).json({ message: "Password changed successfully" });
  } catch (error) {
    console.error("Error changing password:", error.message);
    res.status(500).json({ message: "Server error while changing password" });
  }
};

const Boutiquelogin = async function (req, res) {
  try {
    const { name, password, phone } = req.body;

    console.log("received credentials : ", req.body);

    // Validate required fields
    if (!name || !password || !phone) {
      return res.status(400).json({ message: "name, password, phone are required." });
    }

    // Check if the Boutique exists
    const Boutique = await BoutiqueModel.findOne({ phone });
    if (!Boutique) {
      return res.status(404).json({ message: "Boutique Account not found." });
    }

    // Check if name and password match
    if (Boutique.name !== name || Boutique.password !== password) {
      return res.status(401).json({ message: "Invalid name or password." });
    }

    // Generate a new OTP
    const otp = Math.floor(100000 + Math.random() * 900000); // 6-digit OTP

    // Set OTP expiry duration (1 minute)
    const OTP_EXPIRATION_TIME = 1; // in minutes

    // Update the Boutique with the OTP and expiration time
    Boutique.otp = otp;
    Boutique.otpExpiry = Date.now() + OTP_EXPIRATION_TIME * 60 * 1000; // Expiry in milliseconds
    await Boutique.save();

    // Twilio logic removed — optionally log OTP for testing
    console.log(`Generated OTP for ${phone}: ${otp}`);

    // Respond with instruction to switch to OTP page
    res.status(200).json({
      message: "OTP generated. Please verify to complete login.",
      switchToOTPPage: true,
      boutiqueUserId: Boutique._id,
      otp, // ⚠️ Optional: remove this in production
    });
  } catch (error) {
    console.error("Error during login:", error.message);
    console.error("Stack trace:", error.stack);

    res.status(500).json({ message: "An unexpected error occurred during login." });
  }
};

const boutiquesData = async function (req, res) {
  try {
    const boutiqueId = req.user.userId; // ⬅️ From JWT via authMiddleware

    const boutique = await BoutiqueModel.findById(
      boutiqueId,
      'name location phone headerImage area' // 🆕 include 'area'
    );

    if (!boutique) {
      return res.status(404).json({
        success: false,
        message: "Boutique not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Boutique fetched successfully",
      data: boutique,
    });
  } catch (error) {
    console.error("Error fetching boutique:", error);

    res.status(500).json({
      success: false,
      message: "Server error. Unable to fetch boutique.",
    });
  }
};


const verifyOtpFB = async (req, res) => {
  try {
    const { phone, otp } = req.body;

    if (!phone || !otp) {
      return res.status(400).json({ message: "Phone number and OTP are required." });
    }

    const user = await BoutiqueModel.findOne({ phone });
    console.log("user : ", user.otp);
    if (!user) {
      return res.status(404).json({ message: "Boutique account not found." });
    }

    if (!user.otp) { //for later otp expiration || Date.now() > user.otpExpiry || !user.otpExpiry check otp expiry
      return res.status(400).json({ message: "OTP has expired or is invalid." });
    }

    if (otp !== user.otp) {
      return res.status(400).json({ message: "Invalid OTP. Please try again." });
    }

    // 🔐 Generate JWT tokens
    const accessToken = jwt.sign(
      { userId: user._id, name: user.name, role: user.role },
      process.env.ACCESS_TOKEN_SECRET,
      { expiresIn: "15m" }
    );

    console.log(`'access token : `, accessToken);

    const refreshToken = jwt.sign(
      { userId: user._id },
      process.env.REFRESH_TOKEN_SECRET,
      { expiresIn: "30d" }
    );

    // 💾 Save refresh token and clear OTP
    user.refreshToken = refreshToken;
    user.otp = null;
    user.otpExpiry = null;
    await user.save();

    // 🍪 Send accessToken cookie (HTTP-only, secure)
    res.cookie("accessToken", accessToken, {
      httpOnly: true,
      secure: true, // 🛡️ Use HTTPS only
      sameSite: 'None',
      domain : 'needles-v1.onrender.com',
      maxAge: 15 * 60 * 1000, // 15 minutes
    });

    // 🍪 Send refreshToken cookie (HTTP-only, secure)
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: true, // 🛡️ Use HTTPS only
      sameSite: 'None',
      domain : 'needles-v1.onrender.com',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });

    res.status(200).json({
      message: "OTP verified. User logged in.",
      user: {
        _id: user._id,
        name: user.name,
        role: user.role,
      },
      accessToken,
    });
  } catch (error) {
    console.error("Error verifying OTP:", error);
    res.status(500).json({ message: "Internal server error." });
  }
};

const boutiqueSearch = async function (req, res) {
  try {
    const userId = req.userId; // ✅ Injected from auth-user.js
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized access." });
    }

    const { query } = req.query;

    if (!query) {
      return res.status(400).json({ message: 'Query is required for semantic search' });
    }

    // 🔍 Parse rating and area from query
    const ratingMatch = query.match(/(\d(\.\d)?)(\s?stars?|\s?star\s?rating)/i);
    const areaMatch = query.match(/\bin\s([a-zA-Z\s]+)/i); // e.g., "in Miyapur"

    const ratingValue = ratingMatch ? parseFloat(ratingMatch[1]) : null;
    const areaValue = areaMatch ? areaMatch[1].trim() : null;

    console.log("Semantic Search Debug → Query:", query);
    console.log("Parsed Rating:", ratingValue);
    console.log("Parsed Area:", areaValue);

    // 🔹 Get embedding vector
    const queryVector = await getEmbedding(query);
    if (!queryVector || !Array.isArray(queryVector) || queryVector.length < 100) {
      return res.status(500).json({
        success: false,
        message: 'Failed to generate valid query vector for semantic search.',
      });
    }

    // 🔹 Build $search pipeline
    const pipeline = [
      {
        $search: {
          knnBeta: {
            path: 'embedding',
            vector: queryVector,
            k: 20,
          },
        },
      },

      // 🔸 Optional filters
      ...(ratingValue
        ? [{
            $match: {
              averageRating: { $gte: ratingValue }
            }
          }]
        : []),

      ...(areaValue
        ? [{
            $match: {
              area: { $regex: areaValue, $options: 'i' }
            }
          }]
        : []),

      {
        $project: {
          name: 1,
          area: 1,
          averageRating: 1,
          totalRatings: 1,
          catalogue: 1,
          dressTypes: 1,
          score: { $meta: 'searchScore' }
        },
      },

      {
        $sort: {
          averageRating: -1,
          score: -1
        }
      },

      { $limit: 10 }
    ];

    // 🔍 Run aggregation
    const boutiques = await BoutiqueModel.aggregate(pipeline).exec();

    // ⛑️ Fallback if no results
    if (boutiques.length === 0) {
      console.warn("⚠️ Semantic Search returned no results. Trying fallback query...");
      const fallback = await BoutiqueModel.find()
        .limit(3)
        .select("name area averageRating catalogue dressTypes")
        .exec();

      return res.status(200).json({
        message: "No matches found with semantic search. Showing fallback boutiques.",
        results: fallback
      });
    }

    // ✅ Success
    res.status(200).json(boutiques);

  } catch (error) {
    console.error('Semantic Search Error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error. Unable to perform semantic search.',
    });
  }
};


const viewBoutiqueDetails = async (req, res) => {
  try {
    const { name } = req.params;

    // Fetch boutique details
    const boutique = await BoutiqueModel.findOne({name : name});
    if (!boutique) {
      return res.status(404).json({ message: "Boutique not found" });
    }

    if (req.user) {
      console.log(`User ID: ${req.user._id} is viewing boutique: ${name}`);
      // Log the user action or provide additional personalized data
    } else {
      console.log(`Unauthenticated user is viewing boutique: ${name}`);
    }

    res.status(200).json({ boutique });
  } catch (error) {
    console.error("Error in viewing boutique details:", error);
    res.status(500).json({ message: "Server error" });
  }
};

const addItemToCatalogue = async (req, res) => {
  try {
    const { newItems } = req.body;
    const boutiqueId = req.boutiqueId;

    // Validate input
    if (!boutiqueId || !newItems || !Array.isArray(newItems)) {
      return res
        .status(400)
        .json({ message: "Boutique ID and valid newItems array are required." });
    }

    // Find the boutique by ID
    const boutique = await BoutiqueModel.findById(boutiqueId);
    if (!boutique) {
      return res.status(404).json({ message: "Boutique not found." });
    }

    // Add new items to the catalogue
    newItems.forEach((item) => {
      const itemName = Array.isArray(item.itemName) ? item.itemName : [String(item.itemName)];
      const price = Array.isArray(item.price) ? item.price.map(Number) : [Number(item.price)];

      // Only push if itemName and price are valid
      if (itemName[0] && price[0]) {
        boutique.catalogue.push({
          itemName,
          price,
        });
      }
    });

    // Save the updated boutique
    await boutique.save();

    res.status(200).json({
      message: "Items added to the catalogue successfully.",
      updatedCatalogue: boutique.catalogue,
    });
  } catch (error) {
    console.error("Error adding items to catalogue:", error);
    res.status(500).json({ message: "Server error. Please try again." });
  }
};

const getBoutiqueCatalogue = async (req, res) => {
  try {
    const boutiqueId = req.boutiqueId; // ⬅️ Use injected boutique ID from middleware

    // Find boutique by ID and exclude _id from catalogue items
    const boutique = await BoutiqueModel.findById(boutiqueId).select("name catalogue -_id");

    if (!boutique) {
      return res.status(404).json({ message: "Boutique not found" });
    }

    res.status(200).json({
      message: "Catalogue retrieved successfully",
      boutiqueName: boutique.name,
      catalogue: boutique.catalogue.map(item => ({
        itemName: item.itemName,
        price: item.price
      })),
    });
  } catch (error) {
    console.error("Error retrieving boutique catalogue:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const deleteItemFromCatalogue = async (req, res) => {
  try {
    const { itemNames } = req.body;
    const boutiqueId = req.boutiqueId; // ✅ Use boutiqueId from the request

    // Validate input
    if (!boutiqueId || !itemNames || !Array.isArray(itemNames)) {
      return res
        .status(400)
        .json({ message: "Boutique ID and a valid array of itemNames are required." });
    }

    // Find the boutique by ID
    const boutique = await BoutiqueModel.findById(boutiqueId);
    if (!boutique) {
      return res.status(404).json({ message: "Boutique not found." });
    }

    // Loop through the catalogue and remove matching itemNames
    boutique.catalogue.forEach((item) => {
      item.itemName = item.itemName.filter(
        (name) => !itemNames.includes(name) // Remove names that match
      );
    });

    // Filter out catalogue entries with empty itemName arrays
    boutique.catalogue = boutique.catalogue.filter((item) => item.itemName.length > 0);

    // Save changes
    await boutique.save();

    res.status(200).json({
      message: "Items removed from the catalogue successfully.",
      updatedCatalogue: boutique.catalogue,
    });
  } catch (error) {
    console.error("Error deleting items from catalogue:", error);
    res.status(500).json({ message: "Server error. Please try again." });
  }
};

const getRecommendedBoutiques = async (req, res) => {
  try {
    const userId = req.userId; // ✅ Extracted from JWT by middleware
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized access." });
    }

    // 📍 Get user location
    const user = await UserModel.findById(userId).lean();
    if (!user || !user.address?.location?.lat || !user.address?.location?.lng) {
      return res.status(400).json({ message: "User location is missing." });
    }
    const userLocation = {
      latitude: user.address.location.lat,
      longitude: user.address.location.lng,
    };

    // 🎯 Get all boutiques
    const boutiques = await BoutiqueModel.find()
      .select("name area dressTypes averageRating ratings headerImage location")
      .lean();

    if (!boutiques || boutiques.length === 0) {
      return res.status(404).json({ message: "No boutiques found." });
    }

    // 🧠 Score boutiques by rating + proximity
    const scored = boutiques.map((boutique) => {
      const boutiqueLocation = {
        latitude: boutique.location.latitude,
        longitude: boutique.location.longitude,
      };

      const distance = haversine(userLocation, boutiqueLocation); // in meters
      const distanceKm = distance / 1000;
      const ratingScore = boutique.averageRating || 0;
      const distanceScore = distanceKm > 30 ? 0 : 1 - distanceKm / 30; // 0–1

      const combinedScore = ratingScore * 0.6 + distanceScore * 0.4;

      return {
        ...boutique,
        totalRating: boutique.ratings?.length || 0,
        combinedScore,
        distanceKm: +distanceKm.toFixed(2),
      };
    });

    const sorted = scored
      .sort((a, b) => b.combinedScore - a.combinedScore)
      .slice(0, 10);

    // 📝 Log top 5 viewed recommended boutique areas
    for (const { area, name } of sorted.slice(0, 5)) {
      await logUserActivity(userId, "view", `Boutique:${name}`, {
        source: "getRecommendedBoutiques",
        reason: "Recommended by score (rating + distance)",
      });
    }

    return res.status(200).json({
      message: "Recommended boutiques fetched successfully.",
      recommendedBoutiques: sorted,
    });
  } catch (error) {
    console.error(`Error fetching recommended boutiques for user ${req.userId}:`, error);
    return res.status(500).json({ message: "An error occurred while fetching boutiques" });
  }
};



const canonicalLabels = ["Lehenga", "Saree Blouse", "Kurta", "Gown", "Shirt", "Sherwani", "Choli"];

export const getRecommendedDressTypes = async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized access." });

    const user = await UserModel.findById(userId).lean();
    if (!user || !user.address?.location) {
      return res.status(400).json({ message: "User location missing." });
    }

    const userArea = user.address.formattedAddress?.split(",")[0]?.trim();

    // Fetch all boutiques
    const boutiques = await BoutiqueModel.find().lean();

    // Rank boutiques by weighted factors: rating, location match, etc.
    const boutiqueScores = boutiques.map(boutique => {
      let score = 0;

      // 1. Rating influence
      score += (boutique.averageRating || 0) * 2;

      // 2. Location/area match
      if (boutique.area === userArea) {
        score += 3; // Strong location match
      }

      return {
        ...boutique,
        score,
      };
    });

    // Sort by score descending
    const topBoutiques = boutiqueScores.sort((a, b) => b.score - a.score).slice(0, 10);

    // Collect dressTypes from top boutiques
    const allDressTypes = topBoutiques.flatMap(b => b.dressTypes.map(dt => dt.type.trim()));
    const uniqueDressTypes = [...new Set(allDressTypes)];

    // Get embeddings for unique dress types
    const embeddingResponse = await openai.post("/v1/embeddings", {
      input: uniqueDressTypes,
      model: "text-embedding-3-small",
    });
    const embeddings = embeddingResponse.data.data.map(item => item.embedding);

    const canonicalResponse = await openai.post("/v1/embeddings", {
      input: canonicalLabels,
      model: "text-embedding-3-small",
    });
    const canonicalEmbeddings = canonicalResponse.data.data.map(item => item.embedding);

    const labelMapping = {};
    uniqueDressTypes.forEach((label, i) => {
      let maxSim = -1, bestMatch = null;
      canonicalLabels.forEach((canonical, j) => {
        const sim = cosineSimilarity(embeddings[i], canonicalEmbeddings[j]);
        if (sim > maxSim) {
          maxSim = sim;
          bestMatch = canonical;
        }
      });
      labelMapping[label] = bestMatch;
    });

    // Count mapped labels from top boutiques
    const labelCount = {};
    allDressTypes.forEach(label => {
      const mapped = labelMapping[label];
      labelCount[mapped] = (labelCount[mapped] || 0) + 1;
    });

    const sorted = Object.entries(labelCount)
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) => ({ type, count }));

    // Log top 5 viewed dress types
    for (const { type } of sorted.slice(0, 5)) {
      await logUserActivity(userId, "view", type, {
        source: "getRecommendedDressTypes",
        reason: "Ranked by rating + location",
      });
    }

    res.status(200).json({
      message: "Recommended dress types based on rating & location",
      dressTypes: sorted,
    });
  } catch (err) {
    console.error("Error in getRecommendedDressTypes:", err.message);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};



const addDressType = async (req, res) => {
  try {
    const boutiqueId = req.boutiqueId; // ✅ Use decoded boutiqueId
    const { dressType, measurementRequirements } = req.body;

    if (!boutiqueId || !dressType) {
      return res.status(400).json({ message: 'boutiqueId and dressType are required' });
    }

    const boutique = await BoutiqueModel.findById(boutiqueId);
    if (!boutique) return res.status(404).json({ message: 'Boutique not found' });

    // ✅ Upload multiple images from req.files.images to Cloudinary
    let imageUrls = [];
    if (req.files && req.files.images) {
      const files = Array.isArray(req.files.images) ? req.files.images : [req.files.images];
      const uploads = files.map(file =>
        cloudinary.uploader.upload(file.path, { folder: 'dress_types' })
      );
      const results = await Promise.all(uploads);
      imageUrls = results.map(r => r.secure_url);
    }

    // ✅ Add new dress type with Cloudinary URLs
    boutique.dressTypes.push({
      type: dressType,
      images: imageUrls,
      measurementRequirements: JSON.parse(measurementRequirements || '[]'),
    });

    await boutique.save();

    res.status(200).json({ message: 'Dress type added successfully', boutique });
  } catch (error) {
    console.error('Error adding dress type:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

const deleteDressType = async (req, res) => {
  const boutiqueId = req.boutiqueId; // ✅ Use decoded boutiqueId
  const { dressType } = req.body;

  try {
    const boutique = await BoutiqueModel.findById(boutiqueId);
    if (!boutique) return res.status(404).json({ message: 'Boutique not found' });

    // Filter the dressTypes array to remove the specified dress type
    boutique.dressTypes = boutique.dressTypes.filter((type) => type.type !== dressType);
    await boutique.save();

    res.status(200).json({ message: 'Dress type deleted successfully', boutique });
  } catch (error) {
    console.error('Error deleting dress type:', error);
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
    const boutiqueId = req.boutiqueId; // Extracted from middleware
    const { userId, status } = req.query;

    // ✅ Validate ObjectId if provided
    if (boutiqueId && !mongoose.Types.ObjectId.isValid(boutiqueId)) {
      return res.status(400).json({ error: "Invalid boutique ID" });
    }
    if (userId && !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ error: "Invalid user ID" });
    }

    // ✅ Allowed order statuses
    const validStatuses = [
      "In Progress",
      "Ready for Delivery",
    ];

    // ✅ Build query
    const query = {};
    if (boutiqueId) query.boutiqueId = boutiqueId;
    if (userId) query.userId = userId;

    if (status) {
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: `Invalid status. Allowed values: ${validStatuses.join(", ")}` });
      }
      query.status = status;
    } else {
      // Default to fetching active/paid orders if no status provided
      query["bill.status"] = "Paid";
    }

    // ✅ Fetch orders
    const orders = await OrderModel.find(query)
      .populate("userId", "name phone")
      .populate("boutiqueId", "name location")
      .sort({ createdAt: -1 });

    res.status(200).json({
      message: `Found ${orders.length} order(s).`,
      orders,
    });
  } catch (error) {
    console.error("Error fetching orders:", error);
    res.status(500).json({ error: "Server error", details: error.message });
  }
};

export const logoutBoutique = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Access token missing or invalid." });
    }

    const accessToken = authHeader.split(" ")[1];

    const decoded = jwt.verify(accessToken, process.env.ACCESS_TOKEN_SECRET);
    const boutiqueId = decoded.userId;

    // Blacklist the access token
    const expiresAt = new Date(decoded.exp * 1000);
    await BlacklistedToken.create({ token: accessToken, expiresAt });

    // Clear refresh token from DB
    await BoutiqueModel.findByIdAndUpdate(boutiqueId, { refreshToken: null });

    // Optionally clear refresh token cookie
    res.clearCookie("refreshToken", { httpOnly: true, secure: true, sameSite: "strict" });

    res.status(200).json({ message: "Logged out successfully." });
  } catch (error) {
    console.error("Logout error:", error.message);
    res.status(500).json({ message: "Logout failed", error: error.message });
  }
};


export const getBoutiqueAreas = async (req, res) => {
  try {
    const boutiqueId = req.boutiqueId;

    if (!boutiqueId) {
      return res.status(401).json({ message: "Unauthorized. Boutique ID missing from token." });
    }

    // ✅ Get all boutique areas
    const boutiques = await BoutiqueModel.find({}, 'area').lean();
    
    // Filter areas that are defined in enum list
    const usedAreas = [
      ...new Set(
        boutiques
          .map(b => b.area?.trim())
          .filter(area => predefinedHyderabadAreas.includes(area))
      ),
    ];

    res.status(200).json({
      success: true,
      message: "All boutique areas (filtered from predefined list)",
      areas: usedAreas,
    });
  } catch (err) {
    console.error("Error fetching boutique areas:", err.message);
    res.status(500).json({ success: false, message: "Server error", error: err.message });
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