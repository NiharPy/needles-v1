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
import haversine from "haversine-distance";
import axios from "axios";

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
    });

    // ✅ Generate a semantic string for embedding
    const combinedText = `
      Boutique name: ${name}
      Location: ${parsedLocation?.address || ''}
      Dress types: ${parsedDressTypes?.join(', ')}
      Catalogue: ${parsedCatalogue?.join(', ')}
      Rating: ${CreatedBoutique.rating || 'No rating yet'}
    `;

    // ✅ Get vector embedding
    const embedding = await getEmbedding(combinedText); // returns an array of numbers

    // ✅ Save embedding in the boutique document
    CreatedBoutique.embedding = embedding;
    await CreatedBoutique.save();

    return res.status(201).json(CreatedBoutique);

  } catch (error) {
    console.error("Error creating Boutique:", error);

    if (error.name === 'ValidationError') {
      return res.status(422).json({ error: error.message, details: error.errors });
    }

    return res.status(500).send("An unexpected error occurred");
  }
};

export const updateBoutiqueEmbedding = async (boutiqueId) => {
  const boutique = await BoutiqueModel.findById(boutiqueId).lean();
  if (!boutique) throw new Error("Boutique not found");

  const combinedText = `
    Boutique name: ${boutique.name}
    Location: ${boutique.location?.address || ''}
    Dress types: ${boutique.dressTypes?.join(', ') || ''}
    Catalogue: ${boutique.catalogue?.join(', ') || ''}
    Rating: ${boutique.rating || 'No rating yet'}
  `;

  const embedding = await getEmbeddingForText(combinedText);
  await BoutiqueModel.findByIdAndUpdate(boutiqueId, { embedding });
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

    // ✅ Recalculate embedding based on updated fields
    await updateBoutiqueEmbedding(boutiqueId);

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
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized access." });
    }

    const { query } = req.query;
    if (!query) {
      return res.status(400).json({ message: 'Query is required for semantic search' });
    }

    // 🧠 Query Parser Function
    const parseQuery = (query) => {
      const ratingRegex = /(\d(\.\d)?)(\s?stars?|\s?star\s?rating)?/i;
      const areaRegex = /\bin\s([a-zA-Z\s]+)/i;

      const ratingMatch = query.match(ratingRegex);
      const areaMatch = query.match(areaRegex);

      const ratingValue = ratingMatch ? parseFloat(ratingMatch[1]) : null;
      const areaValue = areaMatch ? areaMatch[1].trim() : null;

      let filteredQuery = query;
      if (ratingMatch) filteredQuery = filteredQuery.replace(ratingMatch[0], '');
      if (areaMatch) filteredQuery = filteredQuery.replace(areaMatch[0], '');

      const cleanedQuery = filteredQuery.trim();

      return { cleanedQuery, ratingValue, areaValue };
    };

    // 🧼 Parse the query
    const { cleanedQuery, ratingValue, areaValue } = parseQuery(query);
    console.log("Semantic Search →", { cleanedQuery, ratingValue, areaValue });

    // 🧠 Generate embedding from cleaned query
    const queryVector = await getEmbedding(cleanedQuery);
    if (!queryVector || !Array.isArray(queryVector) || queryVector.length < 100) {
      return res.status(500).json({
        success: false,
        message: 'Failed to generate valid query vector for semantic search.',
      });
    }

    // 📝 Log search interaction
    await logUserActivity(userId, "search", cleanedQuery, queryVector);

    // 🔍 MongoDB $search pipeline
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
      ...(ratingValue ? [{ $match: { averageRating: { $gte: ratingValue } } }] : []),
      ...(areaValue ? [{ $match: { area: { $regex: areaValue, $options: 'i' } } }] : []),
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
      { $sort: { averageRating: -1, score: -1 } },
      { $limit: 10 }
    ];

    const boutiques = await BoutiqueModel.aggregate(pipeline).exec();

    // ⛑️ Fallback if empty
    if (!boutiques.length) {
      console.warn("⚠️ Semantic search returned no results. Falling back...");
      const fallback = await BoutiqueModel.find()
        .limit(3)
        .select("name area averageRating catalogue dressTypes");

      return res.status(200).json({
        message: "No semantic matches found. Showing fallback results.",
        results: fallback,
      });
    }

    // ✅ Send results
    return res.status(200).json({
      message: "Semantic search results",
      results: boutiques,
    });

  } catch (error) {
    console.error('Semantic Search Error:', error);
    return res.status(500).json({
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
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized access." });
    }

    const user = await UserModel.findById(userId).lean();
    if (!user?.address?.location?.lat || !user?.address?.location?.lng) {
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
      return res.status(404).json({ message: "No boutiques with valid coordinates." });
    }

    // 👇 Prepare destinations for Distance Matrix
    const destinations = boutiquesWithCoords
      .map(b => `${b.location.latitude},${b.location.longitude}`)
      .join("|");

    // 📦 Get actual distance from Google Maps
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
      return res.status(500).json({ message: "Failed to fetch distance data from Google Maps." });
    }

    // 🧠 Score based on rating + actual road distance
    const scored = boutiquesWithCoords.map((boutique, i) => {
      const distanceKm = distances[i]?.distance?.value / 1000 || 100;
      const ratingScore = boutique.averageRating || 0;
      const distanceScore = distanceKm > 30 ? 0 : 1 - distanceKm / 30;
      const combinedScore = ratingScore * 0.6 + distanceScore * 0.4;

      return {
        ...boutique,
        distanceKm: +distanceKm.toFixed(2),
        totalRating: boutique.ratings?.length || 0,
        combinedScore,
      };
    });

    // 📊 Sort by combined score (highest rating + closest)
    const sorted = scored
      .sort((a, b) => b.combinedScore - a.combinedScore)
      .slice(0, 10);

    // 📝 Log viewed top 5 recommended with embedding
    for (const boutique of sorted.slice(0, 5)) {
      await logUserActivity(userId, "view", `Boutique:${boutique.name}`, boutique.embedding);
    }

    return res.status(200).json({
      message: "Recommended boutiques fetched successfully.",
      recommendedBoutiques: sorted,
    });

  } catch (error) {
    console.error(`Error fetching recommended boutiques for user ${req.userId}:`, error.message);
    return res.status(500).json({ message: "An error occurred while fetching boutiques" });
  }
};


