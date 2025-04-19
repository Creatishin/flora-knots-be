const Mongoose = require("mongoose");
const { ITEM_STATUS } = require("../constants");
const { Schema } = Mongoose;

const OrderItemSchema = new Schema({
  productId: {
    type: Schema.Types.ObjectId,
    ref: "Product",
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
  },
  unitPrice: {
    type: Number,
    required: true,
  },
  discount: {
    type: Number,
    required: true,
  },
  totalPrice: {
    type: Number,
    required: true,
  },
});

const PaymentDetailsSchema = new Schema({
  orderId: {
    type : String,
    required: true,
  },
  paymentMethod: {
    type: String,
  },
  paymentStatus: {
    type: String,
  },
  transactionDate: {
    type: Date,
  },
  transactionReference: {
    type: String,
  },
});

const ShippingDetailsSchema = new Schema({
  addressLine1: {
    type: String,
    required: true,
  },
  addressLine2: {
    type: String,
  },
  city: {
    type: String,
    required: true,
  },
  state: {
    type: String,
    required: true,
  },
  zipCode: {
    type: String,
    required: true,
  },
  country: {
    type: String,
    required: true,
  },
  carrier: {
    type: String,
  },
  trackingNumber: {
    type: String,
  },
  shipmentDate: {
    type: Date,
  },
  expectedDelivery: {
    type: Date,
  },
  shippingMethod: {
    type: String,
  },
  shippingCost: {
    type: Number,
  },
});

// Order Schema
const OrderSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    orderDate: {
      type: Date,
      default: Date.now,
    },
    status: {
      type: String,
      enum: [
        ITEM_STATUS.Not_processed,
        ITEM_STATUS.Processing,
        ITEM_STATUS.Shipped,
        ITEM_STATUS.Delivered,
        ITEM_STATUS.Cancelled,
      ],
      default: ITEM_STATUS.Processing,
    },
    orderItems: {
      type: [OrderItemSchema],
      required: true,
    },
    personalizedMessage: {
      type: String,
    },
    shippingDetails: ShippingDetailsSchema,
    paymentDetails: PaymentDetailsSchema,
    total: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: { createdAt: "created", updatedAt: "updated" } }
);

module.exports = Mongoose.model("Order", OrderSchema);
