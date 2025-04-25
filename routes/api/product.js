const express = require("express");
const router = express.Router();
const multer = require("multer");
const Mongoose = require("mongoose");

// Bring in Models & Utils
const Product = require("../../models/product");
const Brand = require("../../models/brand");
const Category = require("../../models/category");
const auth = require("../../middleware/auth");
const role = require("../../middleware/role");
const checkAuth = require("../../utils/auth");
const { s3Upload, s3Delete, s3Invalidate } = require("../../utils/storage");
const {
  getStoreProductsQuery,
  getStoreProductsWishListQuery,
} = require("../../utils/queries");
const { ROLES } = require("../../constants");
const { compressMultipleImages } = require("../../middleware/imageMiddleware");

const storage = multer.memoryStorage();
const upload = multer({ storage });

const uploadFields = upload.fields([
  { name: "heroImage", maxCount: 2 },
  { name: "images", maxCount: 5 },
]);

// fetch product slug api
router.get("/item/:slug", async (req, res) => {
  try {
    const slug = req.params.slug;

    const productDoc = await Product.findOne({ slug, isActive: true }).populate(
      {
        path: "brand",
        select: "name isActive slug",
      }
    );

    const hasNoBrand =
      productDoc?.brand === null || productDoc?.brand?.isActive === false;

    if (!productDoc || hasNoBrand) {
      return res.status(404).json({
        message: "No product found.",
      });
    }

    res.status(200).json({
      product: productDoc,
    });
  } catch (error) {
    res.status(400).json({
      error: "Your request could not be processed. Please try again.",
    });
  }
});

// fetch product name search api
router.get("/list/search/:name", async (req, res) => {
  try {
    const name = req.params.name;

    const productDoc = await Product.find(
      { name: { $regex: new RegExp(name), $options: "is" }, isActive: true },
      { name: 1, slug: 1, imageUrl: 1, price: 1, _id: 0 }
    );

    if (productDoc.length < 0) {
      return res.status(404).json({
        message: "No product found.",
      });
    }

    res.status(200).json({
      products: productDoc,
    });
  } catch (error) {
    res.status(400).json({
      error: "Your request could not be processed. Please try again.",
    });
  }
});

