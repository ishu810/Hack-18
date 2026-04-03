import multer from "multer";
import path from "path";
import fs from "fs";


const tempDir = path.join(process.cwd(), "public", "temp");

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, tempDir);
    },
    filename: function (req, file, cb) {
      const ext = path.extname(file.originalname);          // .png
      const baseName = path.basename(file.originalname, ext); // avatar
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      cb(null, `${baseName}-${uniqueSuffix}${ext}`);
    }
  });
  
  const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"), false);
    }
  };
  

  export const upload = multer({
    storage,
    fileFilter,
    limits: {
      fileSize: 5 * 1024 * 1024 // 5 MB
    }
  });
  