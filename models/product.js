const Mongoose = require("mongoose");
const slug = require("mongoose-slug-generator");
const { Schema } = Mongoose;

const options = {
  separator: "-",
  lang: "en",
  truncate: 120,
};

function maxArrayLengthValidator(max) {
  return {
    validator: function (val) {
      return val.length <= max;
    },
    message: `{PATH} exceeds the limit of ${max}`,
  };
}

Mongoose.plugin(slug, options);

// Product Schema
const ProductSchema = new Schema({
  name: {
    type: String,
    trim: true,
  },
  slug: {
    type: String,
    slug: "name",
    unique: true,
  },
  description: {
    type: String,
    trim: true,
  },
  price: {
    type: Number,
  },
  discount: {
    type: Number,
    default: 0,
  },
  heroImage: {
    imageKey: {
      type: [String],
      validate: maxArrayLengthValidator(2),
    },
  },
  images: {
    imageKey: {
      type: [String],
      validate: maxArrayLengthValidator(5),
    },
  },
  category_id: {
    type: Schema.Types.ObjectId,
    ref: "Category",
    default: null,
  },
  attributes: {
    color: {
      type: String,
      trim: true,
    },
    material: {
      type: String,
      trim: true,
    },
    weight: {
      type: String,
      trim: true,
    },
  },
  inStock: {
    type: Boolean,
    default: true,
  },
  isArchived: {
    type: Boolean,
    default: false,
  },
  featured: {
    type: Boolean,
    default: false,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  updated: Date,
  created: {
    type: Date,
    default: Date.now,
  },
});

module.exports = Mongoose.model("Product", ProductSchema);
