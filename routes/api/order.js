const express = require("express");
const router = express.Router();
const Mongoose = require("mongoose");
const Razorpay = require("razorpay")

// Bring in Models & Utils
const Order = require("../../models/order");
const Cart = require("../../models/cart");
const Product = require("../../models/product");
const auth = require("../../middleware/auth");
const mailgun = require("../../services/mailgun");
const store = require("../../utils/store");
const { ROLES, ITEM_STATUS, PAYMENT_STATUS } = require("../../constants");
const role = require("../../middleware/role");
const product = require("../../models/product");
const keys = require("../../config/keys");

router.post("/add", auth, role.check(ROLES.Member), async (req, res) => {
  try {
    const user = req.user._id;
    const {
      orderItems,
      personalizedMessage,
      shippingDetails,
      paymentDetails,
      total,
    } = req.body;

    if (!orderItems || !Array.isArray(orderItems) || orderItems.length === 0) {
      return res
        .status(400)
        .json({ error: "At least one order item is required" });
    }

    // Validate order items

    for (const item of orderItems) {
      if (!item.productId) {
        return res
          .status(400)
          .json({ message: "Product ID is required for all items" });
      }
      if (!item.quantity || item.quantity < 1) {
        return res.status(400).json({ message: "Quantity must be at least 1" });
      }
      const currentProduct = await Product.findOne({ _id: item.productId });
      item.name = currentProduct.name;
      item.unitPrice = currentProduct.price;
      item.totalPrice =
        ((currentProduct.price * (100 - currentProduct.discount)) / 100) *
        item.quantity;
      item.discount = currentProduct.discount;
    }

    if (
      !shippingDetails ||
      !shippingDetails.addressLine1 ||
      !shippingDetails.city ||
      !shippingDetails.state ||
      !shippingDetails.zipCode ||
      !shippingDetails.country
    ) {
      return res
        .status(400)
        .json({ message: "Complete shipping details are required" });
    }

    // Validate payment details
    // if (
    //   !paymentDetails ||
    //   !paymentDetails.paymentMethod ||
    //   !paymentDetails.paymentStatus
    // ) {
    //   return res
    //     .status(400)
    //     .json({ message: "Payment method and status are required" });
    // }

    const calculatedTotal =
      total || orderItems.reduce((sum, item) => sum + item.totalPrice, 0);

    const razorpay = new Razorpay({
      key_id: keys.razorpay.keyId,
      key_secret: keys.razorpay.keySecret
    })

    const toalOrder = await Order.countDocuments()
    const options = {
      amount: calculatedTotal * 100,
      currency: "INR",
      receipt: `#${toalOrder}`,
      payment_capture: 1
    }

    const razorpayResponse = await razorpay.orders.create(options)

    const newOrder = new Order({
      user,
      orderItems,
      personalizedMessage: personalizedMessage || null,
      shippingDetails,
      paymentDetails : {
        ...paymentDetails,
        orderId: razorpayResponse.id,
        paymentStatus: "Pending"
      },
      total: calculatedTotal,
    });
    
    const savedOrder = await newOrder.save();
    await Promise.all(
      orderItems.map(async (item) => {
        await Product.findByIdAndUpdate(
          item.productId,
          { $inc: { salesCount: item.quantity } },
          { new: true }
        );

        // if (
        //   updatedProduct &&
        //   updatedProduct.salesCount >= bestSellerThreshold &&
        //   !updatedProduct.bestSeller
        // ) {
        //   updatedProduct.bestSeller = true;
        //   await updatedProduct.save();
        // }
      })
    );

    res.status(201).json({
      message: "Order created successfully",
      order: savedOrder
    });
  } catch (error) {
    res.status(400).json({
      error: "Your request could not be processed. Please try again.",
    });
  }
});

