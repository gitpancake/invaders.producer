run:
	git pull && npm run build && pm2 restart invader-bot && pm2 logs
