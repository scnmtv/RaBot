var config = {
	botToken: "", //Discord Bot Token
	notificationChannel: "", // channel to send notifications to (doesnt have to be on main server, just make sure the bot joins that server)
	mainServerID: "", //Server to use
	game: "", // game to play (eg. Overwatch or with nuclear reactors)
	roles: {
		approved: "", //role that gets assigned automatically to people who login with SAML
		mod: "", //role that can be assigned in the control panel
		admin: "" //role that can be assigned in the control panel
	},
	hiddenRoles: [], //roles to hide in the control panel
	accessRoles: [], //roles with access to the control panel
	sessionSecret: '', //express session secret
	oauth: {
		clientID: '', //OAuth Client ID
		clientSecret: '' //OAuth Client Secret
	},
	host: '', //OAuth Host, make sure you add it into the allowed redirects
	joinLink: false //Set to true if you have a widget, set to string if you wnat to use a custom invite (still need widget enabled)
}

module.exports = config;