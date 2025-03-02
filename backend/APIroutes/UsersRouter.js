import express from 'express';
import { boutiquesData, boutiqueSearch, viewBoutiqueDetails, getRecommendedBoutiques, getRecommendedBoutiquesByDressType, getDressTypeImages} from '../controllers/boutique-controller.js';
import { registerUser, verifyOtp, Userlogin } from '../controllers/user-controller.js';
import { placeOrder, getOrderDetails, rateOrder, requestAlteration, getUserAlterationOrders, submitAlterationRequest } from '../controllers/order-controller.js';
import authMiddleware from '../utils/auth-user.js';
import { refreshAccessToken, publicMiddleware } from '../utils/auth-user.js';
import { getDressTypes, getBackImages, placeODOrder, getFrontImages, getSubDressTypes,getSleeveImages} from '../controllers/ODdelivery-controller.js';
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

router.route('/:userId/alterations/:altOrderId/submit').post(authMiddleware, upload.fields([
  { name: "referenceImage", maxCount: 1 }, // Required
  { name: "orderImage", maxCount: 3 }, // Required
  { name: "voiceNotes", maxCount: 5 }, // Optional, max 5 files
]), submitAlterationRequest);

router.route("/:userId/refresh-token").post(refreshAccessToken);

router.route("/:userId/order/:orderId/bill").get(authMiddleware,getBill);

router.route("/:userId/order/:orderId/pay").post(authMiddleware,processPayment);

//odd

router.route("/:userId/odd/dresstypes").get(authMiddleware,getDressTypes);

router.route("/:userId/odd/select/:dressType/subdresstype").get(authMiddleware, getSubDressTypes);

router.route("/:userId/odd/select/:dressType/Front").get(authMiddleware, getFrontImages);

router.route("/:userId/odd/select/:dressType/:subdresstype/Front").get(authMiddleware, getFrontImages);

router.route("/:userId/odd/select/:dressType/:subdresstype/Back").get(authMiddleware, getBackImages);

router.route("/:userId/odd/select/:dressType/:subdresstype/Sleeve").get(authMiddleware,getSleeveImages);

router.route("/:userId/odd/order-placed").post(authMiddleware,placeODOrder);

export default router;

//CAAS

router.route("/:userId/CAAS/dresstypes").get(authMiddleware,getDressTypes);

router.route("/:userId/CAAS/select/:dressType/Body").get(authMiddleware, getFrontImages);

router.route("/:userId/CAAS/select/:dressType/Hands").get(authMiddleware, getBackImages);

router.route("/:userId/CAAS/order-placed").post(authMiddleware,placeCAASOrder);

