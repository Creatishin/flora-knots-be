const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const passport = require("passport");

const auth = require("../../middleware/auth");

// Bring in Models & Helpers
const User = require("../../models/user");
const mailchimp = require("../../services/mailchimp");
const keys = require("../../config/keys");
const { EMAIL_PROVIDER } = require("../../constants");

const { secret, tokenLife } = keys.jwt;

router.post("/login", async (req, res) => {
  try {
    const { phoneNumber, password } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({ error: "You must enter phone number." });
    }

    if (!password) {
      return res.status(400).json({ error: "You must enter a password." });
    }

    const user = await User.findOne({ phoneNumber });
    if (!user) {
      return res
        .status(400)
        .send({ error: "No user found for this phone number." });
    }

    if (user && user.provider !== EMAIL_PROVIDER.Email) {
      return res.status(400).send({
        error: `That email address is already in use using ${user.provider} provider.`,
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(400).json({
        success: false,
        error: "Password Incorrect",
      });
    }

    const payload = {
      id: user.id,
      role: user.role,
    };

    const token = jwt.sign(payload, secret, { expiresIn: tokenLife });

    if (!token) {
      throw new Error();
    }

    res.status(200).json({
      success: true,
      token: `Bearer ${token}`,
      user: {
        phoneNumber: user.phoneNumber,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email
      },
    });
  } catch (error) {
    res.status(400).json({
      error: "Your request could not be processed. Please try again.",
    });
  }
});

router.post("/verify", async (req, res) => {
  try {
    const { phoneNumber } = req.body;

    const existingUser = await User.findOne({ phoneNumber });

    if (existingUser) {
      return res.status(400).json({ error: "This user is already in use." });
    }

    res.status(200).json({
      success: true,
      message: "This user is not in use.",
    });
  } catch (err) {
    res.status(400).json({
      error: "Your request could not be processed. Please try again.",
    });
  }
});

router.post("/register", async (req, res) => {
  try {
    const { email, firstName, lastName, password, isSubscribed, phoneNumber } =
      req.body;

    if (!phoneNumber) {
      return res.status(400).json({ error: "You must enter an phone number." });
    }

    if (!firstName) {
      return res.status(400).json({ error: "You must enter your name." });
    }

    if (!password) {
      return res.status(400).json({ error: "You must enter a password." });
    }

    const existingUser = await User.findOne({ phoneNumber, email });

    if (existingUser) {
      return res.status(400).json({ error: "This user is already in use." });
    }

    let subscribed = false;
    if (isSubscribed) {
      const result = await mailchimp.subscribeToNewsletter(email);

      if (result.status === "subscribed") {
        subscribed = true;
      }
    }

    const user = new User({
      email,
      phoneNumber,
      password,
      firstName,
      lastName,
    });

    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(user.password, salt);

    user.password = hash;
    const registeredUser = await user.save();

    const payload = {
      id: registeredUser.id,
      role: registeredUser.role,
    };

    // await mailgun.sendEmail(
    //   registeredUser.email,
    //   'signup',
    //   null,
    //   registeredUser
    // );

    const token = jwt.sign(payload, secret, { expiresIn: tokenLife });

    res.status(200).json({
      success: true,
      subscribed,
      token: `Bearer ${token}`,
      user: {
        firstName: registeredUser.firstName,
        lastName: registeredUser.lastName,
        email: registeredUser.email,
        phoneNumber: registeredUser.phoneNumber,
      },
    });
  } catch (error) {
    res.status(400).json({
      error: "Your request could not be processed. Please try again.",
    });
  }
});

router.post("/forgot", async (req, res) => {
  try {
    const { phoneNumber, newPassword } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({ error: "You must enter phone number." });
    }

    const existingUser = await User.findOne({ phoneNumber });

    if (!existingUser) {
      return res
        .status(400)
        .send({ error: "No user found for this phone number." });
    }

    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(newPassword, salt);
    existingUser.password = hash;
    existingUser.save();

    // await mailgun.sendEmail(
    //   existingUser.email,
    //   'reset',
    //   req.headers.host,
    //   resetToken
    // );

    res.status(200).json({
      success: true,
      message:
        "Password changed successfully. Please login with your new password.",
    });
  } catch (error) {
    res.status(400).json({
      error: "Your request could not be processed. Please try again.",
    });
  }
});

// router.post('/reset/:token', async (req, res) => {
//   try {
//     const { password } = req.body;

//     if (!password) {
//       return res.status(400).json({ error: 'You must enter a password.' });
//     }

//     const resetUser = await User.findOne({
//       resetPasswordToken: req.params.token,
//       resetPasswordExpires: { $gt: Date.now() }
//     });

//     if (!resetUser) {
//       return res.status(400).json({
//         error:
//           'Your token has expired. Please attempt to reset your password again.'
//       });
//     }

//     const salt = await bcrypt.genSalt(10);
//     const hash = await bcrypt.hash(password, salt);

//     resetUser.password = hash;
//     resetUser.resetPasswordToken = undefined;
//     resetUser.resetPasswordExpires = undefined;

//     resetUser.save();

//     await mailgun.sendEmail(resetUser.email, 'reset-confirmation');

//     res.status(200).json({
//       success: true,
//       message:
//         'Password changed successfully. Please login with your new password.'
//     });
//   } catch (error) {
//     res.status(400).json({
//       error: 'Your request could not be processed. Please try again.'
//     });
//   }
// });

router.post("/reset", async (req, res) => {
  try {
    const { phoneNumber, password, newPassword } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({ error: "You must enter a phone Number." });
    }

    if (!password) {
      return res.status(400).json({ error: "You must enter a password." });
    }

    const existingUser = await User.findOne({ phoneNumber });

    if (!existingUser) {
      return res
        .status(400)
        .json({ error: "That phone number is not in use." });
    }

    const isMatch = await bcrypt.compare(password, existingUser.password);

    if (!isMatch) {
      return res
        .status(400)
        .json({ error: "Please enter your correct old password." });
    }

    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(newPassword, salt);
    existingUser.password = hash;
    existingUser.save();

    // await mailgun.sendEmail(existingUser.email, 'reset-confirmation');

    res.status(200).json({
      success: true,
      message:
        "Password changed successfully. Please login with your new password.",
    });
  } catch (error) {
    res.status(400).json({
      error: "Your request could not be processed. Please try again.",
    });
  }
});

router.get(
  "/google",
  passport.authenticate("google", {
    session: false,
    scope: ["profile", "email"],
    accessType: "offline",
    approvalPrompt: "force",
  })
);

router.get(
  "/google/callback",
  passport.authenticate("google", {
    failureRedirect: `${keys.app.clientURL}/login`,
    session: false,
  }),
  (req, res) => {
    const payload = {
      id: req.user.id,
    };

    // TODO find another way to send the token to frontend
    const token = jwt.sign(payload, secret, { expiresIn: tokenLife });
    const jwtToken = `Bearer ${token}`;
    res.redirect(`${keys.app.clientURL}/auth/success?token=${jwtToken}`);
  }
);

router.get(
  "/facebook",
  passport.authenticate("facebook", {
    session: false,
    scope: ["public_profile", "email"],
  })
);

router.get(
  "/facebook/callback",
  passport.authenticate("facebook", {
    failureRedirect: `${keys.app.clientURL}/login`,
    session: false,
  }),
  (req, res) => {
    const payload = {
      id: req.user.id,
    };
    const token = jwt.sign(payload, secret, { expiresIn: tokenLife });
    const jwtToken = `Bearer ${token}`;
    res.redirect(`${keys.app.clientURL}/auth/success?token=${jwtToken}`);
  }
);

module.exports = router;
