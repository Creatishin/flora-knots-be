const Mongoose = require("mongoose");

const { ITEM_STATUS } = require("../constants");

const { Schema } = Mongoose;

// Cart Item Schema
const CartItemSchema = new Schema({
  product: {
    type: Schema.Types.ObjectId,
    ref: "Product",
  },
  quantity: Number,
  purchasePrice: {
    type: Number,
    default: 0,
  },
  totalPrice: {
    type: Number,
    default: 0,
  },
  priceWithTax: {
    type: Number,
    default: 0,
  },
  totalTax: {
    type: Number,
    default: 0,
  },
  status: {
    type: String,
    default: ITEM_STATUS.Not_processed,
    enum: [
      ITEM_STATUS.Not_processed,
      ITEM_STATUS.Processing,
      ITEM_STATUS.Shipped,
      ITEM_STATUS.Delivered,
      ITEM_STATUS.Cancelled,
    ],
  },
});

module.exports = Mongoose.model("CartItem", CartItemSchema);

// Cart Schema
const CartSchema = new Schema({
  products: [CartItemSchema],
  user: {
    type: Schema.Types.ObjectId,
    ref: "User",
  },
  updated: Date,
  created: {
    type: Date,
    default: Date.now,
  },
});

module.exports = Mongoose.model("Cart", CartSchema);
