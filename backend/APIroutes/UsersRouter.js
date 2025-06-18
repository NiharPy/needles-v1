import express from 'express';
import { boutiquesData, boutiqueSearch, viewBoutiqueDetails, getRecommendedBoutiques, getRecommendedDressTypes, getDressTypeImages, getBoutiqueCatalogueFU, getDressTypesWithDetails, getTopRatedNearbyBoutiquesForDressType} from '../controllers/boutique-controller.js';
import { registerUser, verifyOtp, getAllBoutiqueAreas } from '../controllers/user-controller.js';
import { placeOrder, getOrderDetails, rateOrder, getUserAlterationRequests, submitAlterationRequest, viewPaidOrders, viewPendingOrders ,viewBill, cancelOrder, rejectOrderBill, markBillAsPaid, getUserPendingOrders} from '../controllers/order-controller.js';
import authMiddleware from '../utils/auth-user.js';
import { refreshAccessToken, publicMiddleware } from '../utils/auth-user.js';
import { getDressTypes, getBackImages, placeODOrder, getFrontImages, getSubDressTypes,getSleeveImages, viewODDOrders, getODDOrderDetails} from '../controllers/ODdelivery-controller.js';
import UserModel from '../models/userschema.js';
import { upload } from '../utils/cloudinary.js';
import { updateUserLocation, logout, getUserDetails, updateUserName} from '../controllers/user-controller.js';
import { placeCAASOrder, viewCAASOrders } from '../controllers/CAAS-controller.js';
const router = express.Router();

router.get("/", authMiddleware,(req, res) => {
    res.send("Welcome to the Home page!")
});

router.route("/signup").post(registerUser);

router.route("/login").post(Userlogin);

router.route("/verify-otp").post(verifyOtp);

router.get("/profile", authMiddleware, getUserDetails);

router.put("/update-name", authMiddleware, updateUserName);

router.route("/logout").post(authMiddleware,logout);

router.route("/search").get(authMiddleware,boutiqueSearch);//searchpage

router.route("/boutique/:boutiqueId").get(authMiddleware, viewBoutiqueDetails);

//router.route("/:userId/boutique/:boutiqueId/dressTypes").get(authMiddleware,getDressTypesWithDetails);

//router.route("/:userId/boutique/:boutiqueId/dressTypes/:dressType").get(authMiddleware,getDressTypeImages);

router.route("/:boutiqueId/catalogue").get(authMiddleware,getBoutiqueCatalogueFU);

router.route('/order/place').post(authMiddleware, upload.fields([
  { name: 'referralImage', maxCount: 1 },
  { name: 'voiceNotes', maxCount: 5 }
]), placeOrder);

router.route('/location').put(authMiddleware,updateUserLocation);

router.get("/order/OrderPending", authMiddleware, getUserPendingOrders);

router.route('/order/Paid').get(authMiddleware,viewPaidOrders);

router.route('/order/Pending').get(authMiddleware,viewPendingOrders);

router.route('/order/Pending/:orderId/Bill/Reject').get(authMiddleware,rejectOrderBill);//billviewing TAB, pop up

router.route('/order/Pending/:orderId/Bill/Pay').get(authMiddleware,markBillAsPaid);//billviewing TAB, pop up

router.route('/order/:orderId/cancel').delete(authMiddleware, cancelOrder);

router.route('/order/:orderId/Details').get(authMiddleware,getOrderDetails);// for both pending and paid orders

router.route('/order/:orderId/bill').get(authMiddleware,viewBill);////billviewing TAB, pop up

router.route('/Boutiques/recommended').get(authMiddleware,getRecommendedBoutiques);//homepage

router.route('/recommended').get(authMiddleware,getRecommendedDressTypes);//homepage

router.get('/areas', authMiddleware,getAllBoutiqueAreas);//homepage

router.get('/recommended/dressType/:dressType', authMiddleware, getTopRatedNearbyBoutiquesForDressType);//homepage

router.route("/rate-order").post(authMiddleware, rateOrder);

router.route("/:userId/orders/alterations").get(getUserAlterationRequests);

router.route('/:userId/alterations/submit').post(upload.fields([
  { name: "referenceImage", maxCount: 1 }, // Required
  { name: "orderImage", maxCount: 3 }, // Required
  { name: "voiceNotes", maxCount: 5 }, // Optional, max 5 files
]), submitAlterationRequest);

router.route("/:userId/refresh-token").post(refreshAccessToken);

//router.route("/:userId/order/:orderId/pay").post(authMiddleware,processPayment);

//odd
router.route('/:userId/ODDorder').get(authMiddleware,viewODDOrders);

router.route('/:userId/ODDorder/:orderId').get(authMiddleware, getODDOrderDetails);

router.route("/:userId/odd/dresstypes").get(authMiddleware,getDressTypes);

router.route("/:userId/odd/select/:dressType/subdresstype").get(authMiddleware, getSubDressTypes);

router.route("/:userId/odd/select/:dressType/Front").get(authMiddleware, getFrontImages);

router.route("/:userId/odd/select/:dressType/:subdresstype/Front").get(authMiddleware, getFrontImages);

router.route("/:userId/odd/select/:dressType/:subdresstype/Back").get(authMiddleware, getBackImages);

router.route("/:userId/odd/select/:dressType/:subdresstype/Sleeve").get(authMiddleware,getSleeveImages);

router.route("/:userId/odd/order-placed").post(authMiddleware,placeODOrder);

export default router;

//CAAS

router.route('/:userId/CAASorder').get(authMiddleware, viewCAASOrders);

router.route("/:userId/CAAS/dresstypes").get(authMiddleware,getDressTypes);

router.route("/:userId/CAAS/select/:dressType/Body").get(authMiddleware, getFrontImages);

router.route("/:userId/CAAS/select/:dressType/Hands").get(authMiddleware, getBackImages);

router.route("/:userId/CAAS/order-placed").post(authMiddleware,placeCAASOrder);

