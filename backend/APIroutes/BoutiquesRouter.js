import express from 'express';
import { boutiquesData, boutiqueSearch, Boutiquelogin, verifyOtpFB, addItemToCatalogue, deleteItemFromCatalogue, addDressType, deleteDressType} from '../controllers/boutique-controller.js';
import authMiddleware from '../utils/auth-user.js';
import { updateOrderStatus, getOrderDetails, startChatSessionBoutique, sendMessageBoutique, getChatSessionHistory } from '../controllers/order-controller.js';

import {createBill} from '../controllers/order-controller.js';

const router = express.Router();

router.route("/").get(boutiquesData);

router.route("/login").post(Boutiquelogin);

router.route("/verify-otp").post(verifyOtpFB);

router.route("/search").get(boutiqueSearch);

router.route('/:boutiqueId/order/:orderId/status').post(authMiddleware,updateOrderStatus);

router.route('/:boutiqueId/order/:orderId').get(authMiddleware,getOrderDetails);

router.route("/:boutiqueId/add-catalogue-item").post(addItemToCatalogue);

router.route("/:boutiqueId/delete-catalogue-item").delete(deleteItemFromCatalogue);

router.route("/:boutiqueId/add-dressType").post(addDressType);

router.route("/:boutiqueId/delete-dressType").delete(deleteDressType);

router.route('/:boutiqueId/chat/start').post(authMiddleware, startChatSessionBoutique);

router.route('/:boutiqueId/chat/sendMessage').post(authMiddleware, sendMessageBoutique);

router.route('/:boutiqueId/chat/history').get(authMiddleware, getChatSessionHistory);

router.route("/:boutiqueId/createBill").post(authMiddleware,createBill);



export default router;