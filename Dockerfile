FROM node:alpine
WORKDIR /usr/src/app
COPY package.json .
RUN npm install
COPY ldap-api.js .
COPY client/ ./client
EXPOSE 3269
CMD [ "node", "ldap-api.js" ]
