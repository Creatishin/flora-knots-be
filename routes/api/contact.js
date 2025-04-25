const express = require('express');
const router = express.Router();
const { RateLimiter } = require("../../middleware/rateLimiter");
// Bring in Models & Helpers
const Contact = require('../../models/contact');
const role = require("../../middleware/role");
const { ROLES } = require("../../constants");
const auth = require("../../middleware/auth");

router.post('/add', RateLimiter, async (req, res) => {
  try {
    const name = req.body.name;
    const email = req.body.email;
    const phoneNumber = req.body.phoneNumber;
    const message = req.body.message

    if (!phoneNumber) {
      return res
        .status(400)
        .json({ error: 'You must enter a phone number.' });
    }

    if (!name) {
      return res
        .status(400)
        .json({ error: 'You must enter your name.' });
    }

    if (!message) {
      return res.status(400).json({ error: 'You must enter a message.' });
    }

    const contact = new Contact({
      name,
      email,
      phoneNumber,
      message
    });

    const contactDoc = await contact.save();

    res.status(200).json({
      success: true,
      message: `We will reach you soon!`,
      contact: contactDoc
    });
  } catch (error) {
    return res.status(400).json({
      error: 'Your request could not be processed. Please try again.'
    });
  }
});

router.get('/all', auth, role.check(ROLES.Admin), async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query; // optional pagination

    const contacts = await Contact.find({})
      .sort({ createdAt: -1 }) // latest on top
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec();

    const count = await Contact.countDocuments();

    res.status(200).json({
      success: true,
      contacts,
      totalPages: Math.ceil(count / limit),
      currentPage: Number(page),
      count,
    });
  } catch (error) {
    console.error(error);
    res.status(400).json({
      error: 'Your request could not be processed. Please try again.'
    });
  }
});

module.exports = router;
