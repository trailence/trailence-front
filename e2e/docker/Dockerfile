FROM node:20-alpine
WORKDIR /trailence
RUN npm install -g @ionic/cli @angular/cli
COPY ./start.sh /start.sh
RUN chmod 777 /start.sh
ENTRYPOINT ["/start.sh"]