const canonicalLabels = ["Lehenga", "Saree Blouse", "Kurta", "Gown", "Sherwani", "Choli"];

const canonicalImageMap = [
  { label: "Lehenga", imageUrl: "https://res.cloudinary.com/dwymmpkh8/image/upload/v1750006122/kclivthf8zch7iuoan0w.png" },
  { label: "Saree Blouse", imageUrl: "https://res.cloudinary.com/dwymmpkh8/image/upload/v1750008468/zdoim8ei442krnqfpdqn.png" },
  { label: "Kurta", imageUrl: "https://res.cloudinary.com/dwymmpkh8/image/upload/v1750009018/iibnx4qavyeqjlddgo7v.png" },
  { label: "Gown", imageUrl: "https://res.cloudinary.com/dwymmpkh8/image/upload/v1750009232/jusfhpyhzwefnpjptyyb.png" },
  { label: "Sherwani", imageUrl: "https://res.cloudinary.com/dwymmpkh8/image/upload/v1750009421/tgzz5dch348vdgiqtunx.png" },
  { label: "Choli", imageUrl: "https://res.cloudinary.com/dwymmpkh8/image/upload/v1750009684/ciu9ddfyunzcmlaip1ig.png" },
];

const normalize = str => str.trim().toLowerCase();

const imageMap = {};
canonicalImageMap.forEach(({ label, imageUrl }) => {
  imageMap[normalize(label)] = imageUrl;
});

const GOOGLE_DISTANCE_MATRIX_KEY = process.env.GOOGLE_MAPS_API_KEY;

