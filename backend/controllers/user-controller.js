import UserModel from "../models/userschema.js";
import BoutiqueModel from "../models/BoutiqueMarketSchema.js";
import fs from 'fs';
import fetch from 'node-fetch';
import sharp from 'sharp';
import { pipeline, RawImage } from '@xenova/transformers';
import UserInteraction from "../models/UserActivity.js";
import jwt from "jsonwebtoken";
import { sendOTP } from "../utils/otpService.js";
import axios from 'axios';
import mongoose from "mongoose";
import BlacklistedToken from '../models/BlacklistedToken.js';
import { generateAccessToken, generateRefreshToken } from "../utils/token.js";
import { predefinedHyderabadAreas } from '../constants/areas.js';
import { getQdrantClient } from '../config/qdrant.js';

const OTP_EXPIRATION_TIME = 5


const registerUser = async function (req, res) {
  try {
    let {
      name,
      phone,
      address = {}, // address can be empty if not sent
    } = req.body;

    if (!name || !phone) {
      return res.status(400).send("All fields (name, phone number) are required");
    }

    const existingUser = await UserModel.findOne({ phone });
    if (existingUser) {
      return res.status(409).send("Phone number already exists");
    }

    const otp = Math.floor(100000 + Math.random() * 900000); // 6-digit OTP

    let formattedAddress = null;
    const lat = address.location?.lat;
    const lng = address.location?.lng;

    if (lat && lng) {
      try {
        formattedAddress = await getPlaceNameFromLatLng(lat, lng);
        console.log("Formatted Address Found:", formattedAddress);
        if (!formattedAddress) {
          formattedAddress = "Address not found";
          console.log("No formatted address found.");
        }
      } catch (error) {
        console.error("Error fetching formatted address:", error.message);
        return res.status(400).json({ error: "Unable to fetch formatted address" });
      }
    }

    const CreatedUser = await UserModel.create({
      name,
      phone,
      otp,
      otpExpiry: Date.now() + OTP_EXPIRATION_TIME * 60 * 1000,
      address: {
        flatNumber: address.flatNumber,
        block: address.block,
        street: address.street,
        formattedAddress, // Add the formatted address from reverse geocoding
        location: {
          lat,
          lng,
        },
      },
    });

    console.log(`OTP for ${phone}: ${otp}`);

    res.status(200).json({
      message: "OTP generated. Please verify to complete registration.",
      userId: CreatedUser._id,
    });

  } catch (error) {
    console.error("Error creating User:", error.message);
    console.error("Stack trace:", error.stack);

    if (error.name === 'ValidationError') {
      return res.status(422).json({ error: error.message, details: error.errors });
    }

    return res.status(500).send("An unexpected error occurred");
  }
};



const Userlogin = async function(req, res) {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({ message: "Phone number is required." });
    }

    const user = await UserModel.findOne({ phone });
    if (!user) {
      return res.status(404).json({ message: "User not found. Please register first." });
    }

    const otp = Math.floor(100000 + Math.random() * 900000); // 6-digit OTP

    user.otp = otp;
    user.otpExpiry = Date.now() + OTP_EXPIRATION_TIME * 60 * 1000;
    await user.save();

    // ✅ OTP is generated but NOT sent via Twilio
    console.log(`Login OTP for ${phone}: ${otp}`);

    res.status(200).json({
      message: "OTP generated. Please verify to complete login.",
      userId: user._id,
    });

  } catch (error) {
    console.error("Error during login:", error.message);
    console.error("Stack trace:", error.stack);

    res.status(500).json({ message: "An unexpected error occurred during login." });
  }
};

