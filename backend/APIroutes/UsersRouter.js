import express from 'express';
import { boutiquesData, boutiqueSearch } from '../controllers/boutique-controller.js';
import { registerUser, verifyOtp, Userlogin } from '../controllers/user-controller.js';
const router = express.Router();

router.get("/", (req, res) => {
    res.send("Welcome to the Home page!");
});

router.route("/signup").post(registerUser);

router.route("/login").post(Userlogin);

router.route("/verify-otp").post(verifyOtp);

router.route("/search").get(boutiqueSearch);

export default router;