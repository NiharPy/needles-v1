import BoutiqueModel from "../models/BoutiqueMarketSchema.js";
const CreateBoutique = async function(req,res){
    try{
        const boutique = await BoutiqueModel.find();
        let {name,email,password,location,catalogue} = req.body;
        if (!name || !password || !email || !location || !catalogue){
            return res.status(400).send("All fields (name, password, email, location, catalogue) are required");
        }

        const CreatedBoutique = await BoutiqueModel.create({
            name,
            email,
            password,
            location,
            catalogue
        });

        return res.status(201).json(CreatedBoutique);
    }catch (error) {
        // Log the error and send an appropriate response
        console.error("Error creating Boutique:", error);
  
        if (error.name === 'ValidationError') {
          return res.status(422).json({ error: error.message, details: error.errors });
        }
  
        // Handle any other unexpected errors
        return res.status(500).send("An unexpected error occurred");
      }
};

export {CreateBoutique};
