const Mongoose = require("mongoose");
const slug = require("mongoose-slug-generator");
const { Schema } = Mongoose;

const options = {
  separator: "-",
  lang: "en",
  truncate: 120,
};

Mongoose.plugin(slug, options);

// Category Schema
const CategorySchema = new Schema({
  _id: {
    type: Schema.ObjectId,
    auto: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  slug: {
    type: String,
    slug: "name",
    unique: true,
  },
  image: {
    imageKey: { type: String },
  },
  description: {
    type: String,
    trim: true,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  products: [
    {
      type: Schema.Types.ObjectId,
      ref: "Product",
    },
  ],
  updated: Date,
  created: {
    type: Date,
    default: Date.now,
  },
});

module.exports = Mongoose.model("Category", CategorySchema);
