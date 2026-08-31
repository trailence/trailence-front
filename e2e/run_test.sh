npm run wdio -- $@ | grep -v "BIDI COMMAND" | grep -v "BIDI RESULT" | grep -v "Failed parse WebDriver Bidi message" | grep -v "INFO webdriver: RESULT {\"/home"
exit ${PIPESTATUS[0]}
