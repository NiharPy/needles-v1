import ODorderModel from "../models/ODDorderSchema.js";
import UserModel from '../models/userschema.js';
import nodemailer from 'nodemailer';
import twilio from "twilio";

const measurementRequirements = {
  Blouse: ['Length', 'Upper chest', 'Center chest', 'Shoulder Width', 'Sleeve Length', 'Sleeve Round', 'Middle hand round', 'Front neck height', 'Back neck height', 'Waist loose', 'Front Dart point', 'Full shoulder', 'Armhole Round'],
  KidsFrock: ['Full Length', 'Body Length', 'Bottom Length', 'Chest Round', 'Waist Round', 'Armhole Round', 'Shoulder Width', 'Sleeve Length', 'Sleeve Round', 'Full Shoulder', 'Front Neck height', 'Back Neck Height'],
};

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

const dressTypeData = {
    Blouse: {
      '3 Dart': {
        Front: [
          { serialCode: '001A', imageUrl: 'blouse-3dart1-step1.jpg' },
          { serialCode: '002A', imageUrl: 'blouse-3dart2-step1.jpg' },
        ],
        Back: [
          { serialCode: '101A', imageUrl: 'lehenga1-step2.jpg' },
          { serialCode: '102A', imageUrl: 'lehenga2-step2.jpg' },
        ],
        Sleeve: [
          { serialCode: '201A', imageUrl: "https://res.cloudinary.com/dwymmpkh8/image/upload/v1740558532/ODD-cloud/sleeve/dwglvyq0avguu1vxhmg9.png" },
          { serialCode: '202A', imageUrl: "https://res.cloudinary.com/dwymmpkh8/image/upload/v1740558532/ODD-cloud/sleeve/wmtyf2nze2ox2ibyfbde.png" },
          { serialCode: '203A', imageUrl: "https://res.cloudinary.com/dwymmpkh8/image/upload/v1740558531/ODD-cloud/sleeve/wq1m2vspqkyjn5wmwj9f.png" },
          { serialCode: '204A', imageUrl: "https://res.cloudinary.com/dwymmpkh8/image/upload/v1740558531/ODD-cloud/sleeve/t16zaeperlj79blwttfu.png" },
          { serialCode: '205A', imageUrl: "https://res.cloudinary.com/dwymmpkh8/image/upload/v1740558531/ODD-cloud/sleeve/why2iu9sk2ppghsqurmy.png" },
          { serialCode: '206A', imageUrl: "https://res.cloudinary.com/dwymmpkh8/image/upload/v1740558531/ODD-cloud/sleeve/k7zdnqsi6bqfzookg85q.png" },
        ],
      },
      'Princess Cut': {
        Front: [
          { serialCode: '001B', imageUrl: "https://res.cloudinary.com/dwymmpkh8/image/upload/v1740555495/ODD-cloud/lngcq9nus2hwo9rswjdb.png" },
          { serialCode: '002B', imageUrl: "https://res.cloudinary.com/dwymmpkh8/image/upload/v1740556055/ODD-cloud/uo03tqhpkabxjaialzlq.png" },
          { serialCode: '003B', imageUrl: "https://res.cloudinary.com/dwymmpkh8/image/upload/v1740556457/ODD-cloud/m8qiezde1ibgyh16ysm6.png" },
          { serialCode: '004B', imageUrl: "https://res.cloudinary.com/dwymmpkh8/image/upload/v1740556560/ODD-cloud/fiy47perelgwl4lcm2by.png" },
          { serialCode: '005B', imageUrl: "https://res.cloudinary.com/dwymmpkh8/image/upload/v1740556924/ODD-cloud/ktnwbjetco3my1hevten.png" },
          { serialCode: '006B', imageUrl: "https://res.cloudinary.com/dwymmpkh8/image/upload/v1740556925/ODD-cloud/k1m5et9ronuqhzqsxvc8.png" },
          { serialCode: '007B', imageUrl: "https://res.cloudinary.com/dwymmpkh8/image/upload/v1740556925/ODD-cloud/z7kqutncm8qb7gjmfwwg.png" },
          { serialCode: '008B', imageUrl: "https://res.cloudinary.com/dwymmpkh8/image/upload/v1740556925/ODD-cloud/vqg0pbbcluwqmjtaj9bc.png" },
          { serialCode: '009B', imageUrl: "https://res.cloudinary.com/dwymmpkh8/image/upload/v1740557398/ODD-cloud/lpzdk5jfzm3cv1avjx0r.png" },
          { serialCode: '010B', imageUrl: "https://res.cloudinary.com/dwymmpkh8/image/upload/v1740557421/ODD-cloud/tnfdyys6rez9sjxmshba.png" },
        ],
        Back: [
          { serialCode: '101B', imageUrl: "https://res.cloudinary.com/dwymmpkh8/image/upload/v1740557841/ODD-cloud/Princess%20Cut%20Back/vlfwknos9hvwtqq1dq5s.png" },
          { serialCode: '102B', imageUrl: "https://res.cloudinary.com/dwymmpkh8/image/upload/v1740557841/ODD-cloud/Princess%20Cut%20Back/znejymjig0drmqrrboo0.png" },
          { serialCode: '103B', imageUrl: "https://res.cloudinary.com/dwymmpkh8/image/upload/v1740557841/ODD-cloud/Princess%20Cut%20Back/xl487pfeqmaffae3nm0u.png" },
          { serialCode: '104B', imageUrl: "https://res.cloudinary.com/dwymmpkh8/image/upload/v1740557842/ODD-cloud/Princess%20Cut%20Back/xl2grxfycu4tsh7wln1q.png" },
          { serialCode: '105B', imageUrl: "https://res.cloudinary.com/dwymmpkh8/image/upload/v1740557842/ODD-cloud/Princess%20Cut%20Back/sr70un1wteec9yg2wcdb.png" },
          { serialCode: '106B', imageUrl: "https://res.cloudinary.com/dwymmpkh8/image/upload/v1740557842/ODD-cloud/Princess%20Cut%20Back/exoktfprwu0h2vjre8cd.png" },
          { serialCode: '107B', imageUrl: "https://res.cloudinary.com/dwymmpkh8/image/upload/v1740557842/ODD-cloud/Princess%20Cut%20Back/qadbuqb5xhfqvaoxdjpi.png" },
          { serialCode: '108B', imageUrl: "https://res.cloudinary.com/dwymmpkh8/image/upload/v1740557842/ODD-cloud/Princess%20Cut%20Back/hhwoxn9kpzonuk8bk0kt.png" },
          { serialCode: '109B', imageUrl: "https://res.cloudinary.com/dwymmpkh8/image/upload/v1740557842/ODD-cloud/Princess%20Cut%20Back/bwqr1l3jjdbwhff7shnb.png" },

        ],
        Sleeve: [
          { serialCode: '201B', imageUrl: "https://res.cloudinary.com/dwymmpkh8/image/upload/v1740558532/ODD-cloud/sleeve/dwglvyq0avguu1vxhmg9.png" },
          { serialCode: '202B', imageUrl: "https://res.cloudinary.com/dwymmpkh8/image/upload/v1740558532/ODD-cloud/sleeve/wmtyf2nze2ox2ibyfbde.png" },
          { serialCode: '203B', imageUrl: "https://res.cloudinary.com/dwymmpkh8/image/upload/v1740558531/ODD-cloud/sleeve/wq1m2vspqkyjn5wmwj9f.png" },
          { serialCode: '204B', imageUrl: "https://res.cloudinary.com/dwymmpkh8/image/upload/v1740558531/ODD-cloud/sleeve/t16zaeperlj79blwttfu.png" },
          { serialCode: '205B', imageUrl: "https://res.cloudinary.com/dwymmpkh8/image/upload/v1740558531/ODD-cloud/sleeve/why2iu9sk2ppghsqurmy.png" },
          { serialCode: '206B', imageUrl: "https://res.cloudinary.com/dwymmpkh8/image/upload/v1740558531/ODD-cloud/sleeve/k7zdnqsi6bqfzookg85q.png" },
        ],
      },
      'Sabyasachi': {
        Front: [
          { serialCode: '001C', imageUrl: 'blouse-sabyasachi1-step1.jpg' },
          { serialCode: '002C', imageUrl: 'blouse-sabyasachi2-step1.jpg' },
        ],
        Back: [
          { serialCode: '101C', imageUrl: 'lehenga1-step2.jpg' },
          { serialCode: '102C', imageUrl: 'lehenga2-step2.jpg' },
        ],
        Sleeve: [
          { serialCode: '201C', imageUrl: "https://res.cloudinary.com/dwymmpkh8/image/upload/v1740558532/ODD-cloud/sleeve/dwglvyq0avguu1vxhmg9.png" },
          { serialCode: '202C', imageUrl: "https://res.cloudinary.com/dwymmpkh8/image/upload/v1740558532/ODD-cloud/sleeve/wmtyf2nze2ox2ibyfbde.png" },
          { serialCode: '203C', imageUrl: "https://res.cloudinary.com/dwymmpkh8/image/upload/v1740558531/ODD-cloud/sleeve/wq1m2vspqkyjn5wmwj9f.png" },
          { serialCode: '204C', imageUrl: "https://res.cloudinary.com/dwymmpkh8/image/upload/v1740558531/ODD-cloud/sleeve/t16zaeperlj79blwttfu.png" },
          { serialCode: '205C', imageUrl: "https://res.cloudinary.com/dwymmpkh8/image/upload/v1740558531/ODD-cloud/sleeve/why2iu9sk2ppghsqurmy.png" },
          { serialCode: '206C', imageUrl: "https://res.cloudinary.com/dwymmpkh8/image/upload/v1740558531/ODD-cloud/sleeve/k7zdnqsi6bqfzookg85q.png" },
        ],
      },
    },
    KidsFrock: {
      Front: [
        { serialCode: '301A', imageUrl: 'kidsfrock1-step1.jpg' },
        { serialCode: '302A', imageUrl: 'kidsfrock2-step1.jpg' },
      ],
    },
};

