FROM node:22-alpine AS build
WORKDIR /build
COPY ./ /build/
RUN node build/build.js

FROM nginx:stable-alpine
COPY docker/build/nginx.conf /etc/nginx/nginx.conf
COPY docker/build/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /build/www/ /usr/share/nginx/html

