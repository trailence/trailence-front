FROM node:22-alpine AS build
WORKDIR /build
COPY ./ /build/
RUN cd doc && node build/build.js

FROM nginx:stable-alpine
COPY doc/docker/build/nginx.conf /etc/nginx/nginx.conf
COPY doc/docker/build/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /build/doc/www/ /usr/share/nginx/html

