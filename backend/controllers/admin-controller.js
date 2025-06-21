import AdminModel from '../models/AdminSchema.js';
import { sendOTP } from '../utils/otpService.js';
import jwt from 'jsonwebtoken';
import BoutiqueModel from '../models/BoutiqueMarketSchema.js';
import { predefinedHyderabadAreas } from '../constants/areas.js';
 // Assuming you have a separate service to send OTPs
const OTP_EXPIRATION_TIME = 5; 

const registerAdmin = async function(req, res) {
  try {
    // Ensure only one admin exists
    const existingAdmin = await AdminModel.findOne();
    if (existingAdmin) {
      return res.status(409).send("Admin already exists. Only one admin can be created.");
    }

    let { name, phone } = req.body;
    if (!name || !phone) {  // Ensure both name and phone are provided
      return res.status(400).send("Both name and phone number are required.");
    }

    // Check if the phone number is already registered
    const adminWithPhone = await AdminModel.findOne({ phone });
    if (adminWithPhone) {
      return res.status(409).send("Phone number already exists.");
    }

    const otp = Math.floor(100000 + Math.random() * 900000); // Generate a 6-digit OTP

    // Create new admin with OTP and expiration time
    const createdAdmin = await AdminModel.create({
      username: name, // Assuming name is used as the username
      phone,
      otp,
      otpExpiry: Date.now() + OTP_EXPIRATION_TIME * 60 * 1000, // Set OTP expiration time
    });

    console.log("otp : ", otp);

    // Send success response with userId for OTP verification
    res.status(200).json({
      message: "OTP sent to your phone. Please verify to complete registration.",
      userId: createdAdmin._id, // Include the admin ID for later verification
    });

  } catch (error) {
    console.error("Error creating Admin:", error.message);
    console.error("Stack trace:", error.stack);

    // Handle validation errors
    if (error.name === 'ValidationError') {
      return res.status(422).json({ error: error.message, details: error.errors });
    }

    // Handle any unexpected errors
    return res.status(500).send("An unexpected error occurred");
  }
};

const adminLogin = async function(req, res) {
  try {
      const { phone } = req.body;

      // Validate phone number input
      if (!phone) {
          return res.status(400).json({ message: "Phone number is required." });
      }

      // Check if the admin exists
      const admin = await AdminModel.findOne({ phone });
      if (!admin) {
          return res.status(404).json({ message: "Admin not found. Please register first." });
      }

      // Generate a new OTP
      const otp = Math.floor(100000 + Math.random() * 900000); // 6-digit OTP

      // Update the OTP and expiration time in the database
      admin.otp = otp;
      admin.otpExpiry = Date.now() + OTP_EXPIRATION_TIME * 60 * 1000;
      await admin.save();

      console.log(`📲 OTP for admin ${admin.phone}: ${admin.otp}`)

      res.status(200).json({
          message: "OTP sent to your phone. Please verify to complete login.",
          userId: admin._id, // Include the admin ID to reference during verification
      });
  } catch (error) {
      console.error("Error during admin login:", error.message);
      console.error("Stack trace:", error.stack);

      res.status(500).json({ message: "An unexpected error occurred during login." });
  }
};


const verifyOtpAdmin = async (req, res) => {
  try {
    const { phone, otp } = req.body;

    if (!phone || !otp) {
      return res.status(400).json({ message: "Phone number and OTP are required." });
    }

    const admin = await AdminModel.findOne({ phone });
    if (!admin) {
      return res.status(404).json({ message: "Admin account not found." });
    }

    if (!admin.otp || Date.now() > admin.otpExpiry) {
      return res.status(400).json({ message: "OTP has expired or is invalid." });
    }

    if (otp.toString() !== admin.otp.toString()) {
      return res.status(400).json({ message: "Invalid OTP. Please try again." });
    }

    // ✅ Generate JWT tokens
    const accessToken = jwt.sign(
      { userId: admin._id, name: admin.name, role: "admin" },
      process.env.ACCESS_TOKEN_SECRET,
      { expiresIn: "15m" }
    );

    const refreshToken = jwt.sign(
      { userId: admin._id },
      process.env.REFRESH_TOKEN_SECRET,
      { expiresIn: "30d" }
    );

    // 💾 Save refresh token and clear OTP
    admin.refreshToken = refreshToken;
    admin.otp = null;
    admin.otpExpiry = null;
    await admin.save();

    // 🍪 Set HTTP-only cookies
    res.cookie("accessToken", accessToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'None',
      domain: 'needles-v1.onrender.com',
      maxAge: 15 * 60 * 1000, // 15 minutes
    });

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'None',
      domain: 'needles-v1.onrender.com',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });

    // ✅ Send response
    res.status(200).json({
      message: "OTP verified. Admin logged in.",
      admin: {
        _id: admin._id,
        name: admin.name,
        role: "admin",
      },
      accessToken,
    });

  } catch (error) {
    console.error("Error verifying admin OTP:", error);
    res.status(500).json({ message: "Internal server error." });
  }
};

export const getAllBoutiqueAreasForAdmin = async (req, res) => {
  try {
    const adminId = req.adminId;

    if (!adminId) {
      return res.status(401).json({ message: "Unauthorized. Admin ID missing from token." });
    }

    // ✅ Get all used areas from existing boutiques
    const boutiques = await BoutiqueModel.find({}, 'area').lean();

    const usedAreaSet = new Set(
      boutiques.map(b => b.area?.trim()).filter(Boolean)
    );

    // ✅ Map predefined areas and mark if they're in use
    const areas = predefinedHyderabadAreas.map(area => ({
      area,
      inUse: usedAreaSet.has(area),
    }));

    res.status(200).json({
      success: true,
      message: "All predefined areas with usage info",
      areas,
    });
  } catch (err) {
    console.error("❌ Error fetching boutique areas for admin:", err.message);
    res.status(500).json({ success: false, message: "Server error", error: err.message });
  }
};




export {registerAdmin, adminLogin, verifyOtpAdmin};