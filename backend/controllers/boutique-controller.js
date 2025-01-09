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

const boutiquesData = async function(req,res){
    try{
        const BoutiquesData = await BoutiqueModel.find();
        res.status(200).json({
            success : true,
            message : 'Boutique fetched Successfully',
            data : BoutiquesData,
        });
    }catch(error){
    console.error("error");
    res.status(500).json({
        success : false,
        message : "server error. Unable to fetch Boutiques",
    });
}
};

const boutiqueSearch = async function(req,res){
    try{
        const{ query, location} = req.query;
        const searchconditions = {
            $or:[
                query?{name:{$regex:query,$options:'i'}} : null,
                location?{"location.address": {$regex:location,$options:'i'}} : null,
                query?{"catalogue.items" : {$regex:query,$options:'i'}} : null,
            ].filter(Boolean),
        };

        console.log('Search conditions:', searchconditions);
        
        const Boutique_found = await BoutiqueModel.find(searchconditions);

        res.status(200).send(Boutique_found);

    } catch(error){
    console.error(error);
    res.status(500).json({
        success: false,
        message: 'Server error. Unable to fetch search results.',
      });
    }
};

export {boutiqueSearch};

export {boutiquesData};

export {CreateBoutique};
