sudo apt update

sudo apt install xvfb x11vnc nodejs npm

npx @puppeteer/browsers install chromium@latest

ufw allow 80
ufw allow 443
ufw allow 5900
