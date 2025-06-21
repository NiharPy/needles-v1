import express from 'express';
import { registerAdmin, adminLogin, verifyOtpAdmin ,getAllBoutiqueAreasForAdmin } from '../controllers/admin-controller.js';
import { CreateBoutique } from '../controllers/boutique-controller.js';
import { boutiquesData, boutiqueSearch } from '../controllers/boutique-controller.js';
import { updateODDDeliveryStatus } from '../controllers/ODdelivery-controller.js';
import { updateCAASDeliveryStatus } from '../controllers/CAAS-controller.js';
import { authMiddleware } from '../utils/auth-admin.js'
import { upload } from '../utils/cloudinary.js';
const router = express.Router();

router.get("/", (req, res) => {
    res.send("Welcome to the Admin page!");
});

router.route('/register').post(registerAdmin);

router.route('/login').post(adminLogin);

router.route('/verify-otp').post(verifyOtpAdmin);

router.post('/create-boutique', upload.single('headerImage'),authMiddleware,CreateBoutique);

router.get('/areas', authMiddleware, getAllBoutiqueAreasForAdmin);

router.route('/BoutiqueLocator').get(boutiqueSearch,authMiddleware);

router.route("/Boutiques").get(boutiquesData,authMiddleware);

//router.route('/update-status/odd/:orderId').post(updateODDDeliveryStatus,authMiddleware);

//router.route('/update-status/CAAS/:orderId').post(updateCAASDeliveryStatus,);

export default router;