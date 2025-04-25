const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const TestimonySchema = new Schema({
  image: {
    imageKey: { type: String, required: true },
  },
});

module.exports = mongoose.model('Testimony', TestimonySchema);
