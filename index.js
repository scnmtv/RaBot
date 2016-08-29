var express = require("express")
var app = express()
var session = require('express-session')
var Discord = require('discord.io');
var colors = require("colors")
var moment = require("moment")
var request = require('request');

app.set("view engine", "pug")
app.use(express.static("public"))

var config = require('./config')

var oauth2 = require('simple-oauth2')({
	clientID: config.oauth.clientID,
	clientSecret: config.oauth.clientSecret,
	site: 'https://discordapp.com/api',
	tokenPath: '/oauth2/token',
	authorizationPath: '/oauth2/authorize'
});

var bot = new Discord.Client({
	autorun: true,
	token: config.botToken
})

bot.on('message', function(user, userID, channelID, message, event) {
	if (message.indexOf("|") == 0) {
		var command = message.substr(1)
		console.log(user.red, userID.green, channelID.yellow, command.cyan)
		switch (command) {
			case "ding":
				if (config.ring.chimeId) {
					request.post('https://api.ring.com/clients_api/chimes/' + config.ring.chimeId + '/play_sound?api_version=8&auth_token=' + config.ring.authToken)
					bot.sendMessage({
						to: channelID,
						message: "The owner's bells are ringing."
					})
				}
				break
			case "help":
				bot.sendMessage({
					to: channelID,
					message: "I do not have commands, free will compels me."
				})
		}
	}
});

bot.on('guildCreate', function(server) {
	bot.sendMessage({
		to: config.notificationChannel,
		message: "Joined new server: " + server.name
	})
})

app.use(session({
	secret: config.sessionSecret,
	cookie: {
		maxAge: 15 * 60 * 1000
	},
	resave: true,
	saveUninitialized: true
}))

app.get('/oauth/login', (req, res) => {
	req.session.state = Math.random().toString(36).substring(7);
	var authorization_uri = oauth2.authCode.authorizeURL({
		redirect_uri: config.host + '/oauth/callback',
		scope: 'identify',
		state: req.session.state
	});
	res.redirect(authorization_uri)
})

app.get('/oauth/callback', (req, res) => {
	if (req.query.error == 'access_denied') {
		req.session.error = 'You need to accept the auth, baka'
		return res.redirect('/')
	}
	if (req.query.state != req.session.state) {
		req.session.error = 'Wrong OAuth state'
		return res.redirect('/')
	}
	var code = req.query.code;
	oauth2.authCode.getToken({
		code: code,
		redirect_uri: config.host + '/oauth/callback'
	}, saveToken);

	function saveToken(error, result) {
		if (error) {
			req.session.error = 'OAuth Error, try again'
			res.redirect('/')
			return
		}

		req.session.oauth = oauth2.accessToken.create(result);
		request({
			url: 'https://discordapp.com/api/users/@me',
			headers: {
				'Authorization': 'Bearer ' + req.session.oauth.token.access_token
			}
		}, function(error, response, body) {
			if (!error && response.statusCode == 200) {
				req.session.user = JSON.parse(body)

				var member = bot.servers[config.mainServerID].members[req.session.user.id]
				if (!member) {
					req.session.error = 'Join the server first'
					return res.redirect('/')
				}
				for (var i in config.accessRoles) {
					if (member.roles.indexOf(config.accessRoles[i]) >= 0) {
						if (req.session.user.mfa_enabled) {
							req.session.loggedIn = true;
						} else {
							req.session.error = 'Two-Factor Auth is required for this part of the admin, please check <a href="https://support.discordapp.com/hc/en-us/articles/219576828-Setting-up-Two-Factor-Authentication">here</a> for help.'
						}
						bot.sendMessage({
							to: config.notificationChannel,
							message: "**" + req.session.user.username + "#" + req.session.user.discriminator + "** successfully logged in"
						})
						return res.redirect('/')
						break
					}
				}
				if (!req.session.loggedIn) {
					bot.sendMessage({
						to: config.notificationChannel,
						message: "**" + req.session.user.username + "#" + req.session.user.discriminator + "** doesn't have access but tried to login!!!!"
					})
					req.session.error = 'Nuh uh, you are not a chosen one'
					res.redirect('/')
				}
			}
		});
	}
})

if (config.joinLink) {
	app.get('/join', (req, res) => {
		if (typeof config.joinLink === 'string') {
			res.redirect('http://discord.gg/' + config.joinLink)
		} else {
			request('https://discordapp.com/api/servers/' + config.mainServerID + '/widget.json', (err, resp, body) => {
				res.redirect(JSON.parse(body).instant_invite)
			})
		}
	})
}

app.use((req, res, next) => {
	var error = req.session.error || undefined
	req.session.error = undefined
	if (!req.session.loggedIn) {
		res.render('login', {
			error: error,
			serverId: config.joinLink ? config.mainServerID : undefined
		})
		return;
	}
	next()
})

app.get('/logout', (req, res) => {
	req.session.destroy();
	res.redirect('/')
})

app.get('/', (req, res) => {
	var members = []

	for (var i in bot.servers[config.mainServerID].members) {
		var member = bot.servers[config.mainServerID].members[i]
		var add = true;
		for (var j in config.hiddenRoles) {
			if (member.roles.indexOf(config.hiddenRoles[j]) >= 0) {
				add = false
			}
		}
		if (add) {
			members.push(member)
		}
	}

	res.render('panel', {
		bot: bot,
		server: bot.servers[config.mainServerID],
		members: members,
		roles: config.roles,
		user: req.session.user
	})
})

app.get('/assign/:userID/:roleName', (req, res) => {
	bot.addToRole({
		serverID: config.mainServerID,
		userID: req.params.userID,
		roleID: config.roles[req.params.roleName]
	}, (err, resp) => {
		res.redirect('/')
	})
})

app.get('/unassign/:userID/:roleName', (req, res) => {
	bot.removeFromRole({
		serverID: config.mainServerID,
		userID: req.params.userID,
		roleID: config.roles[req.params.roleName]
	}, (err, resp) => {
		res.redirect('/')
	})
})

app.get('/status/:status', (req, res) => {
	var status = req.params.status
	switch (status) {
		case 'online':
			bot.setPresence({
				game: {
					name: config.game || undefined
				},
				type: 0,
				idle_since: null
			})
			break;
		case 'idle':
			bot.setPresence({
				idle_since: moment().valueOf()
			})
			break;
	}
	res.redirect('/')
})

bot.on('ready', function(event) {
	bot.setPresence({
		game: {
			name: config.game || undefined
		},
		type: 0
	})
	setTimeout(_ => {
		bot.sendMessage({
			to: config.notificationChannel,
			message: "Started new instance at **" + moment.utc().format("DD.MM.YYYY HH:mm:ss") + " UTC**"
		})
	}, 1000)
	console.log('Logged into %s as %s - %s', "Discord".rainbow, bot.username.blue, bot.id.green);
});

var port = process.env.PORT || 3000

app.listen(port, _ => {
	console.log("App running on port", port.toString().red)
})

bot.on('disconnect', function(errMsg, code) {
	console.log("Bot disconnected:".red, errMsg ? errMsg.cyan : 'Unknown Error')
	if (code == 1001) {
		bot.connect();
	}
});