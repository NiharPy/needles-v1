import express from 'express';
import { boutiquesData, boutiqueSearch } from '../controllers/boutique-controller.js';
const router = express.Router();

router.route("/").get(boutiquesData);

router.route("/search").get(boutiqueSearch);

export default router;