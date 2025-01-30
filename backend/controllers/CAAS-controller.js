import CAASorderModel from "../models/CAASSchema.js";
import UserModel from "../models/userschema.js";  // Assuming you have this model imported
import sendEmailToAdmin from './order-controller.js'// Import your email utility
import twilio from 'twilio';

const placeCAASOrder = async (req, res) => {
  try {
    const { userId, dressType, step1Serial, step2Serial, location, specialInstructions, pickUp, measurements } = req.body;

    // Check for required fields
    if (!userId || !dressType || !step1Serial || !step2Serial) {
      return res.status(400).json({ message: 'Missing required fields.' });
    }

    // Find the user
    const User = await UserModel.findById(userId);
    if (!User) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Validate the dressType
    const validDressTypes = ['Lehenga', 'SareeBlouse', 'Kurta', 'Shirt', 'Gown']; // Example dress types
    if (!validDressTypes.includes(dressType)) {
      return res.status(400).json({ message: `Invalid dress type: ${dressType}` });
    }

    // Measurement requirements
    const measurementRequirements = {
      Lehenga: ['Waist', 'Hip', 'Length'],
      SareeBlouse: ['Chest', 'Waist', 'Neck'],
      Kurta: ['Chest', 'Waist', 'Length'],
      Shirt: ['Chest', 'Sleeve', 'Length'],
      Gown: ['Chest', 'Waist', 'Hips', 'Length'],
    };

    const requiredMeasurements = measurementRequirements[dressType] || [];
    const providedKeys = Object.keys(measurements || {});
    const isValidMeasurements = requiredMeasurements.every((key) => providedKeys.includes(key));

    if (!isValidMeasurements) {
      return res.status(400).json({
        message: `Invalid measurements for ${dressType}. Required fields: ${requiredMeasurements.join(', ')}`,
      });
    }

    // Create the new CAAS order
    const newOrder = new CAASorderModel({
      userId: User._id,
      CAASitems: [
        { serialCode: step1Serial, type: 'Dress', fabric: 'Fabric1', cuttingInstructions: 'Cut as per standard size' },  // Example values for CAASitem
        { serialCode: step2Serial, type: 'Dress', fabric: 'Fabric2', cuttingInstructions: 'Cut as per custom size' },  // Example values for CAASitem
      ],
      measurements,
      location: User.address,  // Assuming address from the user model
      specialInstructions,
      pickUp,
      deliveryStatus: 'Pending',
    });

    // Save the order to the database
    await newOrder.save();

    // Update the user with the new order
    User.CAASorders.push({
      orderId: newOrder._id,
      dressType,
      CAASitems: newOrder.CAASitems,
      status: 'Pending',
      specialInstructions,
    });

    await User.save();

    const emailText = `
    A new CAAS order has been placed:
    - Order ID: ${newOrder._id}
    - User Location: ${User.address}
    - Dress Type: ${dressType}
    - Special Instructions: ${specialInstructions || 'None'}
  `;
    
    // Send email to admin (use your email sending function here)
    await sendEmailToAdmin('New CAAS Order Placed', emailText);

    // Send response to the client
    res.status(201).json({
      message: 'Cutting-As-A-Service order placed successfully.',
      order: newOrder,
    });

  } catch (error) {
    console.error('Error placing CAAS order:', error);
    res.status(500).json({ message: 'Internal server error.' });
  }
};


const updateCAASDeliveryStatus = async (req, res) => {
    try {
      const { orderId } = req.params; // Get order ID from params
      const { deliveryStatus } = req.body; // Get new delivery status from request body
  
      // Validate delivery status
      const validDeliveryStatuses = ['Pending', 'On the Way', 'Delivered'];
      if (!validDeliveryStatuses.includes(deliveryStatus)) {
        return res.status(400).json({ message: `Invalid delivery status: ${deliveryStatus}` });
      }
  
      // Find the CAAS order by ID
      const order = await CAASorderModel.findById(orderId);
      if (!order) {
        return res.status(404).json({ message: 'Order not found' });
      }
  
      // Update the delivery status of the order
      order.deliveryStatus = deliveryStatus;
  
      // Save the updated order
      await order.save();
  
      // If the order belongs to a user, update their order's delivery status
      const user = await UserModel.findById(order.userId);
      if (user) {
        const userOrder = user.CAASorders.find(o => o.orderId.toString() === orderId.toString());
        if (userOrder) {
          userOrder.deliveryStatus = deliveryStatus;
          await user.save();
        }
  
        // Send SMS to the user with their updated delivery status
        const userPhoneNumber = user.phone;  // Assuming the user has a 'phone' field
  
        const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
        const message = `Hello ${user.name}, your Cutting-As-A-Service Order (ID: ${orderId}) status is now "${deliveryStatus}".`;
  
        // Send SMS
        await client.messages.create({
          body: message,
          from: process.env.TWILIO_MESSAGING_SERVICE_SID, // Your Twilio phone number
          to: userPhoneNumber,      // The user's phone number
        });
      }
  
      res.status(200).json({
        message: 'Delivery status updated successfully',
        order: order,
      });
    } catch (error) {
      console.error('Error updating delivery status:', error);
      res.status(500).json({ message: 'Internal server error', error: error.message });
    }
  };

export { updateCAASDeliveryStatus};

export {placeCAASOrder};


