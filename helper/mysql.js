var mysql = require('mysql'),
apiSQL = mysql.createConnection({
	host: process.env.sql_HOST,
	user: process.env.sql_USER,
	password: process.env.sql_PASS,
	database: process.env.sql_DB,
	port: process.env.sql_PORT
})
apiSQL.connect(function(err) {
if(err) {
	console.log('error when connecting to db:', err.code);
} else {
	console.log('Connected to db!');
}
})

module.exports = apiSQL