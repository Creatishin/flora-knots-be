const multer = require("multer");
const sharp = require("sharp");

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed!"), false);
    }
  },
});

// Middleware to handle image compression
const compressAndSaveImage = async (req, res, next) => {
  try {
    if (!req.file) return next();

    const compressedBuffer = await sharp(req.file.buffer)
      .resize({
        height: 1080,
        width: 1440,
        fit: "cover",
      })
      .jpeg({ quality: 50 })
      .toBuffer();

    req.compressedImage = {
      originalname: req.file.originalname, // reuse original name or generate new
      buffer: compressedBuffer,
      mimetype: "image/jpeg", // ensure correct content-type
    };
    next();
  } catch (error) {
    console.error("Error processing image:", error);
    res.status(500).json({ error: "Image processing failed" });
  }
};

// Updated compress middleware for multiple fields
const compressMultipleImages = async (req, res, next) => {
  try {
    const allImages = req.files;
    if (!allImages) return next();

    const compressImage = async (file) => {
      const buffer = await sharp(file.buffer)
        .resize({ width: 1440, height: 1080, fit: "cover" })
        .jpeg({ quality: 50 })
        .toBuffer();
      return {
        originalname: file.originalname,
        buffer,
        mimetype: "image/jpeg",
      };
    };

    const compressedHeroImages = await Promise.all(
      (allImages.heroImage || []).map(compressImage)
    );

    const compressedImages = await Promise.all(
      (allImages.images || []).map(compressImage)
    );

    req.compressedFiles = {
      heroImage: compressedHeroImages,
      images: compressedImages,
    };

    next();
  } catch (error) {
    console.error("Error compressing images:", error);
    res.status(500).json({ error: "Image compression failed" });
  }
};


module.exports = { upload, compressAndSaveImage, compressMultipleImages };
