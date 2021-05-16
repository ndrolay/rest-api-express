var nodemailer = require("nodemailer"),
transporter = nodemailer.createTransport({
	host: process.env.mail_HOST,
	port: 465,
	secure: true, // true for 465, false for other ports
	auth: {
	user: process.env.mail_USER, // generated ethereal user
	pass: process.env.mail_PASS, // generated ethereal password
	},
})

module.exports = transporter