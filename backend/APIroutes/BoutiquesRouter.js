import express from 'express';
import { boutiquesData, boutiqueSearch, Boutiquelogin, verifyOtpFB} from '../controllers/boutique-controller.js';
const router = express.Router();

router.route("/").get(boutiquesData);

router.route("/login").post(Boutiquelogin);

router.route("/verify-otp").post(verifyOtpFB);

router.route("/search").get(boutiqueSearch);

export default router;