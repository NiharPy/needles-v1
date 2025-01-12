import express from 'express';
import { boutiquesData, boutiqueSearch, viewBoutiqueDetails } from '../controllers/boutique-controller.js';
import { registerUser, verifyOtp, Userlogin } from '../controllers/user-controller.js';
import authMiddleware from '../utils/auth-user.js';
import { refreshAccessToken, publicMiddleware } from '../utils/auth-user.js';
const router = express.Router();

router.get("/", authMiddleware,(req, res) => {
    res.send("Welcome to the Home page!");
});

router.route("/signup").post(registerUser);

router.route("/login").post(Userlogin);

router.route("/verify-otp").post(verifyOtp);

router.route("/search").get(publicMiddleware,boutiqueSearch);

router.route("/boutique/:name").get(publicMiddleware, viewBoutiqueDetails);

router.route("/auth/boutique/:name").get(authMiddleware, viewBoutiqueDetails);

router.route("/refresh-token").post(refreshAccessToken);

export default router;