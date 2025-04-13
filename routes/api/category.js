const express = require("express");
const router = express.Router();

// Bring in Models & Utils
const Category = require("../../models/category");
const auth = require("../../middleware/auth");
const role = require("../../middleware/role");
const store = require("../../utils/store");
const { ROLES } = require("../../constants");

const {
  upload,
  compressAndSaveImage,
} = require("../../middleware/imageMiddleware");
const { s3Upload, s3Delete, s3Invalidate } = require("../../utils/storage");

router.post(
  "/add",
  auth,
  role.check(ROLES.Admin),
  upload.single("image"),
  compressAndSaveImage,
  async (req, res) => {
    const name = req.body.name;
    const description = req.body.description;
    const products = req.body.products;
    const isActive = req.body.isActive;
    const compressedImage = req.compressedImage;

    if (!description || !name) {
      return res
        .status(400)
        .json({ error: "You must enter description & name." });
    }

    const existingCategory = await Category.findOne({ name });

    if (existingCategory) {
      return res.status(400).json({ error: "Category already exists." });
    }

    const { imageKey } = await s3Upload(`category/${name}`, compressedImage);

    const category = new Category({
      name,
      description,
      products,
      isActive,
      image: {
        imageKey,
      },
    });
    category.save((err, data) => {
      if (err) {
        console.log(err)
        return res.status(400).json({
          error: "Your request could not be processed. Please try again.",
        });
      }

      res.status(201).json({
        success: true,
        message: `Category has been added successfully!`,
        category: data,
      });
    });
  }
);

// fetch store categories api
router.get("/list", async (req, res) => {
  try {
    const { page = 1, limit = 100 } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const filter = { isActive: true };

    const categories = await Category.find(filter)
    .skip(skip)
    .limit(parseInt(limit));

    const total = await Category.countDocuments(filter);
    res.status(200).json({
      categories,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit),
      }
    });
  } catch (error) {
    res.status(400).json({
      error: "Your request could not be processed. Please try again.",
    });
  }
});

// fetch categories api
router.get("/", auth, role.check(ROLES.Admin), async (req, res) => {
  try {
    const categories = await Category.find({});
    res.status(200).json({
      categories,
    });
  } catch (error) {
    res.status(400).json({
      error: "Your request could not be processed. Please try again.",
    });
  }
});

// fetch category api
router.get("/:id", async (req, res) => {
  try {
    const categoryId = req.params.id;

    const categoryDoc = await Category.findOne({ _id: categoryId }).populate({
      path: "products",
      select: "name",
    });

    if (!categoryDoc) {
      return res.status(404).json({
        message: "No Category found.",
      });
    }

    res.status(200).json({
      category: categoryDoc,
    });
  } catch (error) {
    res.status(400).json({
      error: "Your request could not be processed. Please try again.",
    });
  }
});

router.put(
  "/:id",
  auth,
  role.check(ROLES.Admin),
  upload.single("image"),
  compressAndSaveImage,
  async (req, res) => {
    try {
      const categoryId = req.params.id;
      const update = req.body;
      const query = { _id: categoryId };
      const { slug } = req.body;
      const compressedImage = req.compressedImage;

      const foundCategory = await Category.findOne({
        $or: [{ slug }],
      });

      if (foundCategory && foundCategory._id != categoryId) {
        return res.status(400).json({ error: "Slug is already in use." });
      }

      const category = await Category.findOne(query);
      if (!category) {
        return res.status(404).json({ error: "Category not found." });
      }

      if (compressedImage && category.image?.imageKey) {
        s3Delete(category.image.imageKey);
        s3Invalidate(category.image.imageKey);
      }

      if (compressedImage) {
        const { imageKey } = await s3Upload(
          `category/${update.name}`,
          compressedImage
        );
        update.image = {
          imageKey: imageKey,
        };
      }

      const updatedCategory = await Category.findOneAndUpdate(query, update, {
        new: true,
      });

      res.status(200).json({
        success: true,
        message: "Category has been updated successfully!",
        category: updatedCategory,
      });
    } catch (error) {
      res.status(400).json({
        error: "Your request could not be processed. Please try again.",
      });
    }
  }
);

router.put("/:id/active", auth, role.check(ROLES.Admin), async (req, res) => {
  try {
    const categoryId = req.params.id;
    const update = req.body.category;
    const query = { _id: categoryId };

    // disable category(categoryId) products
    if (!update.isActive) {
      const categoryDoc = await Category.findOne(
        { _id: categoryId, isActive: true },
        "products -_id"
      ).populate("products");

      store.disableProducts(categoryDoc.products);
    }

    await Category.findOneAndUpdate(query, update, {
      new: true,
    });

    res.status(200).json({
      success: true,
      message: "Category has been updated successfully!",
    });
  } catch (error) {
    res.status(400).json({
      error: "Your request could not be processed. Please try again.",
    });
  }
});

router.delete(
  "/delete/:id",
  auth,
  role.check(ROLES.Admin),
  async (req, res) => {
    try {
      const category = await Category.findOne({ _id: req.params.id });
      if (!category) {
        return res.status(404).json({ error: "Category not found." });
      }

      await Category.deleteOne({ _id: req.params.id });

      if (category.image?.imageKey) {
        s3Delete(category.image.imageKey);
        s3Invalidate(category.image.imageKey);
      }

      res.status(200).json({
        success: true,
        message: `Category has been deleted successfully!`,
      });
    } catch (error) {
      res.status(400).json({
        error: "Your request could not be processed. Please try again.",
      });
    }
  }
);

module.exports = router;
