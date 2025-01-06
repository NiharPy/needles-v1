import express from "express"
const router = express.Router();

const UsersRouter = router.get("/",function(req,res){
    res.send("Hey");
});


export default UsersRouter;