const verifyOtp = async (req, res) => {
  try {
    const { phone, otp } = req.body;

    if (!phone || !otp) {
      return res.status(400).json({ message: "Phone number and OTP are required." });
    }

    const user = await UserModel.findOne({ phone });
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    if (!user.otp || Date.now() > user.otpExpiry) {
      return res.status(400).json({ message: "OTP has expired or is invalid." });
    }

    if (otp !== user.otp) {
      return res.status(400).json({ message: "Invalid OTP. Please try again." });
    }

    // Generate JWT tokens
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    // ✅ Bypass validation error by using updateOne directly
    await UserModel.updateOne(
      { _id: user._id },
      {
        $set: {
          refreshToken,
          otp: null,
          otpExpiry: null,
        }
      }
    );

    res.status(200).json({
      message: "User authenticated successfully.",
      user: {
        _id: user._id,
        name: user.name,
        role: user.role,
        phone: user.phone,
      },
      accessToken,
      refreshToken,
    });

  } catch (error) {
    console.error("Error verifying OTP:", error);
    res.status(500).json({ message: "Server error. Please try again." });
  }
};

  // Function to get place name from latitude and longitude using Google Maps Geocode API
  const getPlaceNameFromLatLng = async (lat, lng) => {
    try {
      const response = await axios.get(
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${process.env.GOOGLE_MAPS_API_KEY}`
      );
  
      if (response.data.status === 'OK') {
        const formattedAddress = response.data.results[0]?.formatted_address;
        return formattedAddress || null;
      } else {
        throw new Error('Geocode API failed to fetch place name');
      }
    } catch (error) {
      console.error('Error fetching place name:', error);
      throw error;
    }
  };
  
  // Controller to update user's location
  const updateUserLocation = async (req, res) => {
    try {
      const userId = req.userId; // ✅ Injected from JWT
      console.log("Received userId:", userId, "Type of userId:", typeof userId);
  
      const { lat, lng, flatNumber, block, street } = req.body;
  
      // Validate the userId format before processing
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(400).json({ error: "Invalid user ID format" });
      }
  
      // Convert userId to ObjectId using 'new' keyword
      const validUserId = new mongoose.Types.ObjectId(userId);
  
      // Validate that required address fields are provided
      if (!flatNumber || !block || !street) {
        return res.status(400).json({
          error: "Flat number, block, and street are required fields",
        });
      }
  
      // Fetch formatted address using geocoding API
      let formattedAddress = null;
      if (lat && lng) {
        try {
          formattedAddress = await getPlaceNameFromLatLng(lat, lng); // Directly get the formatted address
          console.log("Formatted Address Found:", formattedAddress); // Log the formatted address
          if (!formattedAddress) {
            formattedAddress = "Address not found"; // Fallback if no formatted address
            console.log("No formatted address found.");
          }
        } catch (error) {
          console.error("Error fetching formatted address:", error.message);
          return res.status(400).json({ error: "Unable to fetch formatted address" });
        }
      }
  
      console.log("Final formattedAddress value:", formattedAddress); // Log the final value of formattedAddress
  
      // Proceed to update the user's location
      const updatedUser = await UserModel.findByIdAndUpdate(
        validUserId,
        {
          $set: {
            'address.location.lat': lat,
            'address.location.lng': lng,
            'address.flatNumber': flatNumber,
            'address.block': block,
            'address.street': street,
            'address.formattedAddress': formattedAddress, // Set the formatted address
          },
        },
        { new: true }
      );
  
      if (!updatedUser) {
        return res.status(404).json({ error: "User not found" });
      }
  
      res.status(200).json({
        message: "User location updated successfully",
        user: updatedUser,
      });
    } catch (error) {
      console.error("Error updating user location:", error.message);
      res.status(500).json({ error: "An unexpected error occurred" });
    }
  };  
  

  export const logout = async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
  
      if (!authHeader?.startsWith("Bearer ")) {
        return res.status(401).json({ message: "Access token missing or invalid." });
      }
  
      const token = authHeader.split(" ")[1];
  
      // 🧠 Decode token to get expiry timestamp
      const decoded = jwt.decode(token);
  
      // Use decoded expiration or default to 15 mins from now
      const expiresAt = decoded?.exp
        ? new Date(decoded.exp * 1000)
        : new Date(Date.now() + 15 * 60 * 1000);
  
      // 🛑 Blacklist the token
      await BlacklistedToken.create({ token, expiresAt });
  
      // 🧹 Remove refresh token from user record
      const userId = req.userId;
      const user = await UserModel.findById(userId);
  
      if (user) {
        user.refreshToken = null;
        await user.save();
      }
  
      return res.status(200).json({ message: "Logged out successfully." });
    } catch (error) {
      console.error("Logout error:", error);
      return res.status(500).json({ message: "Internal server error." });
    }
  };

  export const getUserDetails = async (req, res) => {
    try {
      const userId = req.userId; // injected by authMiddleware
  
      const user = await UserModel.findById(userId).select({
        name: 1,
        phone: 1,
        "address.flatNumber": 1,
        "address.block": 1,
        "address.street": 1,
      });
  
      if (!user) {
        return res.status(404).json({ message: "User not found." });
      }
  
      res.status(200).json({ user });
    } catch (error) {
      console.error("Error fetching user details:", error);
      res.status(500).json({ message: "Internal server error." });
    }
  };

  export const updateUserName = async (req, res) => {
    try {
      const userId = req.userId; // Injected by authMiddleware
      const { name } = req.body;
  
      if (!name || typeof name !== "string" || name.trim().length === 0) {
        return res.status(400).json({ message: "Name is required and must be a valid string." });
      }
  
      const updatedUser = await UserModel.findByIdAndUpdate(
        userId,
        { name: name.trim() },
        { new: true, select: "name phone" }
      );
  
      if (!updatedUser) {
        return res.status(404).json({ message: "User not found." });
      }
  
      res.status(200).json({ message: "Name updated successfully.", user: updatedUser });
    } catch (error) {
      console.error("Error updating user name:", error);
      res.status(500).json({ message: "Internal server error." });
    }
  };
  
  


  export const getAllBoutiqueAreas = async (req, res) => {
    try {
      const userId = req.userId; // ✅ Injected by auth-user.js middleware
  
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized access." });
      }
  
      // ✅ Filter only those predefined areas that are already in use by some boutique
      const usedAreasInDb = await BoutiqueModel.distinct("area", { area: { $ne: null } });
  
      const filteredAreas = predefinedHyderabadAreas.filter(area =>
        usedAreasInDb.includes(area)
      ).sort();
  
      if (filteredAreas.length === 0) {
        return res.status(404).json({ message: "No predefined areas found in use." });
      }
  
      res.status(200).json({
        message: "Boutique areas fetched successfully.",
        areas: filteredAreas,
      });
    } catch (error) {
      console.error("Error fetching boutique areas:", error);
      res.status(500).json({ message: "Server error while fetching areas." });
    }
  };

  export const saveUserFcmToken = async (req, res) => {
    try {
      const { token } = req.body;
      const userId = req.userId;
      const user = await UserModel.findById(userId);
      if (!user) return res.status(404).json({ message: 'User not found' });
  
      user.fcmToken = token;
      await user.save();
      res.status(200).json({ message: 'Token saved successfully' });
    } catch (err) {
      res.status(500).json({ message: 'Failed to save token' });
    }
  };

  let embedder = null;

  async function getEmbedder() {
    if (!embedder) {
      // Use 'image-feature-extraction' for vision models, not 'feature-extraction'
      embedder = await pipeline('image-feature-extraction', 'Xenova/clip-vit-base-patch32');
    }
    return embedder;
  }
  
  export const generateEmbedding = async (imagePathOrUrl) => {
    try {
      const model = await getEmbedder();
      
      // Let RawImage handle the image loading and preprocessing
      const image = await RawImage.read(imagePathOrUrl);
      
      // Generate embedding using the image pipeline
      const result = await model(image);
      
      // Extract embedding data - for CLIP vision models, it's usually in result directly
      let embeddings;
      if (result && result.length > 0 && result[0].data) {
        embeddings = result[0].data;
      } else if (result && result.data) {
        embeddings = result.data;
      } else if (Array.isArray(result)) {
        embeddings = result.flat();
      } else {
        embeddings = result;
      }
      
      if (!embeddings || embeddings.length === 0) {
        throw new Error('No embedding data returned from model');
      }
      
      // Convert to array if needed
      const flat = Array.isArray(embeddings) ? embeddings : Array.from(embeddings);
      
      // Normalize the embedding
      const norm = Math.sqrt(flat.reduce((sum, val) => sum + val * val, 0)) || 1;
      return flat.map(x => x / norm);
  
    } catch (err) {
      console.error('❌ Embedding failed:', err.message);
      throw new Error(`Embedding failed: ${err.message}`);
    }
  };
  
  // Alternative approach with manual preprocessing if needed
  export const generateEmbeddingManual = async (imagePathOrUrl) => {
    try {
      const model = await getEmbedder();
      let imageBuffer;
  
      // Load image
      if (imagePathOrUrl.startsWith('http://') || imagePathOrUrl.startsWith('https://')) {
        const response = await fetch(imagePathOrUrl);
        if (!response.ok) throw new Error('Failed to fetch image from URL');
        imageBuffer = Buffer.from(await response.arrayBuffer());
      } else {
        if (!fs.existsSync(imagePathOrUrl)) throw new Error('Local file not found');
        imageBuffer = fs.readFileSync(imagePathOrUrl);
      }
  
      // Process with Sharp and create RawImage
      const { data, info } = await sharp(imageBuffer)
        .resize(224, 224)
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
  
      const image = new RawImage(new Uint8Array(data), info.width, info.height, info.channels);
      
      const result = await model(image);
      
      let embeddings;
      if (result && result.length > 0 && result[0].data) {
        embeddings = result[0].data;
      } else if (result && result.data) {
        embeddings = result.data;
      } else {
        embeddings = result;
      }
      
      const flat = Array.isArray(embeddings) ? embeddings : Array.from(embeddings);
      const norm = Math.sqrt(flat.reduce((sum, val) => sum + val * val, 0)) || 1;
      return flat.map(x => x / norm);
  
    } catch (err) {
      console.error('❌ Manual embedding failed:', err.message);
      throw new Error(`Embedding failed: ${err.message}`);
    }
  };
  
  export const searchSimilarDressImages = async (req, res) => {
    let imagePath = null;
  
    try {
      const userId = req.userId;
  
      if (!req.file) {
        return res.status(400).json({ message: 'Image is required' });
      }
  
      imagePath = req.file.path;
  
      // Step 1: Generate embedding
      const embedding = await generateEmbedding(imagePath);
  
      // Step 2: Log search
      await UserInteraction.create({
        userId,
        type: 'search',
        content: 'image_search',
        embedding,
      });
  
      // Step 3: Qdrant vector search
      const qdrant = await getQdrantClient();
      const results = await qdrant.search('dress_types', {
        vector: embedding,
        limit: 10,
        with_payload: true,
        score_threshold: 0.25,
      });
  
      if (!results || results.length === 0) {
        return res.status(200).json({
          message: 'No similar images found',
          results: [],
        });
      }
  
      // Step 4: Map boutique data
      const boutiqueIds = [...new Set(results.map(r => r.payload.boutiqueId))];
      const boutiques = await BoutiqueModel.find({ _id: { $in: boutiqueIds } });
  
      const boutiqueMap = new Map();
      boutiques.forEach(b => boutiqueMap.set(String(b._id), b));
  
      const response = results.map(r => {
        const b = boutiqueMap.get(r.payload.boutiqueId);
        return {
          boutiqueId: r.payload.boutiqueId,
          boutiqueName: b?.name || 'Unknown',
          area: b?.area || '',
          dressType: r.payload.dressType,
          imageUrl: r.payload.imageUrl,
          similarity: r.score,
        };
      });
  
      res.status(200).json({
        message: 'Search complete',
        matches: response,
      });
  
    } catch (err) {
      console.error('❌ Error in image search:', err);
      res.status(500).json({
        message: 'Failed to search image',
        error: err.message,
      });
    } finally {
      if (imagePath && fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }
  };
  
  
export { updateUserLocation };
  
export { registerUser, verifyOtp, Userlogin  };
  