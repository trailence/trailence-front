echo "[START TIME=$(date +%s)]"
npm run wdio -- $@ | grep -v "BIDI COMMAND" | grep -v "BIDI RESULT" | grep -v "Failed parse WebDriver Bidi message" | grep -v "INFO webdriver: RESULT {\"/home"
status=${PIPESTATUS[0]}
echo "[END TIME=$(date +%s)]"
exit $status
