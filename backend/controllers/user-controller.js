import UserModel from "../models/userschema.js";
import jwt from "jsonwebtoken";
import { sendOTP } from "../utils/otpService.js";

const OTP_EXPIRATION_TIME = 5

const REFRESH_TOKEN_EXPIRATION = 3

const registerUser = async function(req,res){
    try{
        const User = await UserModel.find();
        let {name,phone,address} = req.body;
        if (!name ||!phone){
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
            address,
            otp,
            otpExpiry: Date.now() + OTP_EXPIRATION_TIME * 60 * 1000,
        })

        await sendOTP(phone, otp);

        res.status(200).json({
            message: "OTP sent to your phone. Please verify to complete registration.",
            userId: CreatedUser._id, // Include the user ID to reference during verification
            });
    }catch (error) {
        console.error("Error creating User:", error.message);
        console.error("Stack trace:", error.stack);
    
        if (error.name === 'ValidationError') {
          return res.status(422).json({ error: error.message, details: error.errors });
        }
    
        // Handle other errors
        return res.status(500).send("An unexpected error occurred");
      }
}

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
      if (otp !== otp.toString()) {
        return res.status(400).json({ message: "Invalid OTP. Please try again." });
      }
  
      // Generate tokens after successful OTP verification
      const accessToken = jwt.sign({ userId: user._id, name: user.name }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: "15m" });
      const refreshToken = jwt.sign({ userId: user._id }, process.env.REFRESH_TOKEN_SECRET, { expiresIn: `${REFRESH_TOKEN_EXPIRATION}m` });
  
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
  
export { registerUser, verifyOtp, Userlogin };
  