import AdminModel from '../models/AdminSchema.js';
import { sendOTP } from '../utils/otpService.js'; // Assuming you have a separate service to send OTPs
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

    // Send OTP to the phone number
    await sendOTP(phone, otp);

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

      // Send OTP to the admin's phone number
      await sendOTP(phone, otp);

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


const verifyOtp = async (req, res) => {
  try {
    const { phone, otp } = req.body;

    // Validate the request parameters
    if (!phone || !otp) {
      return res.status(400).json({ message: "Phone number and OTP are required." });
    }

    // Find the admin by phone number
    const admin = await AdminModel.findOne({ phone });

    // If admin not found, handle registration case (admin not existing)
    if (!admin) {
      return res.status(404).json({ message: "Admin not found. Please register first." });
    }

    // Check if the OTP has expired
    if (Date.now() > admin.otpExpiry) {
      return res.status(400).json({ message: "OTP has expired. Please request a new one." });
    }

    // Verify the OTP
    if (otp !== admin.otp) {
      return res.status(400).json({ message: "Invalid OTP. Please try again." });
    }

    // Successful verification - generate tokens (if not already registered)
    // If it's registration, we proceed to create the access token and refresh token
    const accessToken = jwt.sign(
      { userId: admin._id, name: admin.name },
      process.env.ACCESS_TOKEN_SECRET,
      { expiresIn: "30d" }
    );
    const refreshToken = jwt.sign(
      { userId: admin._id },
      process.env.REFRESH_TOKEN_SECRET,
      { expiresIn: "30d" }
    );

    // Save the refresh token (important for session management)
    admin.refreshToken = refreshToken;
    await admin.save();

    // Send the tokens back to the admin
    res.status(200).json({
      message: "Admin authenticated successfully.",
      accessToken,
      refreshToken,
    });
  } catch (error) {
    console.error("Error verifying OTP:", error);
    res.status(500).json({ message: "An error occurred during OTP verification." });
  }
};



export {registerAdmin, adminLogin, verifyOtp};