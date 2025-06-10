// auth-boutique.js

import jwt from 'jsonwebtoken';
import BoutiqueModel from '../models/boutiqueschema.js';
import BlacklistedToken from '../models/BlacklistedToken.js';

const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Access token missing or invalid." });
    }

    const token = authHeader.split(" ")[1];

    const blacklisted = await BlacklistedToken.findOne({ token });
    if (blacklisted) {
      return res.status(401).json({ message: "Token has been invalidated." });
    }

    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
      if (err) {
        if (err.name === "TokenExpiredError") {
          return res.status(401).json({ message: "Access token expired." });
        }
        return res.status(403).json({ message: "Invalid access token." });
      }

      req.user = decoded;
      next();
    });
  } catch (error) {
    console.error("Auth middleware error:", error);
    res.status(500).json({ message: "Internal server error." });
  }
};

const refreshAccessToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ message: "Refresh token is required." });
    }

    jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET, async (err, decoded) => {
      if (err) {
        return res.status(403).json({ message: "Invalid or expired refresh token." });
      }

      const user = await BoutiqueModel.findById(decoded.userId);
      if (!user || user.refreshToken !== refreshToken) {
        return res.status(403).json({ message: "Invalid refresh token." });
      }

      const accessToken = jwt.sign(
        { userId: user._id, name: user.name },
        process.env.ACCESS_TOKEN_SECRET,
        { expiresIn: "15m" }
      );

      res.cookie("accessToken", accessToken, {
        httpOnly: true,
        secure: false,
        sameSite: "strict",
        maxAge: 15 * 60 * 1000,
      });

      res.status(200).json({ accessToken });
    });
  } catch (error) {
    console.error("Error refreshing token:", error);
    res.status(500).json({ message: "Internal server error." });
  }
};

const publicMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];

  if (token) {
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
      if (!err) {
        req.user = decoded;
      }
    });
  }

  next();
};

export { authMiddleware as default, refreshAccessToken, publicMiddleware };