// fetch store products by advanced filters api
router.get("/list", async (req, res) => {
  try {
    const { category_id, product_id, name, featured, inStock, page = 1, limit = 10, sortBy } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const filter = { isActive: true };
    let sortOption = { created: -1 };
    if (sortBy === 'price_high_to_low') {
      sortOption = { price: -1 };
    } else if (sortBy === 'price_low_to_high') {
      sortOption = { price: 1 };
    } else if (sortBy === 'sales_count'){
      sortOption = { salesCount: 1 };
    }

    if (category_id) {
      const categoryIds = Array.isArray(category_id)
        ? category_id
        : category_id.split(','); // support comma-separated string

      filter.category_id = { $in: categoryIds };
    }

    if(product_id){
      const productIds = Array.isArray(product_id) ? product_id : product_id.split(",")

      filter._id = { $in: productIds };
    }

    if (name) filter.name = { $regex: name, $options: "i" };
    if (featured !== undefined) filter.featured = featured === "true";
    if (inStock !== undefined) filter.inStock = inStock === "true";

    let products = await Product.find(filter)
    .skip(skip)
    .limit(parseInt(limit))
    .sort(sortOption).populate("category_id");
    
    const total = await Product.countDocuments(filter);

    res.status(200).json({
      products,
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

router.get("/list/select", auth, async (req, res) => {
  try {
    const products = await Product.find({}, "name");

    res.status(200).json({
      products,
    });
  } catch (error) {
    res.status(400).json({
      error: "Your request could not be processed. Please try again.",
    });
  }
});

// add product api
router.post(
  "/add",
  auth,
  role.check(ROLES.Admin),
  uploadFields,
  compressMultipleImages,
  async (req, res) => {
    try {
      const {
        name,
        description,
        price,
        discount = 0,
        category_id,
        color,
        material,
        weight,
        inStock,
        isActive,
        featured,
      } = req.body;

      if (!name || !description || !price) {
        return res
          .status(400)
          .json({ error: "Name, description, and price are required." });
      }

      const existingProduct = await Product.findOne({ name });
      const existingCategory = await Category.findOne({ _id: category_id });

      if (existingProduct) {
        return res.status(400).json({ error: "Product already exists." });
      }

      if (!existingCategory) {
        return res.status(400).json({ error: "Category does not exists." });
      }

      const { heroImage, images } = req.compressedFiles;

      const heroImageKeys = await Promise.all(
        heroImage.map((file, index) =>
          s3Upload(`product/${name}/hero-${index}`, file).then(
            (res) => res.imageKey
          )
        )
      );

      const imageKeys = await Promise.all(
        images.map((file, index) =>
          s3Upload(`product/${name}/images-${index}`, file).then(
            (res) => res.imageKey
          )
        )
      );

      const product = new Product({
        name,
        description,
        price,
        discount,
        category_id,
        attributes: { color, material, weight },
        inStock: inStock ?? true,
        isActive: isActive ?? true,
        featured: featured ?? false,
        heroImage: { imageKey: heroImageKeys },
        images: { imageKey: imageKeys },
      });

      const savedProduct = await product.save();

      res.status(201).json({
        success: true,
        message: "Product has been added successfully!",
        product: savedProduct,
      });
    } catch (error) {
      res.status(400).json({
        error: "Your request could not be processed. Please try again.",
      });
    }
  }
);

// fetch products api
router.get(
  "/",
  auth,
  role.check(ROLES.Admin),
  async (req, res) => {
    try {
      const { category_id, product_id, name, featured, inStock, page = 1, limit = 10, sortBy } = req.query;
  
      const skip = (parseInt(page) - 1) * parseInt(limit);
  
      const filter = { };
      let sortOption = { created: -1 };
      if (sortBy === 'price_high_to_low') {
        sortOption = { price: -1 };
      } else if (sortBy === 'price_low_to_high') {
        sortOption = { price: 1 };
      } else if (sortBy === 'sales_high_to_low'){
        sortOption = { salesCount: -1 };
      } else if (sortBy === 'sales_low_to_high'){
        sortOption = { salesCount: 1 };
      }
  
      if (category_id) {
        const categoryIds = Array.isArray(category_id)
          ? category_id
          : category_id.split(','); // support comma-separated string
  
        filter.category_id = { $in: categoryIds };
      }
  
      if(product_id){
        const productIds = Array.isArray(product_id) ? product_id : product_id.split(",")
  
        filter._id = { $in: productIds };
      }
  
      if (name) filter.name = { $regex: name, $options: "i" };
      if (featured !== undefined) filter.featured = featured === "true";
      if (inStock !== undefined) filter.inStock = inStock === "true";
  
      let products = await Product.find(filter)
      .skip(skip)
      .limit(parseInt(limit))
      .sort(sortOption).populate("category_id");
      
      const total = await Product.countDocuments(filter);
  
      res.status(200).json({
        products,
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
  }
);

// fetch product api
router.get(
  "/:id",
  auth,
  role.check(ROLES.Admin, ROLES.Merchant),
  async (req, res) => {
    try {
      const productId = req.params.id;

      let productDoc = null;

      if (req.user.merchant) {
        const brands = await Brand.find({
          merchant: req.user.merchant,
        }).populate("merchant", "_id");

        const brandId = brands[0]["_id"];

        productDoc = await Product.findOne({ _id: productId })
          .populate({
            path: "brand",
            select: "name",
          })
          .where("brand", brandId);
      } else {
        productDoc = await Product.findOne({ _id: productId }).populate({
          path: "brand",
          select: "name",
        });
      }

      if (!productDoc) {
        return res.status(404).json({
          message: "No product found.",
        });
      }

      res.status(200).json({
        product: productDoc,
      });
    } catch (error) {
      res.status(400).json({
        error: "Your request could not be processed. Please try again.",
      });
    }
  }
);

router.get(
  "/single/:slug",
  async (req, res) => {
    try {
      const productSlug = req.params.slug;

      let productDoc = await Product.findOne({ slug: productSlug }).populate("category_id");

      if (!productDoc) {
        return res.status(404).json({
          message: "No product found.",
        });
      }

      res.status(200).json({
        product: productDoc,
      });
    } catch (error) {
      res.status(400).json({
        error: "Your request could not be processed. Please try again.",
      });
    }
  }
);

router.put(
  "/:id",
  auth,
  role.check(ROLES.Admin, ROLES.Merchant),
  async (req, res) => {
    try {
      const productId = req.params.id;
      const {heroImage, images, ...update} = req.body.product;
      const query = { _id: productId };

      const postData = {heroImage, images, ...update}

      if(heroImage.length && heroImage.length !== 2){
        return res.status(400).json({ error: "Please provide 2 hero images." });
      }

      if(images.length && images.length > 5){
        return res.status(400).json({ error: "Please provide maximum 5 image." });
      }

      await Product.findOneAndUpdate(query, postData, {
        new: true,
      });

      res.status(200).json({
        success: true,
        message: "Product has been updated successfully!",
      });
    } catch (error) {
      res.status(400).json({
        error: "Your request could not be processed. Please try again.",
      });
    }
  }
);

router.put(
  "/:id/active",
  auth,
  role.check(ROLES.Admin, ROLES.Merchant),
  async (req, res) => {
    try {
      const productId = req.params.id;
      const update = req.body.product;
      const query = { _id: productId };

      await Product.findOneAndUpdate(query, update, {
        new: true,
      });

      res.status(200).json({
        success: true,
        message: "Product has been updated successfully!",
      });
    } catch (error) {
      res.status(400).json({
        error: "Your request could not be processed. Please try again.",
      });
    }
  }
);

router.delete(
  "/delete/:id",
  auth,
  role.check(ROLES.Admin),
  async (req, res) => {
    try {
      const product = await Product.findOne({ _id: req.params.id });
      if (!product) {
        return res.status(404).json({ error: "Product not found." });
      }
      await Product.deleteOne({ _id: req.params.id });

      if (product.images?.imageKey) {
        product.images.imageKey.map(imageKey => {
          s3Delete(imageKey);
          s3Invalidate(imageKey);
        })
      }

      if (product.heroImage?.imageKey) {
        product.heroImage.imageKey.map(imageKey => {
          s3Delete(imageKey);
          s3Invalidate(imageKey);
        })
      }

      res.status(200).json({
        success: true,
        message: `Product has been deleted successfully!`,
        product,
      });
    } catch (error) {
      res.status(400).json({
        error: "Your request could not be processed. Please try again.",
      });
    }
  }
);

module.exports = router;
