import OrderModel from '../models/OrderSchema.js';
import BoutiqueModel from '../models/BoutiqueMarketSchema.js';
import UserModel from '../models/userschema.js';
import nodemailer from 'nodemailer';

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
      measurements,
      location,
      voiceNote,
    } = req.body;

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
      (type) => type.typeName === dressType
    );
    if (!dressTypeData) {
      return res.status(400).json({ message: `Invalid dress type: ${dressType}` });
    }

    // Validate measurements
    const measurementRequirements = {
      'Saree Blouse': ['chest', 'shoulder', 'waist', 'armLength'],
      Lehenga: ['waist', 'hip', 'length'],
      Kurta: ['chest', 'waist', 'hip', 'shoulder', 'armLength'],
      Shirt: ['chest', 'waist', 'shoulder', 'armLength', 'length'],
      Gown: ['chest', 'waist', 'hip', 'shoulder', 'length', 'armLength'],
    };

    const requiredMeasurements = measurementRequirements[dressType] || [];
    const providedKeys = Object.keys(measurements);
    const isValidMeasurements = requiredMeasurements.every((key) =>
      providedKeys.includes(key)
    );

    if (!isValidMeasurements) {
      return res.status(400).json({
        message: `Invalid measurements for ${dressType}. Required fields: ${requiredMeasurements.join(', ')}`,
      });
    }

    // Use the first image from the dressType as the referralImage
    const referralImage = dressTypeData.images[0];

    // Create new order
    const order = await OrderModel.create({
      userId: User._id,
      boutiqueId: boutique._id,
      pickUp,
      dressType,
      measurements,
      referralImage,
      location: User.address,
      voiceNote,
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
      order,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
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


export { rateOrder };

export {getOrderDetails};
export {placeOrder};
export {updateOrderStatus};