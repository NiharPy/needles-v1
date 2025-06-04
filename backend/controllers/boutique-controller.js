import BoutiqueModel from "../models/BoutiqueMarketSchema.js";
import OrderModel from "../models/OrderSchema.js";
import UserModel from "../models/userschema.js";
import jwt from "jsonwebtoken";
import { sendOTP } from "../utils/otpService.js";
const OTP_EXPIRATION_TIME = 5
import { getEmbedding } from '../utils/embedding.js';
const CreateBoutique = async function (req, res) {
  try {
    const { name, email, password, location, phone, dressTypes, headerImage, catalogue } = req.body;

    // 🔍 Validate required fields
    if (!name || !password || !email || !location || !phone || !dressTypes) {
      return res.status(400).send("All fields (name, password, email, location, phone, dressTypes) are required");
    }

    // 🔹 Step 1: Construct input string for embedding (semantic summary)
    const textForEmbedding = `${name} ${location.address || ''} ${dressTypes.map(d => d.type).join(' ')}`;

    // 🔹 Step 2: Generate vector using OpenAI
    const embedding = await getEmbedding(textForEmbedding);

    // 🔹 Step 3: Create Boutique entry
    const CreatedBoutique = await BoutiqueModel.create({
      name,
      email,
      password,
      phone,
      location,
      dressTypes,
      headerImage: headerImage || '', // optional
      catalogue: catalogue || [],      // optional
      embedding,                       // 💡 save vector
    });

    return res.status(201).json(CreatedBoutique);
  } catch (error) {
    console.error("Error creating Boutique:", error);

    if (error.name === 'ValidationError') {
      return res.status(422).json({ error: error.message, details: error.errors });
    }

    return res.status(500).send("An unexpected error occurred");
  }
};

export default CreateBoutique;


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
    const { phone, otp } = req.body;

    if (!phone || !otp) {
      return res.status(400).json({ message: "Phone number and OTP are required." });
    }

    const user = await BoutiqueModel.findOne({ phone });
    if (!user) {
      return res.status(404).json({ message: "Boutique Account not found." });
    }

    if (Date.now() > user.otpExpiry) {
      return res.status(400).json({ message: "OTP has expired. Please request a new one." });
    }

    if (otp !== user.otp) {
      return res.status(400).json({ message: "Invalid OTP. Please try again." });
    }

    // Generate JWTs
    const accessToken = jwt.sign(
      { userId: user._id, name: user.name },
      process.env.ACCESS_TOKEN_SECRET,
      { expiresIn: "30d" }
    );

    const refreshToken = jwt.sign(
      { userId: user._id },
      process.env.REFRESH_TOKEN_SECRET,
      { expiresIn: "30d" }
    );

    // Save refresh token and clear OTP data
    user.refreshToken = refreshToken;
    user.otp = null;
    user.otpExpiry = null;
    await user.save();

    // Set access token as HTTP-only cookie
    res.cookie("accessToken", accessToken, {
      httpOnly: true,
      secure: false, // Not depending on NODE_ENV
      sameSite: "strict",
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });

    res.status(200).json({
      message: "User authenticated successfully.",
      refreshToken,
    });
  } catch (error) {
    console.error("Error verifying OTP:", error);
    res.status(500).json({ message: "Server error. Please try again." });
  }
};

  const boutiqueSearch = async function (req, res) {
    try {
      const { query } = req.query;
  
      if (!query) {
        return res.status(400).json({ message: 'Query is required for semantic search' });
      }
  
      // 🔍 Step 1: Parse for rating and location from query
      const ratingMatch = query.match(/(\d(\.\d)?)(\s?stars?|\s?star\s?rating)/i);
      const locationMatch = query.match(/\bin\s([a-zA-Z\s]+)/i); // e.g., "in Miyapur"
      const ratingValue = ratingMatch ? parseFloat(ratingMatch[1]) : null;
      const locationValue = locationMatch ? locationMatch[1].trim() : null;
  
      // 🔹 Step 2: Get embedding of query
      const queryVector = await getEmbedding(query);
  
      // 🔹 Step 3: Build $search pipeline
      const pipeline = [
        {
          $search: {
            knnBeta: {
              path: 'embedding',
              vector: queryVector,
              k: 20, // get more to allow for sorting
            },
          },
        },
  
        // 🔸 Filter by rating and location if parsed
        ...(ratingValue
          ? [{
              $match: {
                averageRating: { $gte: ratingValue }
              }
            }]
          : []),
  
        ...(locationValue
          ? [{
              $match: {
                "location.address": { $regex: locationValue, $options: 'i' }
              }
            }]
          : []),
  
        {
          $project: {
            name: 1,
            'location.address': 1,
            'dressTypes.type': 1,
            averageRating: 1,
            totalRatings: 1,
            score: { $meta: 'searchScore' }
          },
        },
  
        // 🔸 Optional: Sort by rating and search score
        {
          $sort: {
            averageRating: -1,
            score: -1
          }
        },
  
        // 🔸 Limit final results
        { $limit: 10 }
      ];
  
      const boutiques = await BoutiqueModel.aggregate(pipeline).exec();
      res.status(200).json(boutiques);
  
    } catch (error) {
      console.error('Semantic Search Error:', error);
      res.status(500).json({
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

const getBoutiqueCatalogue = async (req, res) => {
  try {
    const { boutiqueId } = req.params;

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

const getDressTypez = async (req, res) => {
  const { boutiqueId } = req.params;

  try {
    // Find the boutique by ID
    const boutique = await BoutiqueModel.findById(boutiqueId);
    if (!boutique) {
      return res.status(404).json({ message: 'Boutique not found' });
    }

    // Extract and return dress types
    const dressTypes = boutique.dressTypes.map((item) => item.type);

    res.status(200).json({ dressTypes });
  } catch (error) {
    console.error('Error fetching dress types:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export {trackBusiness};



export {getDressTypeImages, getDressTypez};

export {addDressType};

export {deleteDressType};

export {getRecommendedBoutiquesByDressType};

export { getRecommendedBoutiques };

export { deleteItemFromCatalogue };

export {boutiqueSearch, Boutiquelogin, verifyOtpFB, viewBoutiqueDetails};

export {boutiquesData};

export {CreateBoutique};

export {addItemToCatalogue, getBoutiqueCatalogue};