import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,

    },
    fullname: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    role: {
      type: String,
      enum: ["ranger", "doctor", "admin"],
      default: "ranger",
      required: true,
    },
    age: {
    type: Number,
  },


    gender: {
    type: String,
    enum: ["male", "female", "other", "prefer_not_to_say"],
  },

    avatar:{
      type: String, // cloudinary url 
      required: false,
    },
    password: {
      type: String,
      required: function () {
        return this.provider === "local";
      },
    },
    
    refreshToken: {
      type: String,
    },
    provider: {
      type: String,
      enum: ["local", "google"],
      default: "local",
    },
    googleId: {
      type: String, // "sub" from Google token
      index: true,
    },
    weight: {
      type: Number, 
    },
    height: {
      type: Number, 
    },
    conditions: {
      type: String,
      trim: true,
      default: "",
    },
    allergies: {
      type: String,
      trim: true,
      default: "",
    },
    isProfileComplete: {
      type: Boolean,
      default: false,
    },
    specialization: {
  type: String,
  trim: true,
},

licenseNumber: {
  type: String,
  trim: true,
},

experience: {
  type: Number,
},



  },
  { timestamps: true }
);

userSchema.pre("save", async function () {
  // only hash if password exists AND is modified
  if (!this.isModified("password") || !this.password) {
    return;
  }

  this.password = await bcrypt.hash(this.password, 10);
});

userSchema.pre("save", function (next) {
  if (this.role === "doctor") {
    if (!this.specialization || !this.licenseNumber) {
      return next(new Error("Doctor profile incomplete"));
    }
  }

  if (this.role === "ranger") {
    
    this.specialization = undefined;
    this.licenseNumber = undefined;
    this.experience = undefined;
  }


});




userSchema.methods.isPasswordCorrect = async function (password) {
  if (!this.password) return false;
  return await bcrypt.compare(password, this.password);
};

userSchema.methods.generateAccessToken = function () {
  return jwt.sign(
    {
      _id: this._id,
      email: this.email,
      fullname: this.fullname,
    },
    process.env.ACCESS_TOKEN_SECRET,
    {
      expiresIn: process.env.ACCESS_TOKEN_EXPIRY,
    }
  );
};

userSchema.methods.generateRefreshToken = function () {
  return jwt.sign(
    {
      _id: this._id,
      email: this.email,
      fullname: this.fullname,
    },
    process.env.REFRESH_TOKEN_SECRET,
    {
      expiresIn: process.env.REFRESH_TOKEN_EXPIRY,
    }
  );
};

export const User = mongoose.model("User", userSchema);
