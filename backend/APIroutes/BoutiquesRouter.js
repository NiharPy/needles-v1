import express from 'express';
import { boutiquesData, boutiqueSearch, Boutiquelogin, verifyOtpFB, addItemToCatalogue, deleteItemFromCatalogue, addDressType, deleteDressType, getBoutiqueCatalogue, trackBusiness, getDressTypez} from '../controllers/boutique-controller.js';
import authMiddleware from '../utils/auth-user.js';
import { updateOrderStatus, getOrderDetails, reviewAlterationRequest, respondToAlterationRequest, getAlterationRequestsForBoutique, acceptOrder, declineOrder, getBoutiqueOrders, getCompletedOrders} from '../controllers/order-controller.js';

import {createBill} from '../controllers/order-controller.js';

const router = express.Router();

router.route("/").get(boutiquesData);

router.route("/login").post(Boutiquelogin);

router.route("/verify-otp").post(verifyOtpFB);

router.route("/search").get(boutiqueSearch);

router.route('/:boutiqueId/track').get(authMiddleware, trackBusiness);

router.route('/:boutiqueId/order').get(authMiddleware,getBoutiqueOrders);

router.route('/:boutiqueId/order-completed').get(authMiddleware,getCompletedOrders);

router.route('/:boutiqueId/order/:orderId/status').post(authMiddleware,updateOrderStatus);

router.route('/:boutiqueId/order/:orderId').get(authMiddleware,getOrderDetails);

router.route("/:boutiqueId/order/:orderId/accept").post(authMiddleware, acceptOrder);

router.route("/:boutiqueId/order/:orderId/decline").post(authMiddleware, declineOrder);

router.route("/:boutiqueId/catalogue").get(getBoutiqueCatalogue);

router.route("/:boutiqueId/dresstypes").get(getDressTypez);

router.route("/:boutiqueId/add-catalogue-item").post(addItemToCatalogue);

router.route("/:boutiqueId/delete-catalogue-item").delete(deleteItemFromCatalogue);

router.route("/:boutiqueId/add-dressType").post(addDressType);

router.route("/:boutiqueId/delete-dressType").delete(deleteDressType);

router.route('/:boutiqueId/alteration/review/:altOrderId').put(authMiddleware, reviewAlterationRequest);

router.route('/:boutiqueId/alteration/respond/:altOrderId').put(authMiddleware, respondToAlterationRequest);

router.route('/:boutiqueId/alterations').get(authMiddleware, getAlterationRequestsForBoutique);

router.route("/:boutiqueId/createBill").post(authMiddleware,createBill);



export default router;