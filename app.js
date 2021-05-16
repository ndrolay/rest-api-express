    require('dotenv').config();
var morgan = require('morgan'),
    moment = require('moment'),
    mysqlTimestamps = moment(Date.now()).format('YYYY-MM-DD'),
	exphbs = require('express-handlebars'),
	cookieParser = require('cookie-parser'),
	bodyParser = require('body-parser'),
	crypto = require('crypto'),
	fetch = require('node-fetch'),
	cron = require('node-cron'),
	apiSQL = require('./helper/mysql'),
	transporter = require('./helper/nodemailer'),
	Limiter = require('express-rate-limit'),
	express = require('express'),
	app = express(),
	PORT = process.env.PORT || '3000',
	apiLimiter = Limiter({
		windowMs: 24 * 60 * 60 * 1000, // 24 hours
		max: 200, // 200 request per 24hours for 1 apikey
		keyGenerator: function (req, res) { 
			return req.query.apikey;
		},
	});
app.enable('trust proxy')
app.use(morgan('dev'))
app.set("json spaces",2)
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*")
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, recording-session")
    next()
})
app.use(bodyParser.urlencoded({ extended: true }))
app.use(bodyParser.json())
app.use(cookieParser())
app.engine('hbs', exphbs({ extname: '.hbs' }))
app.set('view engine', 'hbs');
app.use(express.static('public'))

//     ----- USER AUTH -----     //
const authTokens = {};
const getHashedPassword = (password) => {
    const sha256 = crypto.createHash('sha256');
    const hash = sha256.update(password).digest('base64');
    return hash;
}

