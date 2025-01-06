import express from 'express';
import { CreateAdmin } from '../controllers/admin-controller.js';
import { CreateBoutique } from '../controllers/boutique-controller.js';
const router = express.Router();

router.get("/", (req, res) => {
    res.send("Welcome to the Admin page!");
});

if (process.env.NODE_ENV === 'development') {
    router.route('/create').post(CreateAdmin)
}

router.route('/createBoutique').post(CreateBoutique);
  

export default router;