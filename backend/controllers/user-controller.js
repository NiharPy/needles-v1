import UserModel from "../models/userschema.js";
import jwt from "jsonwebtoken";
import { sendOTP } from "../utils/otpService.js";
import axios from 'axios';
import mongoose from "mongoose";

const OTP_EXPIRATION_TIME = 5


const registerUser = async function(req, res) {
  try {
      const User = await UserModel.find();
      let { name, phone } = req.body;  // Removed address from destructuring
      if (!name || !phone) {  // Only check for name and phone
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

      await sendOTP(phone, otp);

      res.status(200).json({
          message: "OTP sent to your phone. Please verify to complete registration.",
          userId: CreatedUser._id, // Include the user ID to reference during verification
      });
  } catch (error) {
      console.error("Error creating User:", error.message);
      console.error("Stack trace:", error.stack);

      if (error.name === 'ValidationError') {
          return res.status(422).json({ error: error.message, details: error.errors });
      }

      // Handle other errors
      return res.status(500).send("An unexpected error occurred");
  }
};


const Userlogin = async function(req,res) {
    try {
        const { phone } = req.body;

        // Validate phone number input
        if (!phone) {
            return res.status(400).json({ message: "Phone number is required." });
        }

        // Check if the user exists
        const user = await UserModel.findOne({ phone });
        if (!user) {
            return res.status(404).json({ message: "User not found. Please register first." });
        }

        // Generate a new OTP
        const otp = Math.floor(100000 + Math.random() * 900000); // 6-digit OTP

        // Update the OTP and expiration time in the database
        user.otp = otp;
        user.otpExpiry = Date.now() + OTP_EXPIRATION_TIME * 60 * 1000;
        await user.save();

        // Send OTP to the user's phone number
        await sendOTP(phone, otp);

        res.status(200).json({
            message: "OTP sent to your phone. Please verify to complete login.",
            userId: user._id, // Include the user ID to reference during verification
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
  
      // Find user by phone number (instead of userId)
      const user = await UserModel.findOne({ phone });
      if (!user) {
        return res.status(404).json({ message: "User not found." });
      }
  
      // Check if OTP is expired
      if (Date.now() > user.otpExpiry) {
        return res.status(400).json({ message: "OTP has expired. Please request a new one." });
      }
  
      // Verify OTP (no need to hash, just compare)
      if (otp !== user.otp) {
        return res.status(400).json({ message: "Invalid OTP. Please try again." });
      }
  
      // Generate tokens after successful OTP verification
      const accessToken = jwt.sign({ userId: user._id, name: user.name }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: "30d" });
      const refreshToken = jwt.sign({ userId: user._id }, process.env.REFRESH_TOKEN_SECRET, { expiresIn: "30d" });
  
      // Save refresh token
      user.refreshToken = refreshToken;
      await user.save();
  
      res.status(200).json({
        message: "User authenticated successfully.",
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
      const { userId } = req.params; // Get userId from URL params
      console.log("Received userId:", userId, "Type of userId:", typeof userId); // Log for debugging
  
      const { lat, lng } = req.body;
  
      // Validate the userId format before processing
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(400).json({ error: "Invalid user ID format" });
      }
  
      // Convert userId to ObjectId using 'new' keyword
      const validUserId = new mongoose.Types.ObjectId(userId);
  
      // Call geocoding function to get formatted address
      const formattedAddress = await getPlaceNameFromLatLng(lat, lng);
  
      // Update user location
      const updatedUser = await UserModel.findByIdAndUpdate(
        validUserId,
        {
          $set: {
            'address.location.lat': lat,
            'address.location.lng': lng,
            'address.street': formattedAddress, // Store formatted address
          },
        },
        { new: true } // Return the updated user
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
  

export { updateUserLocation };
  
export { registerUser, verifyOtp, Userlogin };
  