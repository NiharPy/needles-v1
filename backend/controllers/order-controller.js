import OrderModel from '../models/OrderSchema.js';
import BoutiqueModel from '../models/BoutiqueMarketSchema.js';
import UserModel from '../models/userschema.js';
import nodemailer from 'nodemailer';
import AltorderModel from '../models/AlterOrderSchema.js';
import ChatModel from '../models/Chat.js';
import mongoose from 'mongoose';

const transporter = nodemailer.createTransport({
  service: 'Gmail',
  auth: {
    user: 'nihar.neelala124@gmail.com', // Replace with your email
    pass: 'vccu mdgc lwgz iglj', // Replace with your email password or app-specific password
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

    console.log('Received files:', req.files);

    console.log("req body : ", req.body);

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

    // Find the user
    const User = await UserModel.findById(userId);
    if (!User) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Find the boutique
    const boutique = await BoutiqueModel.findById(boutiqueId);
    if (!boutique) {
      return res.status(404).json({ message: 'Boutique not found' });
    }

    // Validate dressType exists in boutique's dressTypes
    const dressTypeData = boutique.dressTypes.find(
      (type) => type.type === dressType
    );
    if (!dressTypeData) {
      return res
        .status(400)
        .json({ message: `Invalid dress type: ${dressType} for this boutique` });
    }

    // Validate measurements based on the boutique-specific requirements
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

    // Upload referral image to Cloudinary
    const referralImage = req.files.referralImage[0].path; // Access Cloudinary URL from referralImage

    // Create new order
    const order = await OrderModel.create({
      userId: User._id,
      boutiqueId: boutique._id,
      pickUp,
      dressType,
      measurements,
      referralImage, // Use the Cloudinary URL for the image
      location: User.address, // Assuming location comes from user's address
      voiceNote: voiceNoteUrl, // Use the Cloudinary URL for the voice note
      status: 'Pending',
    });

    // Add order to Boutique's orders
    boutique.orders.push({
      orderId: order._id,
      status: 'Pending',
    });
    await boutique.save();

    // Add order to User's orders
    User.orders.push({
      orderId: order._id,
      status: 'Pending',
    });
    await User.save();

    // Send response
    res.status(201).json({
      message: 'Order placed successfully',
      order, // Order should include the voiceNote field now
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

    // Validate status
    const validStatuses = ['Pending', 'Accepted', 'Declined', 'In Progress', 'Ready for Delivery', 'Completed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: `Invalid status: ${status}` });
    }

    // Find the order
    const order = await OrderModel.findById(orderId).populate('userId').populate('boutiqueId');
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Update order status
    order.status = status;
    await order.save();

    // Update status in Boutique's orders
    const boutique = await BoutiqueModel.findById(order.boutiqueId);
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
    console.error(error);
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


const startChatSessionUser = async (req, res) => {
  try {
    const { userId } = req.params;

    // Find the user
    const user = await UserModel.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Initialize a new chat session
    const chatSession = new ChatModel({
      userId,
      boutiqueId: null, // This will be set when a boutique joins the chat
      sender: 'User',
      message: 'Hello, I need some alterations.',
      sessionActive: true,
    });

    await chatSession.save();
    res.status(200).json({ message: 'Chat session started', chatSession });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error starting chat session', error: error.message });
  }
};

// Start a new chat session for the boutique
const startChatSessionBoutique = async (req, res) => {
  try {
    const { boutiqueId } = req.params;

    // Find the boutique
    const boutique = await BoutiqueModel.findById(boutiqueId);
    if (!boutique) return res.status(404).json({ message: 'Boutique not found' });

    // Find the user's chat session
    const chatSession = await ChatModel.findOne({ boutiqueId: null, sessionActive: true });
    if (!chatSession) return res.status(404).json({ message: 'No active chat session for this user' });

    // Set the boutique's ID to the session
    chatSession.boutiqueId = boutiqueId;
    chatSession.message = 'Hello, how can I assist you with your alterations?';
    await chatSession.save();

    res.status(200).json({ message: 'Chat session started with boutique', chatSession });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error starting chat session', error: error.message });
  }
};

// Send a message from the user to the boutique
const sendMessageUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { message, image, voiceNote } = req.body;

    // Find the active chat session for the user
    const chatSession = await ChatModel.findOne({ userId, sessionActive: true });
    if (!chatSession) return res.status(404).json({ message: 'No active chat session' });

    // Add the message from the user
    const newMessage = new ChatModel({
      userId,
      boutiqueId: chatSession.boutiqueId,
      sender: 'User',
      message,
      image,
      voiceNote,
      sessionActive: true,
    });

    await newMessage.save();
    res.status(200).json({ message: 'Message sent to boutique', newMessage });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error sending message', error: error.message });
  }
};

// Send a message from the boutique to the user
const sendMessageBoutique = async (req, res) => {
  try {
    const { boutiqueId } = req.params;
    const { message, image, voiceNote } = req.body;

    // Find the active chat session for the boutique
    const chatSession = await ChatModel.findOne({ boutiqueId, sessionActive: true });
    if (!chatSession) return res.status(404).json({ message: 'No active chat session' });

    // Add the message from the boutique
    const newMessage = new ChatModel({
      boutiqueId,
      userId: chatSession.userId,
      sender: 'Boutique',
      message,
      image,
      voiceNote,
      sessionActive: true,
    });

    await newMessage.save();
    res.status(200).json({ message: 'Message sent to user', newMessage });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error sending message', error: error.message });
  }
};

// Close the chat session when boutique says "Bye"
const closeChatSession = async (req, res) => {
  try {
    const { userId } = req.params;

    // Find the active chat session for the user
    const chatSession = await ChatModel.findOne({ userId, sessionActive: true });
    if (!chatSession) return res.status(404).json({ message: 'No active chat session' });

    // Close the chat session
    chatSession.sessionActive = false;
    await chatSession.save();

    res.status(200).json({ message: 'Chat session closed' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error closing chat session', error: error.message });
  }
};

// Get the chat session history for a user or boutique
const getChatSessionHistory = async (req, res) => {
  try {
    const { userId, boutiqueId } = req.params;

    const chatHistory = await ChatModel.find({
      $or: [{ userId }, { boutiqueId }],
      sessionActive: false, // Only retrieve closed sessions
    });

    res.status(200).json({ message: 'Chat history fetched', chatHistory });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error fetching chat history', error: error.message });
  }
};


export {startChatSessionUser, startChatSessionBoutique, sendMessageUser, sendMessageBoutique, closeChatSession, getChatSessionHistory};


export {getUserAlterationOrders};


export {requestAlteration};


export { rateOrder };

export {getOrderDetails};
export {placeOrder};
export {updateOrderStatus};