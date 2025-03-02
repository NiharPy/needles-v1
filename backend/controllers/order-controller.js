import OrderModel from '../models/OrderSchema.js';
import BoutiqueModel from '../models/BoutiqueMarketSchema.js';
import UserModel from '../models/userschema.js';
import nodemailer from 'nodemailer';
import AltorderModel from '../models/AlterOrderSchema.js';
import AlterationRequest from '../models/AlterationRequest.js';
import mongoose from 'mongoose';
import axios from 'axios';

const transporter = nodemailer.createTransport({
  service: 'Gmail',
  auth: {
    user: process.env.EMAIL_USER, // Replace with your email
    pass: process.env.EMAIL_PASS, // Replace with your email password or app-specific password
  },
});

const sendEmailToAdmin = async (subject, text) => {
  try {
    await transporter.sendMail({
      from: 'nihar.neelala124@gmail.com',
      to: 'needles.personal.2025@gmail.com', // Replace with admin email
      subject,
      text,
    });
    console.log('Email sent to admin successfully!');
  } catch (error) {
    console.error('Error sending email to admin:', error.message);
  }
};

/**
 * @desc Place an order by an authenticated user
 * @route POST /order/place
 * @access Private
 */
const placeOrder = async (req, res) => {
  try {
    const {
      userId,
      boutiqueId,
      pickUp,
      dressType,
      measurements: rawMeasurements,
      location,
    } = req.body;

    let measurements;
    if (typeof rawMeasurements === "string") {
      const sanitizedMeasurements = rawMeasurements.trim();
      try {
        measurements = JSON.parse(sanitizedMeasurements); // Parse the sanitized string
      } catch (error) {
        return res.status(400).json({
          message: "Invalid format for measurements. Please provide a valid JSON object.",
        });
      }
    } else {
      measurements = rawMeasurements; // Use as-is if it's already an object
    }

    // Ensure referralImage file is uploaded
    if (!req.files || !req.files.referralImage) {
      return res.status(400).json({ message: 'Referral image is required' });
    }

    // Ensure voiceNotes file is uploaded
    let voiceNoteUrl = [];
    if (req.files && req.files.voiceNotes && req.files.voiceNotes.length > 0) {
      const maxFiles = 5;
      req.files.voiceNotes.slice(0, maxFiles).forEach((file) => {
        voiceNoteUrl.push(file.path); // Add each audio file's URL up to 5
      });
    }

    const User = await UserModel.findById(userId);
    if (!User) {
      return res.status(404).json({ message: 'User not found' });
    }

    const boutique = await BoutiqueModel.findById(boutiqueId);
    if (!boutique) {
      return res.status(404).json({ message: 'Boutique not found' });
    }

    const dressTypeData = boutique.dressTypes.find(
      (type) => type.type === dressType
    );
    if (!dressTypeData) {
      return res
        .status(400)
        .json({ message: `Invalid dress type: ${dressType} for this boutique` });
    }

    // Validate measurements if pickUp is false
    if (!pickUp && !measurements) {
      return res.status(400).json({
        message: `Measurements are required for dress type ${dressType} when pickUp is false`,
      });
    }

    if (!pickUp) {
      const requiredMeasurements = dressTypeData.measurementRequirements || [];
      const providedKeys = Object.keys(measurements);
      const isValidMeasurements = requiredMeasurements.every((key) =>
        providedKeys.includes(key)
      );

      if (!isValidMeasurements) {
        return res.status(400).json({
          message: `Invalid measurements for ${dressType}. Required fields: ${requiredMeasurements.join(
            ', '
          )}`,
        });
      }
    }

    // Upload referral image to Cloudinary
    const referralImage = req.files.referralImage[0].path;

    // Create new order
    const order = await OrderModel.create({
      userId: User._id,
      boutiqueId: boutique._id,
      pickUp,
      dressType,
      measurements: pickUp ? undefined : measurements, // Only set measurements if pickUp is false
      referralImage,
      location: User.address,
      voiceNote: voiceNoteUrl,
      status: 'Pending',
    }).catch(error => {
      console.error('Order creation error:', error); // Log the validation error
      if (error.errors) {
        Object.keys(error.errors).forEach((key) => {
          console.error(`Validation failed on ${key}: ${error.errors[key].message}`);
        });
      }
      throw error;
    });

    boutique.orders.push({
      orderId: order._id,
      status: 'Pending',
    });
    await boutique.save();

    User.orders.push({
      orderId: order._id,
      status: 'Pending',
    });
    await User.save();

    res.status(201).json({
      message: 'Order placed successfully',
      order,
    });
  } catch (error) {
    console.error('Error placing order:', error);
    res.status(500).json({ message: 'Server error', error: error.message || error });
  }
};




