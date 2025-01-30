import express from 'express';
import { CreateAdmin } from '../controllers/admin-controller.js';
import { CreateBoutique } from '../controllers/boutique-controller.js';
import { boutiquesData, boutiqueSearch } from '../controllers/boutique-controller.js';
import { updateODDDeliveryStatus } from '../controllers/ODdelivery-controller.js';
import { updateCAASDeliveryStatus } from '../controllers/CAAS-controller.js';
const router = express.Router();

router.get("/", (req, res) => {
    res.send("Welcome to the Admin page!");
});

if (process.env.NODE_ENV === 'development') {
    router.route('/create').post(CreateAdmin)
}

router.route('/createBoutique').post(CreateBoutique);

router.route('/BoutiqueLocator').get(boutiqueSearch);

router.route("/Boutiques").get(boutiquesData);

router.route('/update-status/odd/:orderId').post(updateODDDeliveryStatus);

router.route('/update-status/CAAS/:orderId').post(updateCAASDeliveryStatus);

export default router;