import BoutiqueModel from "../models/BoutiqueMarketSchema.js";
import UserModel from "../models/userschema.js";
import jwt from "jsonwebtoken";
import { sendOTP } from "../utils/otpService.js";
const OTP_EXPIRATION_TIME = 5
const BOUTIQUE_REFRESH_TOKEN_EXPIRATION = 3
const CreateBoutique = async function(req,res){
    try{
        const boutique = await BoutiqueModel.find();
        let {name,email,password,location,catalogue,phone,knownFor} = req.body;
        if (!name || !password || !email || !location || !catalogue || !phone || !knownFor){
            return res.status(400).send("All fields (name, password, email, location, catalogue, phone) are required");
        }

        const CreatedBoutique = await BoutiqueModel.create({
            name,
            email,
            password,
            location,
            catalogue,
            phone,
            knownFor,
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
            return res.status(400).json({ message: "name, password, phone is required." });
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
      const {phone, otp } = req.body;
  
      if (!phone || !otp) {
        return res.status(400).json({ message: "Phone number and OTP are required." });
      }
  
      // Find user by phone number (instead of userId)
      const user = await BoutiqueModel.findOne({ phone });
      if (!user) {
        return res.status(404).json({ message: "Boutique Account not found." });
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

        const fieldsToSelect = 'name location.address catalogue.itemName catalogue.price averageRating totalRatings'

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
    const { boutiqueId, newItems } = req.body;

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
      if (item.itemName && item.price && item.image) {
        boutique.catalogue.push(item);
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

const deleteItemFromCatalogue = async (req, res) => {
  try {
    const { boutiqueId, itemNames } = req.body;

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
    // Fetch all boutiques with the required fields, sorting by 'averageRating' in descending order
    const boutiques = await BoutiqueModel.find({})
      .select('name location knownFor averageRating ratings') // Select only the fields you need
      .sort({ averageRating: -1 }) // Sort by 'averageRating' in descending order
      .lean();  // Using lean() to return plain JavaScript objects

    if (!boutiques || boutiques.length === 0) {
      return res.status(404).json({ message: 'No boutiques found' });
    }

    // Add total rating (length of the ratings array) for each boutique
    boutiques.forEach(boutique => {
      boutique.totalRating = boutique.ratings.length;
      delete boutique.ratings; // Remove ratings field to avoid sending unnecessary data
    });

    // Send the sorted boutiques to the frontend
    return res.status(200).json({ recommendedBoutiques: boutiques });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'An error occurred while fetching boutiques' });
  }
};




const getRecommendedBoutiquesByCategory = async (req, res) => {
  try {
    const { category } = req.params; // Get category from URL params
    if (!category || !['Saree Blouse', 'Lehenga', 'Kurta', 'Shirt', 'Gown'].includes(category)) {
      return res.status(400).json({ message: "Invalid category." });
    }

    // Find boutiques that are known for the given category and select only the required fields
    const boutiques = await BoutiqueModel.find({ knownFor: category })
      .select('name location knownFor averageRating ratings') // Select only the fields you need
      .lean(); // Using lean() for better performance

    if (boutiques.length === 0) {
      return res.status(404).json({ message: "No boutiques found for this category." });
    }

    // Add total rating (length of the ratings array) for each boutique
    boutiques.forEach(boutique => {
      boutique.totalRating = boutique.ratings.length;
      delete boutique.ratings; // Remove ratings field to avoid sending unnecessary data
    });

    // Sort boutiques by average rating in descending order (highest to lowest)
    boutiques.sort((a, b) => b.averageRating - a.averageRating);

    res.status(200).json({
      message: "Recommended boutiques sorted by rating.",
      boutiques,
    });
  } catch (error) {
    console.error("Error while fetching recommended boutiques:", error);
    res.status(500).json({ message: "Internal server error." });
  }
};


export {getRecommendedBoutiquesByCategory};

export { getRecommendedBoutiques };

export { deleteItemFromCatalogue };

export {boutiqueSearch, Boutiquelogin, verifyOtpFB, viewBoutiqueDetails};

export {boutiquesData};

export {CreateBoutique};

export {addItemToCatalogue};