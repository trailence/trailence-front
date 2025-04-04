FROM node:20-alpine AS build-app
WORKDIR /build
RUN npm install -g @ionic/cli @angular/cli cpy-cli rimraf && apk --no-cache add git
COPY ./ /build/
RUN npm install && \
    ionic capacitor sync android --configuration=android-prod && \
    rimraf android/app/src/main/assets/public/assets/apk && \
    rimraf android/app/src/main/assets/public/assets/admin && \
    rimraf android/app/src/main/assets/public/assets/home-page && \
    cd android/environments/prod && \
    cpy . ../.. && \
    cd ../../.. && \
    ionic build --configuration=production && \
    export BUILD_TIME="$(date -u -Iseconds)" && \
    sed -e 's/\${TRAILENCE_HOSTNAME}/trailence.org/g' -e 's/\${BUILD_TIME}/'"$BUILD_TIME"'/g' /build/site/sitemap.xml > /build/www/browser/sitemap.xml && \
    sed -e 's/\${TRAILENCE_HOSTNAME}/trailence.org/g' /build/site/robots.txt > /build/www/browser/robots.txt

FROM mobiledevops/android-sdk-image:34.0.1 AS build-apk
COPY --from=build-app /build /build-apk
COPY ./docker/trailence.jks /build-apk/android
COPY ./docker/keys.gradle /build-apk/android
WORKDIR /build-apk/android
RUN chmod 777 ./gradlew && ./gradlew assembleRelease

FROM nginx:stable-alpine AS build-image
COPY ./docker/nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build-app /build/www/browser /usr/share/nginx/html
COPY --from=build-apk /build-apk/android/app/build/outputs/apk/release/app-release.apk /usr/share/nginx/html/assets/apk/trailence.apk
COPY --from=build-apk /build-apk/android/app/build/outputs/apk/release/output-metadata.json /usr/share/nginx/html/assets/apk/metadata.json