const getDressTypes = async (req, res) => {
  try {
    const dressTypes = Object.keys(measurementRequirements).map((type) => ({ dressType: type }));

    res.status(200).json({ message: 'Available dress types.', data: dressTypes });
  } catch (error) {
    console.error('Error fetching dress types:', error);
    res.status(500).json({ message: 'Internal server error.' });
  }
};




const getSubDressTypes = async (req, res) => {
  try {
      const { dressType } = req.params;

      if (!dressType || !dressTypeData[dressType]) {
          return res.status(400).json({ message: 'Invalid dress type.' });
      }

      const subDressTypes = Object.keys(dressTypeData[dressType]);

      res.status(200).json({ message: 'Subcategories fetched successfully.', subDressTypes });
  } catch (error) {
      console.error('Error fetching subcategories:', error);
      res.status(500).json({ message: 'Internal server error.' });
  }
};




const getFrontImages = async (req, res) => {
  try {
      const { dressType, subdresstype } = req.params;  // Ensure the parameter names match the route

      // Validate the dress type
      if (!dressTypeData[dressType]) {
          return res.status(400).json({ message: 'Invalid dress type.' });
      }

      let frontImages;

      // Check if the dress type has subcategories
      if (typeof dressTypeData[dressType] === 'object' && !Array.isArray(dressTypeData[dressType].Front)) {
          // If subdresstype is not provided, return an error
          if (!subdresstype) {
              return res.status(400).json({ message: 'Invalid subtype for dress type.' });
          }

          // Validate the subdresstype
          if (!dressTypeData[dressType][subdresstype]) {
              return res.status(400).json({ message: 'Invalid subtype for dress type.' });
          }

          // Fetch images from the subtype
          frontImages = dressTypeData[dressType][subdresstype].Front;
      } else {
          // Fetch images directly if no subtypes exist for this dressType
          frontImages = dressTypeData[dressType].Front;
      }

      // Validate if front images exist
      if (!frontImages || frontImages.length === 0) {
          return res.status(404).json({ message: 'No front images found.' });
      }

      res.status(200).json({ message: 'Front images fetched successfully.', frontImages });
  } catch (error) {
      console.error('Error fetching front images:', error);
      res.status(500).json({ message: 'Internal server error.' });
  }
};



  