app.post('/user/register', async(req, res) => {
	if(req.body['g-recaptcha-response'] === undefined || req.body['g-recaptcha-response'] === '' || req.body['g-recaptcha-response'] === null) return res.render('register', { message: "Please select the captcha!", messageClass: 'red', gCaptcha: process.env.google_htmlCaptcha })
	var secretKey = process.env.google_ReCaptcha
	var verificationUrl = "https://www.google.com/recaptcha/api/siteverify?secret=" + secretKey + "&response=" + req.body['g-recaptcha-response'] + "&remoteip=" + req.connection.remoteAddress;
	const fetchCaptha = await fetch(verificationUrl);
	const resCaptha = await fetchCaptha.json()
	if (!resCaptha.success || resCaptha.success == undefined) return res.render('register', { message: "Invalid in  recaptcha!", messageClass: 'red', gCaptcha: process.env.google_htmlCaptcha })
    const { email, firstName, lastName, userName, password, confirmPassword } = req.body
	if (password !== confirmPassword) return res.render('register', { message: "Password doesnt match!", messageClass: 'red', gCaptcha: process.env.google_htmlCaptcha })
    const hashedPassword = getHashedPassword(password);
    apiSQL.query("SELECT * FROM `restkey` WHERE `email` = ?", email, function(err, result) {
        if (err) return res.render('register', { message: "Error on database!", messageClass: 'red', gCaptcha: process.env.google_htmlCaptcha })
        if (result.length != 0) return res.render('register', { message: "Email already exists!", messageClass: 'red', gCaptcha: process.env.google_htmlCaptcha })
        apiSQL.query("SELECT * FROM `restkey` WHERE `username` = ?", userName, function(err, result) {
            if (err) return res.render('register', { message: "Error on database!", messageClass: 'red', gCaptcha: process.env.google_htmlCaptcha })
            if (result.length != 0) return res.render('register', { message: "Username already exists!", messageClass: 'red', gCaptcha: process.env.google_htmlCaptcha})
			const TokenNya = crypto.randomBytes(35).toString('hex')
            transporter.sendMail({
                from: `"ArugaZ-Restful API" <${process.env.mail_FROM}>`, // sender address
                to: `"${userName}" <${email}>`, // list of receivers
                subject: "ArugaZ | Email Verification", // Subject line
                text: "ArugaZ - Restful API", // plain text body
                html: `
                <p>Hallo ${firstName} ${lastName}</p></br>
                <p>Congratulations! You will soon bind this email address to your ArugaZ - Restful API account.</p></br>
                <p>You can click on the link below to verify this email address:</p>
                <p><a href='//${req.rawHeaders[1]}/user/login?q=${TokenNya}' target='_blank'>https://${req.rawHeaders[1]}/user/login?q=${TokenNya}</a></p></br>
				<p>Email: ${email}</p>
				<p>Password: ${password}</p>
				</br>
                <p>Regards, ArugaZ</p>
                `, // html body
            }, (err) => {
                if (err) return res.render('register', { message: "Error on mail sender!", messageClass: 'red', gCaptcha: process.env.google_htmlCaptcha })
                apiSQL.query("INSERT INTO `restkey` SET?", { updateAt: mysqlTimestamps, createdAt: mysqlTimestamps, firstname: firstName, lastname: lastName, username: userName, email: email, password: hashedPassword, secretToken: TokenNya, apiKey: 'arugaz'+ crypto.randomBytes(Math.floor(Math.random() * 2) +5).toString('hex'), recovery: 'success', active: 'false' }, function(err, result) {
                    if (err) return res.render('register', { message: "Error on database!", messageClass: 'red', gCaptcha: process.env.google_htmlCaptcha })
                    res.redirect('/user/login?q=RegistrationComplete')
                })
            })
        })
    })

})
app.post('/user/login', async(req, res) => {
    const { email, password, checkbox } = req.body
    const hashedPassword = getHashedPassword(password);
    apiSQL.query("SELECT * FROM `restkey` WHERE `email` = ? AND `password` = ?", [ email, hashedPassword ], function(err, result) {
        if (err) return res.render('login', { message: "Error on database!", messageClass: 'red'})
        if (result.length == 0) return res.render('login', { message: "Email or Password it's wrong!", messageClass: 'red' })
		if (result[0].secretToken != 'success') return res.render('login', { message: "Account isn't active yet, please check your email!", messageClass: 'red'})
		apiSQL.query("UPDATE `restkey` SET ? WHERE `email` = ?", [{ updateAt: mysqlTimestamps }, email], function(err) {
			if (err) return res.render('login', { message: "Error on database!", messageClass: 'red'})
			const authToken = crypto.randomBytes(30).toString('hex')
			authTokens[authToken] = result[0];
			if (checkbox) {
				res.cookie('AuthToken', authToken, { expires: new Date(Date.now() + 24 * 3600000) });
			} else {
				res.cookie('AuthToken', authToken);
			}
			res.redirect('/');
		})
    })
})
app.post('/user/recovery', async(req, res) => {
	if (req.body.email) {
		if(req.body['g-recaptcha-response'] === undefined || req.body['g-recaptcha-response'] === '' || req.body['g-recaptcha-response'] === null) return res.render('recovery', { message: "Please select the captcha!", messageClass: 'red', gCaptcha: process.env.google_htmlCaptcha })
		var secretKey = process.env.google_ReCaptcha
		var verificationUrl = "https://www.google.com/recaptcha/api/siteverify?secret=" + secretKey + "&response=" + req.body['g-recaptcha-response'] + "&remoteip=" + req.connection.remoteAddress;
		const fetchCaptha = await fetch(verificationUrl);
		const resCaptha = await fetchCaptha.json()
		if (!resCaptha.success || resCaptha.success == undefined) return res.render('recovery', { message: "Invalid in  recaptcha!", messageClass: 'red', gCaptcha: process.env.google_htmlCaptcha })
		apiSQL.query("SELECT * FROM `restkey` WHERE `email` = ?", req.body.email, function(err, result) {
			if (err) return res.render('recovery', { message: "Error on database!", messageClass: 'red', gCaptcha: process.env.google_htmlCaptcha })
			if (result.length == 0) return res.render('recovery', { message: "Email not registered!", messageClass: 'red', gCaptcha: process.env.google_htmlCaptcha })
			const TokenNya = crypto.randomBytes(35).toString('hex')
			transporter.sendMail({
				from: `"ArugaZ-Restful API" <${process.env.mail_FROM}>`, // sender address
				to: `"${result[0].username}" <${req.body.email}>`, // list of receivers
				subject: "ArugaZ | Password Recovery", // Subject line
				text: "ArugaZ - Restful API", // plain text body
				html: `
				<p>Hallo ${result[0].firstname} ${result[0].lastname}</p></br>
				<p>Someone tried to reset your password, is that you? If that's you, please click the link below:</p>
				<p><a href='//${req.rawHeaders[1]}/user/recovery?q=${TokenNya}' target='_blank'>https://${req.rawHeaders[1]}/user/recovery?q=${TokenNya}</a></p></br>
				<p>Regards, ArugaZ</p>
				`, // html body
			}, (err, info) => {
				if (err) return res.render('recovery', { message: "Error on mail sender!", messageClass: 'red', gCaptcha: process.env.google_htmlCaptcha })
				apiSQL.query("UPDATE `restkey` SET ? WHERE `email` = ?", [{recovery: TokenNya}, req.body.email], function(err, result) {
					if (err) return res.render('recovery', { message: "Error on database!", messageClass: 'red', gCaptcha: process.env.google_htmlCaptcha })
					res.render('recovery', { message: "Please check your email to reset password", messageClass: 'green', gCaptcha: process.env.google_htmlCaptcha })
				})
			})
		})
	} else if (req.body.password) {
		if (req.body.password !== req.body.confirmPassword) return res.render('recovery2', { message: "Password doesnt match!", messageClass: 'red'})
		apiSQL.query("SELECT * FROM `restkey` WHERE `recovery` = ?", req.query.q, function(err, result) {
			if (err) return res.render('recovery2', { message: "Error on database!", messageClass: 'red'})
			if (result.length == 0) return res.render('recovery2', { message: "Recovery Code its Wrong, please check your mail!", messageClass: 'red'})
			const hashedPassword = getHashedPassword(req.body.password);
			apiSQL("UPDATE `restkey` SET ? WHERE `recovery` = ?", [{ password: hashedPassword, recovery: 'success' }, req.query.q], function(err, result) {
				if (err) return res.render('recovery2', { message: "Error on database!", messageClass: 'red'})
				res.render('login', { message: "Password Changed, Login with New Password!", messageClass: 'green' })
			})
		})
	}
})

