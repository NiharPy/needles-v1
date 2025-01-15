import express from 'express';
import { boutiquesData, boutiqueSearch, Boutiquelogin, verifyOtpFB} from '../controllers/boutique-controller.js';
import authMiddleware from '../utils/auth-user.js';
import { updateOrderStatus, getOrderDetails } from '../controllers/order-controller.js';
const router = express.Router();

router.route("/").get(boutiquesData);

router.route("/login").post(Boutiquelogin);

router.route("/verify-otp").post(verifyOtpFB);

router.route("/search").get(boutiqueSearch);

router.route('/order/:orderId/status').post(authMiddleware,updateOrderStatus);

router.route('/order/:orderId').get(authMiddleware,getOrderDetails);

export default router;