import UserModel from "../models/userschema.js";

const CreateUser = async function(req,res){
    try{
        const User = await UserModel.find();
        let {name,phone,otp,address} = req.body;
        if (!name ||!phone || !otp){
            return res.status(400).send("All fields (name, phone number, otp) are required");
        }
        const existingUser = await UserModel.findOne({ phone });
        if (existingUser) {
            return res.status(409).send("Phone number already exists");
        }

        const CreatedUser = await UserModel.create({
            name,
            phone,
            otp,
            address,
        });

        return res.status(201).json(CreatedUser);
    }catch (error) {
        console.error("Error creating User:", error.message);
        console.error("Stack trace:", error.stack);
    
        if (error.name === 'ValidationError') {
          return res.status(422).json({ error: error.message, details: error.errors });
        }
    
        // Handle other errors
        return res.status(500).send("An unexpected error occurred");
      }
}

export {CreateUser};