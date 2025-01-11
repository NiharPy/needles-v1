import BoutiqueModel from "../models/BoutiqueMarketSchema.js";
import jwt from "jsonwebtoken";
import { sendOTP } from "../utils/otpService.js";
const OTP_EXPIRATION_TIME = 5
const BOUTIQUE_REFRESH_TOKEN_EXPIRATION = 3
const CreateBoutique = async function(req,res){
    try{
        const boutique = await BoutiqueModel.find();
        let {name,email,password,location,catalogue,phone} = req.body;
        if (!name || !password || !email || !location || !catalogue || !phone){
            return res.status(400).send("All fields (name, password, email, location, catalogue, phone) are required");
        }

        const CreatedBoutique = await BoutiqueModel.create({
            name,
            email,
            password,
            location,
            catalogue,
            phone
        });

        return res.status(201).json(CreatedBoutique);
    }catch (error) {
        // Log the error and send an appropriate response
        console.error("Error creating Boutique:", error);
  
        if (error.name === 'ValidationError') {
          return res.status(422).json({ error: error.message, details: error.errors });
        }
  
        // Handle any other unexpected errors
        return res.status(500).send("An unexpected error occurred");
      }
};


const Boutiquelogin = async function(req,res) {
    try {
        const { name, password, phone } = req.body;

        // Validate phone number input
        if (!name || !password || !phone) {
            return res.status(400).json({ message: "name, password, email is required." });
        }

        // Check if the user exists
        const Boutique = await BoutiqueModel.findOne({ phone });
        if (!Boutique) {
            return res.status(404).json({ message: "Boutique Account not found." });
        }

        // Generate a new OTP
        const otp = Math.floor(100000 + Math.random() * 900000); // 6-digit OTP

        // Update the OTP and expiration time in the database
        Boutique.otp = otp;
        Boutique.otpExpiry = Date.now() + OTP_EXPIRATION_TIME * 60 * 1000;
        await Boutique.save();

        // Send OTP to the user's phone number
        await sendOTP(phone, otp);

        res.status(200).json({
            message: "OTP sent to your phone. Please verify to complete login.",
            Boutioque_userId: Boutique._id, // Include the user ID to reference during verification
        });
    } catch (error) {
        console.error("Error during login:", error.message);
        console.error("Stack trace:", error.stack);

        res.status(500).json({ message: "An unexpected error occurred during login." });
    }
};

const boutiquesData = async function(req,res){
    try{
        const BoutiquesData = await BoutiqueModel.find();
        res.status(200).json({
            success : true,
            message : 'Boutique fetched Successfully',
            data : BoutiquesData,
        });
    }catch(error){
    console.error("error");
    res.status(500).json({
        success : false,
        message : "server error. Unable to fetch Boutiques",
    });
}
};

const verifyOtpFB = async (req, res) => {
    try {
      const {name, phone, otp } = req.body;
  
      if (!phone || !otp) {
        return res.status(400).json({ message: "Phone number and OTP are required." });
      }
  
      // Find user by phone number (instead of userId)
      const user = await BoutiqueModel.findOne({ name, phone });
      if (!user) {
        return res.status(404).json({ message: "Boutique Account not found." });
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
      const refreshToken = jwt.sign({ userId: user._id }, process.env.REFRESH_TOKEN_SECRET, { expiresIn: `${BOUTIQUE_REFRESH_TOKEN_EXPIRATION}m` });
  
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

const boutiqueSearch = async function(req,res){
    try{
        const{ query, location} = req.query;
        const searchconditions = {
            $or:[
                query?{name:{$regex:query,$options:'i'}} : null,
                location?{"location.address": {$regex:location,$options:'i'}} : null,
                query?{"catalogue.itemName" : {$regex:query,$options:'i'}} : null,
            ].filter(Boolean),
        };

        const fieldsToSelect = 'name location.address catalogue.itemName catalogue.price'

        const Boutique_found = await BoutiqueModel.find(searchconditions, fieldsToSelect);

        res.status(200).send(Boutique_found);

    } catch(error){
    console.error(error);
    res.status(500).json({
        success: false,
        message: 'Server error. Unable to fetch search results.',
      });
    }
};

export {boutiqueSearch, Boutiquelogin, verifyOtpFB};

export {boutiquesData};

export {CreateBoutique};
