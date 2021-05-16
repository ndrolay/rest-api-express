var router = require('express').Router(),
	fetch = require('node-fetch'),
	cheerio = require('cheerio'),
	{ checkApiKey } = require('./')
	
function xnxx(query) {
	return new Promise((resolve, reject) => {
		const baseurl = 'https://www.xnxx.com'
		fetch(`${baseurl}/search/${query}/${Math.floor(Math.random() * 3) + 1}`, {method: 'get'})
		.then(res => res.text())
		.then(res => {
			let $ = cheerio.load(res, {
				xmlMode: false
			});
			let title = [];
			let url = [];
			let desc = [];
			let results = [];

			$('div.mozaique').each(function(a, b) {
				$(b).find('div.thumb').each(function(c, d) {
					url.push(baseurl+$(d).find('a').attr('href').replace("/THUMBNUM/", "/"))
				})
			})
			$('div.mozaique').each(function(a, b) {
				$(b).find('div.thumb-under').each(function(c, d) {
					desc.push($(d).find('p.metadata').text())
					$(d).find('a').each(function(e,f) {
					    title.push($(f).attr('title'))
					})
				})
			})
			for (let i = 0; i < title.length; i++) {
				results.push({
					title: title[i],
					info: desc[i],
					link: url[i]
				})
			}
			resolve({
				code: 200,
				status: true,
				result: results
			})
		})
		.catch(err => reject({code: 503, status: false, result: err }))
	})
}

router.get('/', async(req, res) => {
	if (!req.query.title) return res.json({ code: 403, status: false, msg: 'Please input query: title' })
	if (!req.query.apikey) return res.json({ code: 403, status: false, msg: 'Please input query: apikey' })
	const isApikey = await checkApiKey(req.query.apikey)
	if (!isApikey) return res.json({ code: 403, status: false, msg: 'Apikey is invalid!' })
	xnxx(req.query.title).then(respon => res.json(respon)).catch(err => res.json(err))
})

module.exports = router