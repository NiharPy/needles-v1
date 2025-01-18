import ODorderModel from "../models/ODDorderSchema.js";
import UserModel from '../models/userschema.js';
import nodemailer from 'nodemailer';
import twilio from "twilio";

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

const dressTypeData = {
    Lehenga: {
      step1Images: [
        { serialCode: '001', imageUrl: 'lehenga1-step1.jpg' },
        { serialCode: '002', imageUrl: 'lehenga2-step1.jpg' },
      ],
      step2Images: [
        { serialCode: '101', imageUrl: 'lehenga1-step2.jpg' },
        { serialCode: '102', imageUrl: 'lehenga2-step2.jpg' },
      ],
    },
    SareeBlouse: {
      step1Images: [
        { serialCode: '003', imageUrl: 'saree1-step1.jpg' },
        { serialCode: '004', imageUrl: 'saree2-step1.jpg' },
      ],
      step2Images: [
        { serialCode: '103', imageUrl: 'saree1-step2.jpg' },
        { serialCode: '104', imageUrl: 'saree2-step2.jpg' },
      ],
    },
    // Add more dress types and images as needed
  };


  const getDressTypes = async (req, res) => {
    try {
      const dressTypes = Object.keys(dressTypeData); // Extract all dress types
      const response = dressTypes.map((type) => ({
        dressType: type, // Only include dress type in the response
      }));
      res.status(200).json({ message: 'Available dress types.', data: response });
    } catch (error) {
      console.error('Error fetching dress types:', error);
      res.status(500).json({ message: 'Internal server error.' });
    }
  };

  const getStep1Images = async (req, res) => {
    try {
      const { dressType } = req.params;
  
      // Validate the dress type
      if (!dressType || !dressTypeData[dressType]) {
        return res.status(400).json({ message: 'Invalid dress type.' });
      }
  
      // Fetch step 1 images for the specified dress type
      const step1Images = dressTypeData[dressType].step1Images;
      res.status(200).json({ message: 'Step 1 images fetched successfully.', step1Images });
    } catch (error) {
      console.error('Error fetching step 1 images:', error);
      res.status(500).json({ message: 'Internal server error.' });
    }
  };
  



  const getStep2Images = async (req, res) => {
    try {
      const { dressType } = req.params;
  
      if (!dressType || !dressTypeData[dressType]) {
        return res.status(400).json({ message: 'Invalid dress type.' });
      }
  
      const step2Images = dressTypeData[dressType].step2Images;
      res.status(200).json({ message: 'Step 2 images fetched successfully.', step2Images });
    } catch (error) {
      console.error('Error fetching step 2 images:', error);
      res.status(500).json({ message: 'Internal server error.' });
    }
  };

  const placeODOrder = async (req, res) => {
    try {
      const { userId, dressType, step1Serial, step2Serial, location, specialInstructions, pickUp, measurements } = req.body;
  
      // Check for required fields
      if (!userId || !dressType || !step1Serial || !step2Serial) {
        return res.status(400).json({ message: 'Missing required fields.' });
      }
  
      const User = await UserModel.findById(userId);
      if (!User) {
        return res.status(404).json({ message: 'User not found' });
      }
  
      const validDressTypes = ['Lehenga', 'SareeBlouse', 'Kurta', 'Shirt', 'Gown']; // Example dress types
      if (!validDressTypes.includes(dressType)) {
        return res.status(400).json({ message: `Invalid dress type: ${dressType}` });
      }
  
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
  
      // Create the new ODD order
      const newOrder = new ODorderModel({
        userId: User._id,
        ODitems: [
          { serialCode: step1Serial, quantity: 1, type: 'Dress' },  // Add 'type' here
          { serialCode: step2Serial, quantity: 1, type: 'Dress' }   // Add 'type' here
        ],
        measurements,
        location: User.address,
        specialInstructions,
        pickUp,
        status: 'Pending',
        location: User.address  // Ensure 'location' is provided
      });
  
      // Save the order to the database
      await newOrder.save();
  
      // Update user with new order
      User.ODDorders.push({
        orderId: newOrder._id,
        dressType,
        ODitems: newOrder.ODitems,
        status: 'Pending',
        specialInstructions,
      });
  
      await User.save();

      const emailText = `
      A new ODD order has been placed:
      - Order ID: ${newOrder._id}
      - User Location: ${User.address}
      - Dress Type: ${dressType}
      - Special Instructions: ${specialInstructions || 'None'}
    `;
    
    // Send email to admin (use your email sending function here)
    await sendEmailToAdmin('New ODD Order Placed', emailText);

    // Send response to the client
    res.status(201).json({
      message: 'One-Day Delivery Order placed successfully.',
      order: newOrder,
    });

  } catch (error) {
    console.error('Error placing ODD order:', error);
    res.status(500).json({ message: 'Internal server error.' });
  }
};
  
const updateODDDeliveryStatus = async (req, res) => {
    try {
      const { orderId } = req.params; // Get order ID from params
      const { deliveryStatus } = req.body; // Get new delivery status from request body
  
      // Validate delivery status
      const validDeliveryStatuses = ['Pending', 'On the Way', 'Delivered'];
      if (!validDeliveryStatuses.includes(deliveryStatus)) {
        return res.status(400).json({ message: `Invalid delivery status: ${deliveryStatus}` });
      }
  
      // Find the ODD order by ID
      const order = await ODorderModel.findById(orderId);
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
        const userOrder = user.ODDorders.find(o => o.orderId.toString() === orderId.toString());
        if (userOrder) {
          userOrder.deliveryStatus = deliveryStatus;
          await user.save();
        }
  
        // Send SMS to the user with their updated delivery status
        const userPhoneNumber = user.phone;  // Assuming the user has a 'phoneNumber' field
  
        const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
        const message = `Hello ${user.name}, your One-Day Delivery Order (ID: ${orderId}) status is now "${deliveryStatus}".`;
  
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


  export {getDressTypes,getStep1Images, getStep2Images, placeODOrder, updateODDDeliveryStatus};