const getBackImages = async (req, res) => {
  try {
    const { dressType, subdresstype } = req.params; // Ensure parameter names match the route

    // Validate the dress type
    if (!dressTypeData[dressType]) {
      return res.status(400).json({ message: 'Invalid dress type.' });
    }

    let backImages;

    // Check if the dress type has subcategories (like Blouse)
    if (typeof dressTypeData[dressType] === 'object' && !Array.isArray(dressTypeData[dressType].Back)) {
      if (!subdresstype || !dressTypeData[dressType][subdresstype]) {
        return res.status(400).json({ message: 'Invalid subtype for dress type.' });
      }
      backImages = dressTypeData[dressType][subdresstype].Back;
    } else {
      backImages = dressTypeData[dressType].Back;
    }

    // Validate if back images exist
    if (!backImages || backImages.length === 0) {
      return res.status(404).json({ message: 'No back images found.' });
    }

    res.status(200).json({ message: 'Back images fetched successfully.', backImages });
  } catch (error) {
    console.error('Error fetching back images:', error);
    res.status(500).json({ message: 'Internal server error.' });
  }
};

const getSleeveImages = async (req, res) => {
  try {
    const { dressType, subdresstype } = req.params; // Ensure parameter names match the route

    // Validate the dress type
    if (!dressTypeData[dressType]) {
      return res.status(400).json({ message: 'Invalid dress type.' });
    }

    let sleeveImages;

    // Check if the dress type has subcategories (like Blouse)
    if (typeof dressTypeData[dressType] === 'object' && !Array.isArray(dressTypeData[dressType].Sleeve)) {
      if (!subdresstype || !dressTypeData[dressType][subdresstype]) {
        return res.status(400).json({ message: 'Invalid subtype for dress type.' });
      }
      sleeveImages = dressTypeData[dressType][subdresstype].Sleeve;
    } else {
      sleeveImages = dressTypeData[dressType].Sleeve;
    }

    // Validate if sleeve images exist
    if (!sleeveImages || sleeveImages.length === 0) {
      return res.status(404).json({ message: 'No sleeve images found.' });
    }

    res.status(200).json({ message: 'Sleeve images fetched successfully.', sleeveImages });
  } catch (error) {
    console.error('Error fetching sleeve images:', error);
    res.status(500).json({ message: 'Internal server error.' });
  }
};


