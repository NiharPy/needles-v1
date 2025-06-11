import jwt from 'jsonwebtoken';
import UserModel from "../models/userschema.js";
import BlacklistedToken from '../models/BlacklistedToken.js';
import { generateAccessToken } from './token.js';

const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    // Check if the token exists and starts with "Bearer "
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Access token missing or invalid." });
    }

    const token = authHeader.split(" ")[1]; // Extract token after 'Bearer '

    // Check if token is blacklisted
    const blacklisted = await BlacklistedToken.findOne({ token });
    if (blacklisted) {
      return res.status(401).json({ message: "Unauthorized: Token has been invalidated." });
    }

    // Verify the access token
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
      if (err) {
        if (err.name === "TokenExpiredError") {
          return res.status(401).json({ message: "Access token expired. Please refresh your token." });
        }
        return res.status(403).json({ message: "Invalid access token." });
      }

      // Token is valid; attach user data to the request object
      req.user = decoded; // `decoded` contains `userId`, `name`, etc.
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
  
      // Verify the refresh token
      jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET, async (err, decoded) => {
        if (err) {
          return res.status(403).json({ message: "Invalid or expired refresh token." });
        }
  
        const user = await UserModel.findById(decoded.user.Id);
        if (!user || user.refreshToken !== refreshToken) {
          return res.status(403).json({ message: "Invalid refresh token." });
        }
  
        // Generate a new access token
        const accessToken = jwt.sign(
          { userId: user._id, name: user.name },
          process.env.ACCESS_TOKEN_SECRET,
          { expiresIn: "15m" }
        );
  
        res.status(200).json({ accessToken });
      });
    } catch (error) {
      console.error("Error refreshing token:", error);
      res.status(500).json({ message: "Internal server error." });
    }
};

const publicMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1]; // Extract the token if present

  if (token) {
    // Attempt to verify the token
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
      if (!err) {
        // If token is valid, attach user info to the request object
        req.user = decoded;
      }
      // If token is invalid, silently ignore the error and proceed
    });
  }

  // Continue to the next middleware or route handler
  next();
};

export {publicMiddleware};

  
export {refreshAccessToken};

export default authMiddleware;
