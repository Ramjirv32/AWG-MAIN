const Support = require('../models/Support');
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

const submit = async (req, res) => {
  try {
    const { name, email, message } = req.body;

    const ticket = new Support({
      userId: req.user?.id,
      name,
      email,
      message
    });

    await ticket.save();

    try {
      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: email,
        subject: 'Support Ticket Received',
        text: `Hi ${name},\n\nWe received your message:\n"${message}"\n\nOur team will respond soon.\n\nThanks,\nAWG Support`
      });
    } catch (mailErr) {
      console.log('Email failed but ticket saved');
    }

    res.json({ msg: 'Ticket submitted', id: ticket._id });
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
};

const getTickets = async (req, res) => {
  try {
    const tickets = await Support.find().sort({ createdAt: -1 }).limit(50);
    res.json(tickets);
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
};

module.exports = { submit, getTickets };