const placeODOrder = async (req, res) => {
  try {
    const { userId, dressType, subType, FrontSerial, BackSerial, SleeveSerial, location, specialInstructions, pickUp, measurements } = req.body;

    if (!userId || !dressType) {
      return res.status(400).json({ message: 'Missing required fields.' });
    }

    const User = await UserModel.findById(userId);
    if (!User) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (!dressTypeData[dressType]) {
      return res.status(400).json({ message: `Invalid dress type: ${dressType}` });
    }

    let requiredMeasurements = [];
    let dressConfig = dressTypeData[dressType];

    if (subType && dressTypeData[dressType][subType]) {
      dressConfig = dressTypeData[dressType][subType];
      requiredMeasurements = dressConfig.measurements || [];
    } else {
      requiredMeasurements = dressConfig.measurements || [];
    }

    let missingFields = [];
    let ODitems = [];

    // Function to find the corresponding imageUrl for a given serial code
    const findImageUrl = (category, serial) => {
      const item = dressConfig[category]?.find((item) => item.serialCode === serial);
      return item ? item.imageUrl : null;
    };

    if (dressConfig.Front) {
      if (!FrontSerial) {
        missingFields.push("FrontSerial");
      } else {
        const imageUrl = findImageUrl('Front', FrontSerial);
        ODitems.push({ serialCode: FrontSerial, imageUrl });
      }
    }
    if (dressConfig.Back) {
      if (!BackSerial) {
        missingFields.push("BackSerial");
      } else {
        const imageUrl = findImageUrl('Back', BackSerial);
        ODitems.push({ serialCode: BackSerial, imageUrl });
      }
    }
    if (dressConfig.Sleeve) {
      if (!SleeveSerial) {
        missingFields.push("SleeveSerial");
      } else {
        const imageUrl = findImageUrl('Sleeve', SleeveSerial);
        ODitems.push({ serialCode: SleeveSerial, imageUrl });
      }
    }

    if (missingFields.length > 0) {
      return res.status(400).json({ message: `Missing required fields: ${missingFields.join(', ')}` });
    }

    if (requiredMeasurements.length > 0 && !pickUp) {
      if (!measurements || typeof measurements !== 'object') {
        return res.status(400).json({ message: 'Measurements are required but not provided.' });
      }

      const providedKeys = Object.keys(measurements);
      const isValidMeasurements = requiredMeasurements.every((key) => providedKeys.includes(key));

      if (!isValidMeasurements) {
        return res.status(400).json({
          message: `Invalid measurements for ${dressType}. Required fields: ${requiredMeasurements.join(', ')}`,
        });
      }
    }

    const newOrder = new ODorderModel({
      userId: User._id,
      ODitems,
      measurements: measurements || {},
      location: location || User.address,
      specialInstructions,
      pickUp,
      status: 'Pending',
    });

    await newOrder.save();

    User.ODDorders.push({
      orderId: newOrder._id,
      dressType,
      subType,
      ODitems,
      status: 'Pending',
      specialInstructions,
    });

    await User.save();

    let emailText = `
    A new ODD order has been placed:
    - Order ID: ${newOrder._id}
    - User Location: ${User.address}
    - Dress Type: ${dressType}
    - Sub Type: ${subType || 'N/A'}
    - Special Instructions: ${specialInstructions || 'None'}
    `;

    if (pickUp) {
      const pickUpEmailText = `
      A new pickup request has been placed:
      - Order ID: ${newOrder._id}
      - Pickup Location: ${location || User.address}
      - Formatted Address: ${User.formattedAddress || 'N/A'}
      `;

      await sendEmailToAdmin('New Pickup Request', pickUpEmailText);
    }

    await sendEmailToAdmin('New ODD Order Placed', emailText);

    res.status(201).json({
      message: 'One-Day Delivery Order placed successfully.',
      order: newOrder,
    });

  } catch (error) {
    console.error('Error placing ODD order:', error);
    res.status(500).json({ message: 'Internal server error.' });
  }
};


