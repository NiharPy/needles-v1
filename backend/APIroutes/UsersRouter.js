import express from 'express';
import { boutiquesData, boutiqueSearch, viewBoutiqueDetails, getRecommendedBoutiques, getRecommendedBoutiquesByDressType, getDressTypeImages} from '../controllers/boutique-controller.js';
import { registerUser, verifyOtp, Userlogin } from '../controllers/user-controller.js';
import { placeOrder, getOrderDetails, rateOrder } from '../controllers/order-controller.js';
import authMiddleware from '../utils/auth-user.js';
import { refreshAccessToken, publicMiddleware } from '../utils/auth-user.js';
import { getDressTypes, getStep2Images, placeODOrder, getStep1Images} from '../controllers/ODdelivery-controller.js';
import UserModel from '../models/userschema.js';
const router = express.Router();

router.get("/", authMiddleware,(req, res) => {
    res.send("Welcome to the Home page!");
});

router.route("/signup").post(registerUser);

router.route("/login").post(Userlogin);

router.route("/verify-otp").post(verifyOtp);

router.route("/search").get(authMiddleware,boutiqueSearch);

router.route("/boutique/:name").get(authMiddleware, viewBoutiqueDetails);

router.route("/boutique/:boutiqueId/dressTypes/:dressType").get(getDressTypeImages);

router.route('/order/place').post(authMiddleware,placeOrder);

router.route('/order/:orderId').get(authMiddleware,getOrderDetails);

router.route('/recommended').get(authMiddleware,getRecommendedBoutiques);

router.route('/recommended/:dressType').get(authMiddleware, getRecommendedBoutiquesByDressType);

router.route("/rate-order").post(authMiddleware, rateOrder);

router.route("/refresh-token").post(refreshAccessToken);

router.route("/odd/dresstypes").get(authMiddleware,getDressTypes);

router.route("/odd/select/:dressType/Body").get(authMiddleware, getStep1Images);

router.route("/odd/select/:dressType/Hands").get(authMiddleware, getStep2Images);

router.route("/odd/order-placed").post(authMiddleware,placeODOrder);

export default router;