/**
 * @desc Update order status by the boutique
 * @route PATCH /order/:orderId/status
 * @access Private (Boutique only)
 */


const updateOrderStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;

    const validStatuses = [
      'Pending', 
      'Accepted', 
      'Declined', 
      'In Progress', 
      'Ready for Delivery', 
      'Completed'
    ];
    
    // Validate status
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: `Invalid status: ${status}` });
    }

    // Find the order
    const order = await OrderModel.findById(orderId).populate('userId').populate('boutiqueId');
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Check if boutique exists
    if (!order.boutiqueId) {
      return res.status(400).json({ message: 'Boutique not found in the order' });
    }

    const boutique = await BoutiqueModel.findById(order.boutiqueId);
    if (!boutique) {
      return res.status(404).json({ message: 'Boutique not found' });
    }

    // Update order status
    order.status = status;
    await order.save();

    // Update status in Boutique's orders
    const boutiqueOrder = boutique.orders.find((o) => o.orderId.toString() === orderId.toString());
    if (boutiqueOrder) {
      boutiqueOrder.status = status;
      await boutique.save();
    }

    // Update status in User's orders
    const user = await UserModel.findById(order.userId);
    const userOrder = user.orders.find((o) => o.orderId.toString() === orderId.toString());
    if (userOrder) {
      userOrder.status = status;
      await user.save();
    }

    // Handle notifications for specific statuses
    if (order.pickUp && status === 'Accepted') {
      const userLocation = order.userId.address;
      const boutiqueLocation = order.boutiqueId.location;
      const orderID = order._id;

      const emailText = `
        A User has requested a pick-up:
        - User Location: ${userLocation}
        - Boutique Location: ${boutiqueLocation}
        - Order Id : ${orderID}
      `;
      await sendEmailToAdmin('Pick-Up Request', emailText);
    }

    if (status === 'Ready for Delivery') {
      const userLocation = order.userId.address;
      const boutiqueLocation = order.boutiqueId.location;
      const orderID = order._id;

      const emailText = `
        A Boutique is ready to deliver an order:
        - User Location: ${userLocation}
        - Boutique Location: ${boutiqueLocation}
        - Order Id : ${orderID}
      `;
      await sendEmailToAdmin('Ready for Delivery', emailText);
    }

    // Send response
    res.status(200).json({
      message: 'Order status updated successfully',
      status,
    });
  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};


/**
 * @desc Get order details by ID (User or Boutique)
 * @route GET /order/:orderId
 * @access Private
 */