// fetch orders api
router.get("/", auth, async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;

    const user = req.user;

    const userFilter = {};

    if (user.role === ROLES.Member) {
      userFilter.user = user._id;
    }

    const ordersDoc = await Order.find(userFilter)
      .sort("-created")
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate({
        path: "orderItems._id",
      })
      .exec();

    const count = await Order.find(userFilter).countDocuments();
    const orders = ordersDoc;

    res.status(200).json({
      orders,
      totalPages: Math.ceil(count / limit),
      currentPage: Number(page),
      count,
    });
  } catch (error) {
    res.status(400).json({
      error: "Your request could not be processed. Please try again.",
    });
  }
});

// fetch order api
router.get("/:orderId", auth, async (req, res) => {
  try {
    const orderId = req.params.orderId;

    let orderDoc = null;

    if (req.user.role === ROLES.Admin) {
      orderDoc = await Order.findOne({ _id: orderId }).populate({
        path: "orderItems.productId",
      });
    } else {
      const user = req.user._id;
      orderDoc = await Order.findOne({ _id: orderId, user }).populate({
        path: "orderItems.productId",
      });
    }

    if (!orderDoc) {
      return res.status(404).json({
        message: `Cannot find order with the id: ${orderId}.`,
      });
    }

    res.status(200).json({
      order: orderDoc,
    });
  } catch (error) {
    res.status(400).json({
      error: "Your request could not be processed. Please try again.",
    });
  }
});

router.post("/cancel/:orderId", auth, async (req, res) => {
  try {
    const orderId = req.params.orderId;

    const filter = { _id: orderId };

    const user = req.user;

    if (user.role === ROLES.Member) {
      filter.user = user._id;
    }

    const order = await Order.findOne(filter);

    if (!order) {
      return res.status(400).json({
        error: "Order not found.",
      });
    }

    if (order.status === ITEM_STATUS.Cancelled) {
      return res.status(400).json({
        error: "Order is already cancelled.",
      });
    }

    await Order.findByIdAndUpdate(filter, { status: ITEM_STATUS.Cancelled });

    await Promise.all(
      order.orderItems.map(async (item) => {
        const updatedProduct = await Product.findByIdAndUpdate(
          item.productId,
          { $inc: { salesCount: -item.quantity } },
          { new: true }
        );
        // OPTIONAL: If you want automatic bestSeller logic:
        if (
          updatedProduct &&
          updatedProduct.salesCount < bestSellerThreshold &&
          updatedProduct.bestSeller
        ) {
          updatedProduct.bestSeller = false;
          await updatedProduct.save();
        }
      })
    );

    res.status(200).json({
      success: true,
    });
  } catch (error) {
    res.status(400).json({
      error: "Your request could not be processed. Please try again.",
    });
  }
});

router.put(
  "/paymentStatus/:orderId",
  auth,
  role.check(ROLES.Member),
  async (req, res) => {
    try {
      const orderId = req.params.orderId;
      const filter = { _id: orderId };

      const status = req.body.paymentStatus || PAYMENT_STATUS.Pending;

      if (status !== PAYMENT_STATUS.Pending) {
        await Order.findByIdAndUpdate(filter, { 'paymentDetails.paymentStatus': status });
      }

      res.status(200).json({
        success: true,
        message: "Order status has been updated successfully!",
      });
    } catch (error) {
      res.status(400).json({
        error: "Your request could not be processed. Please try again.",
      });
    }
  }
);

router.put(
  "/status/:orderId",
  auth,
  role.check(ROLES.Admin),
  async (req, res) => {
    try {
      const orderId = req.params.orderId;
      const filter = { _id: orderId };

      const status = req.body.status || ITEM_STATUS.Cancelled;

      if (status !== ITEM_STATUS.Cancelled) {
        await Order.findByIdAndUpdate(filter, { status });
      }

      res.status(200).json({
        success: true,
        message: "Item status has been updated successfully!",
      });
    } catch (error) {
      res.status(400).json({
        error: "Your request could not be processed. Please try again.",
      });
    }
  }
);

module.exports = router;
