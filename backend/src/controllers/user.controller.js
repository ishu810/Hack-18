import { asyncHandler } from "../utils/asyncHandler.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";

const createHttpError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const generateAccessAndRefreshTokens = async (userId) => {
  try {
    const user = await User.findById(userId);

    if (!user) {
      throw createHttpError(404, "User not found while generating tokens");
    }

    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });

    return { accessToken, refreshToken };
  } catch (error) {
    console.error("Token generation error:", error);
    throw createHttpError(500, "Error generating tokens");
  }
};

const registerUser = asyncHandler(async (req, res) => {
  const { username, fullname, email, password } = req.body;

  if (!username || !fullname || !email || !password) {
    throw createHttpError(400, "All fields are required");
  }

  const existedUser = await User.findOne({
    $or: [
      { username: username.toLowerCase() },
      { email: email.toLowerCase() },
    ],
  });

  if (existedUser) {
    if (existedUser.provider === "google") {
      throw createHttpError(409, "Account exists with Google. Please login with Google.");
    }
    throw createHttpError(409, "User already exists");
  }

  let avatarUrl = "";
  if (req.file?.path) {
    const uploaded = await uploadOnCloudinary(req.file.path);
    avatarUrl = uploaded?.url || ""; 
  }

  const user = await User.create({
    username: username.trim().toLowerCase(),
    email: email.trim().toLowerCase(),
    fullname: fullname.trim(),
    password,
    avatar: avatarUrl,
    provider: "local",
  });

  const createdUser = user.toObject();
  delete createdUser.password;
  delete createdUser.refreshToken;

  return res.status(201).json({
    success: true,
    message: "User registered successfully",
    user: createdUser,
  });
});

const loginUser = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw createHttpError(400, "Email and password are required");
  }

  const user = await User.findOne({ email: email.toLowerCase() });

  if (!user) {
    throw createHttpError(404, "User does not exist");
  }

  if (user.provider !== "local") {
    throw createHttpError(400, "Please login using Google");
  }

  const isPasswordValid = await user.isPasswordCorrect(password);

  if (!isPasswordValid) {
    throw createHttpError(401, "Invalid email or password");
  }

  const { accessToken, refreshToken } =
    await generateAccessAndRefreshTokens(user._id);

  const loggedInUser = user.toObject();
  delete loggedInUser.password;
  delete loggedInUser.refreshToken;

  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "Lax",
    maxAge: 24 * 60 * 60 * 1000,
  };

  return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, {
      ...options,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    })
    .json({
      success: true,
      message: "User logged in successfully",
      user: loggedInUser,
    });
});

const logoutUser = asyncHandler(async (req, res) => {
  if (!req.user || !req.user._id) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized",
    });
  }

  await User.findByIdAndUpdate(req.user._id, {
    $set: { refreshToken: undefined },
  });

  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "Lax",
  };

  return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json({
      success: true,
      message: "Logout successful",
    });
});

export {
  registerUser,
  loginUser,
  logoutUser,
};