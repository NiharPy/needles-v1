import UserModel from "../models/userschema.js";
import jwt from "jsonwebtoken";
import { sendOTP } from "../utils/otpService.js";
import axios from 'axios';
import mongoose from "mongoose";
import BlacklistedToken from '../models/BlacklistedToken.js';
import { generateAccessToken, generateRefreshToken } from "../utils/token.js";

const OTP_EXPIRATION_TIME = 5


const registerUser = async function(req, res) {
  try {
    let { name, phone } = req.body;

    if (!name || !phone) {
      return res.status(400).send("All fields (name, phone number) are required");
    }

    const existingUser = await UserModel.findOne({ phone });
    if (existingUser) {
      return res.status(409).send("Phone number already exists");
    }

    const otp = Math.floor(100000 + Math.random() * 900000); // 6-digit OTP

    const CreatedUser = await UserModel.create({
      name,
      phone,
      otp,
      otpExpiry: Date.now() + OTP_EXPIRATION_TIME * 60 * 1000,
    });

    // ✅ OTP is generated but NOT sent via Twilio
    // You may log it for development/debugging:
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

    // Save refresh token, clear OTP data
    user.refreshToken = refreshToken;
    user.otp = null;
    user.otpExpiry = null;
    await user.save();

    // Send tokens in response (not cookies)
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
      const { userId } = req.params;
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
          formattedAddress = await getPlaceNameFromLatLng(lat, lng);  // Directly get the formatted address
          console.log("Formatted Address Found:", formattedAddress); // Log the formatted address
          if (!formattedAddress) {
            formattedAddress = "Address not found";  // Fallback if no formatted address
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
  

  const UserLogout = async function (req, res) {
    try {
      const token = req.headers.authorization?.split(" ")[1]; // Extract token from header
  
      if (!token) {
        return res.status(400).json({ message: "No token provided." });
      }
  
      const decoded = jwt.decode(token); // Decode token to get expiration time
  
      // Save token to blacklist
      await BlacklistedToken.create({
        token,
        expiresAt: new Date(decoded.exp * 1000), // JWT expiry time
      });
  
      res.status(200).json({ message: "Logged out successfully." });
    } catch (error) {
      console.error("Error during logout:", error);
      res.status(500).json({ message: "An error occurred during logout." });
    }
  };
  

export { updateUserLocation };
  
export { registerUser, verifyOtp, Userlogin, UserLogout };
  