const getOrderDetails = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await OrderModel.findById(orderId)
      .populate('userId', 'name phone')
      .populate('boutiqueId', 'name location');
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    res.status(200).json({ order });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Controller function for users to rate a boutique after an order
const rateOrder = async (req, res) => {
  try {
    const { boutiqueId, rating, comment } = req.body;
    const userId = req.user.id; // Assuming user ID is available from the authenticated request

    // Validate the rating
    if (rating < 1 || rating > 5) {
      return res.status(400).json({ message: "Rating must be between 1 and 5." });
    }

    // Find the boutique by ID
    const boutique = await BoutiqueModel.findById(boutiqueId);
    if (!boutique) {
      return res.status(404).json({ message: "Boutique not found." });
    }

    // Check if the boutique's ratings array is valid
    if (!Array.isArray(boutique.ratings)) {
      return res.status(500).json({ message: "Boutique ratings are not properly initialized." });
    }

    // Check if the user has already rated this boutique
    const existingRatingIndex = boutique.ratings.findIndex(
      (ratingItem) => ratingItem.userId && ratingItem.userId.toString() === userId.toString()
    );

    if (existingRatingIndex !== -1) {
      // If the user has already rated, update the existing rating
      boutique.ratings[existingRatingIndex].rating = rating;
      boutique.ratings[existingRatingIndex].comment = comment;
    } else {
      // If it's a new rating, add it to the boutique's ratings array
      boutique.ratings.push({ userId, rating, comment });
    }

    // Debugging: Log ratings array and calculated average
    console.log("Ratings array:", boutique.ratings);
    
    // Recalculate the average rating
    const totalRatings = boutique.ratings.length;
    const sumOfRatings = boutique.ratings.reduce((sum, ratingItem) => sum + ratingItem.rating, 0);
    const newAverageRating = sumOfRatings / totalRatings;
    boutique.averageRating = newAverageRating;

    // Debugging: Log new average rating
    console.log("New average rating:", newAverageRating);

    // Save the updated boutique
    await boutique.save();

    // Refetch the updated boutique to ensure we have the latest averageRating
    const updatedBoutique = await BoutiqueModel.findById(boutiqueId);

    res.status(200).json({ message: "Rating submitted successfully.", boutique: updatedBoutique });
  } catch (error) {
    console.error("Error while rating boutique:", error);
    res.status(500).json({ message: "Internal server error." });
  }
};

