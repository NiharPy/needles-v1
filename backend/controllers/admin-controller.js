import AdminModel from '../models/AdminSchema.js';
const CreateAdmin = async function (req, res) {
    try {
      // Check if an admin already exists
      const admin = await AdminModel.find();
      if (admin.length > 0) {
        return res.status(403).send("You don't have permission to create a new admin");
      }

      // Validate request body
      const { username, password, email } = req.body;
      if (!username || !password || !email) {
        return res.status(400).send("All fields (username, password, email) are required");
      }

      // Create a new admin
      const createdAdmin = await AdminModel.create({
        username,
        password,
        email,
      });

      // Send success response
      return res.status(201).json(createdAdmin);
    } catch (error) {
      // Log the error and send an appropriate response
      console.error("Error creating admin:", error);

      if (error.name === 'ValidationError') {
        return res.status(422).json({ error: error.message, details: error.errors });
      }

      // Handle any other unexpected errors
      return res.status(500).send("An unexpected error occurred");
    }
  };

  export {CreateAdmin};