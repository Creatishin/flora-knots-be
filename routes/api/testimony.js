const express = require("express");
const router = express.Router();
const auth = require("../../middleware/auth");
const role = require("../../middleware/role");
const { ROLES } = require("../../constants");
const {
  upload,
  compressAndSaveImage,
} = require("../../middleware/imageMiddleware");
const { s3Upload, s3Delete, s3Invalidate } = require("../../utils/storage");
const Testimony = require('../../models/testimony');

router.get('/', async (req, res) => {
  try {
    const testimonies = await Testimony.find({}, 'image imageKey createdAt').sort({ createdAt: -1 });

    res.status(200).json(testimonies);
  } catch (error) {
    console.error(error);
    res.status(400).json({
      error: 'Your request could not be processed. Please try again.',
    });
  }
});

router.post(
  '/add',
  auth,
  role.check(ROLES.Admin),
  upload.single('image'),
  compressAndSaveImage,
  async (req, res) => {
    try {
      const totalImages = await Testimony.countDocuments();
      if (totalImages >= 10) {
        return res
          .status(400)
          .json({ error: 'Maximum 10 testimony images allowed.' });
      }

      const compressedImage = req.compressedImage;
      const { imageKey } = await s3Upload(`testimony`, compressedImage);

      const testimony = new Testimony({
        image: {
          imageKey,
        },
      });

      await testimony.save();

      res.status(201).json({
        success: true,
        message: 'Testimony image uploaded successfully!',
        testimony,
      });
    } catch (error) {
      console.error(error);
      res.status(400).json({
        error: 'Your request could not be processed. Please try again.',
      });
    }
  }
);

// Delete a testimony image
router.delete(
  '/delete/:id',
  auth,
  role.check(ROLES.Admin),
  async (req, res) => {
    try {
      const testimony = await Testimony.findOne({ _id: req.params.id });
      if (!testimony) {
        return res.status(404).json({ error: 'Testimony not found.' });
      }

      await Testimony.deleteOne({ _id: req.params.id });

      if (testimony.image?.imageKey) {
        await s3Delete(testimony.image.imageKey);
        await s3Invalidate(testimony.image.imageKey);
      }

      res.status(200).json({
        success: true,
        message: 'Testimony image deleted successfully!',
      });
    } catch (error) {
      console.error(error);
      res.status(400).json({
        error: 'Your request could not be processed. Please try again.',
      });
    }
  }
);

module.exports = router;
