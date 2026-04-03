import dotenv from "dotenv"
dotenv.config()
import {v2 as cloudinary} from "cloudinary"
import fs from "fs"

cloudinary.config({ 
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME, 
    api_key: process.env.CLOUDINARY_API_KEY, 
    api_secret: process.env.CLOUDINARY_API_SECRET 
});


const uploadOnCloudinary = async (localFilePath) => {
    if (!localFilePath) return null;
  
    try {
      const response = await cloudinary.uploader.upload(localFilePath, {
        resource_type: "auto",
        // optional: folder: "ranger_avatars"
      });
  
      console.log("UPLOADED SUCCESSFULLY", response.secure_url);
      return response; // response.secure_url is strored in avatar
    } catch (error) {
      console.error("Cloudinary upload error:", error);
      throw error; 
    } finally {
      // deleting local file
      try {
        await fs.unlink(localFilePath);
      } catch (err) {
        console.warn("Error deleting temp file:", err.message);
      }
    }
  };
  
  export { uploadOnCloudinary };
  