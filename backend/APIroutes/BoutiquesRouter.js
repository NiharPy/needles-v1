import express from 'express';
import { boutiquesData, boutiqueSearch, Boutiquelogin, verifyOtpFB, addItemToCatalogue, deleteItemFromCatalogue, addDressType, deleteDressType, getBoutiqueCatalogue, trackBusiness, getDressTypesWithDetails, getOrdersByStatus} from '../controllers/boutique-controller.js';
import authMiddleware from '../utils/auth-boutique.js';
import { updateOrderStatus, reviewAlterationRequest, respondToAlterationRequest, getAlterationRequestsForBoutique, declineOrder, getBoutiqueOrders, getCompletedOrders, getActiveAlterationRequests} from '../controllers/order-controller.js';

import {createBill} from '../controllers/order-controller.js';
import { upload } from '../utils/cloudinary.js';

const router = express.Router();

router.route("/").get(boutiquesData);

router.route("/login").post(Boutiquelogin);

router.route("/verify-otp").post(verifyOtpFB);

router.route("/search").get(boutiqueSearch);

router.route('/:boutiqueId/track').get(authMiddleware, trackBusiness);

router.route('/order').get(authMiddleware,getBoutiqueOrders);

router.route('/order-completed').get(authMiddleware,getCompletedOrders);

router.route('/order/:orderId/status').post(authMiddleware,updateOrderStatus);

router.route("/order/:orderId/decline").post(authMiddleware, declineOrder);

router.route("/catalogue").get(authMiddleware,getBoutiqueCatalogue);

router.route("/dresstypes").get(authMiddleware,getDressTypesWithDetails);

router.route("/add-catalogue-item").post(authMiddleware,addItemToCatalogue);

router.route("/delete-catalogue-item").delete(authMiddleware,deleteItemFromCatalogue);

router.post(
    '/add-dress-type',
    upload.fields([{ name: 'images', maxCount: 5 }]),
    authMiddleware,addDressType
  );
  

router.route("/delete-dressType").delete(authMiddleware,deleteDressType);

router.route('/review-alteration/:requestId').patch(authMiddleware,reviewAlterationRequest);

router.route('/alteration/respond').patch(authMiddleware,respondToAlterationRequest);

router.route('/alterations').get(authMiddleware,getAlterationRequestsForBoutique);

router.route('/alterations/active').get(authMiddleware,getActiveAlterationRequests);

router.route("/createBill").post(authMiddleware,createBill);

router.route("/PaidOrders").get(authMiddleware,getOrdersByStatus);



export default router;