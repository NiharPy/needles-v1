import BoutiqueModel from "../models/BoutiqueMarketSchema.js";
import UserModel from "../models/userschema.js";
import jwt from "jsonwebtoken";
import { sendOTP } from "../utils/otpService.js";
const OTP_EXPIRATION_TIME = 5
const CreateBoutique = async function (req, res) {
  try {
    const { name, email, password, location, phone, dressTypes } = req.body;

    // Validate required fields
    if (!name || !password || !email || !location || !phone) {
      return res
        .status(400)
        .send("All fields (name, password, email, location, phone, dressTypes) are required");
    }

    // Create new Boutique
    const CreatedBoutique = await BoutiqueModel.create({
      name,
      email,
      password,
      location,
      phone,
    });

    return res.status(201).json(CreatedBoutique);
  } catch (error) {
    console.error("Error creating Boutique:", error);

    if (error.name === 'ValidationError') {
      return res.status(422).json({ error: error.message, details: error.errors });
    }

    // Handle any other unexpected errors
    return res.status(500).send("An unexpected error occurred");
  }
};


const Boutiquelogin = async function (req, res) {
  try {
    const { name, password, phone } = req.body;

    // Validate required fields
    if (!name || !password || !phone) {
      return res.status(400).json({ message: "name, password, phone are required." });
    }

    // Check if the Boutique exists
    const Boutique = await BoutiqueModel.findOne({ phone });
    if (!Boutique) {
      return res.status(404).json({ message: "Boutique Account not found." });
    }

    // Generate a new OTP
    const otp = Math.floor(100000 + Math.random() * 900000); // 6-digit OTP

    // Update the Boutique with the OTP and expiration time
    Boutique.otp = otp;
    Boutique.otpExpiry = Date.now() + OTP_EXPIRATION_TIME * 60 * 1000; // OTP valid for configured minutes
    await Boutique.save();

    // Send OTP to the phone number
    await sendOTP(phone, otp);

    res.status(200).json({
      message: "OTP sent to your phone. Please verify to complete login.",
      boutiqueUserId: Boutique._id, // Include the user ID for OTP verification
    });
  } catch (error) {
    console.error("Error during login:", error.message);
    console.error("Stack trace:", error.stack);

    res.status(500).json({ message: "An unexpected error occurred during login." });
  }
};

const boutiquesData = async function (req, res) {
  try {
    // Fetch all boutiques
    const BoutiquesData = await BoutiqueModel.find({}, 'name location phone dressTypes catalogue');

    res.status(200).json({
      success: true,
      message: "Boutiques fetched successfully",
      data: BoutiquesData,
    });
  } catch (error) {
    console.error("Error fetching boutiques:", error);

    res.status(500).json({
      success: false,
      message: "Server error. Unable to fetch boutiques.",
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

  const boutiqueSearch = async function (req, res) {
    try {
      const { query, location } = req.query;
  
      // Construct search conditions dynamically
      const searchConditions = {
        $and: [
          query
            ? {
                $or: [
                  { name: { $regex: query, $options: 'i' } }, // Search in boutique name
                  { "dressTypes.type": { $regex: query, $options: 'i' } }, // Search in dressTypes.type
                ],
              }
            : null,
          location
            ? {
                "location.address": { $regex: location, $options: 'i' }, // Search in boutique location
              }
            : null,
        ].filter(Boolean), // Remove null entries
      };
  
      // Fields to select
      const fieldsToSelect = 'name location.address dressTypes.type averageRating totalRatings';
  
      // Fetch boutiques based on search conditions
      const boutiques = await BoutiqueModel.find(searchConditions, fieldsToSelect);
  
      // Send the response
      res.status(200).json(boutiques);
    } catch (error) {
      console.error('Error fetching boutiques:', error);
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
      .select('name location dressTypes averageRating ratings') // Select only the fields you need
      .sort({ averageRating: -1 }) // Sort by 'averageRating' in descending order
      .lean(); // Using lean() to return plain JavaScript objects

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





const getRecommendedBoutiquesByDressType = async (req, res) => {
  try {
    const { dressType } = req.params; // Get dressType from URL params
    if (!dressType || !['Saree Blouse', 'Lehenga', 'Kurta', 'Shirt', 'Gown'].includes(dressType)) {
      return res.status(400).json({ message: "Invalid dress type." });
    }

    // Find boutiques that have the given dress type in their dressTypes array
    const boutiques = await BoutiqueModel.find({
      'dressTypes.type': dressType, // Matching dress type
    })
      .select('name location dressTypes averageRating ratings') // Select only the fields you need
      .lean(); // Using lean() for better performance

    if (boutiques.length === 0) {
      return res.status(404).json({ message: `No boutiques found for the dress type: ${dressType}` });
    }

    // Add total rating (length of the ratings array) for each boutique
    boutiques.forEach(boutique => {
      boutique.totalRating = boutique.ratings.length;
      delete boutique.ratings; // Remove ratings field to avoid sending unnecessary data
    });

    // Sort boutiques by average rating in descending order (highest to lowest)
    boutiques.sort((a, b) => b.averageRating - a.averageRating);

    res.status(200).json({
      message: `Recommended boutiques for the dress type: ${dressType}`,
      boutiques,
    });
  } catch (error) {
    console.error("Error while fetching recommended boutiques by dress type:", error);
    res.status(500).json({ message: "Internal server error." });
  }
};



const addDressType = async (req, res) => {
  const { boutiqueId, dressType, images, measurementRequirements } = req.body;

  try {
    const boutique = await BoutiqueModel.findById(boutiqueId);
    if (!boutique) return res.status(404).json({ message: 'Boutique not found' });

    // Add the new dress type with measurement requirements to the boutique
    boutique.dressTypes.push({
      type: dressType,
      images,
      measurementRequirements, // Add the new field
    });

    await boutique.save();

    res.status(200).json({ message: 'Dress type added successfully', boutique });
  } catch (error) {
    console.error('Error adding dress type:', error);
    res.status(500).json({ message: 'Server error' });
  }
};


const deleteDressType = async (req, res) => {
  const { boutiqueId, dressType } = req.body;

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


export {getDressTypeImages};

export {addDressType};

export {deleteDressType};

export {getRecommendedBoutiquesByDressType};

export { getRecommendedBoutiques };

export { deleteItemFromCatalogue };

export {boutiqueSearch, Boutiquelogin, verifyOtpFB, viewBoutiqueDetails};

export {boutiquesData};

export {CreateBoutique};

export {addItemToCatalogue};