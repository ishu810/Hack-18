import { OAuth2Client } from "google-auth-library";
import { User } from "../models/user.model.js";

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const googleLogin = async (req, res) => {
  try {
    console.log("Req body in /google:", req.body);

    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({ message: "idToken is required" });
    }


    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();

    if (!payload) {
      return res.status(400).json({ message: "Invalid Google token" });
    }

    const { sub, email, name, picture, email_verified } = payload;

    if (!email) {
      return res.status(400).json({
        message: "Google did not return an email",
      });
    }

    if (email_verified === false) {
      return res.status(400).json({
        message: "Google email is not verified",
      });
    }

    let user = await User.findOne({
      $or: [{ googleId: sub }, { email }],
    });


    if (!user) {
      const usernameBase = email.split("@")[0];

   
      const username = `${usernameBase}_${Date.now()}`;

      user = await User.create({
        username,
        email,
        fullname: name || usernameBase,
        avatar: picture,
        provider: "google",
        googleId: sub,
        role: "ranger",
      });
    } else {
      
      if (!user.googleId) {
        user.googleId = sub;
        user.provider = "google";

        if (!user.avatar && picture) {
          user.avatar = picture;
        }

        await user.save();
      }
    }

  
    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });


    return res
      .cookie("accessToken", accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "Lax",
        maxAge: 24 * 60 * 60 * 1000,
      })
      .cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "Lax",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      })
      .status(200)
      .json({
        message: "Google login successful",
        accessToken,
        refreshToken,
        user: {
          _id: user._id,
          email: user.email,
          fullname: user.fullname,
          username: user.username,
          avatar: user.avatar,
          role: user.role,
          provider: user.provider,
          isProfileComplete: user.isProfileComplete ?? false,
        },
      });

  } catch (err) {
    console.error("Google login error:", err);
    console.error("STACK >>>", err.stack);

    return res.status(500).json({
      message: "Google login failed",
      error: err.message,
    });
  }
};

export { googleLogin };