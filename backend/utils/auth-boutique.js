// auth-boutique.js

import jwt from 'jsonwebtoken';
import BoutiqueModel from '../models/BoutiqueMarketSchema.js';
import BlacklistedToken from '../models/BlacklistedToken.js';
import { generateAccessToken } from "../utils/token.js";

// Middleware for protected routes
const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  console.log("ts is auth header: ", authHeader);
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Access token missing or invalid." });
  }

  const token = authHeader.split(" ")[1];
  console.log("ts is token: ", token);

  const blacklisted = await BlacklistedToken.findOne({ token });
  if (blacklisted) {
    return res.status(401).json({ message: "Token has been invalidated." });
  }

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).json({ message: err.name === "TokenExpiredError" ? "Access token expired." : "Invalid token." });
    }

    req.user = decoded;
    next();
  });
};

// Optional middleware for unauthenticated pages (detect if logged in)
const publicMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
      req.user = decoded;
    } catch {}
  }
  next();
};

// Refresh token logic
const refreshAccessToken = async (req, res) => {
  const refreshToken = req.cookies.refreshToken;

  if (!refreshToken) return res.status(401).json({ message: "Refresh token required." });

  jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET, async (err, decoded) => {
    if (err) return res.status(403).json({ message: "Invalid or expired refresh token." });

    const user = await BoutiqueModel.findById(decoded.userId);
    if (!user) return res.status(403).json({ message: "User not found." });

    const newAccessToken = generateAccessToken(user);

    res.status(200).json({ accessToken: newAccessToken }); // You can also set in cookie if needed
  });
};

export { authMiddleware as default, refreshAccessToken, publicMiddleware };