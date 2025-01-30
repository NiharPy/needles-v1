import express from 'express';
import { boutiquesData, boutiqueSearch, viewBoutiqueDetails, getRecommendedBoutiques, getRecommendedBoutiquesByDressType, getDressTypeImages} from '../controllers/boutique-controller.js';
import { registerUser, verifyOtp, Userlogin } from '../controllers/user-controller.js';
import { placeOrder, getOrderDetails, rateOrder, requestAlteration, getUserAlterationOrders, startChatSessionUser, sendMessageUser, getChatSessionHistory, closeChatSession } from '../controllers/order-controller.js';
import authMiddleware from '../utils/auth-user.js';
import { refreshAccessToken, publicMiddleware } from '../utils/auth-user.js';
import { getDressTypes, getStep2Images, placeODOrder, getStep1Images} from '../controllers/ODdelivery-controller.js';
import UserModel from '../models/userschema.js';
import { upload } from '../utils/cloudinary.js';
import { updateUserLocation } from '../controllers/user-controller.js';
import { getBill, processPayment } from '../controllers/order-controller.js';
import { placeCAASOrder } from '../controllers/CAAS-controller.js';
const router = express.Router();

router.get("/", authMiddleware,(req, res) => {
    res.send("Welcome to the Home page!");
});

router.route("/signup").post(registerUser);

router.route("/login").post(Userlogin);

router.route("/verify-otp").post(verifyOtp);

router.route("/search").get(authMiddleware,boutiqueSearch);

router.route("/:userId/boutique/:name").get(authMiddleware, viewBoutiqueDetails);

router.route("/:userId/boutique/:boutiqueId/dressTypes/:dressType").get(getDressTypeImages);

router.route('/:userId/order/place').post(authMiddleware, upload.fields([
  { name: 'referralImage', maxCount: 1 },
  { name: 'voiceNotes', maxCount: 5 }
]), placeOrder);

router.route('/:userId/location').put(authMiddleware,updateUserLocation);


router.route('/:userId/order/:orderId').get(authMiddleware,getOrderDetails);

router.route('/:userId/recommended').get(authMiddleware,getRecommendedBoutiques);

router.route('/:userId/recommended/:dressType').get(authMiddleware, getRecommendedBoutiquesByDressType);

router.route("/:userId/rate-order").post(authMiddleware, rateOrder);

router.route("/:userId/orders/request-alteration").post(authMiddleware, requestAlteration);

router.route("/:userId/orders/alterations").get(authMiddleware, getUserAlterationOrders);

router.route('/:userId/alterations/chat/start').post(authMiddleware, startChatSessionUser);

router.route('/:userId/alterations/chat/sendMessage').post(authMiddleware, sendMessageUser);

router.route('/:userId/chat/close').post(authMiddleware, closeChatSession);

router.route('/:userId/alterations/chat/history').get(authMiddleware, getChatSessionHistory);

router.route("/:userId/refresh-token").post(refreshAccessToken);

router.route("/:userId/order/:orderId/bill").get(authMiddleware,getBill);

router.route("/:userId/order/:orderId/pay").post(authMiddleware,processPayment);

//odd

router.route("/:userId/odd/dresstypes").get(authMiddleware,getDressTypes);

router.route("/:userId/odd/select/:dressType/Body").get(authMiddleware, getStep1Images);

router.route("/:userId/odd/select/:dressType/Hands").get(authMiddleware, getStep2Images);

router.route("/:userId/odd/order-placed").post(authMiddleware,placeODOrder);

export default router;

//CAAS

router.route("/:userId/CAAS/dresstypes").get(authMiddleware,getDressTypes);

router.route("/:userId/CAAS/select/:dressType/Body").get(authMiddleware, getStep1Images);

router.route("/:userId/CAAS/select/:dressType/Hands").get(authMiddleware, getStep2Images);

router.route("/:userId/CAAS/order-placed").post(authMiddleware,placeCAASOrder);

