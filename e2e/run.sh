#!/bin/bash

echo Run tests with arguments: $@

echo Cleaning...

rm -rf ./output || true
mkdir ./output
rm -rf ./tmp-data || true
mkdir ./tmp-data

echo List tests to run in parallel

npm run list_parallel --silent -- $@ > ./output/tests.txt
code=$?
if [[ $code -ne 0 ]]; then
  echo "Error in list_parallel: $code"
  exit 1
fi

nb_tests=$(wc -l < ./output/tests.txt)
echo Jobs to launch: $nb_tests

echo Launching tests in parallel

date=$(date)
echo "Launching tests at $date" >> ./output/jobs_result.txt

count=0

while read test; do
  count=$((count + 1))
  mkdir ./tmp-data/$count
  mkdir ./tmp-data/$count/downloads
  echo "Launching command $count/$nb_tests: $test"
  echo "Launching command $count/$nb_tests: $test" >> ./output/jobs_result.txt
  ./run_test.sh --test-instance=$count $test &> ./output/test_$count.log &
  echo $! >> ./output/jobs.txt
done < ./output/tests.txt

echo Waiting for tests to finish

result=0
count=0

while read pid; do
  wait -n $pid
  code=$?
  count=$((count + 1))
  date=$(date -r ./output/test_$count.log)
  echo "Process $pid command $count/$nb_tests exit code $code at $date"
  echo "Command $count/$nb_tests exit code $code at $date" >> ./output/jobs_result.txt
  if [[ $code -ne 0 ]]; then
    result=1
  fi
  cat ./output/test_$count.log | grep -v "BIDI COMMAND" | grep -v "BIDI RESULT" | grep -v "INFO webdriver: RESULT {\"/home" > ./output/test_$count_filtered.log
  rm ./output/test_$count.log
  mv ./output/test_$count_filtered.log ./output/test_$count.log
done < ./output/jobs.txt

echo "Result = $result"
exit $result