export const getRecommendedDressTypes = async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized access." });

    const user = await UserModel.findById(userId).lean();
    if (!user?.address?.location?.lat || !user?.address?.location?.lng) {
      return res.status(400).json({ message: "User location missing." });
    }

    const userCoords = `${user.address.location.lat},${user.address.location.lng}`;

    const boutiques = await BoutiqueModel.find().lean();
    const boutiqueWithCoords = boutiques.filter(b => b.location?.latitude && b.location?.longitude);

    if (boutiqueWithCoords.length === 0) {
      return res.status(404).json({ message: "No valid boutique coordinates available." });
    }

    // 🔐 GOOGLE API - wrapped safely
    let distances;
    try {
      const destinations = boutiqueWithCoords.map(b => `${b.location.latitude},${b.location.longitude}`).join("|");
      const distanceRes = await axios.get("https://maps.googleapis.com/maps/api/distancematrix/json", {
        params: {
          origins: userCoords,
          destinations,
          key: GOOGLE_DISTANCE_MATRIX_KEY,
        },
      });
      distances = distanceRes.data?.rows?.[0]?.elements;
      if (!distances) throw new Error("No distance data returned.");
    } catch (err) {
      console.error("Google Maps API Error:", err?.response?.data || err.message);
      if (err.response?.status === 401) {
        return res.status(500).json({ message: "Google Maps API Unauthorized. Check your API key." });
      }
      return res.status(500).json({ message: "Failed to fetch distance data from Google Maps." });
    }

    const boutiqueScores = boutiqueWithCoords.map((boutique, i) => {
      const rating = boutique.averageRating || 0;
      const distanceKm = (distances[i]?.distance?.value || 1000000) / 1000;
      const score = (0.75 * rating) + (0.25 * (1 / (distanceKm + 1)));
      return { ...boutique, score };
    });

    const topBoutiques = boutiqueScores.sort((a, b) => b.score - a.score).slice(0, 10);

    // 🔍 STEP 1: Collect all raw dress types
    const rawTypes = [];
    topBoutiques.forEach(b => {
      (b.dressTypes || []).forEach(dt => {
        const raw = dt.type?.trim();
        if (raw) rawTypes.push(raw);
      });
    });

    // 🔐 STEP 2 & 3: Get embeddings from OpenAI
    let canonicalEmbeddings, rawEmbeddings;
    try {
      const [canonicalRes, rawRes] = await Promise.all([
        axios.post("https://api.openai.com/v1/embeddings", {
          input: canonicalLabels,
          model: "text-embedding-3-small",
        }, {
          headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          },
        }),
        axios.post("https://api.openai.com/v1/embeddings", {
          input: rawTypes,
          model: "text-embedding-3-small",
        }, {
          headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          },
        }),
      ]);
      canonicalEmbeddings = canonicalRes.data.data.map(d => d.embedding);
      rawEmbeddings = rawRes.data.data.map(d => d.embedding);
    } catch (err) {
      console.error("OpenAI Embedding API Error:", err?.response?.data || err.message);
      if (err.response?.status === 401) {
        return res.status(500).json({ message: "OpenAI API Unauthorized. Check your API key or access level." });
      }
      return res.status(500).json({ message: "Failed to fetch embeddings from OpenAI." });
    }

    // 🔄 STEP 4: Match raw labels to canonical ones
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

    // 🧠 STEP 5: User history + scoring
    const userEmbeddings = await getRecentUserEmbeddings(userId, "view", 50);

    if (userEmbeddings.length === 0) {
      return res.status(200).json({
        message: "No user activity yet. Showing trending dress types.",
        dressTypes: uniqueLabels.map(label => ({
          label,
          imageUrl: imageMap[normalize(label)] || null,
          count: canonicalCountMap[label] || 1,
        })),
      });
    }

    // STEP 6: Embed unique labels
    let labelEmbeddings;
    try {
      const labelRes = await axios.post("https://api.openai.com/v1/embeddings", {
        input: uniqueLabels,
        model: "text-embedding-3-small",
      }, {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
      });
      labelEmbeddings = labelRes.data.data.map(d => d.embedding);
    } catch (err) {
      console.error("OpenAI Embedding (labels) Error:", err?.response?.data || err.message);
      return res.status(500).json({ message: "Failed to embed dress type labels." });
    }

    const relevanceScores = uniqueLabels.map((label, idx) => {
      const avgSim = userEmbeddings.reduce((sum, emb) => {
        return sum + cosineSimilarity(labelEmbeddings[idx], emb);
      }, 0) / userEmbeddings.length;

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

    res.status(200).json({
      message: "Recommended dress types using distance, rating and user activity",
      dressTypes: sorted,
    });

  } catch (err) {
    console.error("Error in getRecommendedDressTypes:", err.message);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};


export const getTopRatedNearbyBoutiquesForDressType = async (req, res) => {
  try {
    const userId = req.userId;
    const selectedType = req.params.dressType?.trim();

    if (!userId || !selectedType) {
      return res.status(400).json({ message: "Missing user ID or dress type." });
    }

    // Get user location
    const user = await UserModel.findById(userId).lean();
    if (!user?.address?.location?.lat || !user?.address?.location?.lng) {
      return res.status(400).json({ message: "User location is missing." });
    }

    const userLoc = `${user.address.location.lat},${user.address.location.lng}`;

    // Get all boutiques with valid coordinates
    const allBoutiques = await BoutiqueModel.find().lean();
    const boutiquesWithCoords = allBoutiques.filter(
      b => b.location?.latitude && b.location?.longitude
    );

    if (boutiquesWithCoords.length === 0) {
      return res.status(404).json({ message: "No valid boutique coordinates available." });
    }

    // Semantic embedding
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

    // Find closest canonical label
    let bestMatch = null, bestSim = -1;
    canonicalLabels.forEach((canonical, i) => {
      const sim = cosineSimilarity(selectedVector, canonicalEmbeddingRes.data.data[i].embedding);
      if (sim > bestSim) {
        bestSim = sim;
        bestMatch = canonical;
      }
    });

    // Filter only relevant boutiques offering this dress type
    const relevantBoutiques = boutiquesWithCoords.filter(b =>
      b.dressTypes.some(dt => dt.type?.trim().toLowerCase() === bestMatch.toLowerCase())
    );

    if (relevantBoutiques.length === 0) {
      return res.status(404).json({ message: `No boutiques found offering ${bestMatch}.` });
    }

    // Prepare destinations for Distance Matrix API
    const destinations = relevantBoutiques
      .map(b => `${b.location.latitude},${b.location.longitude}`)
      .join("|");

    // Call Google Distance Matrix API
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
      return res.status(500).json({ message: "Failed to fetch distance data from Google Maps." });
    }

    // Score based on rating and actual Google distance
    const scored = relevantBoutiques.map((b, i) => {
      const distanceKm = distances[i]?.distance?.value / 1000 || 100; // fallback 100 km if missing
      const ratingScore = b.averageRating || 0;
      const distanceScore = distanceKm > 30 ? 0 : 1 - distanceKm / 30;

      const combinedScore = ratingScore * 0.6 + distanceScore * 0.4;

      return {
        ...b,
        distanceKm: +distanceKm.toFixed(2),
        combinedScore,
      };
    });

    // Get top 5
    const top = scored
      .sort((a, b) => b.combinedScore - a.combinedScore)
      .slice(0, 5);

    // Log viewed boutiques
    for (const boutique of top) {
      await logUserActivity(userId, "view", `Boutique:${boutique.name}`, {
        source: "getTopRatedNearbyBoutiquesForDressType",
        reason: `User searched for ${bestMatch}`,
      });
    }

    return res.status(200).json({
      message: `Top rated boutiques offering ${bestMatch}`,
      dressType: bestMatch,
      boutiques: top,
    });

  } catch (err) {
    console.error("❌ Error in getTopRatedNearbyBoutiquesForDressType:", err.message);
    return res.status(500).json({ message: "Server error", error: err.message });
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