//     ----- USER AUTH -----     //
app.use((req, res, next) => {
    const authToken = req.cookies['AuthToken'];
    req.user = authTokens[authToken];
    next();
});
app.get('/', (req, res) => {
    if (req.user) {
		apiSQL.query("SELECT * FROM `restkey` WHERE `email` = ?", req.user.email, function(err, result) {
			console.log(result[0])
		})
        res.render('rumah', {
            nama: req.user.username,
            firstnama: req.user.firstname,
            lastnama: req.user.lastname,
            userid: req.user.id,
            email: req.user.email,
            apikey: req.user.apiKey
        })
    } else {
        res.render('rumah', {
            name: 'Guest'
        })
    }
});
app.get('/user/register', (req, res) => {
    if (req.user) return res.redirect('/')
    res.render('register', {
		gCaptcha: process.env.google_htmlCaptcha
	})
})
app.get('/user/login', (req, res) => {
    if (req.user) return res.redirect('/')
    if (req.query.q) {
        if (req.query.q == 'RegistrationComplete') return res.render('login', { message: 'Registration complete please check your Email to Activate!', messageClass: 'green' })
        apiSQL.query("SELECT * FROM `restkey` WHERE `secretToken` = ?", req.query.q, function(err, result) {
            if (err) return res.render('login', { message: "Error on database!", messageClass: 'red'})
            if (result.length == 0) return res.render('login', { message: "Invalid Secret Token or you already activated account try login!", messageClass: 'red'})
            apiSQL.query("UPDATE `restkey` SET ? WHERE `secretToken` = ?", [{secretToken: 'success', active: 'true'}, req.query.q], function(err, result) {
                if (err) return res.render('login', { message: "Error on database!", messageClass: 'red'})
                res.render('login', { message: "Account activated, please login!", messageClass: 'green'})
            })
        })
    } else {
        res.render('login')
    }
})
app.get('/user/recovery', (req, res) => {
    if (req.user) return res.redirect('/')
    if (req.query.q) {
        apiSQL.query("SELECT * FROM `restkey` WHERE `recovery` = ?", req.query.q, function(err, result) {
            if (err) return res.render('recovery', { message: "Error on database!", messageClass: 'red', gCaptcha: process.env.google_htmlCaptcha })
			if (result.length == 0) return res.render('recovery', { message: "Invalid Secret Token!", messageClass: 'red', gCaptcha: process.env.google_htmlCaptcha })
			res.render('recovery2')
        })
    } else {
        res.render('recovery', {
			gCaptcha: process.env.google_htmlCaptcha
		})
    }
})
app.post('/user/logout', (req, res) => {
    if (!req.user) return res.redirect('/')
	res.clearCookie('AuthToken')
	res.redirect('/')
})

//     ----- API ROUTE -----     //
app.use(apiLimiter)
app.use('/api/xnxx/search', require('./router/xnxx-search'))
app.use('/api/xnxx/detail', require('./router/xnxx-detail'))

//     ----- HANDLE ERROR -----      //
app.use((req, res) => {
	res.status(404).send("404");
})

app.listen(PORT ,() => {
	console.log(`Server Run on port ${PORT}`)
})

//     ----- NODE - CRON -----     //
// Runinng node cron at 9am every sunday to delete unregistered account.
cron.schedule('0 9 * * 0', () => {
	apiSQL.query("DELETE FROM `restkey` WHERE `active` = ?", 'false', function(err, result) {
		if (err) return console.log('Error: ' + result)
		console.log('Success: ' + result)
	})
}, {
	scheduled: true,
	timezone: "Asia/Jakarta"
})
