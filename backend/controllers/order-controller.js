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
      referralImage,
      location,
      voiceNote,
    } = req.body;

    // Validate boutique and dress type
    const boutique = await BoutiqueModel.findById(boutiqueId);
    if (!boutique) {
      return res.status(404).json({ message: 'Boutique not found' });
    }

    const availableItems = boutique.catalogue.flatMap((item) => item.itemName);
    if (!availableItems.includes(dressType)) {
      return res.status(400).json({ message: `Invalid dress type: ${dressType}` });
    }

    // Validate measurements based on dress type
    const measurementRequirements = {
      'Saree Blouse': ['chest', 'shoulder', 'waist', 'armLength'],
      Lehenga: ['waist', 'hip', 'length'],
      Kurta: ['chest', 'waist', 'hip', 'shoulder', 'armLength'],
      Shirt: ['chest', 'waist', 'shoulder', 'armLength', 'length'],
      Gown: ['chest', 'waist', 'hip', 'shoulder', 'length', 'armLength'],
    };

    const requiredMeasurements = measurementRequirements[dressType] || [];
    const providedKeys = Object.keys(measurements);
    const isValidMeasurements = requiredMeasurements.every((key) => providedKeys.includes(key));

    if (!isValidMeasurements) {
      return res.status(400).json({
        message: `Invalid measurements for ${dressType}. Required fields: ${requiredMeasurements.join(', ')}`,
      });
    }

    // Create new order
    const order = await OrderModel.create({
      userId,
      boutiqueId,
      pickUp,
      dressType,
      itemName: dressType,
      measurements,
      referralImage,
      location,
      voiceNote,
      status: 'Pending',
    });

    // Add order to Boutique's orders
    boutique.orders.push({
      orderId: order._id,
      itemName: dressType,
      status: 'Pending',
    });
    await boutique.save();

    // Add order to User's orders
    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.orders.push({
      orderId: order._id,
      itemName: dressType,
      status: 'Pending',
    });
    await user.save();

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

    // Update order status
    const order = await OrderModel.findById(orderId).populate('userId').populate('boutiqueId');
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

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
    };

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
    };

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

export {getOrderDetails};
export {placeOrder};
export {updateOrderStatus};