#!/bin/bash

ionic capacitor sync android --configuration=android-$1
cd android
rm -rf app/src/main/assets/public/{assets/{apk,admin,home-page},media}
cp -R environments/$1/* .
