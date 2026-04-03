import { asyncHandler } from "../utils/asyncHandler.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";


const generateAccessAndRefreshTokens = async (userId) => {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error("User not found while generating tokens");
      }
  
      const accessToken = user.generateAccessToken();
      const refreshToken = user.generateRefreshToken();
  
      user.refreshToken = refreshToken;
      await user.save({ validateBeforeSave: false });
  
      return { accessToken, refreshToken };
    } catch (error) {
      console.error("Token generation error:", error);
      throw new Error("Something went wrong while generating refresh and access token");
    }
  };
  


  const registerUser=asyncHandler(async (req ,res)=>{
    const {username,fullname,email,age,gender,role,password}=req.body;


    if (!username) {
        throw new Error("Username is required");
      }
    if (!fullname) {
        throw new Error("Full name is required");
      }
      
      if (!email) {
        throw new Error("Email is required");
      }
      
      if (!password) {
        throw new Error("Password is required");
      }
    
      if (!age || isNaN(age) || Number(age) <= 0) {
        throw new Error("Valid age is required");
      }
      
      if (!gender) {
        throw new Error("Gender is required");
      }
      
      if (!role) {
        throw new Error("Role is required");
      }
      
      const existedUser = await User.findOne({
        $or: [{ username: username.toLowerCase() }, { email: email.toLowerCase() }]
      });
      if (existedUser) {
        throw new Error("User already exists");
      }
      const user=await User.create({
        
        username: username.trim().toLowerCase(),
        email: email.trim().toLowerCase(),
        fullname: fullname.trim().toLowerCase(),

        age: Number(age),
        gender,
        role,
        password: password,
        provider: "local",
        isProfileComplete: true,
        

      

      })
      const createdUser = await User.findById(user._id).select(
        "-password -refreshToken"
      );
      
      if (!createdUser) {
        throw new Error("Something went wrong while registering the user");
      }
      
      return res.status(201).json({
        success: true,
        message: "User registered successfully",
        user: createdUser
      })      
      

})
const loginUser = asyncHandler(async (req, res) => {
    const { email, password } = req.body;
  
    if (!email) {
      throw new Error("Email is required");
    }
  
    if (!password) {
      throw new Error("Password is required");
    }
  
    const user = await User.findOne({ email: email.toLowerCase() });
  
    if (!user) {
      throw new Error("User does not exist");
    }

    if (user.provider !== "local") {
      throw new Error("Please login using Google for this account");
    }

    const isPasswordValid = await user.isPasswordCorrect(password);
    if (!isPasswordValid) {
      throw new Error("Invalid user credentials");
    }
  
    const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(
      user._id
    );
  
    const loggedInUser = await User.findById(user._id).select(
      "-password -refreshToken"
    );
  
    // cookie options
    const options = {
      httpOnly: true,
      secure: true, 
    };
  
    return res
      .status(200)
      .cookie("accessToken", accessToken, options)
      .cookie("refreshToken", refreshToken, options)
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
          message: "Unauthorized: user not found in request"
        });
      }
    
    await User.findByIdAndUpdate(req.user._id, {
      $set: { refreshToken: undefined }
    });
  
    const options = {
      httpOnly: true,
      secure: true
    };
  
    return res
      .status(200)
      .clearCookie("accessToken", options)
      .clearCookie("refreshToken", options)
      .json({
        success: true,
        message: "Logout successful"
      });
  });

  export {registerUser,loginUser,logoutUser}