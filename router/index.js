var apiSQL = require('../helper/mysql')

function checkApiKey(apikey) {
	return new Promise((resolve, reject) => {
		apiSQL.query("SELECT * FROM `restkey` WHERE `apikey` = ?", apikey, (err, result) => {
			if (err) reject(err)
			if (result.length == 0) resolve(false)
			resolve(true)
		})
	})
}

module.exports = {
	checkApiKey
}