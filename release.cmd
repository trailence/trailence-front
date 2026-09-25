echo Releasing version %1
npm run with-env -- NEWVERSION=%1 npm run release