const requestAlteration = async (req, res) => {
  try {
    const { userId, orderId } = req.body;

    // Find the original order
    const originalOrder = await OrderModel.findById(orderId);
    if (!originalOrder) return res.status(404).json({ message: 'Order not found' });

    // Check if the user is the owner of the order
    if (originalOrder.userId.toString() !== userId) {
      return res.status(403).json({ message: 'Unauthorized request' });
    }

    // Find the boutique handling the order
    const boutique = await BoutiqueModel.findById(originalOrder.boutiqueId);
    if (!boutique) return res.status(404).json({ message: 'Boutique not found' });

    // Update alteration status in the original order
    originalOrder.alterations = true;
    await originalOrder.save();

    // Create a new Altorder
    const altOrder = new AltorderModel({
      originalOrderId: orderId,
      orderId: new mongoose.Types.ObjectId(), // Use 'new' keyword to create a new ObjectId
      userId,
      boutiqueId: originalOrder.boutiqueId,
      deliveryStatus: 'Pending',
      alterations: true,
    });

    await altOrder.save();

    // Update User schema
    const user = await UserModel.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.orders.push({
      orderId: altOrder.orderId,
      dressType: originalOrder.dressType,
      alterations: true,
      status: 'Pending',
    });
    await user.save();

    // Update Boutique schema
    boutique.orders.push({
      orderId: altOrder.orderId,
      alterations: true,
    });
    await boutique.save();

    const mailOptions = {
      from: 'nihar.neelala124@gmail.com',
      to: 'needles.personal.2025@gmail.com',
      subject: 'New Alteration Request',
      text: `An alteration request has been made for Order ID: ${orderId}.
New Alteration Order ID: ${altOrder.orderId}
User Location: ${user.address.flatNumber}, ${user.address.block}, ${user.address.street}
Boutique Location: ${boutique.location.address}`,
    };

    await transporter.sendMail(mailOptions);

    res.status(200).json({ message: 'Alteration request placed successfully', altOrder });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};



const getUserAlterationOrders = async (req, res) => {
  try {
    const { userId } = req.params;

    // Check if user exists
    const user = await UserModel.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Find all alteration orders for the user and populate the originalOrderId field
    const alterationOrders = await AltorderModel.find({ userId })
      .populate('originalOrderId') // This is to populate the order details
      .exec();

    if (alterationOrders.length === 0) {
      return res.status(404).json({ message: 'No alteration orders found for this user' });
    }

    res.status(200).json({
      message: 'Alteration orders retrieved successfully',
      alterationOrders,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// 📌 Submit Alteration Request
export const submitAlterationRequest = async (req, res) => {
  try {
    const { userId, boutiqueId, altOrderId, alterationType, issueArea, fixType } = req.body;

    // Ensure User Exists
    const user = await UserModel.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Ensure Boutique Exists
    const boutique = await BoutiqueModel.findById(boutiqueId);
    if (!boutique) return res.status(404).json({ message: "Boutique not found" });

    // Ensure referenceImage & orderImage files are uploaded
    if (!req.files || !req.files.referenceImage || !req.files.orderImage) {
      return res.status(400).json({ message: "Both reference image and order image are required" });
    }

    // Upload reference image & order image
    const referenceImage = req.files.referenceImage[0].path;
    const orderImage = req.files.orderImage[0].path;

    // Ensure AltvoiceNotes files are uploaded (Optional, but stores up to 5)
    let AltvoiceNotes = [];
    if (req.files?.AltvoiceNotes?.length > 0) {
    const maxFiles = 5;
    req.files.AltvoiceNotes.slice(0, maxFiles).forEach((file) => {
    AltvoiceNotes.push(file.path); // Add each audio file's URL up to 5
    });
  }

    // Create alteration request
    const alterationRequest = await AlterationRequest.create({
      userId,
      boutiqueId,
      altOrderId,
      alterationType,
      issueArea,
      fixType,
      referenceImage,
      orderImage,
      voiceNote : AltvoiceNotes,
      status: "Pending",
    });

    res.status(201).json({
      message: "Alteration request submitted successfully",
      alterationRequest,
    });
  } catch (error) {
    console.error("Error submitting alteration request:", error);
    res.status(500).json({ message: "Server error", error: error.message || error });
  }
};




// 📌 Boutique Reviews Request
export const reviewAlterationRequest = async (req, res) => {
  try {
    const { altOrderId } = req.params;
    const alterationRequest = await AlterationRequest.findOne({ altOrderId });

    if (!alterationRequest) return res.status(404).json({ message: "Request not found" });

    alterationRequest.status = "Reviewed";
    await alterationRequest.save();

    res.status(200).json({ message: "Request reviewed", alterationRequest });
  } catch (error) {
    res.status(500).json({ message: "Error reviewing request", error: error.message });
  }
};

// 📌 Open Chat if Needed
export const respondToAlterationRequest = async (req, res) => {
  try {
    const { altOrderId } = req.params;
    const { responseMessage, responseStatus } = req.body; // Response message + status (Accepted, Needs Clarification, Rejected)

    const alterationRequest = await AlterationRequest.findOne({ altOrderId });

    if (!alterationRequest) return res.status(404).json({ message: "Request not found" });

    alterationRequest.response = {
      message: responseMessage,
      status: responseStatus,
      respondedAt: new Date(),
    };
    alterationRequest.status = responseStatus; // Update request status
    await alterationRequest.save();

    res.status(200).json({ message: "Response recorded", alterationRequest });
  } catch (error) {
    res.status(500).json({ message: "Error responding to request", error: error.message });
  }
};

// 📌 Get All Alteration Requests for a Boutique
export const getAlterationRequestsForBoutique = async (req, res) => {
  try {
    const { boutiqueId } = req.params;
    const alterationRequests = await AlterationRequest.find({ boutiqueId });

    res.status(200).json({ message: "Alteration requests fetched", alterationRequests });
  } catch (error) {
    res.status(500).json({ message: "Error fetching requests", error: error.message });
  }
};

const createBill = async (req, res) => {
  try {
    const { boutiqueId, orderId, selectedItems, additionalCost } = req.body;

    // Find the boutique and order
    const boutique = await BoutiqueModel.findById(boutiqueId);
    const order = await OrderModel.findById(orderId).populate("userId");

    if (!boutique || !order) {
      return res.status(404).json({ error: "Boutique or Order not found" });
    }

    if (order.status !== "Accepted") {
      return res.status(400).json({ error: "The order must be accepted before creating a bill" });
    }

    let totalAmount = 0;
    let billDetails = {};

    // Calculate total from selected items
    selectedItems.forEach(({ item, quantity }) => {
      const catalogItem = boutique.catalogue.find((c) => c.itemName.includes(item));
      if (catalogItem) {
        const price = catalogItem.price[0] * quantity;
        billDetails[item] = price;
        totalAmount += price;
      }
    });

    // Platform fee (2%)
    const platformFee = totalAmount * 0.02;
    totalAmount += platformFee;

    // Delivery Fee
    const userLocation = order.userId.address.location;
    const boutiqueLocation = boutique.location;
    const distance = await getDistance(userLocation, boutiqueLocation);
    const deliveryFee = calculateDeliveryFee(distance);
    totalAmount += deliveryFee;

    // Handle additional cost
    let additionalCostValue = 0;
    let additionalCostReason = "Not specified";

    if (additionalCost && typeof additionalCost === "object" && additionalCost.amount) {
      additionalCostValue = parseFloat(additionalCost.amount);
      additionalCostReason = additionalCost.reason || "Not specified";
    }

    if (isNaN(additionalCostValue) || additionalCostValue < 0) {
      additionalCostValue = 0;
    }

    totalAmount += additionalCostValue;

    // Update order bill
    order.bill = {
      items: billDetails,
      platformFee,
      deliveryFee,
      additionalCost: {
        amount: additionalCostValue,
        reason: additionalCostReason
      },
      totalAmount,
      status: "Pending"
    };

    // Ensure Mongoose tracks changes
    order.markModified("bill");
    order.totalAmount = totalAmount;
    await order.save();

    res.json({ success: true, bill: order.bill });
  } catch (error) {
    console.error("Error creating bill:", error);
    res.status(500).json({ error: error.message });
  }
};




// Function to get distance using Google Maps API
const getDistance = async (userLocation, boutiqueLocation) => {
  try {
    const response = await axios.get(
      `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${userLocation.lat},${userLocation.lng}&destinations=${boutiqueLocation.latitude},${boutiqueLocation.longitude}&key=${process.env.GOOGLE_MAPS_API_KEY}`
    );
    return response.data.rows[0].elements[0].distance.value / 1000; // Distance in KM
  } catch (error) {
    return 5; // Default fee if API fails
  }
};

// Simple delivery fee calculation
const calculateDeliveryFee = (distance) => {
  return distance * 10; // ₹10 per KM
};

// Get Bill for User
const getBill = async (req, res) => {
  try {
    const { userId, orderId } = req.params;
    
    // Fetch the order and check ownership
    const order = await OrderModel.findById(orderId);
    
    // Debugging log to check the content of the order
    console.log(order);

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    if (order.userId.toString() !== userId) {
      return res.status(403).json({ error: "Unauthorized access to this order" });
    }

    // Check if the bill exists in the order
    if (!order.bill) {
      return res.status(404).json({ error: "Bill not found for this order" });
    }

    res.json({ success: true, bill: order.bill });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};


// Payment Process (Placeholder Without Razorpay)
const processPayment = async (req, res) => {
  try {
    const { orderId } = req.body;
    const order = await OrderModel.findById(orderId).populate("boutiqueId");  // Use OrderModel here
    if (!order) return res.status(404).json({ error: "Order not found" });

    order.paymentStatus = "Paid";
    await order.save();

    // Notify Boutique
    notifyBoutique(order.boutiqueId, orderId);

    res.json({ success: true, message: "Payment successful!" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Function to notify boutique via Email (Placeholder Example)
const notifyBoutique = async (boutiqueId, orderId) => {
  try {
    const boutique = await BoutiqueModel.findById(boutiqueId);  // Use BoutiqueModel here
    if (!boutique) return;

    // Send an email notification (assuming an email sending service is set up)
    console.log(`Sending email to ${boutique.email} about payment for Order ${orderId}`);
  } catch (error) {
    console.error("Error notifying boutique: ", error);
  }
};

export {createBill, processPayment, getBill};


export {getUserAlterationOrders};


export {requestAlteration};

export default sendEmailToAdmin;


export { rateOrder };

export {getOrderDetails};
export {placeOrder};
export {updateOrderStatus};