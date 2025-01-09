import express from 'express';
import { boutiquesData, boutiqueSearch } from '../controllers/boutique-controller.js';
import { CreateUser } from '../controllers/user-controller.js';
const router = express.Router();

router.get("/", (req, res) => {
    res.send("Welcome to the Home page!");
});

router.route("/signup").post(CreateUser);

router.route("/search").get(boutiqueSearch);

export default router;