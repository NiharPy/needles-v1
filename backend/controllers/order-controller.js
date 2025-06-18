import OrderModel from '../models/OrderSchema.js';
import BoutiqueModel from '../models/BoutiqueMarketSchema.js';
import UserModel from '../models/userschema.js';
import nodemailer from 'nodemailer';
import AlterationRequest from '../models/AlterationRequest.js';
import mongoose from 'mongoose';
import axios from 'axios';
import twilio from "twilio";
import fs from 'fs';
import path from 'path';
import { createWriteStream, unlinkSync } from 'fs';
import PDFDocument from 'pdfkit';
import { v2 as cloudinary } from 'cloudinary';

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

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
      boutiqueId,
      pickUp: rawPickUp,
      dressType,
      measurements: rawMeasurements,
      location,
      catalogueItems,
    } = req.body;

    const userId = req.userId; // ✅ Extract userId from JWT

    const pickUp = rawPickUp === true || rawPickUp === 'true';

    let measurements;
    if (typeof rawMeasurements === "string") {
      const sanitizedMeasurements = rawMeasurements.trim();
      try {
        measurements = JSON.parse(sanitizedMeasurements);
      } catch (error) {
        return res.status(400).json({
          message: "Invalid format for measurements. Please provide a valid JSON object.",
        });
      }
    } else {
      measurements = rawMeasurements;
    }

    if (!req.files || !req.files.referralImage || !req.files.referralImage[0]) {
      return res.status(400).json({ message: "Referral image is required" });
    }

    const referralImage = req.files.referralImage[0].path;

    let voiceNoteUrl = [];
    if (Array.isArray(req.files.voiceNotes)) {
      voiceNoteUrl = req.files.voiceNotes.slice(0, 5).map(file => file.path);
    }

    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const boutique = await BoutiqueModel.findById(boutiqueId);
    if (!boutique) {
      return res.status(404).json({ message: "Boutique not found" });
    }

    const dressTypeData = boutique.dressTypes.find(
      (type) => type.type === dressType
    );
    if (!dressTypeData) {
      return res.status(400).json({ message: `Invalid dress type: ${dressType} for this boutique` });
    }

    if (catalogueItems && Array.isArray(catalogueItems)) {
      catalogueItems.forEach(item => {
        const itemName = Array.isArray(item.itemName) ? item.itemName : [String(item.itemName)];
        const price = Array.isArray(item.price) ? item.price.map(Number) : [Number(item.price)];

        if (itemName[0] && price[0]) {
          boutique.catalogue.push({ itemName, price });
        }
      });
    }

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
          message: `Invalid measurements for ${dressType}. Required fields: ${requiredMeasurements.join(", ")}`,
        });
      }
    }

    const order = await OrderModel.create({
      userId: user._id,
      boutiqueId: boutique._id,
      pickUp,
      dressType,
      measurements: pickUp ? undefined : measurements,
      referralImage,
      location: user.address,
      voiceNote: voiceNoteUrl,
      status: "Pending",
      createdAt: new Date(),
    }).catch((error) => {
      console.error("Order creation error:", error);
      if (error.errors) {
        Object.keys(error.errors).forEach((key) => {
          console.error(`Validation failed on ${key}: ${error.errors[key].message}`);
        });
      }
      throw error;
    });

    boutique.orders.push({ orderId: order._id, status: "Pending" });
    await boutique.save();

    user.orders.push({ orderId: order._id, status: "Pending" });
    await user.save({ validateBeforeSave: false }); // ✅ prevent OTP validation error

    if (typeof scheduleOrderCancellation === "function") {
      scheduleOrderCancellation(order._id, user.phone);
    }

    res.status(201).json({
      message: "Order placed successfully. Waiting for boutique response...",
      order,
    });
  } catch (error) {
    console.error("Error placing order:", error);
    res.status(500).json({ message: "Server error", error: error.message || error });
  }
};


const cancelOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.userId; // ✅ Now extracted from JWT

    const order = await OrderModel.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (order.userId.toString() !== userId) {
      return res.status(403).json({ message: "Unauthorized request" });
    }

    if (order.status === "Cancelled") {
      return res.status(400).json({ message: "Order has already been cancelled" });
    }

    if (order.status === "Accepted" || order.status === "Completed") {
      return res.status(400).json({ message: "Order cannot be cancelled after acceptance" });
    }

    const orderTime = new Date(order.createdAt);
    const currentTime = new Date();
    const timeDifference = (currentTime - orderTime) / (1000 * 60 * 60);

    if (timeDifference > 4) {
      return res.status(400).json({ message: "Cancellation window expired. You can no longer cancel this order" });
    }

    order.status = "Cancelled";
    await order.save();

    await UserModel.findByIdAndUpdate(order.userId, {
      $pull: { orders: { orderId: order._id } },
    });

    await BoutiqueModel.findByIdAndUpdate(order.boutiqueId, {
      $pull: { orders: { orderId: order._id } },
    });

    res.status(200).json({ message: "Order cancelled successfully", status: "Cancelled" });

  } catch (error) {
    console.error("Error cancelling order:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const viewPaidOrders = async (req, res) => {
  try {
    const userId = req.userId; // Injected from JWT by authMiddleware

    const paidOrders = await OrderModel.find({ userId, "bill.status": "Paid" }) // Use bill.status here
      .populate("boutiqueId", "name")
      .select("referralImage _id boutiqueId bill.totalAmount bill.status");

    if (!paidOrders.length) {
      return res.status(404).json({ message: "No paid orders found" });
    }

    const formattedOrders = paidOrders.map(order => ({
      orderId: order._id,
      boutiqueName: order.boutiqueId.name,
      amount: order.bill.totalAmount,
      status: order.bill.status,
      referralImage: order.referralImage
    }));

    res.status(200).json({
      message: "Paid orders retrieved successfully",
      orders: formattedOrders
    });

  } catch (error) {
    console.error("Error fetching paid orders:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const getUserPendingOrders = async (req, res) => {
  try {
    const userId = req.userId; // ✅ From JWT auth middleware

    const orders = await OrderModel.find({
      userId,
      status: "Pending",
    }).select("dressType measurements pickUp referralImage voiceNote status");

    const filteredOrders = orders.map((order) => {
      return {
        orderId: order._id,
        dressType: order.dressType,
        ...(order.measurements ? { measurements: Object.fromEntries(order.measurements) } : {}),
        ...(order.pickUp ? { pickUp: true } : {}),
        referralImage: order.referralImage || null,
        voiceNote: order.voiceNote?.length ? order.voiceNote : null,
        status: order.status,
      };
    });

    res.status(200).json({ orders: filteredOrders });
  } catch (error) {
    console.error("Error fetching user orders:", error);
    res.status(500).json({ message: "Server error", error: error.message || error });
  }
};


const updateOrderStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;
    const boutiqueId = req.boutiqueId; // From authMiddleware

    const validStatuses = ['Pending', 'In Progress', 'Ready for Delivery', 'Declined'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: `Invalid status: ${status}` });
    }

    const order = await OrderModel.findById(orderId)
      .populate('userId')
      .populate('boutiqueId');

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Validate that the boutique making the request owns this order
    if (order.boutiqueId?._id?.toString() !== boutiqueId) {
      return res.status(403).json({ message: 'Unauthorized boutique access to this order' });
    }

    const boutique = await BoutiqueModel.findById(boutiqueId);
    if (!boutique) {
      return res.status(404).json({ message: 'Boutique not found' });
    }

    // ✅ Update order status
    order.status = status;
    await order.save();

    // ✅ Update boutique.orders[] embedded status
    const boutiqueOrder = boutique.orders.find(
      (o) => o?.orderId?.toString() === orderId.toString()
    );
    if (boutiqueOrder) {
      boutiqueOrder.status = status;
      await boutique.save();
    }

    // ✅ Update user.orders[] embedded status
    const user = await UserModel.findById(order.userId._id);
    if (user && Array.isArray(user.orders)) {
      const userOrder = user.orders.find(
        (o) => o?.orderId?.toString() === orderId.toString()
      );
      if (userOrder) {
        userOrder.status = status;
        await user.save();
      }
    }

    // 📧 Optional email notification if marked Ready for Delivery
    if (status === 'Ready for Delivery') {
      const userLocation = order.userId?.address || 'Not Provided';
      const boutiqueLocation = order.boutiqueId?.location?.address || 'Not Provided';

      const emailText = `
        A Boutique is ready to deliver an order:
        - User Location: ${userLocation}
        - Boutique Location: ${boutiqueLocation}
        - Order ID: ${order._id}
      `;
      await sendEmailToAdmin('Ready for Delivery', emailText);
    }

    // 🛑 Optional: You can customize declining logic here
    if (status === 'Declined') {
      // Example: send notification or log reason
      console.log(`Order ${orderId} was declined by boutique ${boutiqueId}`);
    }

    res.status(200).json({
      message: `Order status updated to '${status}' successfully`,
      status,
    });
  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const viewPendingOrders = async (req, res) => {
  try {
    const userId = req.userId;

    const pendingOrders = await OrderModel.find({
      userId,
      status: "Accepted",         // ✅ Order must be accepted
      "bill.status": "Pending"    // ✅ Bill must be pending
    })
      .populate("boutiqueId", "name")
      .select("referralImage _id boutiqueId bill.totalAmount bill.status");

    if (!pendingOrders.length) {
      return res.status(404).json({ message: "No pending orders found" });
    }

    const formattedOrders = pendingOrders.map(order => ({
      orderId: order._id,
      boutiqueName: order.boutiqueId.name,
      amount: order.bill.totalAmount,
      status: order.bill.status,
      referralImage: order.referralImage
    }));

    res.status(200).json({
      message: "Pending orders retrieved successfully",
      orders: formattedOrders
    });

  } catch (error) {
    console.error("Error fetching pending orders:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};




export const rejectOrderBill = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await OrderModel.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (order.bill.status !== "Pending") {
      return res.status(400).json({ message: `Cannot reject a ${order.bill.status.toLowerCase()} bill.` });
    }

    order.bill.status = "Rejected";
    await order.save();

    res.status(200).json({
      message: "Bill status updated to Rejected",
      orderId: order._id,
      status: order.bill.status
    });
  } catch (error) {
    console.error("Error rejecting bill:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const markBillAsPaid = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.userId; // ✅ Injected from JWT middleware

    // 🔎 Find order and ensure it belongs to this user
    const order = await OrderModel.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: "Order not found." });
    }

    if (order.userId.toString() !== userId) {
      return res.status(403).json({ message: "Unauthorized to update this order." });
    }

    if (order.bill.status === "Paid") {
      return res.status(400).json({ message: "This bill is already marked as Paid." });
    }

    // ✅ Update bill status
    order.bill.status = "Paid";
    await order.save();

    res.status(200).json({
      message: "Bill marked as Paid successfully.",
      orderId: order._id,
      billStatus: order.bill.status,
    });
  } catch (error) {
    console.error("Error marking bill as paid:", error);
    res.status(500).json({ message: "Server error", error: error.message });
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
    const userId = req.userId; // ✅ Injected from JWT

    const order = await OrderModel.findById(orderId)
      .populate('userId', 'name phone')
      .populate('boutiqueId', 'name location');

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // ✅ Ensure the requesting user owns the order
    if (order.userId._id.toString() !== userId) {
      return res.status(403).json({ message: 'Unauthorized access to this order.' });
    }

    res.status(200).json({ order });
  } catch (error) {
    console.error("Error fetching order details:", error);
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



export const getUserAlterationRequests = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await UserModel.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const alterationRequests = await AlterationRequest.find({ userId })
      .populate("boutiqueId", "name phone location")
      .exec();

    if (alterationRequests.length === 0) {
      return res.status(404).json({ message: "No alteration requests found for this user" });
    }

    res.status(200).json({
      message: "Alteration requests retrieved successfully",
      alterationRequests,
    });
  } catch (error) {
    console.error("Error fetching user alteration requests:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};


// 📌 Submit Alteration Request
export const submitAlterationRequest = async (req, res) => {
  try {
    const { boutiqueId, description, orderId } = req.body;
    const { userId } = req.params;

    // Validate user
    const user = await UserModel.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Validate boutique
    const boutique = await BoutiqueModel.findById(boutiqueId);
    if (!boutique) return res.status(404).json({ message: "Boutique not found" });

    // Validate order
    const order = await OrderModel.findById(orderId);
    if (!order || order.userId.toString() !== userId || order.boutiqueId.toString() !== boutiqueId) {
      return res.status(400).json({ message: "Invalid or mismatched order" });
    }

    // Enforce max 2 alteration requests per order
    const existingRequests = await AlterationRequest.find({ orderId }).sort({ createdAt: 1 });

    if (existingRequests.length >= 2) {
      return res.status(400).json({ message: "Maximum of 2 alteration requests allowed per order." });
    }

    if (existingRequests.length === 1 && existingRequests[0].status !== 'Completed') {
      return res.status(400).json({
        message: "Second alteration request can be submitted only after the first request is marked as Completed.",
      });
    }

    // Validate file uploads
    if (!req.files || !req.files.referenceImage || !req.files.orderImage) {
      return res.status(400).json({ message: "Reference image and at least one order image are required" });
    }

    const referenceImage = req.files.referenceImage[0].path;
    const orderImage = req.files.orderImage.map(file => file.path);

    let voiceNotes = [];
    if (req.files?.voiceNote?.length > 0) {
      voiceNotes = req.files.voiceNote.slice(0, 5).map(file => file.path);
    }

    // Create alteration request
    const alterationRequest = await AlterationRequest.create({
      userId,
      boutiqueId,
      orderId,
      description,
      referenceImage,
      orderImage,
      voiceNote: voiceNotes,
      status: "Pending",
    });

    // Send email notification
    const mailOptions = {
      from: 'nihar.neelala124@gmail.com',
      to: 'needles.personal.2025@gmail.com',
      subject: 'New Alteration Request Submitted',
      text: `A new alteration request has been submitted.

Alteration Request ID: ${alterationRequest._id}

User Location: ${user.address?.flatNumber || ""}, ${user.address?.block || ""}, ${user.address?.street || ""}
Boutique Location: ${boutique.location?.address || ""}`,
    };

    await transporter.sendMail(mailOptions);

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
    const { requestId } = req.params;
    const boutiqueId = req.boutiqueId;

    const alterationRequest = await AlterationRequest.findOne({
      _id: requestId,
      boutiqueId,
    });

    if (!alterationRequest) {
      return res.status(404).json({ message: "Alteration request not found" });
    }

    alterationRequest.status = "Reviewed";
    await alterationRequest.save();

    res.status(200).json({ message: "Request reviewed", alterationRequest });
  } catch (error) {
    res.status(500).json({ message: "Error reviewing request", error: error.message });
  }
};


export const getActiveAlterationRequests = async (req, res) => {
  try {
    const boutiqueId = req.boutiqueId;

    // Find alteration requests with status NOT "Pending" or "Completed"
    const activeRequests = await AlterationRequest.find({
      boutiqueId,
      status: { $nin: ["Pending", "Completed"] },
    })
      .populate("userId", "name email") // Optional: populate user details
      .populate("boutiqueId", "name email"); // Optional: populate boutique details

    res.status(200).json({ requests: activeRequests });
  } catch (error) {
    console.error("Error fetching active alteration requests:", error);
    res.status(500).json({ message: "Internal server error." });
  }
};

// 📌 Open Chat if Needed

export const respondToAlterationRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { responseStatus } = req.body;
    const boutiqueId = req.boutiqueId;

    // 🔍 Validate requestId format (optional but recommended)
    if (!mongoose.Types.ObjectId.isValid(requestId)) {
      return res.status(400).json({ message: "Invalid request ID format" });
    }

    // 📥 Fetch the alteration request by ID
    const alterationRequest = await AlterationRequest.findById(requestId);
    if (!alterationRequest) {
      return res.status(404).json({ message: "Alteration request not found" });
    }

    // 🔒 Check boutique ownership
    if (alterationRequest.boutiqueId.toString() !== boutiqueId) {
      return res.status(403).json({ message: "Not authorized to respond to this alteration request" });
    }

    // ✅ Validate allowed status transitions
    const validStatuses = ["Reviewed", "In Progress", "Ready for Delivery", "Completed"];
    if (!validStatuses.includes(responseStatus)) {
      return res.status(400).json({ message: `Invalid status update. Must be one of: ${validStatuses.join(", ")}` });
    }

    // 💾 Update the request
    alterationRequest.status = responseStatus;
    await alterationRequest.save();

    res.status(200).json({
      message: `Alteration request status updated to '${responseStatus}'`,
      alterationRequest,
    });

  } catch (error) {
    console.error("Error updating alteration request:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};




// 📌 Get All Alteration Requests for a Boutique
export const getAlterationRequestsForBoutique = async (req, res) => {
  try {
    const boutiqueId = req.boutiqueId;

    const alterationRequests = await AlterationRequest.find({
      boutiqueId,
      status: "Pending", // Only include requests that haven't been reviewed yet
    })
      .populate("userId", "name phone")
      .exec();

    res.status(200).json({
      message: "Alteration requests fetched successfully",
      alterationRequests,
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching requests", error: error.message });
  }
};



const createBill = async (req, res) => {
  try {
    const { orderId, selectedItems, additionalCost } = req.body;
    const boutiqueId = req.user.userId;

    if (!mongoose.Types.ObjectId.isValid(orderId) || !mongoose.Types.ObjectId.isValid(boutiqueId)) {
      return res.status(400).json({ error: "Invalid order ID or boutique ID" });
    }

    const boutique = await BoutiqueModel.findById(boutiqueId);
    const order = await OrderModel.findById(orderId).populate("userId");

    if (!boutique || !order) return res.status(404).json({ error: "Boutique or Order not found" });
    if (order.status === "Declined") return res.status(400).json({ message: "Cannot generate bill for a declined order." });

    order.status = "Accepted";

    let subtotal = 0;
    let billDetails = {};

    selectedItems.forEach(({ item, quantity }) => {
      const catalogItem = boutique.catalogue.find((c) => c.itemName.includes(item));
      if (catalogItem) {
        const price = catalogItem.price[0] * quantity;
        billDetails[item] = price;
        subtotal += price;
      }
    });

    // Additional cost
    let additionalCostValue = 0;
    let additionalCostReason = "Not specified";
    if (additionalCost && typeof additionalCost === "object" && additionalCost.amount !== undefined) {
      const val = parseFloat(additionalCost.amount);
      if (!isNaN(val) && val >= 0) {
        additionalCostValue = val;
        additionalCostReason = additionalCost.reason || "Not specified";
        subtotal += val;
      }
    }

    // Calculations
    const platformFee = subtotal * 0.015;
    const boutiqueCommission = subtotal * 0.05;
    const gstOnPlatformFee = platformFee * 0.18;
    const gstOnBoutiqueCommission = boutiqueCommission * 0.18;

    // Delivery fee (₹5 per km)
    const userLocation = order.userId.address.location;
    const boutiqueLocation = boutique.location;
    const distance = await getDistance(userLocation, boutiqueLocation);
    const deliveryFee = calculateDeliveryFee(distance); // ₹5 per km

    const totalAmount = subtotal + platformFee + gstOnPlatformFee + deliveryFee;
    const generatedAt = new Date();

    // Save bill
    order.bill = {
      items: billDetails,
      subtotal,
      platformFee,
      deliveryFee,
      additionalCost: {
        amount: additionalCostValue,
        reason: additionalCostReason,
      },
      gst: {
        onPlatformFee: gstOnPlatformFee,
        onBoutiqueCommission: gstOnBoutiqueCommission,
        total: gstOnPlatformFee + gstOnBoutiqueCommission,
        rate: 18,
      },
      boutiqueCommission,
      totalAmount,
      status: "Pending",
      generatedAt,
    };

    order.markModified("bill");
    order.totalAmount = totalAmount;
    await order.save();

    // Email admin
    const subject = `🧾 New Bill Created - ${boutique.name}`;
    const text = `
A new bill has been generated for an order.

🧵 Boutique Name: ${boutique.name}
🆔 Boutique ID: ${boutique._id}

💸 Boutique Commission (5%): ₹${boutiqueCommission.toFixed(2)}
🧾 GST on Commission (18%): ₹${gstOnBoutiqueCommission.toFixed(2)}

📦 Total Amount (Customer pays): ₹${totalAmount.toFixed(2)}
📍 Delivery Distance: ${distance} km
📅 Generated At: ${generatedAt.toISOString()}

🧾 Platform Fee (1.5%): ₹${platformFee.toFixed(2)}
🧾 GST on Platform Fee: ₹${gstOnPlatformFee.toFixed(2)}
`;

    await sendEmailToAdmin(subject, text);

    res.status(200).json({
      message: "Bill created successfully and email sent to admin.",
      bill: order.bill,
      orderId: order._id,
      status: order.status,
    });

  } catch (error) {
    console.error("Error creating bill:", error);
    res.status(500).json({ message: "Server error", error: error.message });
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
  return distance * 5; // ₹10 per KM
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

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});


const viewBill = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.userId;

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({ message: "Invalid order ID" });
    }

    const order = await OrderModel.findById(orderId)
      .populate("boutiqueId", "name")
      .populate("userId", "_id")
      .select("bill _id boutiqueId userId");

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (order.userId._id.toString() !== userId) {
      return res.status(403).json({ message: "Unauthorized access to this bill" });
    }

    if (!order.bill || !order.bill.totalAmount) {
      return res.status(400).json({ message: "Bill not available for this order" });
    }

    const bill = order.bill;

    const billDetails = {
      orderId: order._id,
      boutiqueName: order.boutiqueId.name,
      subtotal: bill.subtotal, // if you're storing this
      items: bill.items,
      platformFee: bill.platformFee,
      gst: bill.gst?.onPlatformFee,
      deliveryFee: bill.deliveryFee,
      additionalCost: bill.additionalCost,
      totalAmount: bill.totalAmount,
      status: bill.status,
      generatedAt: bill.generatedAt,
    };

    res.status(200).json({
      message: "Bill retrieved successfully",
      bill: billDetails,
    });

  } catch (error) {
    console.error("Error fetching bill:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};



const getBoutiqueOrders = async (req, res) => {
  try {
    const boutiqueId = req.user.userId; // 🔄 Extracted from JWT token via middleware

    // Find boutique and populate orders
    const boutique = await BoutiqueModel.findById(boutiqueId).populate({
      path: "orders.orderId",
      model: "order", // Ensure correct model reference
      populate: {
        path: "userId",
        select: "name",
      },
    });

    if (!boutique) {
      return res.status(404).json({ message: "Boutique not found" });
    }

    // Filter orders: Only include orders that exist and have "Pending" status
    const orders = boutique.orders
      .filter(({ orderId }) => orderId && orderId.status === "Pending") // Ensure orderId exists and status is "Pending"
      .map(({ orderId }) => ({
        orderId: orderId._id || null,
        userName: orderId.userId?.name || "Unknown User", // Handle missing user data
        dressType: orderId.dressType || "Unknown",
        measurements: orderId.measurements ? Object.fromEntries(orderId.measurements) : null, // Convert Map to Object
        pickUp: orderId.pickUp || false,
        referralImage: orderId.referralImage || null,
        voiceNote: orderId.voiceNote?.length ? orderId.voiceNote : null,
        location: orderId.location || "Unknown",
        alterations: orderId.alterations || false,
        status: orderId.status || "Pending",
        totalAmount: orderId.totalAmount || 0,
        bill: orderId.bill || {}, // Ensure bill exists
        createdAt: orderId.createdAt || new Date(),
      }));

    res.status(200).json({ orders });
  } catch (error) {
    console.error("Error fetching boutique orders:", error);
    res.status(500).json({ message: "Server error", error: error.message || error });
  }
};


const getCompletedOrders = async (req, res) => {
  try {
    const boutiqueId = req.boutiqueId;

    const completedOrders = await OrderModel.find({ 
        status: "Completed", 
        boutiqueId 
      })
      .populate("userId", "name email phone") // Populate user details
      .populate("boutiqueId", "name location") // Populate boutique details
      .sort({ updatedAt: -1 }); // Sort by latest completed orders

    if (completedOrders.length === 0) {
      return res.status(404).json({ message: "No completed orders found." });
    }

    res.status(200).json({ message: "Completed orders fetched successfully", orders: completedOrders });
  } catch (error) {
    console.error("Error fetching completed orders:", error);
    res.status(500).json({ message: "Server error", error: error.message || error });
  }
};







export {createBill, processPayment, getBill, getCompletedOrders};



export {getBoutiqueOrders};

export default sendEmailToAdmin;


export { rateOrder };

export {getOrderDetails};
export {placeOrder};
export {updateOrderStatus, viewPaidOrders, viewBill, cancelOrder};