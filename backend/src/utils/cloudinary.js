import { v2 as cloudinary } from "cloudinary";
import fs from "fs/promises";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const uploadOnCloudinary = async (localFilePath) => {
  if (!localFilePath) return null;

  try {
    const response = await cloudinary.uploader.upload(localFilePath, {
      resource_type: "auto",
      folder: "trip_planner/avatars", 
    });

    console.log("UPLOADED SUCCESSFULLY:", response.secure_url);

    return {
      url: response.secure_url,
      public_id: response.public_id,
    };

  } catch (error) {
    console.error("Cloudinary upload error:", error);
    throw error;

  } finally {
    try {
      await fs.unlink(localFilePath);
    } catch (err) {
      console.warn("Error deleting temp file:", err.message);
    }
  }
};

export { uploadOnCloudinary };