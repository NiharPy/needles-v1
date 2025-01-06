import mongoose from "mongoose";


const userSchema = new mongoose.Schema({
    Id: String,
    Name : String,
    phone_number : Number,
    location : String,
    orders : {
        type : Array,
        default : []
    },
    picture : String,
});

module.exports = mongoose.model("user", userSchema)