const viewODDOrders = async (req, res) => {
  try {
    const orders = await ODorderModel.find()
      .populate("userId", "name address") // Populating user details
      .select("_id userId dressType subType ODitems measurements location specialInstructions pickUp status createdAt");

    if (!orders.length) {
      return res.status(404).json({ message: "No ODD orders found." });
    }

    const formattedOrders = orders.map(order => ({
      orderId: order._id,
      userName: order.userId?.name || "Unknown",
      userLocation: order.location || "Not Provided",
      dressType: order.dressType || "Not Specified",
      subType: order.subType || "None",
      ODitems: order.ODitems,
      measurements: order.measurements,
      specialInstructions: order.specialInstructions || "None",
      pickUp: order.pickUp,
      status: order.status,
      createdAt: order.createdAt,
    }));

    res.status(200).json({
      message: "One-Day Delivery Orders retrieved successfully.",
      orders: formattedOrders,
    });

  } catch (error) {
    console.error("Error retrieving ODD orders:", error);
    res.status(500).json({ message: "Internal server error." });
  }
};

const getODDOrderDetails = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await ODorderModel.findById(orderId)
      .populate("userId", "name phone address") // Populating user details
      .select("_id userId dressType subType ODitems measurements specialInstructions pickUp status createdAt");

    if (!order) {
      return res.status(404).json({ message: "ODD Order not found" });
    }

    // Convert the order document to a plain object
    let orderData = order.toObject();

    // Remove measurements field if it's empty
    if (!orderData.measurements || Object.keys(orderData.measurements).length === 0) {
      delete orderData.measurements;
    }

    // Remove location field if it exists
    delete orderData.location;

    res.status(200).json({ order: orderData });

  } catch (error) {
    console.error("Error retrieving ODD order details:", error);
    res.status(500).json({ message: "Server error", error: error.message });
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


  export {getDressTypes,getFrontImages, getBackImages, placeODOrder, updateODDDeliveryStatus, getSubDressTypes, getSleeveImages, viewODDOrders, getODDOrderDetails};